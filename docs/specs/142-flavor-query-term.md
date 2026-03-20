# Spec 142: Flavor Text Query Term (`flavor:` / `ft:`)

**Status:** Implemented

**GitHub Issue:** [#138](https://github.com/jimbojw/frantic-search/issues/138)

**Depends on:** Spec 141 (Flavor Text Index), Spec 002 (Query Engine), Spec 047 (Printing Query Fields)

## Goal

Add the `flavor:` and `ft:` query terms to search cards by flavor text. Matches [Scryfall's syntax](https://scryfall.com/docs/syntax#flavor): literal substring match (with optional quotes for spaces/punctuation) and regex match via `/pattern/`. Flavor text is printing-domain; results promote to face when composed with face-domain terms.

## Background

Scryfall supports:
- **`ft:`** or **`flavor:`** — Search for words in a card's flavor text
- Quotes for text with spaces or punctuation: `ft:"draw a card"`
- Regex with slashes: `ft:/\b(orc|orcs)\b/` (see [Scryfall Regular Expressions](https://scryfall.com/docs/regular-expressions))

Spec 141 provides the strided inverted index in `flavor-index.json` — a separate supplemental file loaded after printings, like `atags.json` (Spec 092). The file stores raw flavor text as keys; the worker builds a normalized index (lowercase, trim, collapse whitespace) at load time for search. This spec adds the query engine support.

## Domain

- **Printing-domain:** Flavor text is per-printing. Evaluation produces a `Uint8Array(printingCount)`. When used in OR/AND with face-domain terms (e.g. `t:creature ft:mishra`), the evaluator promotes printing→face: a card matches if **any** of its printings has matching flavor text.

## Spec Updates

| Spec | Update |
|------|--------|
| 002 | Add `flavor`, `ft` to Supported Fields |
| 047 | Add `flavor` to `PRINTING_FIELDS` |
| 024 | Add `flavor-ready` status (worker posts when flavor-index.json loaded); add `flavorUnavailable` to query result |
| 098 | Add `flavor`, `ft` to syntax help Fields table |

**Note:** Bare regex `/pattern/` stays as OR(name, oracle, type) — flavor is **not** included. Scryfall supports an undocumented `lore:` field that searches flavor text, oracle text, name, and type line. A future spec will implement `lore:` to give users an all-four term.

## Technical Details

### 1. Field aliases

**Module:** `shared/src/search/eval-leaves.ts`

Add to `FIELD_ALIASES`:
```ts
flavor: "flavor", ft: "flavor",
```

### 2. Printing field registration

**Module:** `shared/src/search/eval-printing.ts`

Add `"flavor"` to `PRINTING_FIELDS` so `isPrintingField("flavor")` returns true.

### 3. Literal (substring) evaluation — `evalPrintingField`

**Module:** `shared/src/search/eval-printing.ts`

Add a `flavor` case to `evalPrintingField()`:

- **Operators:** `:` and `=` only (substring semantics; Scryfall parity)
- **Value normalization:** Lowercase, trim, collapse internal whitespace to single space (matches the normalized index keys built at load per Spec 141)
- **Algorithm:** Iterate over `flavor_text_index` keys (from `tagDataRef.flavor`). For each key where `key.includes(normalizedValue)`, iterate the strided array in pairs (stride 2): `for (let i = 0; i < arr.length; i += 2)` — odd-indexed elements are printing row indices; set `buf[arr[i + 1]] = 1` for each pair.
- **Empty value:** Match all printings that have flavor text (union of all strided arrays — collect printing indices from odd positions). Per Spec 002 § "Error Recovery", trailing operator with no value is often neutral. **Recommendation:** Empty value matches all printings that have flavor text.
- **PrintingIndex null:** Match nothing; evaluator flags `printingsUnavailable` if flavor was present. Per Spec 047, printing-domain fields match nothing when printings not loaded.
- **Flavor index null:** Match nothing; evaluator flags `flavorUnavailable` when flavor index not yet loaded (printings ready but `flavor-index.json` still fetching). Enables progressive enhancement — search works without flavor until the supplemental file arrives.

### 4. Regex evaluation — `REGEX_FIELD` for flavor

**Module:** `shared/src/search/evaluator.ts`

The `REGEX_FIELD` case currently calls `evalLeafRegex(ast, this.index, buf)` which only accepts `CardIndex` and produces face-domain output. Flavor is printing-domain.

**Options:**
- **A:** Add an overload or branch in the evaluator: when `ast.field` is `flavor` (or canonical `flavor`) and `PrintingIndex` is available, allocate a printing-domain buffer, evaluate flavor regex, promote to face, store in the face buffer.
- **B:** Add `evalLeafFlavorRegex(node, pIdx, buf)` in eval-printing.ts that fills a printing-domain buffer. The evaluator's REGEX_FIELD case dispatches to it when field is flavor, then promotes.

**Algorithm for flavor regex:**
- Iterate over `flavor_text_index` keys (from `tagDataRef.flavor`)
- For each key, `if (new RegExp(pattern, "i").test(key))` then iterate the strided array (stride 2); set `buf[arr[i + 1]] = 1` for each printing row index (odd positions)
- Invalid regex: catch, return error `"invalid regex"`
- Promote printing buffer to face buffer before returning

**Evaluator change:** In the `REGEX_FIELD` branch, before calling `evalLeafRegex`:
- If canonical field is `flavor` and `this._printingIndex` is non-null and `this._tagDataRef?.flavor` is non-null:
  - Allocate `printBuf = new Uint8Array(printingCount)`
  - Call new `evalFlavorRegex(pattern, tagDataRef.flavor, pIdx, printBuf)` (or equivalent)
  - Promote `printBuf` to face `buf`
  - Set `domain: "face"` (promoted)
- Else if canonical is `flavor` and (PrintingIndex is null or flavor index is null):
  - Set `buf` to zeros, `domain: "face"`. Flag `printingsUnavailable` if PrintingIndex null; flag `flavorUnavailable` if PrintingIndex present but flavor index null.
- Else: existing `evalLeafRegex` path for name, oracle, type

### 5. TagDataRef: add flavor

**Module:** `shared/src/search/evaluator.ts`

Extend `TagDataRef` to include `flavor: FlavorTagData | null`. The worker populates `tagDataRef.flavor` when `flavor-index.json` arrives. The evaluator reads from `tagDataRef.flavor` for both literal and regex flavor evaluation. No change to `PrintingIndex` — flavor data is supplemental, like `atags`.

### 6. Unavailability handling

- **Printing data not loaded:** `flavor:` and `ft:` produce all-zero buffers; evaluator flags `printingsUnavailable: true`.
- **Flavor index not loaded:** When printings are ready but `flavor-index.json` has not arrived, `flavor:` produces all-zero buffers; evaluator flags `flavorUnavailable: true`. Enables progressive enhancement — `flavor-ready` status posts when the file loads; UI can show "flavor search loading" or simply work once ready.
- No face-fallback (unlike `is:universesbeyond`); flavor text lives only in printing-domain supplemental data.

## Edge cases

| Input | Behavior |
|-------|----------|
| `flavor:mishra` | Substring: printings whose flavor text contains "mishra" (case-insensitive) |
| `ft:"draw a card"` | Substring: printings whose flavor text contains "draw a card" |
| `flavor:/orcs?/` | Regex: printings whose flavor text matches the pattern |
| `flavor:` (empty) | Match all printings with flavor text (union of index) |
| `-flavor:mishra` | NOT: printings whose flavor text does NOT contain "mishra" |
| `t:creature ft:mishra` | Cross-domain AND: creatures that have at least one printing with "mishra" in flavor text |
| `flavor:/[invalid/` | Invalid regex: error or match zero |

## Test Strategy

### Evaluator tests

- `flavor:mishra` with synthetic flavor index in tagDataRef
- `ft:"draw a card"` — substring with spaces
- `flavor:/orc/` — regex match
- `t:creature flavor:x` — cross-domain AND
- `flavor:x` when PrintingIndex is null — match nothing, printingsUnavailable
- `-flavor:x` — negation

### eval-printing tests

- Unit test `evalPrintingField("flavor", ":", "mishra", pIdx, buf)` fills correct printing indices
- Unit test flavor regex evaluation

## Files to Touch

| File | Changes |
|------|---------|
| `shared/src/search/eval-leaves.ts` | Add `flavor`, `ft` to `FIELD_ALIASES` |
| `shared/src/search/eval-printing.ts` | Add `flavor` to `PRINTING_FIELDS`; add `flavor` case to `evalPrintingField` (receives flavor index from caller); add `evalFlavorRegex` |
| `shared/src/search/evaluator.ts` | Extend `TagDataRef` with `flavor`; REGEX_FIELD branch: dispatch flavor to printing-domain eval + promote; pass `tagDataRef.flavor` to flavor eval; add `flavorUnavailable` to result when flavor term present but index null |
| `app/src/worker.ts` | Fetch flavor-index.json after printings; store in tagDataRef.flavor; post `flavor-ready` |
| `shared/src/search/eval-printing.test.ts` | Tests for flavor literal and regex |
| `shared/src/search/evaluator-printing.test.ts` | Integration tests for flavor in cross-domain queries |
| `docs/specs/002-query-engine.md` | Add flavor, ft to Supported Fields |
| `docs/specs/098-syntax-help-content.md` | Add flavor, ft to Fields table |

## Acceptance Criteria

1. `flavor:mishra` returns cards that have at least one printing with "mishra" in flavor text
2. `ft:"draw a card"` returns cards with that phrase in flavor text (substring, case-insensitive)
3. `flavor:/orc/` and `ft:/\b(orc|orcs)\b/` work with regex
4. `t:creature flavor:x` returns creatures with matching flavor (cross-domain AND)
5. `-flavor:x` negates correctly
6. When printing data is not loaded, `flavor:` matches nothing and `printingsUnavailable` is set
7. When flavor index is not yet loaded (printings ready, flavor-index.json still fetching), `flavor:` matches nothing and `flavorUnavailable` is set
8. Invalid regex in `flavor:/.../` produces error or matches zero
9. All existing tests pass
