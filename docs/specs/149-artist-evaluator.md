# Spec 149: Artist Query — Evaluator, Autocomplete, and Docs

**Status:** Implemented

**Depends on:** Spec 148 (Artist ETL and Worker), Spec 002 (Query Engine), Spec 047 (Printing Query Fields), ADR-022 (Categorical field operators — substring semantics, not prefix-union vocabulary)

## Goal

Add `a:` and `artist:` query terms to search cards by illustrator name. Matches [Scryfall's syntax](https://scryfall.com/docs/syntax#artist): literal substring match (case-insensitive). Artist is printing-domain; results promote to face when composed with face-domain terms. This spec covers the evaluator, contextual autocomplete for `a:` value positions, and user-facing reference docs.

## Background

Scryfall supports `a:` or `artist:` — search for words in a card's artist name. Quotes for text with spaces: `artist:"Scott Murphy"`. No regex support for artist in Scryfall.

Spec 148 provides the strided inverted index in `artist-index.json` — raw artist name → strided `(face_index_within_card, printing_row_index)` pairs. The worker builds a normalized index (lowercase, trim, collapse whitespace) at load time for search. This spec adds query engine support, autocomplete (artist names are a finite set ~2k), and reference documentation.

## Scope

| In scope                                                 | Out of scope                                |
|----------------------------------------------------------|---------------------------------------------|
| Evaluator: `a:` / `artist:` field handling               | Regex match (Scryfall artist: is substring only) |
| Field aliases: `a`, `artist`                             | Watermark (`wm:`), `ft:`, `new:art`          |
| `artistUnavailable` when index not loaded                | Compliance tests                             |
| Contextual autocomplete for `a:` value position (single-word; multi-word quoted out of scope) |                                             |
| Reference docs: `artist.mdx`                              |                                             |
| Extend `artist-ready` with `tagLabels`                   |                                             |

## Domain

- **Printing-domain:** Artist is per-printing, per-face. Evaluation produces a `Uint8Array(printingCount)`. When used in OR/AND with face-domain terms (e.g. `t:creature a:fetches`), the evaluator promotes printing→face: a card matches if **any** of its printings has a matching artist.

## Spec Updates

| Spec | Update |
|------|--------|
| 002 | Add `artist`, `a` to Supported Fields |
| 047 | Add `artist` to `PRINTING_FIELDS` |
| 024 | Add `artistUnavailable` to query result; extend `artist-ready` with optional `tagLabels` |
| 098 | Add `artist`, `a` to syntax help Fields table; Printing-domain row: `artist` \| `a` \| Artist name (substring) \| `a:proce`, `artist:"Scott Murphy"` |
| 148 | Note: evaluator, autocomplete, docs implemented in Spec 149 |

## Technical Details

### 1. Field aliases

**Module:** `shared/src/search/eval-leaves.ts`

```ts
a: "artist",
artist: "artist",
```

### 2. Printing field registration

**Module:** `shared/src/search/eval-printing.ts`

Add `"artist"` to `PRINTING_FIELDS` so `isPrintingField("artist")` returns true.

### 3. Literal (substring) evaluation — `evalPrintingField`

**Module:** `shared/src/search/eval-printing.ts`

Extend `evalPrintingField` signature to accept `artistIndex` (same pattern as `flavorIndex`):

```ts
artistIndex?: ArtistIndexData | null,
```

Add an `artist` case:

- **Operators:** `:` and `=` only (substring semantics; Scryfall parity)
- **Value normalization:** Lowercase, trim, collapse internal whitespace to single space (matches the normalized index keys built at load per Spec 148)
- **Algorithm:** Iterate over artist index keys (from `tagDataRef.artist`). For each key where `key.includes(normalizedValue)`, iterate the strided array in pairs (stride 2): odd-indexed elements are printing row indices; set `buf[arr[i + 1]] = 1` for each pair.
- **Empty value:** Match all printings that have artist data (union of all strided arrays — collect printing indices from odd positions).
- **PrintingIndex null:** Match nothing; evaluator flags `printingsUnavailable`.
- **Artist index null:** Match nothing; evaluator flags `artistUnavailable` when artist index not yet loaded (printings ready but `artist-index.json` still fetching).

**Import:** Add `ArtistIndexData` from `../data`.

### 4. Evaluator integration

**Module:** `shared/src/search/evaluator.ts`

- In the printing-domain `FIELD` branch (alongside `flavor`), add an `artist` case:
  - If `ast.operator` is not `:` or `=`, return error `artist: does not support operator "${op}"`.
  - If `!this._tagDataRef?.artist`: set `error = null` (all-zero buf); `artistUnavailable` set at `evaluate()` level.
  - Else: `error = evalPrintingField(canonical, ast.operator, ast.value, pIdx, buf, this.index, this._getResolutionContext(), undefined, this._tagDataRef.artist)` (pass `undefined` for `flavorIndex`, `this._tagDataRef.artist` for `artistIndex`).

- Add `_hasArtistLeaves(ast)`: same logic as `_hasFlavorLeaves` but checks `canonical === "artist"`.

- In `evaluate()`: add `hasArtistLeaves`, compute `artistUnavailable = hasArtistLeaves && this._printingIndex != null && !this._tagDataRef?.artist`, include in return object.

- Add `artistUnavailable?: boolean` to `EvalOutput` in `shared/src/search/ast.ts` (or return type).

- Ensure the printing-domain dispatch passes `artistIndex` to `evalPrintingField` when `canonical === "artist"`. The flavor path passes `flavor` as the 8th param. Add `artistIndex` as optional 9th param to `evalPrintingField`.

### 5. Worker protocol: extend `artist-ready`

**Module:** `shared/src/worker-protocol.ts`

```ts
| { type: 'status'; status: 'artist-ready'; tagLabels?: string[] }
```

**Module:** `app/src/worker.ts`

When posting `artist-ready`, include tag labels from the normalized index:

```ts
if (artistRaw) {
  tagDataRef.artist = buildNormalizedArtistIndex(artistRaw)
  post({ type: 'status', status: 'artist-ready', tagLabels: Object.keys(tagDataRef.artist) })
}
```

### 6. Autocomplete

**Modules:** `app/src/query-autocomplete.ts`, `app/src/App.tsx`, `app/src/DualWieldLayout.tsx`

- Add `artistTagLabels?: string[]` to `AutocompleteData`.

- Extend `buildAutocompleteData` third param to accept `artist?: string[]` (full artist names from index keys). Derive completion candidates by splitting each name on spaces and collecting the unique set of words — e.g. "Vincent Proce" and "Scott Murphy" yield `["Vincent", "Proce", "Scott", "Murphy", ...]`. Set `artistTagLabels` to that word list.

- In `computeSuggestion` for `case 'value':`:

  ```ts
  if (fn === 'artist' || fn === 'a') {
    if (!data.artistTagLabels?.length) return null
    const match = firstMatchSubstring(data.artistTagLabels, prefix)
    return match
  }
  ```

  Use `firstMatchSubstring` (not `firstMatchByPrefix`) so typing `pro` suggests "Proce" and typing `vin` suggests "Vincent". Typeahead suggests single words only (multi-word quoted values like `artist:"Scott Murphy"` are out of scope; users type those manually).

- **App state:** Add `artistTagLabels` signal. In `artist-ready` handler, call `setArtistTagLabels(msg.tagLabels ?? [])`. Pass `artist: artistTagLabels()` into `buildAutocompleteData`.

- **DualWieldLayout:** Same wiring — each pane's `buildAutocompleteData` receives `artist` from pane state. Add `artistTagLabels` to `PaneState` / `CreatePaneStateOpts` and handle in `artist-ready`.

### 7. Reference docs

**New file:** `app/src/docs/reference/fields/printing/artist.mdx`

```mdx
---
title: artist
---

# artist

Artist (illustrator) name for the card. Substring match, case-insensitive.

**Canonical:** `artist`  
**Aliases:** `a`  
**Domain:** Printing

## Operators

| Operator | Behavior | Example |
|----------|----------|---------|
| `:` | Substring (case-insensitive) | `q=a:proce` |
| `=` | Substring (case-insensitive) | `q=artist:"Scott Murphy"` |

## Allowed values

Literal text (substring). Quotes preserve spaces and punctuation: `q=artist:"Scott Murphy"`. Empty value matches all printings that have artist data. When the artist index is not yet loaded, the evaluator flags `artistUnavailable` and matches nothing.
```

**Update:** `app/src/docs/reference/fields/index.mdx` — add artist to Printing fields list:

```mdx
- [artist](?doc=reference/fields/printing/artist) — Artist name (substring)
```

## Edge cases

| Input | Behavior |
|-------|----------|
| `a:proce` | Substring: printings whose artist name contains "proce" (e.g. Vincent Proce) |
| `artist:"Scott Murphy"` | Substring with spaces (quotes preserved) |
| `artist:` (empty) | Match all printings with artist data |
| `-a:proce` | NOT: printings whose artist does NOT contain "proce" |
| `t:creature a:fetches` | Cross-domain AND: creatures with at least one printing by an artist matching "fetches" |
| `a:x` when PrintingIndex null | Match nothing; `printingsUnavailable` |
| `a:x` when artist index null | Match nothing; `artistUnavailable` |
| `artist:!=foo` | Error: `artist: does not support operator "!="` |

## Test Strategy

### Evaluator tests (`evaluator-printing.test.ts`)

- `a:proce` with synthetic artist index in tagDataRef — matches printings with artist containing "proce"
- `artist:vincent` — substring match
- `artist:` (empty) — matches all printings with artist data
- `t:creature a:proce` — cross-domain AND
- `-a:proce` — negation
- `a:x` when PrintingIndex null — match nothing, `printingsUnavailable`
- `a:x` when artist index null — match nothing, `artistUnavailable`
- `artist:!=foo` — error

### eval-printing tests

- Unit test `evalPrintingField("artist", ":", "proce", pIdx, buf, ..., artistIndex)` fills correct printing indices
- Empty value fills union of all artist printings
- Returns error when artist index null
- Returns error for unsupported operator (e.g. `!=`)

### Autocomplete tests

- `a:pro` suggests "Proce" (word from artist name containing "pro") when `artistTagLabels` populated
- `artist:vin` suggests "Vincent"
- No completion when `artistTagLabels` empty (before `artist-ready`)

## File Changes Summary

| File | Changes |
|------|---------|
| `shared/src/search/eval-leaves.ts` | Add `a`, `artist` to `FIELD_ALIASES` |
| `shared/src/search/eval-printing.ts` | Add `artist` to `PRINTING_FIELDS`; extend `evalPrintingField` with `artistIndex` param and `artist` case |
| `shared/src/search/evaluator.ts` | Add `artist` dispatch in printing-domain; `_hasArtistLeaves`; `artistUnavailable`; pass `artistIndex` to `evalPrintingField` |
| `shared/src/search/ast.ts` | Add `artistUnavailable?: boolean` to `EvalOutput` |
| `shared/src/worker-protocol.ts` | Extend `artist-ready` with optional `tagLabels`; add `artistUnavailable` to result message type |
| `app/src/worker.ts` | Include `tagLabels` in `artist-ready` post |
| `app/src/worker-search.ts` | Propagate `artistUnavailable` from evaluator (live + pinned); include in result (same pattern as `flavorUnavailable`) |
| `app/src/App.tsx` | Add `artistTagLabels` state; handle `tagLabels` in `artist-ready`; pass to `buildAutocompleteData` |
| `app/src/DualWieldLayout.tsx` | Same state and `buildAutocompleteData` wiring for artist |
| `app/src/query-autocomplete.ts` | Add `artistTagLabels` to `AutocompleteData`; extend `buildAutocompleteData` (split artist names into unique words for candidates); add `artist`/`a` case in `computeSuggestion` using `firstMatchSubstring` |
| `app/src/docs/reference/fields/printing/artist.mdx` | **New** — artist field reference |
| `app/src/docs/reference/fields/index.mdx` | Add artist to Printing fields list |
| `docs/specs/002-query-engine.md` | Add `artist`, `a` to Supported Fields |
| `docs/specs/098-syntax-help-content.md` | Add `artist`, `a` to Fields table |

## Acceptance Criteria

1. `a:proce` and `artist:proce` return cards that have at least one printing with an artist name containing "proce".
2. `artist:` and `a:` with empty value match all printings that have artist data.
3. Only `:` and `=` operators supported; other operators return error.
4. When artist index is not yet loaded (printings ready, artist-index.json still fetching), `a:` matches nothing and `artistUnavailable` is set.
5. When printing data is not loaded, `a:` matches nothing and `printingsUnavailable` is set.
6. Typing `a:pro` suggests a word containing "pro" (e.g. "Proce") as ghost text when artist data is loaded; Tab accepts.
7. No completion for `a:` or `artist:` before `artist-ready`.
8. Reference doc for `artist` exists and is linked from fields index.
9. `npm run typecheck` passes.
