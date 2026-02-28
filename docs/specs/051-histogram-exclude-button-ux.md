# Spec 051: Histogram Exclude Button UX

**Status:** Implemented

**Depends on:** Spec 037 (Histogram Toggles), Spec 043 (Graduated Color Identity Interaction)

**GitHub Issue:** [#39](https://github.com/jimbojw/frantic-search/issues/39)

## Goal

Fix the directional and semantic dissonance of the histogram exclude ("less of") buttons by moving them to the left side of each row and replacing the × icon with a minus sign.

## Background

Each histogram row in the Results Breakdown has two interactive targets:

- **Bar click** (drill / "more of this") — the colored bar area filling left-to-right.
- **× click** (exclude / "less of this") — a circular button currently positioned to the right of the bar.

Two UX problems:

1. **Directional dissonance.** The × button sits at the right end of the row — the high end of the bar's scale — but its purpose is to *reduce* prevalence. This conflicts with the left-to-right growth direction of the bars.
2. **Semantic confusion.** The × icon universally reads as "remove this." When a field value is already maximally excluded (e.g., `-t:creature`), the red × looks like an invitation to remove the constraint, when it actually means the opposite.

## Design

### Layout change

Move the exclude button from the right end to the left end of each `BarRow`, before the label:

**Before:**

```
[Label] | [Bar ────────────────] [×]
```

**After:**

```
[−] [Label] | [Bar ────────────────]
```

The button's sizing (`size-6 shrink-0`), active/inactive color states, and click behavior are unchanged.

### Icon change

Replace the × SVG path (`M18 6L6 18M6 6l12 12`) with a horizontal minus sign (`M5 12h14`). The minus sign communicates "less of this" without the "remove" connotation of ×.

### Accessibility

Update the `aria-label` from `"Exclude"` to `"Less"`.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/ResultsBreakdown.tsx` | In `BarRow`: reorder flex children so the exclude button precedes the label; replace × SVG path with minus; update aria-label |

## Risk

Purely cosmetic. No query logic, data flow, toggle behavior, or active-state detection is affected.

## Acceptance Criteria

1. The exclude button appears to the left of the label in every histogram row (mana value, color identity, card type).
2. The button icon is a minus sign, not an ×.
3. All existing toggle/exclude behavior is preserved (no functional regression).
