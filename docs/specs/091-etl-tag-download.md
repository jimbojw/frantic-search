# Spec 091: ETL Tag Download

**Status:** Draft

**Depends on:** Spec 001 (ETL Download), Issue #99 (Epic: otag/atag Support)

## Goal

Fetch Scryfall's community-curated oracle tags and illustration tags via their private API endpoints and cache the raw JSON locally, following the same patterns as the existing bulk data downloads. The output feeds a downstream processing step (future spec) that maps tags to internal card indices.

## Background

Scryfall's [Tagger](https://tagger.scryfall.com/) project is a community-driven effort to classify cards with semantic tags. Two kinds of tags exist:

- **Oracle tags (`otag:`)** — mechanical identifiers (e.g., `otag:ramp`, `otag:removal`). These categorize what a card *does*.
- **Illustration tags (`atag:` / `art:`)** — visual identifiers (e.g., `atag:chair`, `atag:sunlight`). These categorize what a card's art *shows*.

These tags are not included in Scryfall's public bulk data files (`oracle-cards.json`, `default-cards.json`). They are available through two undocumented private API endpoints:

| Endpoint | Payload size | Tags | ID references | Contents |
|---|---|---|---|---|
| `https://api.scryfall.com/private/tags/oracle` | ~20 MB | ~5,100 | ~500K oracle IDs | Oracle tag definitions with oracle ID lists |
| `https://api.scryfall.com/private/tags/illustration` | ~46 MB | ~11,500 | ~1.2M illustration IDs | Illustration tag definitions with illustration ID lists |

### Why use a private API?

The alternative — scraping the Tagger web application — would be slower, more fragile, and generate significantly more load on Scryfall's servers. The private endpoints return complete datasets in a single GET request each, comparable to the public bulk files we already consume (162 MB + 505 MB). This is the most polite available approach.

Since these endpoints are undocumented, they may change without notice. The design accounts for this with schema validation and graceful fallback to cached data (see § Error Handling).

### Known Schema

Both endpoints return a Scryfall list object (`"object": "list"`, `"has_more": false`) with a `data` array. Each element maps a tag to a list of Scryfall IDs, but the **join key differs by tag type**:

#### Oracle tags (`/private/tags/oracle`)

Each oracle tag maps to a list of `oracle_id` UUIDs — the same join key used in `columns.json` and `printings.json`:

```json
{
  "object": "tag",
  "id": "5da154fe-e265-4873-920a-04c404bde312",
  "label": "107-3f-x-card",
  "type": "oracle",
  "description": "107.3f - Sometimes X...",
  "oracle_ids": [
    "7404c078-228b-4296-bf1f-62f57bf832d9",
    "7af0e2da-9163-42d9-bf69-439cc61cd28d"
  ]
}
```

#### Illustration tags (`/private/tags/illustration`)

Each illustration tag maps to a list of `illustration_id` UUIDs — the Scryfall illustration ID, which is a printing-level (or more precisely, artwork-level) identifier:

```json
{
  "object": "tag",
  "id": "484f697a-9887-442e-bb94-734af5918768",
  "label": "3d-glasses",
  "type": "illustration",
  "description": null,
  "illustration_ids": [
    "ae0dfde5-7b10-405e-8851-1860fcfac893",
    "b33febb1-c20c-4268-b64c-e346d4cb84c5"
  ]
}
```

#### Common fields

| Field | Type | Description |
|---|---|---|
| `object` | `string` | Always `"tag"` |
| `id` | `string` | Scryfall-internal UUID for the tag |
| `label` | `string` | Tag name used in queries (e.g., `"ramp"`, `"chair"`) |
| `type` | `string` | `"oracle"` or `"illustration"` |
| `description` | `string \| null` | Human-readable description of the tag, or `null` |

#### Differing fields

| Tag type | ID field | Join target |
|---|---|---|
| Oracle | `oracle_ids: string[]` | `oracle_id` on cards (face-domain via canonical face index) |
| Illustration | `illustration_ids: string[]` | `illustration_id` on printings (printing-domain) |

The `label` field is what users type as the value in `otag:label` or `atag:label` queries.

This asymmetry has downstream implications: oracle tags join naturally to the face domain (like `color_identity`), while illustration tags join to the printing domain (like `set:` or `is:foil`). The processing step (future spec) must handle both join paths.

### Cardinality (as of March 2026)

| | Oracle tags | Illustration tags |
|---|---|---|
| Tag count | 5,104 | 11,486 |
| Total ID references | ~500K | ~1.2M |
| Min cards per tag | 1 | 1 |
| Max cards per tag | 16,341 (`triggered-ability`) | 37,226 (`plane`) |
| Avg cards per tag | ~98 | ~102 |
| Tags with 0 cards | 0 | 0 |
| Null descriptions | 3,978 (78%) | 10,018 (87%) |

The largest tags (`triggered-ability`, `plane`) cover roughly half the card pool. Most tags are small — the average is ~100 cards. No empty tags exist in the current data.

## CLI Interface

Tag download is a new subcommand, separate from the existing `download` command. The private API endpoints have different characteristics than the public bulk-data API (no metadata endpoint, no freshness timestamps, different error modes), so a separate command keeps the concerns clean.

```
npm run etl -- download-tags [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--force` | `false` | Download even if cached files exist and are recent |
| `--verbose` | `false` | Print detailed progress |

### Freshness Heuristic

The private tag endpoints do not provide `updated_at` metadata. Instead, use a time-based heuristic: if the local file exists and is less than 24 hours old, skip the download (unless `--force` is set). This prevents redundant fetches during local development while ensuring CI picks up reasonably fresh data on each daily deploy.

The age check uses the file's `mtime` (modification time), not a separate metadata file. This is simpler than the bulk-data approach (which has server-provided timestamps) and appropriate given the lack of upstream freshness information.

## Behavior

```
┌───────────────────────────────────────────────┐
│  For each endpoint (oracle, then illustration): │
│  1. Check local file age                        │
│  2. If file missing, stale (>24h), or --force:  │
│     a. GET the private endpoint                 │
│     b. Validate response schema with Zod        │
│     c. On success: write to data/raw/           │
│     d. On failure: warn and keep existing file   │
│  3. Else: log "up to date"                      │
└───────────────────────────────────────────────┘
```

### HTTP Request Details

Requests to the private endpoints must include a descriptive `User-Agent` header:

```
User-Agent: FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)
```

No authentication is required. The endpoints currently return the full dataset in a single response (no pagination).

### Schema Validation

Validate each response with Zod before writing to disk. The two endpoints have different ID fields, so each gets its own schema:

```typescript
const OracleTagEntrySchema = z.object({
  object: z.literal("tag"),
  id: z.string(),
  label: z.string(),
  type: z.literal("oracle"),
  description: z.string().nullable(),
  oracle_ids: z.array(z.string()),
});

const IllustrationTagEntrySchema = z.object({
  object: z.literal("tag"),
  id: z.string(),
  label: z.string(),
  type: z.literal("illustration"),
  description: z.string().nullable(),
  illustration_ids: z.array(z.string()),
});

const OracleTagResponseSchema = z.object({
  object: z.literal("list"),
  has_more: z.literal(false),
  data: z.array(OracleTagEntrySchema),
});

const IllustrationTagResponseSchema = z.object({
  object: z.literal("list"),
  has_more: z.literal(false),
  data: z.array(IllustrationTagEntrySchema),
});
```

The `has_more: z.literal(false)` assertion guards against a future scenario where Scryfall paginates these endpoints. If `has_more` becomes `true`, our download would be incomplete — better to fail validation and fall back to cached data than to silently use a partial dataset.

Zod's default `strip` mode means **additional unexpected fields are silently accepted**. This is intentional: if Scryfall adds new fields (e.g., `"created_at"`), validation still passes and the raw response is written to disk with the extra fields preserved. Only missing or structurally incompatible changes (removed fields, type changes) trigger a validation failure.

If a response fails schema validation, the download is treated as a failure (see § Error Handling). This protects against silent data corruption if Scryfall changes the private API shape.

## Output Files

| Path | Contents |
|---|---|
| `data/raw/oracle-tags.json` | Full oracle tags response from Scryfall |
| `data/raw/illustration-tags.json` | Full illustration tags response from Scryfall |

Both files are written as-is from the API response (after schema validation). No transformation is performed at this stage — that is the job of the downstream processing step.

Both files are git-ignored (they live under `data/raw/` which is already in `.gitignore`).

## Error Handling

The private API can fail in ways the public API cannot (endpoint removed, schema changed, rate-limited without warning). The error handling strategy prioritizes **never breaking the build** over **always having the latest data**.

| Failure mode | Behavior |
|---|---|
| **Network error** (timeout, DNS, connection refused) | Log warning, exit 0. Existing cached files (if any) are preserved. |
| **Non-200 HTTP status** (404, 403, 500, etc.) | Log warning with status code, exit 0. Existing cached files preserved. |
| **Schema validation failure** | Log warning with Zod error details, exit 0. Existing cached files preserved. Do not overwrite good data with an unrecognized payload. |
| **No cached file and download failed** | Log warning, exit 0. Downstream processing (future spec) handles the absence of tag files gracefully — tag queries are simply unavailable. |

The command always exits 0. This is intentional: tag data is an optional enhancement, not a prerequisite for the core search experience. A tag download failure should not block CI deployment. This differs from the `download` command (which exits non-zero on failure) because oracle and default card data are required.

## CI Integration

The deploy workflow (`.github/workflows/deploy.yml`) gains a new step between "Download Oracle Cards" and "Restore ThumbHash cache":

```yaml
- name: Download Scryfall tags
  run: npm run etl -- download-tags --verbose
```

### Caching

No new cache step is needed. The existing Scryfall data cache already covers all of `data/raw`:

```yaml
- name: Restore Scryfall data cache
  uses: actions/cache@v4
  with:
    path: data/raw
    key: scryfall-oracle-cards-${{ github.run_id }}
    restore-keys: |
      scryfall-oracle-cards-
```

Since `oracle-tags.json` and `illustration-tags.json` live in `data/raw/`, they are included in this cache automatically. The `${{ github.run_id }}` key ensures each successful run creates a new cache entry (GitHub Actions caches are immutable — the unique key sidesteps this by creating a fresh entry per run). The `restore-keys` prefix match restores the most recent entry, which includes the tag files from the last successful download.

This means: if a tag download fails on run N, the `restore-keys` match on run N+1 restores `data/raw/` from run N (or the most recent successful run), including the last good tag files. The `download-tags` command's exit-0-on-failure behavior (§ Error Handling) ensures the cached files are never deleted by a failed attempt.

## File Organization

```
etl/src/
├── download-tags.ts          New: tag download logic
├── index.ts                  Updated: register download-tags subcommand
├── paths.ts                  Updated: ORACLE_TAGS_PATH, ILLUSTRATION_TAGS_PATH constants
└── scryfall.ts               Unchanged (private endpoints don't use bulk-data API)
```

The tag download logic lives in a new module rather than extending `scryfall.ts` because the private endpoints have a fundamentally different interface (no metadata endpoint, no freshness data, different response schema).

## Paths

New constants in `etl/src/paths.ts`:

```typescript
export const ORACLE_TAGS_PATH = path.join(RAW_DIR, "oracle-tags.json");
export const ILLUSTRATION_TAGS_PATH = path.join(RAW_DIR, "illustration-tags.json");
```

## Dependencies

No new dependencies. The command uses `axios` (already installed) for HTTP requests and `zod` (already installed) for schema validation.

## Acceptance Criteria

1. Running `npm run etl -- download-tags` for the first time downloads both `oracle-tags.json` and `illustration-tags.json` to `data/raw/`.
2. Running it again within 24 hours (without `--force`) logs "up to date" for both files and skips downloading.
3. Running with `--force` always downloads both files regardless of age.
4. If a download fails (network error, non-200 status, schema mismatch), the command logs a warning and exits 0. Existing cached files are not overwritten.
5. If the response payload does not match the expected Zod schema, it is rejected (not written to disk).
6. Requests include the `FranticSearch-ETL` User-Agent header.
7. All output goes to `stderr` (logs); `stdout` remains clean.
8. Tag files in `data/raw/` are covered by the existing Scryfall data cache in the deploy workflow, providing fallback data when downloads fail.
