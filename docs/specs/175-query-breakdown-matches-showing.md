# Spec 175: Query Breakdown MATCHES vs SHOWING (Playable Filter)

**Status:** Implemented

**References:** [GitHub #211](https://github.com/jimbojw/frantic-search/issues/211)

**Depends on:** [Spec 057](057-include-extras-default-playable-filter.md) (playable filter, pre-filter counts), [Spec 079](079-consolidated-query-accordion.md) (unified accordion footer), [Spec 151](151-suggestion-system.md) (`include-extras` suggestion)

**Extends:** Spec 079 (summary footer rows), Spec 057 (worker `result` fields)

## Goal

The unified query breakdown accordion footer labels the live row **MATCHES** but, today, shows **post–playable-filter** card/print counts—the same numbers as the visible result list. Breakdown chips already show **pre-filter** semantic match counts from the evaluator, so users can see a large chip total and a tiny **MATCHES** footer with no explanation.

Surface **MATCHES** (full match count after pinned∩live combination, before the default playable-somewhere filter) and **SHOWING** (what the list actually uses) when the filter hides at least one result and there is a non-empty result list. The **`include:extras` rewrite** remains in **SuggestionList** (empty state and non-empty rider per Spec 057 / 151), not inline on the accordion footer, so the footer stays a simple vertical stack of label + counts.

## Definitions

- **Pre-filter (MATCHES source):** Same semantics as `indicesIncludingExtras` and `printingIndicesIncludingExtras` in `runSearch` (Spec 057): populated only when `include:extras` is absent and the playable filter removed at least one card or printing from the combined pinned+live candidate set.
- **Post-filter (SHOWING source):** `indices.length` and the printing stream length the app already uses for the accordion footer and list (`liveCardCount` / `livePrintingCount`).

## Summary footer behavior

### PINNED row

Unchanged (Spec 079): optional row with pin icon, counts, `· N ignored` when the pinned breakdown has errors.

### Live rows

1. **Split (MATCHES + SHOWING)** when **all** are true:
   - `totalCards > 0` (post-filter face count).
   - The playable filter hid at least one **card** or **printing** (same condition as the Spec 057 non-empty `include:extras` rider: `hiddenCards > 0 || hiddenPrintings > 0`, using pre/post counts from the worker).

   Layout: stacked rows, **MATCHES** first (pre-filter totals), **SHOWING** second (post-filter totals). **MATCHES** keeps primary visual weight (font weight / contrast per Spec 079). **SHOWING** is secondary (similar cadence to PINNED). Counts on the right; optional **Learn more** link next to the **SHOWING** label (when `navigateToDocs` is available) opens the user-facing **`include:extras`** doc (`reference/modifiers/include-extras`), which explains **MATCHES** vs **SHOWING** and the default filter.

2. **Single live row (MATCHES only)** when split does not apply:
   - **Non-empty post-filter:** **MATCHES** shows post-filter counts (indistinguishable from pre–Spec-175 behavior).
   - **Zero post-filter with hidden pre-filter matches:** **MATCHES** shows **pre-filter** card count (and printing count when `printingIndicesIncludingExtras` is present and printing counts are relevant), so the footer aligns with breakdown chips. **Do not** add a **SHOWING** row (no redundant “0 cards”).

3. **`include:extras` in query:** No split; footer matches current single-row behavior (filter skipped).

### `include:extras` discoverability

Non-empty and empty-state **`include-extras`** suggestions behave as in Spec 057 / 151 (sky-panel **SuggestionList**). The **SHOWING** row’s **Learn more** link points at the user-facing **`include:extras`** reference doc, which documents **MATCHES** / **SHOWING** and when the split row appears.

### Optional threshold (deferred)

Issue #211 suggests hiding the split when only a tiny number of cards differ. **Out of scope** for the initial implementation; no minimum gap.

### Results Summary Bar (Spec 152)

**Out of scope:** The bar’s “matched N cards” line remains post-filter unless a follow-up spec extends it.

## Worker protocol

Expose optional fields on the `type: 'result'` message (as already described in Spec 057 prose; implementation aligns type + payload):

- `indicesIncludingExtras?: number`
- `printingIndicesIncludingExtras?: number`

Populated in `runSearch` whenever those values are computed today for `buildSuggestions` (same conditions).

## Acceptance criteria

1. With `include:extras` absent and the playable filter hiding matches, **non-empty** results: accordion footer shows **MATCHES** (pre-filter) and **SHOWING** (post-filter), with **Learn more** → `include:extras` docs when docs navigation is wired.
2. When nothing is hidden or counts match: a single live **MATCHES** row; behavior matches pre–Spec-175 footer counts.
3. **Zero** post-filter results with hidden matches: no **SHOWING** row; **MATCHES** shows pre-filter totals; empty-state suggestions unchanged.
4. Pinned + live: pre-filter totals reflect the **combined** candidate set after intersection, before the playable filter (`runSearch` order).
5. With `include:extras` present: no split; single **MATCHES** row with post-filter counts.
6. When split is shown, the Spec 057 non-empty **`include-extras` rider** in **SuggestionList** still appears when the worker supplies that suggestion (unchanged from pre–accordion-chip behavior).

## Changes by layer

| Layer | Change |
|-------|--------|
| `shared/src/worker-protocol.ts` | Add optional `indicesIncludingExtras`, `printingIndicesIncludingExtras` to `result`. |
| `app/src/worker-search.ts` | Spread pre-filter counts onto returned `result`. |
| `app/src/App.tsx` (and Dual Wield handlers) | Store counts from `result`; clear when clearing search state; pass to `UnifiedBreakdown`. |
| `app/src/DualWieldLayout.tsx` | `PaneState` + `UnifiedBreakdown` props for dual panes. |
| `app/src/UnifiedBreakdown.tsx` | Footer rows, split logic, **Learn more** on **SHOWING** row → `reference/modifiers/include-extras`. |
| `app/src/worker-search.test.ts` | Assert new `result` fields alongside existing `include-extras` suggestion tests. |

## Related specs

- Update Spec 079 § Summary footer: live section may be two rows (**MATCHES** + **SHOWING**); chevron centers on full stack.
- Update Spec 057: reference Spec 175 for accordion UX; clarify `result` fields as canonical for UI.

## Implementation Notes

- 2026-03-31: Removed inline **`include:extras`** `ChipButton` from the **SHOWING** row; it disrupted vertical rhythm. **`include-extras`** remains available via **SuggestionList** (rider / empty) only.
- 2026-03-31: Added **Learn more** next to **SHOWING** (when `navigateToDocs` is set) → `reference/modifiers/include-extras` user doc; doc section **Query breakdown: MATCHES and SHOWING** explains the split row and default filter.
