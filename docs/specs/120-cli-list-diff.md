# Spec 120: CLI `list-diff` Subcommand

**Status:** Implemented

**Depends on:** Spec 069 (CLI diff), Spec 077 (Query Engine — my:list), Spec 076 (Worker Protocol and List Caching), Spec 114 (Worker-Based Deck List Validation), Spec 116 (Index-Based Deck Validation Protocol)

## Goal

Add a `list-diff` subcommand to the CLI that compares **list contents** (expected) against **search results** (actual) for `my:list` queries. This provides a principled, repeatable tool for investigating discrepancies between a deck list and the output of the standard search — analogous to the Scryfall diff tool (Spec 069) for list-vs-search parity.

## Background

The Scryfall diff (`npm run cli -- diff "<query>"`) compares local search results against Scryfall's API. It has been enormously helpful for investigating search discrepancies. However, `my:list` is Frantic Search–exclusive; Scryfall has no equivalent. When bugs occur in the interaction between the My List feature and rendered search results (e.g., a printing-only list showing extra printings), there is no external reference to compare against.

The list is the ground truth. A list-diff tool compares:
- **Expected:** What the parsed deck list contains (from `ParsedEntry[]`).
- **Actual:** What the search engine returns for the same query with masks built from that list.

Example: List contains `1x Dawn of Hope (ltc) 164 [Draw]`. Query `v:images unique:prints include:extras my:list` should return exactly that printing. If the search returns both GRN 8 and LTC 164, the tool reports "Only in Search: 1 (GRN 8)" — immediately flagging the bug.

## Requirements

1. **Syntax:** `frantic-search list-diff "<query>" --list <path|->` (or `npm run cli -- list-diff "<query>" --list <path|->`).
2. **List input:** `--list <path>` reads deck list from file; `--list -` reads from stdin.
3. **Query must use list context:** The tool is for list-vs-search comparison. Accept queries that contain `my:list` (or `my:default`) **or** `#` metadata queries (Spec 123). Reject only when the query has neither `my:` nor `#`.
4. **Parse deck list:** Use `validateDeckListWithEngine` (or equivalent) to produce `ParsedEntry[]` with oracle_id, scryfall_id, finish, quantity.
5. **Build masks:** Convert `ParsedEntry[]` to `faceMask` and `printingMask` for `getListMask`.
6. **Run search:** Execute the query through the Frantic Search engine with `getListMask` returning the built masks.
7. **Compare:** Expected = parsed list entries (by printing ID for `unique:prints`, oracle ID for `unique:cards`, art counts for `unique:art`). Actual = search results.
8. **Output:** Summary with In Both, Only in List, Only in Search. Discrepancy details list specific cards. `--quiet` shows only comparison keys.

## Technical Details

### Prerequisite: `search --list`

The CLI `search` command currently has no `getListMask`; `my:list` produces an error. Add `--list <path|->` to `search` so it can run `my:list` queries:

- Parse deck list from path or stdin.
- Build masks from parsed entries (see § Mask Building below).
- Construct `NodeCache` with `getListMask` returning those masks.
- Run the query and output results as today.

This enables `npm run cli -- search "my:list" --list -` for ad-hoc debugging and is the foundation for `list-diff`.

### Mask Building from Parsed Entries

`buildMasksForList` in `app/src/list-mask-builder.ts` expects `MaterializedView`. For the CLI, add one of:

- **Option A:** `buildMasksFromParsedEntries(ParsedEntry[], options)` in `shared` or `app`, taking `faceCount`, `printingCount`, `oracleToCanonicalFace`, `printingLookup`. Iterate entries and set bits identically to `buildMasksForList`.
- **Option B:** A minimal adapter that constructs a temporary `MaterializedView`-like structure from `ParsedEntry[]` and calls `buildMasksForList`.

ParsedEntry has `oracle_id`, `scryfall_id`, `quantity`, `finish`. Handle quantity by expanding each entry `quantity` times into the expected set (or treat as one instance per unique printing; spec leaves this to implementation — both are valid for diff purposes).

### Display Columns in CLI

`validateDeckListWithEngine` and mask building require `DisplayColumns` and `PrintingDisplayColumns`. The worker uses `extractDisplayColumns` and `extractPrintingDisplayColumns` from `app/src/worker.ts`. Either:

- Extract these helpers to `shared` and reuse in CLI, or
- Duplicate the extraction logic in the CLI.

The CLI already loads `columns.json` and `printings.json`; it needs the same column extraction as the worker.

### Comparison Semantics

Mirror Spec 069 (Scryfall diff) comparison modes:

| unique mode | Comparison key | Expected set |
|-------------|----------------|--------------|
| `unique:prints` | Printing Scryfall ID | One entry per list line (printing-level); quantity expands to multiple entries |
| `unique:cards` | Oracle ID | One entry per unique card in list |
| `unique:art` | Per-oracle art-variant count | Art counts per card in list |

For `unique:prints`, the expected set is built from `ParsedEntry[]`: each entry with `scryfall_id` contributes that printing (× quantity); entries without `scryfall_id` contribute the canonical nonfoil printing per face (× quantity), matching Spec 077's `promoteFaceToPrintingCanonicalNonfoil` behavior for generic entries with `unique:prints`.

### Output Format

```
List Diff Summary: "v:images unique:prints include:extras my:list"
--------------------------------------------------
Comparison mode: prints
Expected (from list): 1
Actual (from search): 2
In Both: 1
Only in List: 0
Only in Search: 1

Discrepancies:
--------------------------------------------------

[Search Only — not in list]
  Dawn of Hope (GRN/8) — <scryfall-id>
```

- **Only in List:** Cards/printings in the parsed list that the search did not return. May indicate a bug (search under-matching) or validation/parsing issues.
- **Only in Search:** Cards/printings the search returned that are not in the list. Indicates a bug (search over-matching).

### Error Handling

- **Query lacks list context:** Exit with error when the query has neither `my:` nor `#`; suggest adding `my:list` or a `#` metadata term.
- **List file not found:** Exit with error.
- **Validation errors in list:** Report validation failures (e.g., unresolved lines) and optionally proceed with resolved lines only, or exit. Implementation choice.
- **Empty list:** Expected = 0; actual = search result count. Diff reports Only in Search for any results.

### Data Paths

Reuse existing CLI options: `--data`, `--printings`, `--raw` (for oracle IDs in comparison keys). Add `--list` as required for `list-diff`.

## Acceptance Criteria

- [x] `npm run cli -- search "my:list" --list=-` accepts deck list on stdin and runs the query (with `getListMask`).
- [x] `npm run cli -- list-diff "v:images unique:prints include:extras my:list" --list ./list.txt` runs and outputs summary.
- [x] Output includes Expected (from list), Actual (from search), In Both, Only in List, Only in Search.
- [x] Discrepancy section lists cards with name, set, collector number by default.
- [x] `--quiet` shows only comparison keys for discrepancies.
- [x] Query without `my:list` or `my:default` exits with clear error.
- [ ] Query with `#` but without `my:list` is accepted when `--list` is provided (Spec 123).
- [x] `--list=-` reads from stdin (use `--list=-` as shell may not pass `-` correctly with `--list -`).
- [x] Comparison respects `unique:prints` / `unique:cards` / `unique:art` from the query.
- [x] `docs/guides/list-comparison.md` documents when and how to use the tool (analogous to `scryfall-comparison.md`).

## Implementation Notes

- Spec 123 relaxes the query requirement: list-diff will accept `#` metadata queries without `my:list`. The acceptance criterion above will be satisfied when Spec 123 is implemented.

## Out of Scope

- **Scryfall comparison:** List-diff does not compare against Scryfall; `my:list` has no Scryfall equivalent.
- **Multiple lists:** MVP supports only the default list (`my:list` / `my:default`). `my:trash` could be added later if needed.
- **List management:** The tool reads list text; it does not read from IndexedDB or persisted app state.
