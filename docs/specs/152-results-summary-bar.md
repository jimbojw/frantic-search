# Spec 152: Results Summary Bar

**Status:** Implemented

**Depends on:** Spec 151 (Suggestion System), Spec 079 (Consolidated Query Accordion), Spec 052 (Scryfall Outlink Canonicalization), Spec 088 (Syntax Highlight Eval Feedback), Spec 126 (Empty List CTA)

**References:** [Discussion: Search results / spec 151 suggestions enhancement](https://github.com/jimbojw/frantic-search/)

## Goal

Add a uniform two-cell results footer that appears beneath the search results in both match and zero-match cases. The bar echoes the effective query with syntax highlighting and provides Try on Scryfall, Syntax help, and Report a problem—giving users a consistent, informative anchor after scrolling through results or when no results were found.

## Background

### Current state

When `totalCards === 0`, the empty state shows:

- "No cards found" (plain text)
- Try on Scryfall and Report a problem links (muted)
- SuggestionList with contextual chips (or empty-list CTA when applicable)

Syntax help is *not* shown in the empty state; it appears only in the query breakdown accordion (Spec 079).

When `totalCards > 0`, the results list (or image grid) is followed by optional rider suggestions (unique:prints, include:extras). There is no repeat of the user's query or summary message beneath the results.

### Problem

- **No query echo:** Users who have scrolled through results—or who have pinned terms they forgot about—do not see what they searched at a glance. The query lives only in the input and the breakdown accordion above.
- **Inconsistent actions:** Empty state lacks Syntax help; the query breakdown has Try on Scryfall, Syntax help, and Report a problem. Action parity improves discoverability.
- **Muted empty state:** The current "No cards found" plus links feel like an afterthought. A syntax-highlighted query echo reinforces what was searched and makes zero-result states more informative.

## Design

### Layout

A two-cell flex row, matching the expanded query breakdown (UnifiedBreakdown) action column pattern:

| Cell | Content | Behavior |
|------|---------|----------|
| Left (stretch) | **Three stacked lines:** (1) "Your query," (2) syntax-highlighted query in chip-like box, (3) "matched N cards (M prints)." or "matched zero cards." | `flex flex-col gap-1.5`; query box (`rounded px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-sm font-mono min-w-0`); QueryHighlight uses `whitespace-pre-wrap break-words` to wrap long queries |
| Right (shrink) | Try on Scryfall ↗, Syntax help, Report a problem | `flex-col gap-1 shrink-0 items-end`; stacked vertically as in UnifiedBreakdown |

The right column uses `ResultsActionsColumn` (shared with UnifiedBreakdown). Syntax help is conditional on `navigateToDocs` being present.

### Placement

- **When totalCards > 0:** Rider suggestions (unique:prints, include:extras, empty-list, etc.) render directly beneath the results list/grid when applicable, then the bar as the bottom footer of the results box. Users see results first, then optional refinement suggestions, then the bar.
- **When totalCards === 0:** SuggestionList (or the empty-list Import deck CTA) appears at the top of the empty-state block; the bar replaces "No cards found" and the separate links paragraph and follows SuggestionList when the effective query is non-empty (Spec 155 omits the bar when the effective query is empty).
- **Empty-list case:** Same as all zero-result cases. The bar shows the three-line format with "matched zero cards." The `my:list` term will appear in amber (error styling) when the list is empty. SuggestionList includes the empty-list CTA chip. Uniform treatment—no special-case layout for empty-list.

### Message copy

Three-line stacked format (works well on desktop and mobile):

| Line | Content |
|------|---------|
| 1 | "Your query," |
| 2 | `{syntax-highlighted effective query}` in chip-like box |
| 3 | "matched N cards (M prints)." or "matched zero cards." |

Long queries wrap inside the chip box via `whitespace-pre-wrap break-words`.

**Printing count:** Omit when zero. When `totalPrintingItems > 0` and the display is printing-aware (e.g. `uniqueMode === 'prints'` or `hasPrintingConditions`), include it. Use `formatDualCount(cardCount, printingCount)` from InlineBreakdown for the count portion—it returns e.g. `"30.6k cards (151k prints)"`, matching Spec 082 / UnifiedBreakdown.

### Data dependencies

- **effectiveQuery:** `sealQuery(pinned) + ' ' + sealQuery(live)` — the full effective query evaluated by the worker. Surfaces pinned terms for users who may have forgotten them.
- **effectiveBreakdown:** From worker result for error styling in syntax highlighting (Spec 088). Passed to `buildSpans` so invalid/ignored tokens appear in amber/red.
- **totalCards, totalPrintingItems:** From pane state.
- **scryfallUrl, navigateToDocs, navigateToReport:** Already in SearchContext.

### Syntax highlighting

Use `QueryHighlight` with `query={effectiveQuery}` and `breakdown={effectiveBreakdown}`. Pass `class="inline whitespace-pre-wrap break-words"` so long queries wrap instead of overflowing. Field names, operators, and values use semantic colors; error and zero-match regions (e.g. unknown field `foo:bar`, empty `my:list`) use warning styling (red/amber) via Spec 088. The query sits in a chip-like box (`rounded px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-sm font-mono min-w-0`).

## UI component: ResultsSummaryBar

```tsx
// Conceptual API
<ResultsSummaryBar
  effectiveQuery={ctx.effectiveQuery()}
  effectiveBreakdown={ctx.effectiveBreakdown()}
  cardCount={ctx.totalCards()}
  printingCount={ctx.totalPrintingItems() > 0 ? ctx.totalPrintingItems() : undefined}
  zeroResult={cardCount === 0}
/>
```

The component consumes `scryfallUrl`, `navigateToDocs`, `navigateToReport` from SearchContext via ResultsActionsColumn (no props). Left cell: three stacked lines (`flex flex-col gap-1.5`)—"Your query," then query in chip box, then "matched …". Message `text-base text-gray-600`; query box `rounded px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-sm font-mono min-w-0`; QueryHighlight with `whitespace-pre-wrap break-words`. Container: `border-t border-gray-200 dark:border-gray-800`, `px-3 py-2` (or `py-3` for zero-result case).

## Shared component: ResultsActionsColumn

PostHog: **Try on Scryfall** fires `scryfall_outlink_clicked` (Spec 085).

Extract the three-link column from UnifiedBreakdown into a shared component to avoid duplication:

- **Try on Scryfall ↗** — Outlink; `text-blue-500` styling
- **Syntax help** — Button when `navigateToDocs` present; navigates to `?doc=reference/syntax`
- **Report a problem** — Button with IconBug

Both UnifiedBreakdown and ResultsSummaryBar use this component. Styling: `text-sm`, `flex flex-col gap-1 shrink-0 items-end`, link classes matching UnifiedBreakdown.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/SearchContext.tsx` | Add `effectiveQuery: () => string`, `effectiveBreakdown: () => BreakdownNode or null` to interface |
| `app/src/DualWieldLayout.tsx` | Expose `effectiveQuery`, `effectiveBreakdown` in `buildPaneContext` |
| `app/src/App.tsx` | Expose both in single-pane context; ensure `effectiveBreakdown` flows from worker result |
| `app/src/ResultsActionsColumn.tsx` | **New** — Extracted three-link column; used by UnifiedBreakdown and ResultsSummaryBar |
| `app/src/ResultsSummaryBar.tsx` | **New** — Two-cell bar: left = three-line stacked layout ("Your query," + chip box + "matched …"); right = ResultsActionsColumn |
| `app/src/UnifiedBreakdown.tsx` | Replace inline links with `ResultsActionsColumn` |
| `app/src/SearchResults.tsx` | Integrate ResultsSummaryBar: after optional SuggestionList when totalCards > 0; empty state shows SuggestionList then ResultsSummaryBar when the effective query is non-empty (GitHub #233) |

## Spec updates

| Spec | Update |
|------|--------|
| 151 | Add "Results area footer unified by Spec 152 (Results Summary Bar)" to placement rules |
| 079 | Note that ResultsActionsColumn is shared with Spec 152 |
| 126 | Empty-list CTA appears in SuggestionList above Results Summary Bar when the bar is shown; bar shows effective query uniformly |

## Acceptance Criteria

1. Results Summary Bar appears after the results list/grid (and after optional rider SuggestionList) when `totalCards > 0`.
2. Results Summary Bar appears in the empty-state block when `totalCards === 0`, after SuggestionList when the effective query is non-empty.
3. Bar shows syntax-highlighted effective query (pinned + live) in both cases.
4. Bar includes Try on Scryfall, Syntax help (when `navigateToDocs` present), and Report a problem.
5. Message copy: "matched N cards (M prints)" or "matched zero cards" as specified (via `formatDualCount` when printing count present).
6. Empty-list case uses the same bar; Import deck CTA and SuggestionList render above the bar.
7. Single-pane and Dual Wield layouts both work.
8. Rider suggestions (unique:prints, include-extras, empty-list) render above the bar when present.

### Refinements area typography

The SuggestionList (refinement suggestions) uses `text-base` to match the bar's message copy, keeping the footer area visually cohesive.

## Out of scope

- Suggestion reformatting (future Spec 151 update)
