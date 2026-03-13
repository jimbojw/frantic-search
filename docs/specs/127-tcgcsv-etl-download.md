# Spec 127: TCGCSV ETL Download

**Status:** Draft

**Depends on:** Spec 001 (ETL Download)

## Goal

Fetch Magic: The Gathering product and group data from [TCGCSV](https://tcgcsv.com/) and build a `productId → { setAbbrev, number }` mapping. This mapping enables TCGPlayer Mass Entry export resolution (Spec 128): Scryfall printings include `tcgplayer_id`, which we join to TCGCSV's product data to obtain the correct set code and collector number that TCGPlayer's bulk entry accepts.

TCGCSV is a public mirror of TCGPlayer's catalog, updated daily. It requires no API key. TCGPlayer itself no longer grants new API access.

## Background

TCGPlayer Mass Entry expects lines in the format `quantity name [SET] collector`. The SET and collector values must come from TCGPlayer's catalog, not Scryfall's. Scryfall and TCGPlayer model variants differently (e.g., Banquet Guests Showcase Scrolls is LTC 450 in Scryfall but a separate product in TCGPlayer). Scryfall's default_cards bulk data includes `tcgplayer_id` (productId) per printing. TCGCSV exposes products with `groupId` and `extendedData` containing the collector `Number`. Groups have `abbreviation`, which is the Mass Entry set code.

### TCGCSV Data Hierarchy

| Tier | TCGCSV concept | Maps to |
|------|----------------|---------|
| Categories | Card game / merchandise type | Magic = categoryId 1 |
| Groups | Sets within a category | Each Magic set; `abbreviation` = Mass Entry set code |
| Products | Individual cards, packs, etc. | Card printings; `extendedData` has `Number` |

### URL Scheme

| Endpoint | URL | Contents |
|----------|-----|----------|
| Categories | `https://tcgcsv.com/tcgplayer/categories` | All categories (Magic = 1) |
| Groups | `https://tcgcsv.com/tcgplayer/1/groups` | All Magic sets |
| Products | `https://tcgcsv.com/tcgplayer/1/{groupId}/products` | Products in a set |

All endpoints return JSON with `{ success, errors, results[], totalItems? }`. Products include `productId`, `groupId`, `name`, and `extendedData` (array of `{ name, displayName, value }`). For Magic (category 1), the collector number is in `extendedData` where `name === "Number"`. Groups include `groupId` and `abbreviation`.

### Freshness and Conditional GET

TCGCSV updates daily around 20:00 UTC. The site provides `https://tcgcsv.com/last-updated.txt` with an ISO 8601 timestamp. TCGCSV endpoints (served via S3/CloudFront) return standard HTTP caching headers: `ETag` and `Last-Modified`.

**Conditional GET** — Send `If-None-Match: <stored-etag>` with each request. The server returns `304 Not Modified` (no body) when content is unchanged, or `200 OK` with full content when it has changed. One request per resource; no separate HEAD. When unchanged, we avoid re-downloading the response body entirely.

| Request | Stored ETag | Behavior |
|---------|-------------|----------|
| last-updated.txt | `meta.etag` | `If-None-Match`. 304 → skip all fetches, log "up to date". 200 → parse timestamp, proceed with groups + products. |
| groups | `meta.groupsEtag` | `If-None-Match`. 304 → reuse cached group list (`meta.groupIds`); fetch products for those groups. 200 → parse, build groupId→abbrev map, store groupIds. Note: when groups returns 304, newly added TCGCSV groups are missed until the next run that gets 200. |
| products (per group) | `meta.etags[groupId]` | `If-None-Match`. 304 → skip that group's products (reuse from cached productMap). 200 → parse, merge into productMap. |

Store ETags in `tcgcsv-meta.json` after each successful fetch. Use the exact ETag string from the response header (including weak `W/"..."` format if present). On first run (no meta), omit `If-None-Match`; all requests return 200. When groups returns 304 we use `meta.groupIds` to know which product URLs to conditional-GET. The `--force` flag skips all conditional checks: omit `If-None-Match` on every request and perform full fetches. **Implementation note:** A 304 response has an empty body; do not attempt to parse JSON from it.

## CLI Interface

```
npm run etl -- download-tcgcsv [options]
```

### Options

| Flag        | Default | Description                                           |
|-------------|---------|-------------------------------------------------------|
| `--force`   | `false` | Download even if local data is up to date            |
| `--verbose` | `false` | Print detailed progress (group count, product count)  |

## Behavior

```
┌─────────────────────────────────────────────────────────────┐
│  GET last-updated.txt (If-None-Match when meta exists)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │ 304?                    │ 200?
              ▼                         ▼
    ┌────────────────────┐   ┌─────────────────────────────────┐
    │ Log "up to date"   │   │ 1. GET groups (conditional)      │
    │ Skip all fetches   │   │ 2. For each group: GET products │
    └────────────────────┘   │    (conditional, merge if 200)  │
                             │ 3. Write products + meta        │
                             │    (atomic: temp file + rename)  │
                             └─────────────────────────────────┘
```

### Freshness Check

Use **conditional GET** on `https://tcgcsv.com/last-updated.txt`. When `tcgcsv-meta.json` exists, send `If-None-Match: <stored-etag>`. A `304 Not Modified` response means data is current — skip all fetches and log "up to date". A `200 OK` response means proceed with groups and products. When no meta exists, omit the header; the first run fetches everything. The `--force` flag bypasses all conditional checks and forces full fetches (no `If-None-Match` on any request).

### Fetch Strategy

1. **last-updated.txt:** GET with `If-None-Match` when meta.etag exists. 304 → exit early. 200 → parse timestamp, store ETag in meta.etag, proceed.
2. **Groups:** GET `/tcgplayer/1/groups` with `If-None-Match` when meta.groupsEtag exists. 304 → use `meta.groupIds` and `meta.groupAbbrevs` for product URLs and setAbbrev lookups. 200 → parse, build groupId→abbrev map, store ETag in meta.groupsEtag, groupIds, and groupAbbrevs.
3. **Products:** For each groupId, GET `/tcgplayer/1/{groupId}/products` with `If-None-Match` when meta.etags[groupId] exists. 304 → keep existing productMap entries for that group. 200 → parse, merge into productMap, store ETag. Load existing productMap at start when doing conditional fetches so 304 responses preserve prior data. Rate limit: ~100–200 ms between product fetches.
4. **Number extraction:** For each product, find `extendedData` entry where `name === "Number"`. The `value` field is the collector number string (e.g., `"139/195"`, `"47"`). Products without a Number (sealed product, pack, etc.) are skipped for the mapping.
5. **Build map:** `productId → { setAbbrev: string, number: string }`. `setAbbrev` from the group's `abbreviation`; `number` from the Number extendedData value. Products in groups with empty `abbreviation` (e.g., "Box Sets", "Launch Party Cards") are omitted — Mass Entry requires a valid set code. If the same productId appears in multiple groups (rare), last-wins when merging into productMap.

### Output Format

**tcgcsv-products.json:**

```json
{
  "productMap": {
    "499719": { "setAbbrev": "LTC", "number": "47" },
    "525959": { "setAbbrev": "CLTR", "number": "450" }
  }
}
```

Keys are stringified productIds for JSON compatibility. The map may have 80k–100k+ entries (one per Magic card product). (Example: 499719 = Banquet Guests regular; 525959 = Banquet Guests Showcase Scrolls, which TCGPlayer may place in a separate group such as Commander: Tales of Middle-earth.)

**tcgcsv-meta.json:**

```json
{
  "lastUpdated": "2026-03-12T20:05:38+0000",
  "productCount": 95000,
  "etag": "862567772fc7a365382bfd01c187ca32",
  "groupsEtag": "abc123def456",
  "groupIds": [123, 456, 789],
  "groupAbbrevs": { "123": "LTC", "456": "CLTR", "789": "LTR" },
  "etags": { "123": "abc...", "456": "def..." }
}
```

- `etag` — ETag for last-updated.txt; sent as `If-None-Match` on the freshness check.
- `groupsEtag` — ETag for the groups response; sent as `If-None-Match` on the groups request.
- `groupIds` — List of group IDs from the groups response; used when groups returns 304 to know which product URLs to conditional-GET.
- `groupAbbrevs` — Map of groupId (string) → abbreviation; used when groups returns 304 to resolve setAbbrev for products.
- `etags` — Per-group ETags keyed by groupId (string); sent as `If-None-Match` on product requests.

## Output Files

| Path                         | Contents                                                                 |
|------------------------------|---------------------------------------------------------------------------|
| `data/raw/tcgcsv-products.json` | `{ productMap: Record<string, { setAbbrev: string; number: string }> }`   |
| `data/raw/tcgcsv-meta.json`     | `{ lastUpdated, productCount, etag?, groupsEtag?, groupIds?, groupAbbrevs?, etags? }` for conditional GET |

Both files are git-ignored (under `data/raw/`). Write both files atomically: write to `*.tmp`, then `fs.renameSync` to the final path (matching Spec 001 and download-mtgjson). This avoids partial/corrupt JSON if the process crashes during write.

## Error Handling

TCGCSV data is optional. The process command (Spec 003, via Spec 128) handles missing TCGCSV gracefully — all TCGPlayer resolutions fall back to Scryfall set+number when the mapping is absent. The download command must **never block CI**.

| Failure mode                    | Behavior                                                                 |
|--------------------------------|---------------------------------------------------------------------------|
| **last-updated.txt fetch fails** | Use 24h mtime heuristic: if `tcgcsv-products.json` exists and was modified within 24 hours, skip. Otherwise attempt full download. When proceeding without last-updated.txt, set `meta.lastUpdated` to current timestamp (ISO 8601). |
| **Groups fetch fails**          | Log warning, exit 0. Existing cached files preserved.                    |
| **Product fetch fails**         | Log warning for that group, continue with others. Partial map is useful. |
| **Parse/schema validation error** | Log warning, exit 0. Do not overwrite existing files. |
| **No cached file and all fetches fail** | Log warning, exit 0. Spec 128 will fall back to Scryfall values. |

The command always exits 0. Matches Spec 091 and Spec 100: optional enrichment data must not block deployment.

## CI Integration

The deploy workflow (`.github/workflows/deploy.yml`) gains a new step after "Download MTGJSON AtomicCards" and before "Restore ThumbHash cache":

```yaml
- name: Download TCGCSV Magic data
  run: npm run etl -- download-tcgcsv --verbose
```

### Caching and Fallthrough

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

**Cache keys must be unique per run.** GitHub's cache is immutable — you cannot overwrite an existing cache entry. If the key were stable (e.g. `scryfall-oracle-cards`), run 1 would save; run 2 would fetch fresh data but the save would fail (key already exists); run 3 would restore stale run‑1 data forever. Including `${{ github.run_id }}` ensures each successful run creates a *new* cache entry; `restore-keys` prefix matching restores the most recent prior entry. This "unique key per run" pattern is required for any cache that holds downloadable data that can go stale.

Since `tcgcsv-products.json` and `tcgcsv-meta.json` live in `data/raw/`, they are included in this cache automatically. The cache is **restore-only from our perspective** — the restore step either populates `data/raw` from a previous run or does nothing (cache miss). The download steps then run and must **fall through** correctly:

| Scenario | Behavior |
|----------|----------|
| **Cache hit** | `data/raw` has prior run's files. Conditional GET on last-updated may return 304 → skip fetches. Or 200 → re-fetch only what changed. |
| **Cache miss** | `data/raw` empty or partial. No meta → full fetch. Downloads populate from scratch. |
| **Download fails** | Exit 0. Existing files (from restore or earlier downloads) are not overwritten. Job continues; cache save at end preserves whatever is in `data/raw`. |
| **Next run** | `restore-keys` match restores `data/raw` including last good TCGCSV files from any prior successful run. |

This matches Spec 091 (tags) and Spec 100 (MTGJSON): output in `data/raw`, no new cache step, exit 0 on failure, never overwrite on failure.

## Paths

New constants in `etl/src/paths.ts`:

```typescript
export const TCGCSV_PRODUCTS_PATH = path.join(RAW_DIR, "tcgcsv-products.json");
export const TCGCSV_META_PATH = path.join(RAW_DIR, "tcgcsv-meta.json");
```

## File Organization

```
etl/
├── src/
│   ├── download-tcgcsv.ts   # New: TCGCSV fetch and product map build
│   ├── index.ts             # Updated: register download-tcgcsv subcommand
│   └── paths.ts             # Updated: TCGCSV paths
└── AGENTS.md                # Updated: add download-tcgcsv to commands table and data directory
```

## Dependencies

| Package  | Purpose                     |
|----------|-----------------------------|
| `cac`    | CLI framework (existing)    |
| `axios`  | HTTP client (existing)     |

No new npm dependencies. Use existing etl/ tooling. Send a `User-Agent` header (e.g. `FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)`) on all requests, matching Spec 001 and Spec 100.

## Downstream Usage

Spec 128 (TCGPlayer Export Resolution) consumes this output. The process command will optionally load `tcgcsv-products.json`, join Scryfall `tcgplayer_id` to the product map, and emit TCGPlayer set+number in the printing columnar data.

## Acceptance Criteria

1. Running `npm run etl -- download-tcgcsv` for the first time fetches Magic groups, fetches products for each group, builds the product map, and writes `tcgcsv-products.json` and `tcgcsv-meta.json` to `data/raw/`.
2. Running it again (without `--force`) when last-updated returns 304 (conditional GET) logs "up to date" and skips all fetches.
3. Running with `--force` always fetches and overwrites, regardless of freshness.
4. If last-updated.txt fetch fails, the 24h mtime fallback is used.
5. On any fetch failure, the command logs a warning and exits 0. Existing cached files are not overwritten.
6. Rate limiting between product fetches is applied (~100–200 ms delay).
7. All output goes to `stderr`; `stdout` remains clean.
8. Products without a Number in extendedData, or in groups with empty abbreviation, are omitted from the map.
9. All GET requests use `If-None-Match` when a stored ETag exists; 304 responses are handled without downloading the body.
10. Output files are written atomically (temp file + rename) to avoid partial writes on crash.
