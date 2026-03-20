# Spec 142: Flavor Text Query Term (`flavor:` / `ft:`)

**Status:** Draft

**GitHub Issue:** [#138](https://github.com/jimbojw/frantic-search/issues/138)

**Depends on:** Spec 141 (Flavor Text Index), Spec 002 (Query Engine), Spec 047 (Printing Query Fields)

## Goal

Add the `flavor:` and `ft:` query terms to search cards by flavor text. Matches [Scryfall's syntax](https://scryfall.com/docs/syntax#flavor): literal substring match (with optional quotes for spaces/punctuation) and regex match via `/pattern/`. Flavor text is printing-domain; results promote to face when composed with face-domain terms.

## Background

Scryfall supports:
- **`ft:`** or **`flavor:`** — Search for words in a card's flavor text
- Quotes for text with spaces or punctuation: `ft:"draw a card"`
- Regex with slashes: `ft:/\b(orc|orcs)\b/` (see [Scryfall Regular Expressions](https://scryfall.com/docs/regular-expressions))

Spec 141 provides the inverted index (`flavor_text_index`) in printings.json. This spec adds the query engine support.

## Domain

- **Printing-domain:** Flavor text is per-printing. Evaluation produces a `Uint8Array(printingCount)`. When used in OR/AND with face-domain terms (e.g. `t:creature ft:mishra`), the evaluator promotes printing→face: a card matches if **any** of its printings has matching flavor text.

## Spec Updates

| Spec | Update |
|------|--------|
| 002 | Add `flavor`, `ft` to Supported Fields |
| 047 | Add `flavor` to `PRINTING_FIELDS` |
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
- **Value normalization:** Lowercase, trim, collapse internal whitespace to single space (same as index keys in Spec 141)
- **Algorithm:** Iterate over `flavor_text_index` keys. For each key where `key.includes(normalizedValue)`, set `buf[pi] = 1` for every printing index `pi` in that key's array
- **Empty value:** Match all printings that have flavor text (union of all index arrays). Or: if empty value, fill canonical (match all). Per Spec 002 § "Error Recovery", trailing operator with no value is often neutral. For flavor, matching "all printings with flavor text" is a reasonable interpretation; alternatively match nothing. **Recommendation:** Empty value matches all printings that have flavor text (union of all arrays).
- **PrintingIndex null:** Return error `"flavor requires printing data"` or match nothing. Per Spec 047, printing-domain fields match nothing when printings not loaded. Use same pattern: match nothing, evaluator flags `printingsUnavailable` if flavor was present.

### 4. Regex evaluation — `REGEX_FIELD` for flavor

**Module:** `shared/src/search/evaluator.ts`

The `REGEX_FIELD` case currently calls `evalLeafRegex(ast, this.index, buf)` which only accepts `CardIndex` and produces face-domain output. Flavor is printing-domain.

**Options:**
- **A:** Add an overload or branch in the evaluator: when `ast.field` is `flavor` (or canonical `flavor`) and `PrintingIndex` is available, allocate a printing-domain buffer, evaluate flavor regex, promote to face, store in the face buffer.
- **B:** Add `evalLeafFlavorRegex(node, pIdx, buf)` in eval-printing.ts that fills a printing-domain buffer. The evaluator's REGEX_FIELD case dispatches to it when field is flavor, then promotes.

**Algorithm for flavor regex:**
- Iterate over `flavor_text_index` keys
- For each key, `if (new RegExp(pattern, "i").test(key))` then set `buf[pi] = 1` for every `pi` in that key's array
- Invalid regex: catch, return error `"invalid regex"`
- Promote printing buffer to face buffer before returning

**Evaluator change:** In the `REGEX_FIELD` branch, before calling `evalLeafRegex`:
- If canonical field is `flavor` and `this._printingIndex` is non-null and has `flavor_text_index`:
  - Allocate `printBuf = new Uint8Array(printingCount)`
  - Call new `evalFlavorRegex(pattern, pIdx, printBuf)` (or equivalent)
  - Promote `printBuf` to face `buf`
  - Set `domain: "face"` (promoted)
- Else if canonical is `flavor` and PrintingIndex is null:
  - Set `buf` to zeros, `domain: "face"`, optionally set `error` or leave matchCount 0
- Else: existing `evalLeafRegex` path for name, oracle, type

### 5. PrintingIndex: expose flavor_text_index

**Module:** `shared/src/search/printing-index.ts`

Ensure `PrintingIndex` holds `flavor_text_index` from `PrintingColumnarData` and exposes it for evaluation. Add a getter or readonly property, e.g. `flavorTextIndex: Record<string, number[]> | undefined`.

### 6. Unavailability handling

When printing data is not loaded:
- `flavor:` and `ft:` (both FIELD and REGEX_FIELD) produce all-zero buffers (match nothing)
- Evaluator flags `printingsUnavailable: true` when flavor was present in the query
- No face-fallback (unlike `is:universesbeyond`); flavor text lives only in printing data

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

- `flavor:mishra` with synthetic printing data that has flavor_text_index
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
| `shared/src/search/eval-printing.ts` | Add `flavor` to `PRINTING_FIELDS`; add `flavor` case to `evalPrintingField`; add `evalFlavorRegex` |
| `shared/src/search/printing-index.ts` | Expose `flavorTextIndex` from data |
| `shared/src/search/evaluator.ts` | REGEX_FIELD branch: dispatch flavor to printing-domain eval + promote |
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
7. Invalid regex in `flavor:/.../` produces error or matches zero
8. All existing tests pass
