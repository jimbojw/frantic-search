# Spec 102: EDHREC and Salt Percentile Chips in MenuDrawer

**Status:** Implemented 

**Depends on:** Spec 083 (MenuDrawer), Spec 044 (Terms Drawer Redesign), Spec 099 (EDHREC Rank Support), Spec 101 (EDHREC Salt Support), Spec 095 (Percentile Filters)

## Goal

Add two new TERMS sections to the MenuDrawer — **Popularity** (EDHREC) and **Salt** — each with three toggleable percentile filter chips. This makes percentile filters for these fields easily accessible on mobile without typing.

## Background

EDHREC rank (Spec 099) and salt (Spec 101) support percentile queries (`edhrec>90%`, `salt>90%`). Users must currently type these terms. On mobile, typing `edhrec>95%` is cumbersome. The existing prices section (`$<5`, `$<10`, etc.) demonstrates the value of one-tap filter chips.

These chips differ from format/is/rarity chips in one important way: **at most one chip per section should be active**. Selecting `>95%` should replace `>90%`, not add to it. The tri-state cycle (neutral → active → negated → neutral) still applies to the *tapped* chip.

## Design

### Content

Two new sections, each with three chips:

| Section   | Chips   | Query terms                         |
|-----------|---------|-------------------------------------|
| Popularity| `>90%`, `>95%`, `>99%` | `edhrec>90%`, `edhrec>95%`, `edhrec>99%` |
| Salt      | `>90%`, `>95%`, `>99%` | `salt>90%`, `salt>95%`, `salt>99%` |

**Chip labels:** Short form (`>90%`) — the section header provides context (Popularity vs Salt).

**Semantics:**
- `edhrec>90%` = top 10% most popular (rank inversion per Spec 099)
- `salt>90%` = top 10% saltiest (no inversion per Spec 101)

### Mutually exclusive behavior

When the user taps any chip in a section:

1. **Clear all terms for that field** from the query. Remove every `edhrec` filter term (any operator, any value) or every `salt` filter term. This includes manually typed terms (e.g. `edhrec<10%`) and terms from other chips.
2. **Apply the tapped chip's cycle logic** to the cleared query:
   - If the tapped chip was **neutral** → append the positive term (e.g. `edhrec>90%`)
   - If the tapped chip was **active** → append the negated term (e.g. `-edhrec>90%`)
   - If the tapped chip was **negated** → do nothing (already cleared in step 1; result is neutral)

State detection uses the *cleared* query to determine the tapped chip's state before the tap. After step 1, the tapped chip is always neutral (its term was removed). So the effective behavior is:

- **Tapping a different chip:** Clear all, then add the new chip's positive term. (The new chip was neutral.)
- **Tapping the same chip (currently active):** Clear all, then add the negated term. (Positive → negated.)
- **Tapping the same chip (currently negated):** Clear all, then stop. (Negated → neutral.)

### Tri-state cycle (per chip)

| State   | Query effect        | Visual treatment                          |
|---------|---------------------|--------------------------------------------|
| Neutral | Term absent         | Muted gray chip                            |
| Active  | Term present        | Filled blue background, white text         |
| Negated | Negated term present| Red-tinted background, line-through text    |

Same styling as existing TermChip (Spec 044).

### Active state detection

For each chip, search the breakdown:

- **Active:** `findFieldNode(bd, field, operator, false, v => v === value)` returns non-null
- **Negated:** `findFieldNode(bd, field, operator, true, v => v === value)` returns non-null
- **Neutral:** Neither returns a result

| Section   | Fields                          | Operator | Values   |
|-----------|----------------------------------|----------|----------|
| Popularity| `['edhrec', 'edhrecrank']`       | `>`      | `90%`, `95%`, `99%` |
| Salt      | `['salt', 'edhrecsalt', 'saltiness']` | `>`      | `90%`, `95%`, `99%` |

### Section placement

Insert after **prices** and before **sort**:

```
...
prices
popularity   ← new
salt         ← new
sort
...
```

### Clear predicate

A new helper (or extension of `clearFieldTerms`) removes all terms matching a field family. For Popularity: any node whose label (stripped of leading `-`) matches `edhrec` or `edhrecrank` followed by any operator and value. For Salt: `salt`, `edhrecsalt`, or `saltiness`. This ensures manually typed terms (e.g. `edhrec<10%`) are also cleared when the user taps a chip.

## Implementation

### New function: `cyclePercentileChip`

```ts
function cyclePercentileChip(
  query: string,
  breakdown: BreakdownNode | null,
  opts: {
    field: string[]
    operator: string
    value: string
    term: string
    clearPredicate: (label: string) => boolean
  },
): string
```

1. Determine tapped chip state (positive / negated / neutral) from `breakdown` using `findFieldNode`.
2. Clear all terms matching `clearPredicate` from the query. Re-parse to get fresh breakdown.
3. Apply cycle transition:
   - **Positive** → append negated term (`-${opts.term}`)
   - **Negated** → append nothing (already cleared; result is neutral)
   - **Neutral** → append positive term (`opts.term`)

### Chip definitions

```ts
const POPULARITY_FIELDS = ['edhrec', 'edhrecrank']
const SALT_FIELDS = ['salt', 'edhrecsalt', 'saltiness']

function popularityClearPredicate(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  return POPULARITY_FIELDS.some(f => raw.toLowerCase().startsWith(f))
}

function saltClearPredicate(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  return SALT_FIELDS.some(f => raw.toLowerCase().startsWith(f))
}
```

Each chip: `{ label: '>90%', field, operator: '>', value: '90%', term: 'edhrec>90%', clearPredicate }`. All chips use operator `>`. Use `cyclePercentileChip` instead of `cycleChip` for these sections.

**Clear implementation note:** The existing `clearFieldTerms` only removes direct children of the root. For typical flat AND queries (`t:creature edhrec>90%`), that suffices. If the implementation encounters nested structures where edhrec/salt terms appear inside OR or nested AND, a recursive walk may be required to find and remove all matching nodes.

## Edge Cases

1. **Manually typed terms:** If the user has `edhrec<10%` (typed) and taps `>90%`, we clear `edhrec<10%` and add `edhrec>90%`. The clear predicate matches any edhrec/salt term, so manual terms are removed. This keeps the section's "one filter at a time" invariant.

2. **Aliases in query:** The user might type `edhrecrank>95%` or `saltiness>90%`. `findFieldNode` uses the field alias list, so state detection works. The clear predicate matches `edhrecrank` and `saltiness` via the field arrays.

3. **Empty query:** Clearing yields empty string. `appendTerm('', term, null)` returns the term. Correct.

4. **OR at root:** If the query is `(t:creature OR t:instant)`, appending follows existing `appendTerm` behavior (paren wrapping). Clearing must handle AND/OR structure — `clearFieldTerms` walks direct children; nested terms may require a recursive clear.

5. **Multiple sections:** Popularity and Salt are independent. The user can have both `edhrec>90%` and `salt>95%` active. Clearing in one section does not affect the other.

## Files to Touch

| File | Changes |
|------|---------|
| `app/src/query-edit-chips.ts` | Add `cyclePercentileChip` |
| `app/src/query-edit.ts` | Export `cyclePercentileChip` |
| `app/src/MenuDrawer.tsx` | Add `popularity` and `salt` sections; new chip type using `cyclePercentileChip` |
| `docs/specs/083-menu-drawer.md` | Note extension by Spec 102 |

## Spec Updates

| Spec | Update |
|------|--------|
| 098 | Add Popularity and Salt percentile chips to Syntax Help (Exclusives or Modifiers) if not already covered |
| 083 | Add "Extended by Spec 102" note |

## Acceptance Criteria

1. Two new sections — Popularity and Salt — appear in the MenuDrawer between prices and sort.
2. Each section has three chips: `>90%`, `>95%`, `>99%`.
3. Tapping a chip clears all other terms for that field (including manually typed), then applies the tri-state cycle for the tapped chip.
4. Active and negated states display with correct styling (blue fill / red line-through).
5. Popularity and Salt sections operate independently; having one active does not prevent the other.
</think>

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace