# Spec 044: Terms Drawer Redesign

**Status:** Implemented 

**Depends on:** Spec 037 (Histogram Toggles), Spec 036 (Source Spans), Spec 040 (Extended `is:` Keywords)

## Goal

Replace the TERMS drawer's fire-and-forget append-only chip model with tri-state cycling chips. Remove the redundant Types section (now covered by the histograms) and curate a broader set of high-value, low-discoverability query terms organized into four sections: Formats, Layouts, Deckbuilding, and Land Cycles.

## Background

### Current behavior

The TERMS drawer has two columns of click-to-append chips: Formats (`f:standard`, `f:pioneer`, `f:modern`, `f:commander`, `f:pauper`, `f:legacy`) and Types (`t:creature`, `t:instant`, `t:sorcery`, `t:artifact`, `t:enchantment`, `t:land`, `t:planeswalker`). Clicking a chip calls `appendQuery(term)`, which concatenates the term to the query string.

### Problems

1. **Redundancy.** The Types column duplicates the Card Type histogram (Spec 025), which now supports interactive drill/exclude toggles (Spec 037). There is no reason to have both.
2. **No state awareness.** Chips don't reflect whether their term already exists in the query. Clicking a chip that's already active appends a duplicate.
3. **No negation.** The only way to exclude a term is to manually type the `-` prefix. For terms like `is:reserved` or `is:funny`, exclusion is as useful as inclusion.
4. **Limited coverage.** With 51 `is:` keywords now supported (Spec 040) and 22 land cycle keywords, the drawer's six format chips underserve the available query vocabulary.

## Design

### Content

Four sections, ordered to maximize scan-ability and discovery:

**Formats** (reordered by popularity):

`f:commander`, `f:modern`, `f:standard`, `f:pioneer`, `f:pauper`, `f:legacy`

**Layouts** (card structure — invisible in histograms):

`is:dfc`, `is:transform`, `is:mdfc`, `is:split`, `is:adventure`, `is:saga`, `is:flip`, `is:meld`

**Deckbuilding** (meta-categories that cut across types):

`is:commander`, `is:partner`, `is:companion`, `is:reserved`, `is:permanent`, `is:spell`

**Land Cycles** (useful but hard-to-remember keywords):

`is:dual`, `is:fetchland`, `is:shockland`, `is:checkland`, `is:fastland`, `is:painland`, `is:triome`, `is:manland`, `is:bounceland`, `is:scryland`

### Tri-state cycling interaction

Each chip has three states and cycles through them on click:

```
neutral ──click──▶ positive ──click──▶ negative ──click──▶ neutral
```

| State | Query effect | Visual treatment |
|-------|-------------|-----------------|
| Neutral | Term absent from query | Muted gray chip (current default styling) |
| Positive | Term present, un-negated (e.g., `is:dfc`) | Filled blue background, white text |
| Negative | Term present, negated (e.g., `-is:dfc`) | Red-tinted background, line-through text |

The cycling model rewards tap-to-explore: tap once to see what a term includes, tap again to see what it excludes, tap a third time to return to neutral.

### Active state detection

The drawer computes a synchronous breakdown from the query string via `parseBreakdown()` (same pattern as `ResultsBreakdown`). For each chip, the state is determined by searching the breakdown tree:

- **Positive:** `findFieldNode(bd, fields, operator, false, v => v === value)` returns non-null.
- **Negative:** `findFieldNode(bd, fields, operator, true, v => v === value)` returns non-null.
- **Neutral:** Neither search returns a result.

Field alias lists for each chip type:

| Chip type | Fields | Operator |
|-----------|--------|----------|
| Format | `['f', 'format', 'legal']` | `:` |
| `is:` keyword | `['is']` | `:` |

### Cycling logic (`cycleChip`)

A new function in `query-edit.ts` encapsulates the three-state cycle:

```typescript
function cycleChip(
  query: string,
  breakdown: BreakdownNode | null,
  opts: { field: string[]; operator: string; value: string; term: string },
): string
```

Where `term` is the canonical append form (e.g., `f:commander`, `is:dfc`).

**Neutral → Positive:** No same-polarity or opposite-polarity node exists. Append the term via `appendTerm`.

**Positive → Negative:** Same-polarity (un-negated) node exists. Remove it, then re-parse the updated query and append the negated term.

**Negative → Neutral:** Opposite-polarity (negated) node exists, no un-negated node exists. Remove the negated node.

This function internally uses `findFieldNode` for detection and `removeNode` + `appendTerm` for mutation, plus `parseBreakdown` to get a fresh breakdown after removal when transitioning from positive to negative.

### Layout

The drawer uses a **tabbed** layout to keep vertical height minimal on mobile. Only one section's chips are visible at a time.

```
┌──────────────────────────────────────────────────────────┐
│ FORMATS  LAYOUTS  ROLES  LANDS                [?] [×]     │
│ f:commander  f:modern  f:standard  f:pioneer  ...        │
└──────────────────────────────────────────────────────────┘
```

**Tab row:** Four tab buttons (`FORMATS`, `LAYOUTS`, `ROLES`, `LANDS`) left-aligned, followed by a spacer, then the help (`?`) and close (`×`) buttons right-aligned. The active tab is highlighted with a blue text/background tint. Tab labels are short plurals that clearly communicate each section contains multiple items.

**Content area:** A single `flex flex-wrap` row of chips for the active tab. Chips wrap naturally — no horizontal scroll or overflow.

**Persistence:** The active tab is saved to localStorage (`frantic-terms-tab`) so it persists across sessions.

### Props

The drawer's prop interface changes from append-only to query-aware:

```typescript
// Before
{ onChipClick: (term: string) => void; onHelpClick: () => void; onClose: () => void }

// After
{ query: string; onSetQuery: (query: string) => void; onHelpClick: () => void; onClose: () => void }
```

This matches the `ResultsBreakdown` prop pattern.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/query-edit.ts` | Add `cycleChip` function |
| `app/src/query-edit.test.ts` | Tests for `cycleChip` covering all state transitions, alias preservation, and splice correctness |
| `app/src/TermsDrawer.tsx` | Complete rewrite: four sections, tri-state chip component, `parseBreakdown`-based state detection |
| `app/src/App.tsx` | Pass `query` and `onSetQuery` to `TermsDrawer` instead of `onChipClick`; remove `appendQuery` if no longer used elsewhere |
| `docs/specs/037-histogram-toggles.md` | Implementation note referencing this spec |

## Test Strategy

### Unit tests for `cycleChip`

| Initial query | Chip | Expected result |
|---------------|------|-----------------|
| (empty) | `f:commander` | `f:commander` |
| `f:commander` | `f:commander` | `-f:commander` |
| `-f:commander` | `f:commander` | (empty) |
| (empty) | `is:dfc` | `is:dfc` |
| `is:dfc` | `is:dfc` | `-is:dfc` |
| `-is:dfc` | `is:dfc` | (empty) |
| `format:commander` | `f:commander` | `-format:commander` |
| `-format:commander` | `f:commander` | (empty) |
| `t:creature is:dfc` | `is:dfc` | `t:creature -is:dfc` |
| `t:creature -is:dfc` | `is:dfc` | `t:creature` |

### Multi-step sequences

| Sequence | Expected |
|----------|----------|
| tap `f:commander`, tap `is:dfc`, tap `f:commander` again | `is:dfc -f:commander` |
| tap `is:dual`, tap `is:dual`, tap `is:dual` | (empty) — full round-trip |

## Edge Cases

### User-typed aliases

The user may type `format:commander` instead of `f:commander`. The chip detects this via `findFieldNode` with the full alias list `['f', 'format', 'legal']`. Cycling modifies the existing node (preserving the alias) rather than appending a duplicate.

### Multiple nodes of the same field

If the query contains `f:commander f:commander`, DFS finds the first. The chip cycles that node. Consolidation is out of scope (consistent with Spec 037).

### OR-rooted queries

When appending to a query whose root is an OR node, the existing parenthesization logic applies: `(existing) term` or `(existing) -term`.

## Acceptance Criteria

1. The Types section is removed from the TERMS drawer.
2. Four sections appear: Formats, Layouts, Deckbuilding, Land Cycles with the specified chips.
3. Each chip cycles through neutral → positive → negative → neutral on click.
4. Chips reflect the current query state (including user-typed queries with aliases).
5. Positive chips have a visually distinct filled style; negative chips have a red/line-through style.
6. Land Cycles chips flex-wrap (no horizontal scroll).
7. The close (×) and help (?) buttons remain functional.
8. `cycleChip` has unit tests covering all transitions.
