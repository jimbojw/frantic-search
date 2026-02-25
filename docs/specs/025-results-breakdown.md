# Spec 025: Results Breakdown

**Status:** Implemented

**Depends on:** Spec 024 (Index-Based Result Protocol), Spec 021 (Inline Query Breakdown), Spec 023 (Breakdown Remove Node)

## Goal

Add a collapsible "Results Breakdown" panel above the results table that visualizes the distribution of matching cards across three dimensions: **color identity**, **mana value**, and **card type**. Each dimension is rendered as a horizontal bar chart. Bars are clickable to drill into a subset (append a filter) or removable via an × button to exclude that subset (append a negated filter).

## Background

The inline query breakdown (Spec 021) shows how the *query* decomposes — which terms matched how many cards. The results breakdown shows how the *result set* decomposes — what the matching cards look like along key axes. Together they give the user a complete picture: the query breakdown explains *why* these results appeared, and the results breakdown summarizes *what* was found.

Color identity, mana value, and card type are the three most fundamental axes for filtering Magic cards. Showing their distributions lets users quickly assess a result set ("mostly green creatures, clustered at 3–4 mana") and refine it with a single click.

### Precedents

| System | Feature | Behavior |
|---|---|---|
| Scryfall | No equivalent | Results are a flat list with no distribution summary |
| EDHREC | Color identity pie chart | Shows commander color distribution; not interactive |
| Deckstats | Mana curve bar chart | Shows mana value distribution for a deck; not search-integrated |
| Faceted search (e.g., Amazon) | Filter sidebar with counts | Click to add filter, × to remove — the direct inspiration for this feature |

## Design

### Placement

The histograms are rendered **inside the RESULTS drawer** (Spec 026), between the RESULTS toggle row and the Oracle Text toggle. They do not have their own collapsible container or toggle row — they share the RESULTS drawer's expanded/collapsed state. When the RESULTS drawer is collapsed, the histograms are hidden; when expanded, they are visible.

This eliminates the standalone "STATS" box that previously occupied its own vertical space between the search input and the RESULTS container.

### Layout

When the RESULTS drawer is expanded, the histograms appear as three horizontal bar charts side by side (mana value first, then color identity, then card type):

```
┌─ RESULTS ────────────────────────────────────────────────────────────────────────┐
│ ▾ RESULTS                                                                   [⚙]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Mana Value              │  Color Identity             │  Card Type               │
│                          │                             │                          │
│  0 │ ██░░░░░░░░░░░░  ×  │ {C} │ ████░░░░░░░░░░  ×   │ Lgn │ ██████░░░░░░  ×   │
│  1 │ ████░░░░░░░░░░  ×  │ {W} │ ███████░░░░░░░  ×   │ Cre │ █████████░░░  ×   │
│  2 │ ██████░░░░░░░░  ×  │ {U} │ ██████░░░░░░░░  ×   │ Ins │ █████░░░░░░░  ×   │
│  3 │ ████████░░░░░░  ×  │ {B} │ ███████░░░░░░░  ×   │ Sor │ ████░░░░░░░░  ×   │
│  4 │ ██████░░░░░░░░  ×  │ {R} │ █████░░░░░░░░░  ×   │ Art │ ███░░░░░░░░░  ×   │
│  5 │ █████░░░░░░░░░  ×  │ {G} │ ██░░░░░░░░░░░░  ×   │ Enc │ ███░░░░░░░░░  ×   │
│  6 │ ███░░░░░░░░░░░  ×  │ {M} │ ███████████░░░  ×   │ Plw │ █░░░░░░░░░░░  ×   │
│ 7+ │ ██░░░░░░░░░░░░  ×  │                             │ Lnd │ ██░░░░░░░░░░  ×   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Oracle text                                                        [=====○]    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Card row 1                                                                      │
│  Card row 2                                                                      │
│  …                                                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Each row has three columns:

1. **Label** — fixed-width, left-aligned. Color letter or mana value number.
2. **Bar** — fills remaining width proportionally. The entire row width (minus the × column) is the click target for the drill-down action, not just the filled portion.
3. **× button** — fixed-width, right-aligned. Exclude action.

A thin vertical rule separates the label column from the bar, forming a visual axis.

### Bar scaling

Bars are scaled relative to the **maximum count within that chart**. The longest bar fills the available width; all others are proportional. This is per-chart scaling — the color chart and mana value chart scale independently.

Bars with zero count are rendered as empty (no fill) but the row remains visible, preserving layout stability.

### Color identity chart

Seven rows: one per color, one for colorless, and one for multicolored. Most labels are rendered as **mana symbols** using the `mana-font` CSS icon font (e.g., `<i class="ms ms-c ms-cost" />` for colorless), matching the mana symbol rendering used elsewhere in the app (`card-symbols.tsx`). The multicolored label is a small rounded square filled with the WUBRG gradient (same visual as the color identity stripe on 5-color card thumbnails):

| Label | Symbol class | Meaning | Counting rule |
|---|---|---|---|
| {C} | `ms-c` | Colorless | `color_identity === 0` |
| {W} | `ms-w` | White | `color_identity & Color.White` |
| {U} | `ms-u` | Blue | `color_identity & Color.Blue` |
| {B} | `ms-b` | Black | `color_identity & Color.Black` |
| {R} | `ms-r` | Red | `color_identity & Color.Red` |
| {G} | `ms-g` | Green | `color_identity & Color.Green` |
| {M} | *(small rounded square with WUBRG gradient)* | Multicolored | `popcount(color_identity) >= 2` |

A multicolored card (e.g., Boros, with identity W|R) increments **both** the W and R buckets, **and** the M bucket. The colorless bucket only counts cards with identity exactly 0. The seven bars therefore do not sum to the total result count — multicolored cards are counted multiple times, and that is intentional. Each bar answers a different question: the five color bars answer "how many results include this color?", the colorless bar answers "how many results have no color?", and the multicolored bar answers "how many results have two or more colors?"

#### Bar colors

Each bar is tinted to match its color identity, reusing the hex constants already defined in `app/src/color-identity.ts` for the ArtCrop thumbnail backgrounds:

| Label | Color constant | Value |
|---|---|---|
| C | `CI_COLORLESS` | `#C0BCB0` |
| W | `CI_W` | `#E8D44D` |
| U | `CI_U` | `#4A90D9` |
| B | `CI_B` | `#6B5B6B` |
| R | `CI_R` | `#D94040` |
| G | `CI_G` | `#3A9A5A` |
| M | `CI_BACKGROUNDS[31]` | WUBRG linear gradient (via `stripes()`) |

Mono-colored bars use their hex value as an inline `background-color` style. The multicolored bar uses the WUBRG gradient from `CI_BACKGROUNDS[31]` (all 5 color bits set) as an inline `background` style — this is the same striped gradient rendered behind multicolored card thumbnails. The color palette is kept centralized in `app/src/color-identity.ts` rather than duplicated as Tailwind classes.

### Mana value chart

Eight rows. Labels are plain monospace numerals (`font-mono text-xs`):

| Label | Meaning | Counting rule |
|---|---|---|
| 0 | MV = 0 | `floor(manaValue) === 0` |
| 1 | MV = 1 | `floor(manaValue) === 1` |
| … | … | … |
| 6 | MV = 6 | `floor(manaValue) === 6` |
| 7+ | MV ≥ 7 | `floor(manaValue) >= 7` |

All bars use a single neutral color (e.g., `blue-400` / `blue-500`).

### Card type chart

Eight rows. Labels are abbreviated type names in monospace text (`font-mono text-xs`):

| Label | Meaning | Counting rule |
|---|---|---|
| Lgn | Legendary | `typeLinesLower[i].includes('legendary')` |
| Cre | Creature | `typeLinesLower[i].includes('creature')` |
| Ins | Instant | `typeLinesLower[i].includes('instant')` |
| Sor | Sorcery | `typeLinesLower[i].includes('sorcery')` |
| Art | Artifact | `typeLinesLower[i].includes('artifact')` |
| Enc | Enchantment | `typeLinesLower[i].includes('enchantment')` |
| Plw | Planeswalker | `typeLinesLower[i].includes('planeswalker')` |
| Lnd | Land | `typeLinesLower[i].includes('land')` |

Like color identity, the type bars are **not mutually exclusive**. A Legendary Creature increments both the Legendary and Creature bars. An Enchantment Creature increments both Enchantment and Creature. Each bar answers "how many results are this type?" independently.

The histogram is computed from the **canonical face's type line** (same face used for mana value). For multi-face cards, only the front face's type line is checked. This is consistent with how the results list displays type lines and matches Scryfall's convention.

All bars use a single neutral color (e.g., `emerald-400` / `emerald-500`), distinct from the mana value bars to visually separate the two charts.

### Interactions

Each bar supports two actions, mirroring the query breakdown's drill-down and remove (Spec 023):

#### Click bar → Drill down (append filter)

Clicking anywhere in a bar's row (the full possible width, not just the filled portion) appends a filter term to the current query. This makes zero-count bars clickable too — the user can click an empty bar to add that filter, even though it will produce zero results. This is low-risk: the user can undo via the browser back button or by removing the term from the query breakdown.

| Bar | Appended term | Rationale |
|---|---|---|
| C (colorless) | `ci:c` | Identity is colorless |
| W | `ci>=w` | Identity includes white (superset match) |
| U | `ci>=u` | Identity includes blue |
| B | `ci>=b` | Identity includes black |
| R | `ci>=r` | Identity includes red |
| G | `ci>=g` | Identity includes green |
| M (multicolored) | `ci:m` | Identity has two or more colors |
| 0 | `mv=0` | Mana value equals 0 |
| 1 | `mv=1` | Mana value equals 1 |
| … | … | … |
| 6 | `mv=6` | Mana value equals 6 |
| 7+ | `mv>=7` | Mana value is 7 or greater |
| Lgn (Legendary) | `t:legendary` | Type line includes "legendary" |
| Cre (Creature) | `t:creature` | Type line includes "creature" |
| Ins (Instant) | `t:instant` | Type line includes "instant" |
| Sor (Sorcery) | `t:sorcery` | Type line includes "sorcery" |
| Art (Artifact) | `t:artifact` | Type line includes "artifact" |
| Enc (Enchantment) | `t:enchantment` | Type line includes "enchantment" |
| Plw (Planeswalker) | `t:planeswalker` | Type line includes "planeswalker" |
| Lnd (Land) | `t:land` | Type line includes "land" |

The `>=` operator for colors means "identity includes this color" — it matches any card whose color identity contains the specified color (possibly among others). This is the correct semantic for "show me cards with red" as opposed to `ci=r` ("identity is exactly red") or `ci:r` ("identity fits within red", the Commander subset meaning).

#### Click × → Exclude (append negated filter)

Clicking the × button appends a **negated** filter term.

| Bar | Appended term |
|---|---|
| C (colorless) | `-ci:c` |
| W | `-ci>=w` |
| U | `-ci>=u` |
| … | … |
| M (multicolored) | `-ci:m` |
| 0 | `-mv=0` |
| 1 | `-mv=1` |
| … | … |
| 7+ | `-mv>=7` |
| Lgn (Legendary) | `-t:legendary` |
| Cre (Creature) | `-t:creature` |
| Ins (Instant) | `-t:instant` |
| Sor (Sorcery) | `-t:sorcery` |
| Art (Artifact) | `-t:artifact` |
| Enc (Enchantment) | `-t:enchantment` |
| Plw (Planeswalker) | `-t:planeswalker` |
| Lnd (Land) | `-t:land` |

This removes cards matching that bucket from the results. For example, clicking × on the Red bar appends `-ci>=r`, filtering out all cards with red in their identity.

#### Append mechanics

Both actions use a simple "always append" model — the term is appended to the end of the current query string. No attempt is made to detect whether the term (or its negation) is already present. If the user produces a degenerate query (e.g., `ci>=r -ci>=r`), the query breakdown (Spec 021 + 023) makes this visible and provides × buttons to remove individual terms.

When appending, the existing query may need to be parenthesized. If the current query's AST root is an OR node, a naive append would bind incorrectly — `t:enchantment OR t:artifact ci>=r` parses as `t:enchantment OR (t:artifact AND ci>=r)`. To preserve the user's intent, the append logic wraps the existing query in parentheses when the breakdown's root node type is `OR`:

```
existing query: "t:enchantment OR t:artifact"
appended term:  "ci>=r"
result:         "(t:enchantment OR t:artifact) ci>=r"
```

When the root is AND, NOT, or a leaf, no parentheses are needed — the appended term naturally joins the top-level conjunction:

```
existing query: "t:creature c:green"
appended term:  "ci>=r"
result:         "t:creature c:green ci>=r"
```

The component receives the current `BreakdownNode` root to check its `type` field for this decision.

### Layout mode

The three charts always sit side by side in a three-column layout within the RESULTS drawer, regardless of viewport width. On narrow screens the charts simply get narrower — bars compress gracefully since they are percentage-width `<div>` elements. No stacking breakpoint is needed.

### Empty state

When the result set is empty (zero matches), the results breakdown is not rendered. The "No cards found" message appears instead, as today.

## Data Flow

### Histogram computation (worker)

Histograms are computed in the WebWorker after deduplication, using data already available in `CardIndex`. This avoids any main-thread computation and keeps the aggregation off the UI thread.

**Location:** `app/src/worker.ts`, inside the `onmessage` handler, after `index.deduplicateMatches(matchingIndices)` and before posting the result.

**Algorithm:**

```
colorCounts = [0, 0, 0, 0, 0, 0, 0]                    // C, W, U, B, R, G, M
mvCounts    = [0, 0, 0, 0, 0, 0, 0, 0]                  // 0..6, 7+
typeCounts  = [0, 0, 0, 0, 0, 0, 0, 0]                  // Lgn, Cre, Ins, Sor, Art, Enc, Plw, Lnd

for each canonicalIndex in deduped:
  ci = index.colorIdentity[canonicalIndex]
  if ci === 0:
    colorCounts[0]++          // Colorless
  else:
    if ci & Color.White:  colorCounts[1]++
    if ci & Color.Blue:   colorCounts[2]++
    if ci & Color.Black:  colorCounts[3]++
    if ci & Color.Red:    colorCounts[4]++
    if ci & Color.Green:  colorCounts[5]++
    if popcount(ci) >= 2: colorCounts[6]++   // Multicolored

  mv = Math.floor(index.manaValue[canonicalIndex])
  bucket = Math.min(mv, 7)
  mvCounts[bucket]++

  tl = index.typeLinesLower[canonicalIndex]
  if tl.includes('legendary'):   typeCounts[0]++
  if tl.includes('creature'):    typeCounts[1]++
  if tl.includes('instant'):     typeCounts[2]++
  if tl.includes('sorcery'):     typeCounts[3]++
  if tl.includes('artifact'):    typeCounts[4]++
  if tl.includes('enchantment'): typeCounts[5]++
  if tl.includes('planeswalker'):typeCounts[6]++
  if tl.includes('land'):        typeCounts[7]++
```

The popcount can use the same bit-twiddling approach as the evaluator: `v = ci; v = (v & 0x55) + ((v >> 1) & 0x55); v = (v & 0x33) + ((v >> 2) & 0x33); v = (v + (v >> 4)) & 0x0f; if (v >= 2) colorCounts[6]++`.

This is a single pass over the deduplicated indices — negligible cost relative to the evaluation itself. The type checks use `String.includes()` on the canonical face's lowercased type line, consistent with how the evaluator matches `t:` queries.

### Wire protocol

Add a `Histograms` type and include it in the `result` message.

```typescript
export type Histograms = {
  colorIdentity: number[]  // [C, W, U, B, R, G, M] — length 7
  manaValue: number[]      // [0, 1, 2, ..., 6, 7+] — length 8
  cardType: number[]       // [Lgn, Cre, Ins, Sor, Art, Enc, Plw, Lnd] — length 8
}
```

Update `FromWorker`:

```typescript
| {
    type: 'result'
    queryId: number
    indices: Uint32Array
    totalMatches: number
    breakdown: BreakdownNode
    histograms: Histograms
  }
```

The histogram arrays are small (7 + 8 + 8 = 23 numbers), adding negligible serialization cost to `postMessage`.

### Main-thread state

Add a signal to hold the current histograms:

```typescript
const [histograms, setHistograms] = createSignal<Histograms | null>(null)
```

Update the `result` handler in `App.tsx` to set it:

```typescript
case 'result':
  if (msg.queryId === latestQueryId) {
    setIndices(msg.indices)
    setTotalMatches(msg.totalMatches)
    setBreakdown(msg.breakdown)
    setHistograms(msg.histograms)
  }
  break
```

Clear it when the query is empty:

```typescript
setHistograms(null)
```

## Implementation Plan

### 1. Wire protocol (`shared/src/worker-protocol.ts`)

Add `Histograms` type. Add `histograms` field to the `result` variant of `FromWorker`. Export `Histograms` from `shared/src/index.ts`.

### 2. Worker aggregation (`app/src/worker.ts`)

After `index.deduplicateMatches`, iterate over deduplicated indices to build `colorIdentity`, `manaValue`, and `cardType` count arrays. Include the histograms in the posted result message.

### 3. Main-thread state (`app/src/App.tsx`)

Add `histograms` signal. Set it on `result` messages, clear on empty query. Pass it to the new component.

### 4. ResultsBreakdown component (`app/src/ResultsBreakdown.tsx`)

Component with props:

```typescript
{
  histograms: Histograms
  breakdown: BreakdownNode
  onAppendQuery: (term: string) => void
}
```

- Renders three bar chart columns (mana value, color identity, card type) in a `grid-cols-3` layout. **No own toggle row or collapsible wrapper** — visibility is controlled by the RESULTS drawer (Spec 026).
- Each bar row: label, full-width clickable area (drill-down), × button.
- Bar widths computed as percentages of the chart-local maximum.
- Uses `breakdown.type` to determine whether to parenthesize on append (see "Append mechanics").

### 5. Integration (`app/src/App.tsx`)

- Render `<ResultsBreakdown>` inside the RESULTS drawer (Spec 026), above the Oracle Text toggle. It is visible when the RESULTS drawer is expanded and hidden when collapsed.
- Wire `onAppendQuery` to append the term to the current query, parenthesizing when the breakdown root is OR: `setQuery(q => breakdown()?.type === 'OR' ? '(' + q + ') ' + term : q + ' ' + term)`.

### 6. Styling

- Bar chart rows use `font-mono text-xs` for labels and counts, consistent with the query breakdown.
- Bars are rendered as `<div>` elements with percentage widths and background colors.
- The × button follows the same styling as Spec 023: always visible at `opacity-60`, `hover:opacity-100`, `hover:text-red-500`.
- The toggle row matches the query breakdown's summary line styling (chevron, muted text, `cursor-pointer`, hover state).

## Edge Cases

### Single result

When only one card matches, the histograms still render. One color bar, one MV bar, and one or more type bars will have height 1 (100% width); all others will be 0.

### All results in one bucket

If every matching card has MV=3, the "3" bar fills to 100% and all others show empty. This is informative — it tells the user the result set is homogeneous in mana value.

### Multi-category overcounting

The color identity and card type bars intentionally overcount. If 100 cards match and all are exactly Boros (W|R), the W bar shows 100, the R bar shows 100, and the M bar shows 100. If all are Legendary Creatures, the Lgn bar shows 100 and the Cre bar shows 100. This is not a bug — each bar answers a different question about the result set. The bars within a chart are not expected to sum to the total.

### Back faces

The worker aggregates using the canonical face index (front face). For double-faced cards, the front face's mana value and type line are used. This matches Scryfall's convention: the "mana value" of a DFC is its front face's mana value, and the front face is the primary identity.

### Large result sets

With no query (all ~30,000 cards), the histograms compute over all cards. The single-pass aggregation is O(n) and takes < 1ms on modern hardware, so there is no performance concern.

## Acceptance Criteria

1. When a query produces results and the RESULTS drawer is expanded, the histograms are visible inside the RESULTS container, above the Oracle Text toggle.
2. The histograms show three horizontal bar charts side by side: Mana Value (8 bars), Color Identity (7 bars), and Card Type (8 bars).
3. Color Identity bars are labeled with mana symbols ({C}, {W}, {U}, {B}, {R}, {G}) rendered via `mana-font`, and a WUBRG gradient square for {M}. Multicolored cards increment multiple bars (individual colors and M).
4. Mana Value bars are labeled 0–6 and 7+. Values are bucketed by `floor(manaValue)`.
5. Card Type bars are labeled Lgn, Cre, Ins, Sor, Art, Enc, Plw, Lnd. Multi-typed cards (e.g., Legendary Creature) increment multiple bars.
6. Bar widths are proportional to the maximum count within each chart.
7. Each color bar is tinted using the hex constants from `app/src/color-identity.ts` (`CI_W`, `CI_U`, `CI_B`, `CI_R`, `CI_G`, `CI_COLORLESS`). The multicolored bar uses the WUBRG gradient from `CI_BACKGROUNDS[31]`. Mana value and card type bars each use their own distinct neutral color.
8. Clicking anywhere in a bar's row (full width, including zero-count bars) appends the corresponding filter to the query (`ci>=r`, `mv=3`, `t:creature`, etc.).
9. Clicking the × button appends the negated filter (`-ci>=r`, `-mv=3`, `-t:creature`, etc.).
9a. When the current query's breakdown root is an OR node, the existing query is wrapped in parentheses before appending (e.g., `(t:enchantment OR t:artifact) ci>=r`).
10. The colorless bar uses `ci:c` / `-ci:c` (not `ci>=c`).
11. The multicolored bar uses `ci:m` / `-ci:m`.
12. The 7+ bar uses `mv>=7` / `-mv>=7`.
13. Histograms are computed in the WebWorker, not the main thread.
14. The histograms do not have their own collapsible container — they share the RESULTS drawer's expanded/collapsed state (Spec 026).
15. The histograms are not rendered when the result set is empty. The RESULTS container remains visible (showing "No cards found") so that drilldown/exclusion affordances in the query breakdown remain accessible.
16. The three charts always sit side by side, compressing on narrow viewports rather than stacking.
