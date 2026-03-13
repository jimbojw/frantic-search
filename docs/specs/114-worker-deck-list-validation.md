# Spec 114: Worker-Based Deck List Validation

**Status:** Implemented

**Depends on:** Spec 108 (List Import Textarea), Spec 110 (Hybrid Deck Editor), Spec 112 (Deck Editor Quick Fixes), Spec 113 (Deck Editor Toolbar and Status Redesign), Spec 076 (Worker Protocol and List Caching)

## Goal

Move deck list validation from the main thread to the worker and refactor it to use the search engine (CardIndex, NodeCache, PrintingIndex) for name resolution and printing lookup. Validation becomes a form of card search: each deck line resolves card names through the same evaluator path as the main search box. This eliminates the 2-second Edit-click lag and aligns validation with the architecture that makes query typing instantaneous.

## Background

Spec 108 defines the deck list lexer and validator. Validation runs via `validateDeckList(text, display, printingDisplay)`, which performs O(n) linear scans over `display.names` (~30,000 cards) for each card line. Each scan calls `normalize()` on every name, causing ~2 seconds of main-thread blocking when entering Edit mode with a 100-card list.

The main search page achieves instant query response by running the evaluator in a WebWorker. The worker has CardIndex (pre-normalized names, O(1) alternate-name lookup), PrintingIndex, and NodeCache (AST internment). Validation is conceptually the same problem: resolve each deck-line card name to a canonical face. This spec moves validation into the worker and uses the engine for resolution.

## Design

### 1. Validation as Card Search

Each parsed deck line yields up to four matchable parts:

| Token | AST Node | Example |
|-------|----------|---------|
| Card name | `EXACT` | `!"Lightning Bolt"` |
| Set code | `FIELD set:` | `set:M21` |
| Collector number | `FIELD cn:` | `cn:159` |
| Finish | `FIELD is:` | `is:foil`, `is:etched` |

When all parts are present, the line maps to the equivalent of `!"Lightning Bolt" set:M21 cn:159 is:foil unique:prints`, which should return exactly one printing match. If it does, validation succeeds for that line.

The search engine already evaluates all of these fields:

- **`EXACT`:** `evalLeafExact` compares against `CardIndex.combinedNamesLower` and `namesLower` — pre-normalized arrays. `CardIndex.alternateNamesIndex` provides O(1) alternate-name lookup.
- **`set:`:** `evalPrintingField` matches against `PrintingIndex.setCodesLower`.
- **`cn:`:** `evalPrintingField` matches `collectornumber` against `PrintingIndex.collectorNumbersLower`.
- **`is:foil` / `is:etched`:** `evalPrintingIsKeyword` matches against `PrintingIndex.finish`.
- **`unique:prints`:** Expands evaluation to individual printings rather than cards.

**NodeCache internment** is the key performance advantage. Each leaf node (`!"Lightning Bolt"`, `set:M21`, `cn:159`, `is:foil`) is interned individually. When a deck list contains multiple cards from the same set, the `set:M21` leaf is evaluated once and cached. When the same card appears multiple times ("4 Lightning Bolt"), the `!"Lightning Bolt"` leaf hits cache. Cascading queries for quick fixes (see § 3) reuse the same cached leaves.

### 1a. Constructing AST Trees

Validation constructs AST trees directly (not by parsing query strings). For a line like `1 Lightning Bolt (M21) 159 *F*`, the validator builds:

```
AND [
  EXACT "lightning bolt"
  FIELD set:m21
  FIELD cn:159
  FIELD is:foil
  FIELD unique:prints
]
```

The `unique:prints` node ensures evaluation returns individual printing rows rather than card-level matches, so the result identifies the specific printing.

For a name-only line like `1 Lightning Bolt`, the AST is simply `EXACT "lightning bolt"`. The result gives the canonical face; no printing resolution is needed.

### 2. Worker Protocol Extension

Add a request/response pair for validation:

**ToWorker:**
```typescript
| { type: 'validate-list'; requestId: number; text: string }
```

**FromWorker:**
```typescript
| { type: 'validate-result'; requestId: number; result: ListValidationResult }
```

- `requestId` — Disambiguates concurrent responses; main thread ignores stale results.
- `text` — The draft deck list text (same as current `validateDeckList` input).
- `result` — `ListValidationResult` (lines, errors, warnings, quick fixes) — unchanged from Spec 108/112.

### 3. Cascading Query Strategy

For each deck line, the validator builds and evaluates AST trees in a cascade. Each subsequent query reuses cached leaves from previous queries, so the incremental cost of each fallback step is minimal.

#### 3a. Full match (name + set + collector + finish)

When all parts are present, build the full AND tree:

```
AND [EXACT "name", FIELD set:SET, FIELD cn:NUM, FIELD is:foil, FIELD unique:prints]
```

If `result.indices.length === 1`: the line resolves to that printing. Record oracle_id, scryfall_id, canonical_face. **Done.**

If `result.indices.length === 0`: the full combination doesn't match. Proceed to fallback queries.

#### 3b. Drop collector number — wrong collector quick fix

```
AND [EXACT "name", FIELD set:SET, FIELD is:foil, FIELD unique:prints]
```

If this matches (one or more printings): the name and set are valid, but the collector number is wrong. The result indices identify which printings exist for this card in this set. Generate **quick fixes** offering each valid collector number (same as current Spec 112 behavior for "collector number doesn't match").

#### 3c. Drop name — wrong name quick fix

```
AND [FIELD set:SET, FIELD cn:NUM, FIELD is:foil, FIELD unique:prints]
```

If this matches exactly one printing: the set+collector combination is valid but points to a different card. Read the canonical face from `printingIndex.canonicalFaceRef[printingRow]` and look up the correct name from `display.names`. Generate **quick fixes**: "Use `CorrectName`" and "Remove set/collector, use name only".

#### 3d.0. Unknown set gate — name+collector fallback (before cascade)

When the set code is not in `knownSetCodes`, the validator does **not** enter the cascade. Instead, it tries to resolve by name+collector before falling back to "Remove set/collector":

1. If a collector number is present, evaluate:
   ```
   AND [EXACT "name", FIELD cn:NUM, ...finishNodes, ...variantIsNodes, FIELD unique:prints]
   ```
2. **Disaggregate by set code:** The printings schema has separate rows per finish (foil/non-foil). Group result indices by set code. Count unique sets, not raw printing count.
3. **1 unique set:** Resolve to that printing (prefer foil when line has foil marker, else non-foil) but emit `kind: "warning"` with message "Set resolved to [SET]" (e.g. "Set resolved to DOM") and span on the set token. The user can Apply; the warning signals we inferred the set.
4. **2+ unique sets:** If set is `000` (no-set placeholder), resolve by name only and succeed. Otherwise, generate error "Unknown set" with quick fixes: "Use [set1]", "Use [set2]" (up to the first two unique sets, deduped by replacement), then "Remove set/collector, use name only".
5. **0 matches:** If set is `000`, resolve by name only and succeed. Otherwise, before falling back to "Remove set/collector", try **Levenshtein-on-set resolution** (below). If that yields no improvement, generate error "Unknown set" with "Remove set/collector, use name only" quick fix.
6. **No collector number:** If set is `000`, resolve by name only and succeed. Otherwise, generate error "Unknown set" with "Remove set/collector, use name only" quick fix.

**Set code `000`:** TappedOut uses `(000)` as a "no set" placeholder meaning "any printing." When the set is `000`, 0 or 2+ matches (or no collector) cause name-only resolution instead of an error.

This catches typos like `(DAR)` instead of `(DOM)` when the collector number uniquely identifies the printing. The warning ensures the user sees that we inferred the set.

**Levenshtein-on-set (0 matches, collector present):** When name+collector returns 0 matches and a collector number is present, search the provided set code against `knownSetCodes` using Levenshtein distance with cap 1. Case-insensitive comparison.

- **Exactly 1 set at distance ≤1:** Treat the resolved set as known. Query `AND [EXACT "name", FIELD set:RESOLVED_SET, ...finishNodes, ...variantIsNodes, FIELD unique:prints]` to get printings for that card in that set. Compare the provided collector number to each printing's collector number via Levenshtein (cap 1).
  - **Exactly 1 collector at distance 1:** Auto-resolve to that printing with `kind: "warning"` and message "Set and collector number resolved to [SET] [cn]" (span on set token). Prefer foil when line has foil marker.
  - **0 or 2+ collectors at distance 1:** Generate error "Unknown set" with quick fixes that replace **both** set and collector: one fix per valid collector number in that set, sorted by distance (closest first), then lexicographically. Each replacement corrects the set code and the collector number in the line.
- **2+ sets at distance ≤1:** Generate error "Unknown set" with quick fixes for the first 2 matching sets only. Each fix replaces **only** the set code (not the collector). After the user applies a fix, re-validation runs; if the collector is within Levenshtein cap of a valid one, it auto-resolves (§ 3b). Otherwise, a new collector-number error appears with its own quick fixes.
- **0 sets at distance ≤1:** Fall through to "Remove set/collector, use name only".

#### 3d. Name only — unknown set

If neither 3b nor 3c produced matches, evaluate the EXACT node alone:

```
EXACT "name"
```

If this matches: the card exists but the set is unknown or wrong. Generate error "Unknown set" with "Remove set/collector, use name only" quick fix.

If this doesn't match either: the card name is unknown. Generate error "Unknown card".

#### 3e. Name-only lines

When the line has no set/collector/finish, only the EXACT node is evaluated. Match → success; no match → "Unknown card" error. This is the simplest case and benefits most from NodeCache internment (many deck lines share the same card names).

**Printing resolution:** Name-only resolution never assigns `scryfall_id`; the resolved entry has `scryfall_id: null`. Printing resolution requires explicit set/collector in the line (e.g. `1 Taiga (LEA) 285`). This ensures generic entries like `1 Taiga` export as name-only for TCGPlayer Mass Entry, which accepts best-effort matching without set/collector.

#### 3f. Variant handling (MTGGoldfish, TappedOut)

Lines with `VARIANT` or `FOIL_PRERELEASE_MARKER` tokens follow the same cascade but with variant-aware field nodes. `variantToFlags` maps the variant string to a printing attribute:

| Variant | Resolved field |
|---------|---------------|
| `<extended>` | `PrintingFlag.ExtendedArt` |
| `<borderless>` | `PrintingFlag.Borderless` |
| `<showcase>` | `PrintingFlag.Showcase` |
| `<prerelease>`, `*f-pre*` | `promo_type: prerelease` |

When the variant maps to a printing flag, the cascade replaces `cn:` with the appropriate `FIELD is:` node for that attribute. For example, `4 Spirebluff Canal <prerelease> [OTJ] (F)` becomes:

```
AND [EXACT "spirebluff canal", FIELD set:otj, FIELD is:prerelease, FIELD is:foil, FIELD unique:prints]
```

When the variant is a numeric collector number (e.g. `<251>`), it maps to `cn:251` as in § 3a.

Known Goldfish variants that cannot resolve to a distinct printing flag (e.g. "japanese", "promo pack") fall back to set-level resolution with a warning, same as current behavior. Unknown variants produce an error.

#### 3g. Approximate name match — punctuation/whitespace/lookalike normalization

When the EXACT match (3d or 3e) fails to find a card, try an approximate match before declaring "Unknown card":

1. **Lookalike pre-normalization:** Map visually confusable characters to their Latin equivalents before alphanumeric normalization (e.g. Greek omicron ο → Latin o). This handles cases like "Glόin" (Greek omicron) vs "Glóin" (Latin o with acute). The map is a curated subset of common MTG-name confusables; see `normalizeForLookalikes` in `shared/src/normalize.ts`.
2. **Alphanumeric normalization:** Apply `normalizeAlphanumeric(normalizeForLookalikes(name))` — NFD + strip diacritics + lowercase + `[a-z0-9]` only).
3. Compare with `CardIndex.combinedNamesNormalized` (exact equality) and `alternateNamesIndex`, picking the shortest match when multiple cards contain the normalized input as a substring.
4. **If exactly one card's normalized name equals the normalized input:** This is a high-confidence match: the user likely has a punctuation/whitespace difference (e.g. "Narsets Reversal" vs "Narset's Reversal") or a lookalike character (e.g. "Gloin" vs "Glóin", "Glόin" vs "Glóin"). **Auto-resolve** to that card with `kind: "warning"` and message "Name resolved to [correct name]" (span on name token). The line is imported normally; the warning signals the user that we inferred the correct spelling.
5. If multiple cards contain the normalized input as a substring but none match exactly, do not offer a fix — report "Unknown card" as before. Substring matches are too ambiguous for automatic suggestions.

This catches the common class of user errors — missing apostrophes, extra/missing hyphens, wrong whitespace, and lookalike character substitution — without needing Levenshtein distance. The normalization is the same one `CardIndex` already pre-computes, so no new data structure is required. The BARE node is also interned in NodeCache.

### 4. Worker-Side Validation Module

A new module in `shared/` provides `validateDeckListWithEngine(text, index, printingIndex, display, printingDisplay, cache)`.

**Per-line flow:**

1. Lex the line (`lexDeckList`).
2. Extract tokens: QUANTITY, CARD_NAME, SET_CODE, COLLECTOR_NUMBER, finish markers.
3. Build AST tree(s) per the cascade in § 3.
4. Evaluate via `cache.evaluate(ast)`.
5. Interpret results: match count, printing row(s), canonical face, quick fixes.
6. Emit `LineValidation` with the same shape as current Spec 108/112.

**Reading results:** `cache.evaluate` returns `EvalOutput` with `indices: Uint32Array` (face indices) and optional `printingIndices: Uint32Array`. When `unique:prints` is in the AST, `printingIndices` contains the matched printing rows. The validator reads `printingIndex.canonicalFaceRef[row]` to get the canonical face, `display.oracle_ids[face]` for oracle_id, and `printingIndex.scryfallIds[row]` for scryfall_id.

**Unchanged:** Lexer, line structure, error messages, quick fix format, variant fallback, `reconstructLineWithoutSet`, `getDisplayNameForCanonicalFace` — all preserve semantics from Spec 108/112.

### 5. Main Thread: Async Validation Flow

**Replace synchronous validation with async:**

- DeckEditor no longer calls `validateDeckList` directly.
- App (or ListsPage) provides `onValidateRequest(text: string): Promise<ListValidationResult>`.
- App owns the worker ref; it posts `validate-list` and resolves a promise when `validate-result` arrives.
- Use a request ID map: `Map<requestId, (result) => void>` to resolve the correct promise.

**DeckEditor integration:**

- When `debouncedDraft` changes (in edit mode, non-empty), call `onValidateRequest(debouncedDraft())`.
- Store the result in a signal or resource. Downstream memos (`hasValidationErrors`, `validationErrors`, `editDiffSummary`, `highlightValidation`) read from that signal.
- Use `createResource` or a manual effect + signal to handle loading state. Optional: show "Validating…" briefly.

**Skip validation when draft equals baseline:** When transitioning Display→Edit, the draft text is the serialized output of the current list — known valid by construction. Skip the worker round-trip and set a synthetic valid result (`{ lines: [] }`) so the status bar does not flash "Validating…". Validation runs only when the user has made changes (draft ≠ baseline).

**Defer validation on Edit click:** In `handleEdit`, do not call `setDebouncedDraft(text)` synchronously. Use `setTimeout(() => setDebouncedDraft(text), 0)` so the UI can paint edit mode before validation is requested. This ensures Edit mode appears immediately.

### 6. Backward Compatibility

- `validateDeckList(text, display, printingDisplay)` in `shared/src/list-validate.ts` remains for `list-import.ts` and CLI usage. The app uses the worker path exclusively.
- `importDeckList` and `diffDeckList` stay on the main thread; they run after validation and are fast.

## Acceptance Criteria

1. Validation runs in the worker, not on the main thread.
2. Edit mode renders immediately when the user clicks Edit; no perceptible lag.
3. Validation results appear within ~100–200 ms for a 100-card list (vs ~2 s before).
4. Each deck line is validated by constructing and evaluating AST trees via NodeCache. Individual leaf nodes (EXACT, set:, cn:, is:) are interned and cached across lines.
5. Full match (name + set + collector + finish) resolves in a single evaluation when all parts are present.
6. Cascading fallback queries (drop collector, drop name, name-only, approximate match) produce the same quick fixes as current Spec 112 behavior. When approximate name match finds exactly one card (punctuation/whitespace/lookalike difference), auto-resolve with `kind: "warning"` and message "Name resolved to [correct name]" instead of an error.
7. Protocol: `validate-list` and `validate-result` message types; requestId for request/response matching.
8. Validation behavior (errors, warnings, quick fixes) is unchanged from Spec 108/112.
9. `validateDeckList` remains available for non-UI consumers (list-import, CLI).

## Implementation Notes

- Worker handler: add branch for `msg.type === 'validate-list'`; call `validateDeckListWithEngine`; post `validate-result`.
- **Display→Edit fast path:** When `draftText === baselineText` (e.g. just entered Edit from Display, or after Revert), skip `onValidateRequest` and set `validationResult` to `{ lines: [] }`. Avoids "Validating…" flash for known-valid text.
- **Per-line memoization:** Each line's validation result is cached by line string. Same line content (e.g. `"4 Lightning Bolt"`) yields the same result; unchanged lines on re-validation hit the cache. Helps incremental edits and repeated lines.
- `displayRef` and `printingDisplayRef` are already in scope in the worker from init.
- Test `validateDeckListWithEngine` with existing list-validate test fixtures; use test CardIndex/PrintingIndex/NodeCache from evaluator tests.
- **§ 3g approximate match:** The spec describes using a BARE node and `cache.evaluate()` for approximate matching. The implementation uses a manual loop over `cardIndex.faceCount` and `combinedNamesNormalized`, plus `alternateNamesIndex`, instead. Behavior is correct (exact normalized match and alternate-name lookup); the manual path is O(faceCount) per unknown card and only runs when EXACT fails. NodeCache internment for the BARE node was not implemented. When a match is found, the validator auto-resolves with `kind: "warning"` and "Name resolved to [correct name]" (not an error with quick fix). Lookalike pre-normalization (`normalizeForLookalikes`) maps Greek letters and other confusables to Latin equivalents before `normalizeAlphanumeric`.
