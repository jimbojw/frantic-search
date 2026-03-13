# Spec 112: Deck Editor Quick Fixes

**Status:** Implemented

**Depends on:** Spec 108 (List Import Textarea), Spec 110 (Hybrid Deck Editor)

## Goal

Add IDE-style quick fixes to the DeckEditor Status box. When validation reports an error, offer one or more suggested corrections that the user can apply with a single click, updating the draft text in place.

## Background

Spec 110's Status box displays validation errors hierarchically: line number, syntax-highlighted card line, and error message. The user must manually edit the textarea to correct errors. For many error types, the validator has enough context to compute a concrete fix (e.g., the correct card name when set+collector points to a different card). Quick fixes reduce friction and help users fix common paste/typo issues without leaving the error context.

## Design

### 1. Data Model

Extend `LineValidation` (in `shared/src/list-lexer.ts`) with an optional `quickFixes` array:

```typescript
interface QuickFix {
  /** Short label shown on the fix button or in a menu. */
  label: string
  /** The full replacement line text. Applied to the draft when user selects this fix. */
  replacement: string
}

interface LineValidation {
  lineIndex: number
  lineStart: number
  lineEnd: number
  kind: "ok" | "error" | "warning"
  span?: { start: number; end: number }
  message?: string
  /** Suggested fixes for this line. Only present when kind === "error". */
  quickFixes?: QuickFix[]
}
```

**Replacement semantics:** `replacement` is the exact text that replaces the line `[lineStart, lineEnd]` in the draft. The validator produces this by reconstructing the line with the fix applied (e.g., corrected card name, removed set/collector). Newline handling: the replacement does **not** include a trailing newline; the UI preserves line boundaries when splicing.

### 2. Error Types and Applicable Fixes

Errors are ordered by likelihood: collector number wrong (most common), then set, then name.

**Case 1: Collector number wrong (card in set)**  
Card name is valid, set is valid, card has printings in that set, but the given collector number doesn't match any of them.

| Behavior | Description |
|----------|-------------|
| **Auto-resolve (distance 1)** | When exactly one valid collector number has Levenshtein distance 1 from the input (e.g. `37e` → `37`), resolve to that printing with `kind: "warning"` and message "Collector number resolved to [cn]". Prefer foil when user has *F* and multiple printings share that cn. |
| **Quick fixes** | When no single distance-1 match: suggest each valid collector number, sorted by Levenshtein distance (closest first), then lexicographically. |

| Fix | Label Example |
|-----|---------------|
| Suggest each valid collector number | `Use 281`, `Use 282 (borderless)`, `Use 337 (extended art)` |

One quick fix per printing of that card in that set. Include parenthetical variant info (full art, borderless, etc.) when the printing has a notable variant.

**Case 2: Name vs. printing mismatch (set+collector valid)**  
Card name is valid, set is valid, collector number is valid for the set, but set+collector points to a *different* card.

| Fix | Label Example |
|-----|---------------|
| Remove printing details; resolve by name only | `Remove set/collector, use name only` |
| Use the card that set+collector points to | `Use "Flooded Strand"` |

**Case 3: Card name not recognized (set+collector valid)**  
Card name does not resolve, but set and collector number are valid and point to a known printing.

| Fix | Label Example |
|-----|---------------|
| Use the card that set+collector points to | `Use "Flooded Strand"` |

**Other errors:**

| Error Type | Fix |
|------------|-----|
| **Unknown set** | When name+collector matches 1 printing: resolve to that printing with `kind: "warning"` and message "Set resolved to [SET]" (span on set token). When 2+ match: offer "Use [set]" for up to the first two (deduped), then "Remove set/collector". When 0 match: try Levenshtein-on-set (Spec 114 § 3d.0). If exactly 1 set at distance 1: resolve set, then apply collector logic — auto-resolve both when exactly 1 cn at distance 1, else quick fixes for set+collector (both replaced, sorted by cn distance). If 2+ sets at distance 1: "Use [set]" for first two only (set replacement only). If 0 sets: "Remove set/collector" only. When set is `000`: 0 or 2+ matches (or no collector) resolve by name only. |
| **No matching printing** (variant) | Remove variant spec. |
| **Unknown card** (no set+collector) | — Out of scope (would require fuzzy "Did you mean?"). |
| **Missing card name** | — No fix; user must type the name. |

**Phase 1 (MVP):** Cases 1, 2, 3, and Unknown set. Phase 2: No matching printing.

### 3. Validator Changes

**Module:** `shared/src/list-validate.ts`

For each error path that will support quick fixes:

1. Compute the fixed line text (e.g., by string manipulation or token reconstruction).
2. Push a `LineValidation` with `quickFixes: [{ label, replacement }]`.

**Flow change for Case 3:** When `findCardByName` returns null, do not immediately return. If `setTok` and `collectorTok` (or numeric variant) are present and `printingDisplay` exists, try `findPrintingRow`. If a printing is found, we have the card from `canonical_face_ref`. Report "Card name not recognized; set+collector point to \"Foo\"" (or similar) with one quick fix: replace the name with that card's name.

**Case 1 (collector number wrong):** When `findPrintingRow` returns -1 but the card (by name) has printings in that set: compute Levenshtein distance from input to each valid collector number. If exactly one distinct cn has distance 1, resolve to that printing with warning. Otherwise, produce one fix per printing, sorted by distance (closest first), then by cn. Include variant info from `printing_flags` / `promo_types_flags_*`.

**Case 2 (name vs. printing mismatch):** When `findCardByCanonicalFace` returns null but we have a valid printing: two fixes. (1) Remove set/collector from the line. (2) Replace the card name with `display.names[faceIndex]` for the printing's canonical face.

**Case 3 (name not recognized, set+collector valid):** As above, when name fails but printing resolves: one fix — replace the name with the card from the printing.

**Unknown set:** When a collector number is present, try resolving by name+collector before falling back. If exactly one printing matches, resolve to that printing with `kind: "warning"` and message "Set resolved to [SET]" (span on set token). If 2+ match, offer "Use [set]" for up to the first two (deduped), then "Remove set/collector". If 0 match, reconstruct the line without the `(SET)` or `(SET:num)` token. When set is `000`, 0 or 2+ matches (or no collector) resolve by name only. Preserve quantity, name, foil markers, tags, etc.

**Line reconstruction:** The validator has access to the lexer tokens for the line. Use token positions to splice: e.g., for "Unknown set", omit the range covering `setTok` and `collectorTok` (if present), plus any adjacent punctuation/whitespace. A helper `reconstructLineWithoutSet(line, tokens, setTok, collectorTok)` keeps the logic centralized.

### 4. UI Behavior

**Placement:** Each error row in the Status box (the two-column grid: line number | content) shows quick fix controls when `quickFixes` is non-empty.

**Single fix:** Show a button or link, e.g. `[Apply fix]` or a wrench icon with tooltip. Clicking applies the fix.

**Multiple fixes:** Show a dropdown or small menu. Each option shows the `label`. Selecting one applies that fix.

**Apply behavior:**
1. Replace the line `[lineStart, lineEnd]` in the draft with `replacement`.
2. Update `draftText` signal and `localStorage`.
3. Re-run validation (debounced). The error may disappear; if not, the fix was insufficient (e.g. multiple issues on the same line) and the UI continues to show errors.
4. Preserve cursor/selection if possible: if the user had focus in the textarea, consider scrolling to the edited line or placing the cursor at the end of the replacement. (Nice-to-have; can defer.)

**Styling:** Quick fix controls use muted styling (e.g. `text-blue-600 dark:text-blue-400` link, or a small `[Fix]` button) so they don't compete with the error message. Position: inline after the error message, or on a separate row beneath it.

**Accessibility:** Buttons/links must be keyboard-focusable and have clear labels (the `label` from the fix, or "Apply fix: {label}").

### 5. Edge Cases

- **Fix produces another error:** e.g. "Unknown set" fix removes set, but the card name is also wrong. Validation will report the new error. No special handling; the user can apply another fix or edit manually.
- **Concurrent edits:** User applies a fix while the draft has changed (e.g. another tab). The fix uses `lineStart`/`lineEnd` from the validation run. If the draft has shifted, the replacement might be misaligned. Mitigation: validation is debounced and typically fresh; we could disable fix buttons when the draft is "stale" (validation run older than last edit), but that adds complexity. For MVP, assume validation is current.
- **Empty replacement:** Should not occur; "Remove set" produces a line that still has quantity and name. If a fix would produce an invalid line, the validator should not offer it.

### 6. Format Preservation

When reconstructing a line for a fix, preserve the format of the rest of the line. For example, TappedOut uses `(SET:num)`; Moxfield uses `(SET) num`. The validator has the tokens; use them to rebuild with the same structure (minus the removed/corrected parts).

## Out of Scope

- **Fuzzy "Did you mean?" for unknown cards (no set+collector):** When the card name doesn't resolve and there is no set+collector to fall back on, we have no fix. Spec 110 explicitly out-of-scopes "Fuzzy matching / auto-correction for card names." A future spec could add this.
- **Auto-apply on paste:** No automatic application of fixes; the user must click.
- **Fix preview:** Showing a diff or preview before applying is a possible enhancement, not in scope for MVP.

## Acceptance Criteria

1. `LineValidation` includes optional `quickFixes`; `QuickFix` has `label` and `replacement`.
2. **Case 1:** When collector number is wrong but the card exists in the set, the validator produces N quick fixes (one per valid collector number, with variant info when applicable).
3. **Case 2:** When name doesn't match set+collector, the validator produces two fixes: remove set/collector, and use the correct card name.
4. **Case 3:** When the card name is not recognized but set+collector are valid, the validator produces one fix: use the card name that matches set+collector.
5. For "Unknown set" errors, the validator produces a quick fix that removes the set/collector and resolves by name.
6. The Status box displays a fix control (button or link) when an error has `quickFixes`.
7. Clicking a fix replaces the line in the draft, updates `draftText` and `localStorage`, and triggers re-validation.
8. After applying a fix, the error disappears if the line is now valid.
9. Multiple fixes (when supported) appear as a menu; selecting one applies that fix.
10. Fix controls are keyboard-accessible and have clear labels.

## Implementation Notes

- 2026-03-10: Implemented per spec. QuickFix and LineValidation.quickFixes in list-lexer; reconstructLineWithoutSet and variantLabelForPrinting helpers in list-validate; Cases 1–3 and Unknown set quick fixes; DeckEditor Status box shows full fix buttons (same size as MenuDrawer chips: min-h-11, rounded, gray bg). Single fix: "Fix:" prefix; multiple: "Fixes:" prefix. Each button shows the full label.
- 2026-03-10: Error messages and fix labels use syntax-highlight styling: "..." content (card names) → card-name color (gray-900 dark:gray-100) + font-mono; \`...\` content (set-code, collector) → set-code color (blue-600 dark:blue-400) + font-mono. Validator uses backticks for set/collector consistently.
- 2026-03-10: "Remove set/collector" fix also removes foil/etched/alter markers — they only apply to specific printings; resolving by name has no finish. Fixed off-by-one: end expansion no longer consumes trailing space, preserving gap before next token.
- 2026-03-11: Apply all quick fixes — Button in Status header applies first fix per error; accordion UX in Spec 113.
- 2026-03-12: Collector number near-match: when exactly one valid cn has Levenshtein distance 1 from input, auto-resolve with warning (like unknown set). Quick fixes sorted by distance so closest matches appear first (e.g. `1 Claim the Firstborn (STA) 37e` → 37 before 100).
- 2026-03-12: Levenshtein-on-set: when both set and collector are wrong (0 name+collector matches), search provided set against known sets at distance 1. Exactly 1 set: resolve set, then collector logic (auto-resolve or set+collector quick fixes). 2+ sets: "Use [set]" for first two (set only). See Spec 114 § 3d.0.
