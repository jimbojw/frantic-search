# Spec 127: TCGCSV ETL Download

**Status:** Draft

**Depends on:** Spec 001 (ETL Download)

## Goal

Fetch raw Magic: The Gathering product and group data from [TCGCSV](https://tcgcsv.com/) and store it unchanged in `data/raw/`. The download command writes only actual API responses — no transformation. A separate process step (see § Process Step) reads this raw data and builds the `productId → { setAbbrev, number }` mapping for TCGPlayer Mass Entry export resolution (Spec 128).

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

**last-updated.txt** — Always fetch (no conditional GET). It is a small file and acts as a canary: if the fetch fails, something is wrong (network, TCGCSV down). Compare the parsed timestamp with `meta.lastUpdated`. If meta exists and the timestamp is unchanged, skip groups and products. Otherwise proceed.

**Conditional GET for groups and products** — Send `If-None-Match: <stored-etag>` with each request. The server returns `304 Not Modified` (no body) when content is unchanged, or `200 OK` with full content when it has changed. One request per resource; no separate HEAD. When unchanged, we avoid re-downloading the response body entirely.

| Request | Stored ETag | Behavior |
|---------|-------------|----------|
| groups | `meta.groupsEtag` | `If-None-Match`. 304 → reuse cached group list (`meta.groupIds`); fetch products for those groups. 200 → write raw response to `tcgcsv-groups.json`, parse to extract groupIds and groupAbbrevs for meta. Note: when groups returns 304, newly added TCGCSV groups are missed until the next run that gets 200. |
| products (per group) | `meta.etags[groupId]` | `If-None-Match`. 304 → skip that group's products (existing raw file remains valid). 200 → write raw response to `tcgcsv-products/{groupId}.json`. |

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
│  GET last-updated.txt (always fetch; canary)                │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │ Fetch failed?           │ Fetch OK
              ▼                         ▼
    ┌────────────────────┐   ┌─────────────────────────────────┐
    │ 24h mtime fallback │   │ meta exists & timestamp same?   │
    │ (see Error Handling)│   │   Yes → log "up to date", skip  │
    └────────────────────┘   │   No  → 1. GET groups (cond.)  │
                             │        2. For each: GET products │
                             │        3. Write groups+products+meta│
                             └─────────────────────────────────┘
```

### Freshness Check

Always fetch `https://tcgcsv.com/last-updated.txt`. Parse the ISO 8601 timestamp. When `tcgcsv-meta.json` exists and the timestamp equals `meta.lastUpdated`, data is current — skip groups and products, log "up to date". Otherwise proceed with groups and products. The `--force` flag bypasses the timestamp check and forces full fetches (no conditional GET on groups or products).

### Fetch Strategy

1. **last-updated.txt:** Always GET (no conditional). If fetch fails → 24h mtime fallback (see Error Handling). If OK → parse timestamp. If meta exists and timestamp unchanged (and not `--force`) → exit early. Else proceed.
2. **Groups:** GET `/tcgplayer/1/groups` with `If-None-Match` when meta.groupsEtag exists. 304 → use `meta.groupIds` and `meta.groupAbbrevs` for product URLs. 200 → write raw response body to `tcgcsv-groups.json` (atomic), parse to extract groupIds and groupAbbrevs for meta, store ETag.
3. **Products:** For each groupId, GET `/tcgplayer/1/{groupId}/products` with `If-None-Match` when meta.etags[groupId] exists. 304 → do not overwrite; existing `tcgcsv-products/{groupId}.json` from a prior run remains valid. 200 → write raw response body to `tcgcsv-products/{groupId}.json` (atomic), store ETag. Rate limit: 150 ms between product fetches.

### Output Format

**tcgcsv-groups.json:** Raw response from `GET /tcgplayer/1/groups` — `{ success, errors, results[], totalItems? }` unchanged.

**tcgcsv-products/{groupId}.json:** Raw response from `GET /tcgplayer/1/{groupId}/products` — `{ success, errors, results[], totalItems? }` unchanged. One file per groupId.

**tcgcsv-meta.json:**

```json
{
  "lastUpdated": "2026-03-12T20:05:38+0000",
  "groupsEtag": "abc123def456",
  "groupIds": [123, 456, 789],
  "groupAbbrevs": { "123": "LTC", "456": "CLTR", "789": "LTR" },
  "etags": { "123": "abc...", "456": "def..." }
}
```

- `lastUpdated` — Timestamp from last-updated.txt; used to detect when TCGCSV has updated.
- `groupsEtag` — ETag for the groups response; sent as `If-None-Match` on the groups request.
- `groupIds` — List of group IDs from the groups response; used when groups returns 304 to know which product URLs to conditional-GET.
- `groupAbbrevs` — Map of groupId (string) → abbreviation; used when groups returns 304.
- `etags` — Per-group ETags keyed by groupId (string); sent as `If-None-Match` on product requests.

## Output Files

| Path | Contents |
|------|----------|
| `data/raw/tcgcsv-groups.json` | Raw groups API response — `{ success, errors, results[], totalItems? }` |
| `data/raw/tcgcsv-products/{groupId}.json` | Raw products API response per group — `{ success, errors, results[], totalItems? }` |
| `data/raw/tcgcsv-meta.json` | `{ lastUpdated, groupsEtag?, groupIds?, groupAbbrevs?, etags? }` for freshness and conditional GET |

All files are git-ignored (under `data/raw/`). Write atomically: write to `*.tmp`, then `fs.renameSync` to the final path (matching Spec 001 and download-mtgjson). Ensure `tcgcsv-products/` directory exists before writing product files.

## Error Handling

TCGCSV data is optional. The process command (invoked from `npm run etl -- process`; Spec 128 describes process-printings integration) handles missing TCGCSV gracefully — all TCGPlayer resolutions fall back to Scryfall set+number when the mapping is absent. The download command must **never block CI**.

| Failure mode                    | Behavior                                                                 |
|--------------------------------|---------------------------------------------------------------------------|
| **last-updated.txt fetch fails** | Fallback only when the canary fails (network error, non-200, etc.): if `tcgcsv-groups.json` exists and was modified within 24 hours, skip all fetches. Otherwise attempt full download. When proceeding without last-updated.txt, set `meta.lastUpdated` to current timestamp (ISO 8601). |
| **Groups fetch fails**          | Log warning, exit 0. Existing cached files preserved.                    |
| **Product fetch fails**         | Log warning for that group, continue with others. Partial raw data is useful. |
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

Since `tcgcsv-groups.json`, `tcgcsv-products/`, and `tcgcsv-meta.json` live in `data/raw/`, they are included in this cache automatically. The cache is **restore-only from our perspective** — the restore step either populates `data/raw` from a previous run or does nothing (cache miss). The download steps then run and must **fall through** correctly:

| Scenario | Behavior |
|----------|----------|
| **Cache hit** | `data/raw` has prior run's files. Timestamp comparison may skip fetches. Or timestamp changed → re-fetch only what changed (conditional GET on groups/products). |
| **Cache miss** | `data/raw` empty or partial. No meta → full fetch. Downloads populate from scratch. |
| **Download fails** | Exit 0. Existing files (from restore or earlier downloads) are not overwritten. Job continues; cache save at end preserves whatever is in `data/raw`. |
| **Next run** | `restore-keys` match restores `data/raw` including last good TCGCSV files from any prior successful run. |

This matches Spec 091 (tags) and Spec 100 (MTGJSON): output in `data/raw`, no new cache step, exit 0 on failure, never overwrite on failure.

## Paths

New constants in `etl/src/paths.ts`:

```typescript
export const TCGCSV_GROUPS_PATH = path.join(RAW_DIR, "tcgcsv-groups.json");
export const TCGCSV_PRODUCTS_DIR = path.join(RAW_DIR, "tcgcsv-products");
export const TCGCSV_META_PATH = path.join(RAW_DIR, "tcgcsv-meta.json");
export const TCGCSV_PRODUCT_MAP_PATH = path.join(DIST_DIR, "tcgcsv-product-map.json");  // written by process-tcgcsv
```

## File Organization

```
etl/
├── src/
│   ├── download-tcgcsv.ts   # TCGCSV fetch, raw output only
│   ├── process-tcgcsv.ts    # Read raw, build product map, write to dist
│   ├── index.ts             # Register download-tcgcsv, invoke process-tcgcsv from process command
│   └── paths.ts             # TCGCSV paths
└── AGENTS.md                # Commands table and data directory
```

## Process Step

The download command writes only raw API responses. A separate **process step** (run as part of `npm run etl -- process`) reads this raw data and produces the product map:

- **Input:** `data/raw/tcgcsv-groups.json`, `data/raw/tcgcsv-products/*.json`, `data/raw/tcgcsv-meta.json`
- **Output:** `data/dist/tcgcsv-product-map.json` — `{ productMap: Record<string, { setAbbrev: string; number: string }> }`
- **Logic:** For each group with non-empty `abbreviation`, read the corresponding products file. For each product, find `extendedData` entry where `name === "Number"`; add `productMap[productId] = { setAbbrev, number }` (last-wins for duplicate productId). Skip products without Number. Skip groups with empty abbreviation (e.g., "Box Sets", "Launch Party Cards").
- **When to run:** As part of the process command, before process-printings. Runs when raw TCGCSV exists; skips when absent.

## Dependencies

| Package  | Purpose                     |
|----------|-----------------------------|
| `cac`    | CLI framework (existing)    |
| `axios`  | HTTP client (existing)     |

No new npm dependencies. Use existing etl/ tooling. Send a `User-Agent` header (e.g. `FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)`) on all requests, matching Spec 001 and Spec 100.

## Downstream Usage

Spec 128 (TCGPlayer Export Resolution) consumes the product map produced by the process step. process-printings loads `data/dist/tcgcsv-product-map.json`, joins Scryfall `tcgplayer_id` to the product map, and emits TCGPlayer set+number in the printing columnar data.

## Acceptance Criteria

1. Running `npm run etl -- download-tcgcsv` for the first time fetches Magic groups, fetches products for each group, and writes raw API responses to `tcgcsv-groups.json`, `tcgcsv-products/{groupId}.json`, and `tcgcsv-meta.json` in `data/raw/`.
2. Running it again (without `--force`) when last-updated timestamp equals meta.lastUpdated logs "up to date" and skips all fetches.
3. Running with `--force` always fetches and overwrites, regardless of freshness.
4. If last-updated.txt fetch fails, the 24h mtime fallback (on `tcgcsv-groups.json`) is used.
5. On any fetch failure, the command logs a warning and exits 0. Existing cached files are not overwritten.
6. Rate limiting between product fetches is applied (150 ms delay).
7. All output goes to `stderr`; `stdout` remains clean.
8. Raw API responses are written unchanged; no transformation in the download command.
9. Groups and products GET requests use `If-None-Match` when a stored ETag exists; 304 responses are handled without downloading the body.
10. Output files are written atomically (temp file + rename) to avoid partial writes on crash.
