# Spec 151: Unified Suggestion System for Alternative Queries and Syntax Education

**Status:** Implemented

**Depends on:** Spec 057 (include:extras), Spec 126 (Empty List CTA), Spec 131 (Oracle Did You Mean), Spec 139 (unique:prints hint), Spec 150 (ChipButton)

**Addresses:** [Issue #171](https://github.com/jimbojw/frantic-search/issues/171)

## Goal

Unify the existing ad-hoc suggestion mechanisms under a consistent control flow and UI pattern, and establish an extensible architecture for new suggestion triggers. Zero-result searches must never be a dead end — every empty state offers at least one actionable next step.

## Background

### Current state

Four suggestions exist today, implemented independently:

| Trigger | Spec | Source | Placement |
|---------|------|--------|-----------|
| Empty list (`my:list` / `#` with no instances) | 126 | Main thread | Replaces empty state |
| Playable filter hides results | 057 | Worker | Empty state or rider |
| Printings hidden (dedup) | 139 | Main thread | Rider only |
| Bare tokens → oracle alternative works | 131 | Worker | Empty state only |

Priority is hardcoded in `SearchResults.tsx`: empty-list CTA > include:extras > oracle hint. The `unique:prints` rider appears only when results exist, so it lives outside the empty-state cascade. Each suggestion uses separate `Show` blocks and different protocol shapes (`oracleHint`, `indicesIncludingExtras`, `defaultListEmpty`, etc.).

### Problem

- **Inconsistent surfacing:** New triggers (card type tokens, artist/atag confusion, near-miss syntax, small-result relaxations) would each require ad-hoc wiring.
- **No composition:** Multiple suggestions can apply (e.g., empty list + include:extras) but only one is shown due to strict priority. Future triggers need a principled way to rank and compose.
- **Scattered logic:** Worker and main thread each own different pieces; there is no single place that understands "what suggestions apply right now."

### Design principles (from Issue #171)

1. **Never fail silently.** A 0-result search always offers at least one actionable next step.
2. **High visibility.** Suggestions are prominent, not footnotes.
3. **Composable.** Multiple suggestions may apply; the system can surface more than one, ranked by usefulness.
4. **Narrowest suggestion first.** Where multiple reformulations exist, offer the most specific first. Example: for `draw two`, suggest `o:"draw two"` (phrase) before `o:draw o:two` (per-word) — a two-word sequence is more specific than two one-word oracle queries.
5. **Teach, don't just fix.** Where possible, show *why* a suggestion works (e.g., "Use `a:` for artist search when available"). Deep-link into the docs when relevant — e.g., an oracle hint can link to `?doc=reference/fields/face/oracle`; an `include:extras` suggestion to `?doc=reference/modifiers/include-extras`.
6. **Consistent UI pattern.** All suggestions use the same visual component and interaction model.

## Design

### Data model: Suggestion

A suggestion is a single actionable item the user can tap.

```typescript
/** Single suggestion shown to the user. */
export type Suggestion = {
  /** Unique id for this trigger; used for deduplication and analytics. */
  id: 'empty-list' | 'include-extras' | 'unique-prints' | 'oracle' | 'card-type' | 'keyword' | 'artist-atag' | 'near-miss' | 'relaxed' | 'example-query'
  /** Full query to apply when user taps (rewrite suggestions). Omit for CTA-style (navigate, paste). */
  query?: string
  /** Short label for the chip, e.g. "include:extras", "o:scry". */
  label: string
  /** Optional teaching copy: explains why this helps. */
  explain?: string
  /** Optional doc param for deep-link (e.g. "reference/fields/face/oracle"). Rendered as "Learn more" link when present. */
  docRef?: string
  /** Card count when tapping would change results; for two-line chip display. */
  count?: number
  /** Printing count when relevant. */
  printingCount?: number
  /** 0 = highest; lower values appear first. */
  priority: number
  /** 'rewrite' = setQuery; 'cta' = custom action (navigate, paste). */
  variant: 'rewrite' | 'cta'
  /** For CTA variant: function key to invoke (e.g. 'navigateToLists'). */
  ctaAction?: 'navigateToLists' | 'pasteList'
}
```

### Control flow

1. **Worker** produces the full `suggestions: Suggestion[]` array. It has everything needed to do so:
   - Query (live + pinned), `getListMask` (list cache), parse/eval results, `appendTerm`, `sealQuery`
   - Empty-list: query references `my:list`/`my:default`/`#` and `getListMask("default")` is empty
   - include-extras, oracle, unique-prints: already computed or derivable from search output
   - Lists/Import CTA is always available (persistent header button); no conditional filtering

2. **Main thread** receives `suggestions` from the worker result and passes through to SearchResults. No merge, no main-thread context, no translation.

3. **SearchResults** consumes `suggestions: Suggestion[]` and renders a single `SuggestionList` component that:
   - When `totalCards === 0`: Results Summary Bar (Spec 152) at top, then SuggestionList for empty-state suggestions (including empty-list chip when applicable).
   - When `totalCards > 0`: Results Summary Bar below the results list, then rider suggestions.
   - All chips use `ChipButton` (Spec 150).

### Placement rules

| Context | Eligible suggestion ids | Max shown | Placement |
|---------|-------------------------|-----------|-----------|
| Empty state | empty-list, include-extras, oracle, card-type, keyword, artist-atag, near-miss, example-query | All that apply, priority-ordered; example-query as fallback when none others apply | Below Results Summary Bar (Spec 152); bar shows effective query + actions |
| Non-empty riders | unique-prints, include-extras | Both when both apply | Below Results Summary Bar (Spec 152); bar is directly beneath results list; **fixed order:** unique-prints first, then include-extras (not priority order) |

Results area footer unified by Spec 152 (Results Summary Bar).

### Example query fallback (example-query)

When the empty state has *no* context-specific suggestions (no include-extras, oracle hint, etc.), show an example query CTA so the user always has something to try. Example: "Find Commander legal cards with `f:commander`?" Tapping applies the query. We may end up with a rotating lineup — e.g. `f:commander`, `t:creature`, `ci:g` — to surface different syntax over time. One example per empty state; selection could be random, session-based, or curated.

**Empty-list CTA (Spec 152):** When the worker includes `empty-list` in suggestions, it appears as a chip in SuggestionList below the Results Summary Bar. Uniform treatment—no separate "Your list is empty" block; the bar shows effective query + actions, SuggestionList shows all applicable chips (empty-list, include-extras, oracle, etc.).

### Priority values (convention)

| id | priority | Rationale |
|----|----------|-----------|
| empty-list | 0 | Highest — user cannot get results without a list |
| include-extras | 10 | Unblocks hidden playable-filtered results |
| oracle | 20 | Reformulates bare tokens to oracle search |
| unique-prints | 30 | Rider context; expand printings |
| (future) card-type | 15 | Type token reformulation; between extras and oracle (e.g. "creatures" → t:creature) |
| (future) keyword | 16 | Keyword token reformulation; after card-type (e.g. "landfall" → kw:landfall; "first strike" → kw:"first strike") |
| (future) artist-atag | 25 | Cross-detect atag vs a; suggest the field that returns results |
| (future) near-miss | 18 | Unquoted multi-word field value; suggest quoted form when it would match |
| (future) relaxed | 35 | "Try broader" alternative |
| example-query | 40 | Fallback — when no other empty-state suggestion applies; ensures we never fail silently |

### Wire protocol

Add `suggestions: Suggestion[]` to the `result` variant of `FromWorker`. The worker produces the full array; no translation on the main thread.

Deprecate/remove `oracleHint`, `indicesIncludingExtras`, `printingIndicesIncludingExtras` from the result — they are folded into `suggestions`.

### UI component: SuggestionList

A single component replaces the scattered `Show` blocks:

```tsx
// Conceptual; actual API TBD during implementation
<SuggestionList
  suggestions={emptyStateSuggestions()}
  onApplyQuery={(q) => ctx.setQuery(q)}
  onCta={(action) => { if (action === 'navigateToLists') ctx.navigateToLists() }}
  formatDualCount={formatDualCount}
/>
```

- Empty state: renders contextual wrappers ("Did you mean to search oracle text? Try ", "Try again with ", etc.) with chips. SuggestionList derives wrapper text from `id` (per-id lookup).
- Rider: renders "N not shown. Try [chip]?" / "Additional printings… Try [chip]?" patterns.
- All chips use `ChipButton` with `state="neutral"`; two-line layout when `count`/`printingCount` present.
- When `docRef` is set, show a "Learn more" link that navigates to `?doc={docRef}` (e.g. `reference/fields/face/oracle` for oracle hints).

### Migration of existing behavior

| Existing | Worker produces |
|----------|-----------------|
| Empty-list CTA (Spec 126) | `Suggestion { id: 'empty-list', variant: 'cta', ctaAction: 'navigateToLists' }` when query references my:list/my:default/# and `getListMask("default")` is empty and results are zero. |
| include:extras (Spec 057) | `Suggestion { id: 'include-extras', query, label, count, printingCount, docRef: 'reference/modifiers/include-extras' }`. Empty: totalCards === 0 and indicesIncludingExtras. Rider: totalCards > 0 and hidden playable-filtered results. |
| unique:prints (Spec 139) | `Suggestion { id: 'unique-prints', query, label, docRef: 'reference/modifiers/unique' }`. Rider only. Trigger: uniqueMode !== 'prints' and `totalPrintingItems > totalDisplayItems`. |
| Oracle hint (Spec 131) | `Suggestion { id: 'oracle', query, label, count, printingCount, docRef: 'reference/fields/face/oracle' }` from existing oracleHint logic. Empty state only. |

**Invariant:** Same triggers and tap actions as before. Placement and layout may be improved—looking good takes precedence over perfect parity with the status quo. "Learn more" links (docRef) are encouraged as part of the unified UI pattern.

## Future triggers (out of scope here)

Each future trigger gets its own spec. This document records the intended ids and rough priority:

| Trigger | id | Spec | Notes |
|---------|-----|------|------|
| Card type tokens | card-type | TBD | "creatures" → `t:creature`; "creatures scry" → `t:creature o:scry`; narrowest first |
| Keyword tokens | keyword | TBD | "landfall" → `kw:landfall`; "first strike" → `kw:"first strike"`; known keywords get kw: before o: |
| Artist / atag confusion | artist-atag | TBD | Cross-detect: `atag:Dan Frazier` + 0 but `a:"Dan Frazier"` returns results → suggest `a:`; or `a:X` + 0 but `atag:X` returns results → suggest `atag:`. [Issue #128 comment](https://github.com/jimbojw/frantic-search/issues/128) |
| Near-miss: unquoted multi-word | near-miss | TBD | Bare term(s) after a field term: `a:Dan Frazer` parsed as `a:Dan` + bare `Frazer`; when `a:"Dan Frazer"` would match → "Did you mean `a:"Dan Frazer"`?" Same for `atag:dan frazier` → `atag:"dan frazier"` |
| Small result set | relaxed | TBD | 1–3 results; relaxed query returns more; offer as alternative |
| Example query fallback | example-query | TBD | 0 results + no other suggestions → "Find Commander legal cards with `f:commander`?"; rotating lineup |

## Implementation notes

- **Worker suggestion building:** runSearch receives `getListMask` in params (same callback used by NodeCache); has `msg` (query, pinnedQuery), eval results (indices, printingIndices, uniqueMode, totalDisplayItems, totalPrintingItems, etc.); imports `appendTerm`, `parseBreakdown`, `hasMyInQuery`, `hasHashInQuery` from query-edit. For empty-list: parse the effective query, check `hasMyInQuery(bd) || hasHashInQuery(bd)`, and `getListMask("default")?.printingIndices?.length === 0` (or empty/undefined), plus zero results.
- **include-extras rider trigger:** `indicesIncludingExtras` defined and `(indicesIncludingExtras - totalCards) > 0`.
- **Rider order:** Fixed sequence `['unique-prints', 'include-extras']`. Priority governs empty-state order only.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/worker-protocol.ts` | Add `suggestions: Suggestion[]` to result; remove `oracleHint`, `indicesIncludingExtras`, `printingIndicesIncludingExtras` |
| `shared/src/suggestion-types.ts` | **New** — `Suggestion` type (worker-protocol carries it; shared is dependency-free) |
| `app/src/worker-search.ts` | Build `suggestions` array in runSearch; add `getListMask` to RunSearchParams for empty-list check; populate all four triggers |
| `app/src/worker.ts` | Pass `getListMask` to runSearch |
| `app/src/SuggestionList.tsx` | **New** — Renders suggestion chips; empty-state vs rider layouts |
| `app/src/SearchResults.tsx` | Refactor: replace four `Show` blocks with `SuggestionList`; consume `suggestions` from context |
| `app/src/App.tsx` | Pass `suggestions` from worker result to pane state; remove `defaultListEmpty`, `oracleHint`, `indicesIncludingExtras` wiring |
| `app/src/pane-state-factory.ts` | Add `suggestions` to PaneState; remove `defaultListEmpty` |
| `app/src/DualWieldLayout.tsx` | Pass `suggestions` through `buildPaneContext` |

### Spec updates

| Spec | Update |
|------|--------|
| 057 | Add "Unified by Spec 151 (Suggestion System)" |
| 126 | Add "Unified by Spec 151" |
| 131 | Add "Unified by Spec 151" |
| 139 | Add "Unified by Spec 151" |
| 150 | Note SuggestionList uses ChipButton |

## Acceptance Criteria

1. After migration, empty-list CTA, include:extras, unique:prints, and oracle hint fire on the same triggers and perform the same actions. Layout may be improved; parity with pre-migration is not strict.
2. All suggestion chips use `ChipButton` with consistent styling.
3. Worker produces priority-ordered suggestions; when empty-list applies, SearchResults renders the Spec 126 block and skips inline chips.
4. Rider suggestions (unique:prints, include:extras) appear in fixed order when both apply (unique-prints first).
5. Works in single-pane and Dual Wield layouts.
6. `Suggestion` type and worker-owned logic support future triggers without main-thread changes.
