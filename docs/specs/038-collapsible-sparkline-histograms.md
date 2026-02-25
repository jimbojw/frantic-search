# Spec 038: Collapsible Sparkline Histograms

**Status:** Draft

**Depends on:** Spec 025 (Results Breakdown)

**Modifies:** Spec 026 (Results Box with Options Drawer)

## Goal

Replace the RESULTS hat and drawer toggle with a two-state histogram area: a **collapsed sparkline bar** (default) and an **expanded interactive histogram**. The toolbar (Scryfall link, bug report, Oracle text toggle) becomes always-visible, no longer gated behind the drawer toggle. This saves vertical space on mobile while keeping the histogram data glanceable at all times.

## Background

### Problem

On mobile with the keyboard open, usable viewport height is roughly 3 inches. The current RESULTS hat (~1.5em) contributes to the vertical squeeze while providing minimal information — it is just the word "RESULTS" and a gear icon. Meanwhile, the full histograms (the useful content) default to expanded, consuming ~220px of vertical space that most users don't interact with.

The toolbar (Try on Scryfall, bug report, Oracle text toggle) is hidden behind the same drawer toggle as the histograms, even though these are utility actions users want access to regardless of whether they care about distribution charts.

### Design intent

The collapsed sparkline bar replaces the RESULTS hat as the topmost element of the results container. It is information-dense: three tiny bar charts labeled `mv:`, `ci:`, and `t:` give the user an at-a-glance read of the result set's distribution shape. The abbreviated labels are intentionally cryptic — when a user taps the bar and the full histograms expand, the labels "Mana Value", "Color Identity", and "Card Type" appear directly under their finger, establishing the relationship between short form and concept. This is a deliberate pedagogical/discovery affordance.

## Design

### Removed elements

- **The RESULTS hat.** The toggle row with "RESULTS" label, chevron, and gear icon (Spec 026 § "RESULTS toggle row") is removed entirely. Its toggle function is absorbed by the histogram area itself.
- **The gear icon.** No longer needed — there is nothing to "configure." The histogram area is self-toggling.

### Always-visible toolbar

The toolbar containing "Try on Scryfall ↗", the bug report button, and the "Oracle text" pill is moved outside the collapsible region. It renders between the histogram area and the card list, visible in both collapsed and expanded states.

### Layout: Collapsed (default)

```
┌─ RESULTS container ──────────────────────────────────────┐
│ ▸ mv: ▁▃▅▇▅▃▁▁   ci: ▁▃▅▇▃▅▁   t: ▃▇▅▃▂▂▁▁           │
├──────────────────────────────────────────────────────────┤
│  Try on Scryfall ↗  [🐛]                   Oracle text   │
├──────────────────────────────────────────────────────────┤
│  Card row 1                                              │
│  Card row 2                                              │
│  …                                                       │
└──────────────────────────────────────────────────────────┘
```

The sparkline bar is the first element inside the RESULTS container. Clicking anywhere on it expands the histogram area.

### Layout: Expanded

```
┌─ RESULTS container ──────────────────────────────────────┐
│ ▾ Mana Value          Color Identity         Card Type   │
│  0 │ ██████████░░  ×  │ {C} │ ████░░░░  ×  │ Lgn │ ██  │
│  1 │ ████████░░░░  ×  │ {W} │ ███████░  ×  │ Cre │ ██  │
│  …                    │ …                   │ …          │
├──────────────────────────────────────────────────────────┤
│  Try on Scryfall ↗  [🐛]                   Oracle text   │
├──────────────────────────────────────────────────────────┤
│  Card row 1                                              │
│  Card row 2                                              │
│  …                                                       │
└──────────────────────────────────────────────────────────┘
```

The expanded state looks like the current histograms (Spec 025) but without the hat above them. The label row ("Mana Value" / "Color Identity" / "Card Type") at the top of the histograms becomes the toggle target. A downward-pointing chevron sits at the far left of this label row. Clicking anywhere on the label row collapses back to the sparkline bar.

### Sparkline bar specification

The sparkline bar is a single horizontal strip containing three miniature bar charts with abbreviated labels.

#### Structure

```
[chevron] [mv-label] [mv-sparkline] [ci-label] [ci-sparkline] [t-label] [t-sparkline]
```

- **Chevron**: Right-pointing triangle (▸), same SVG as the current RESULTS hat chevron, in muted color (`text-gray-500 dark:text-gray-400`).
- **Labels**: `mv:`, `ci:`, `t:` in `font-mono text-[10px]` muted text (`text-gray-400 dark:text-gray-500`).
- **Sparklines**: Inline miniature bar charts (see below).

The bar has `cursor-pointer` and a subtle hover state (`hover:bg-gray-50 dark:hover:bg-gray-800/50`) to indicate interactivity. The entire bar is a single click target.

#### Sparkline rendering

Each sparkline is a vertical stack of thin horizontal bars:

- **Bar height**: 2px.
- **Gap between bars**: 1px.
- **Total height**: Mana value (8 bars) = 8×2 + 7×1 = **23px**. Color identity (7 bars) = 7×2 + 6×1 = **20px**. Card type (8 bars) = **23px**.
- **Width**: Each sparkline occupies a fixed width of **48px**. This is wide enough for proportional differences to be visible at 2px bar height.
- **Bar widths**: Proportional to count / max within that chart, same per-chart scaling as the full histograms. Zero-count bars render as 0-width (invisible).
- **Minimum bar width**: 1px when count > 0 (scaled down from the full histogram's 2px minimum).
- **Border radius**: None — at 2px tall, rounding is not perceptible.
- **Vertical alignment**: All three sparklines are vertically centered within the bar's height.

#### Sparkline colors

- **Mana Value**: All bars use `#60a5fa` (blue-400), matching the full histogram.
- **Color Identity**: Each bar uses its own color, matching the full histogram — `CI_COLORLESS`, `CI_W`, `CI_U`, `CI_B`, `CI_R`, `CI_G`, and `CI_BACKGROUNDS[31]` (WUBRG gradient) for multicolor. Even at 2px tall, the colored stripe communicates the color distribution at a glance.
- **Card Type**: All bars use `#34d399` (emerald-400), matching the full histogram.

#### Non-interactive

The sparklines are purely visual. They have no hover states, no click targets on individual bars, no drill/exclude behavior, and no tooltips. The only interaction is tapping anywhere on the entire sparkline bar to expand.

### Expanded label row as toggle

In expanded mode, the existing histogram header labels ("Mana Value", "Color Identity", "Card Type") are repurposed as the collapse toggle:

- A chevron (▾, downward-pointing / rotated 90°) is added at the far left of the label row, before the first column.
- The entire label row is a single click target with `cursor-pointer` and the same hover state as the sparkline bar.
- Clicking anywhere on the label row collapses the histogram area back to the sparkline bar.

The chevron is positioned outside the three-column grid, at the start of the row, so it doesn't disrupt the column alignment. Implementation: wrap the label row in a flex container with the chevron as the first item and the `grid-cols-3` labels as the second.

### Animation

The transition between collapsed and expanded states uses a **150ms ease-out** animation on `max-height` (or `grid-template-rows: 0fr → 1fr` for a CSS Grid approach). The content is clipped with `overflow: hidden` during the transition.

The chevron rotates between right-pointing (collapsed) and downward-pointing (expanded) with the same `transition-transform` already used by the current hat chevron.

### Default state

The histogram area **defaults to collapsed** (sparkline bar visible, full histograms hidden). This is a flip from the current default (Spec 026 § "Default state").

The persisted `localStorage` key remains `'frantic-results-options-expanded'`. The initialization logic flips:

```typescript
const [histogramsExpanded, setHistogramsExpanded] = createSignal(
  localStorage.getItem('frantic-results-options-expanded') === 'true'
)
```

This evaluates to `false` when the key is absent (new user) or explicitly `'false'`, and `true` only when the user has previously expanded the histograms. Existing users who had the drawer expanded will see their preference preserved.

### Empty state

When the result set is empty (zero matches), neither the sparkline bar nor the full histograms are rendered. The toolbar is still visible (it contains "Try on Scryfall" which is useful for debugging zero-result queries). The "No cards found" message appears below the toolbar as today.

When `histograms()` is null (no query yet, or loading), the sparkline bar is not rendered. The toolbar still appears if there are results to display.

## Sparkline component

Extract a `SparkBars` component for the individual sparkline charts:

```typescript
function SparkBars(props: {
  counts: number[]
  colors: string | string[]  // single color or per-bar array
}) { ... }
```

- `counts`: The histogram bucket values (e.g., `histograms.manaValue`).
- `colors`: Either a single CSS color string (applied to all bars) or an array of color strings (one per bar, for color identity).

The component renders a `<div>` with flexbox column layout, 1px gap, containing N child `<div>` elements each 2px tall with width proportional to count/max.

## Interaction with Spec 037 (Histogram Toggles)

Spec 037's toggle behavior (drill, exclude, active state detection) applies only to the **expanded** interactive histograms. The sparklines in collapsed mode are non-interactive. No changes to Spec 037 are needed.

## Scope of changes

| File | Change |
|---|---|
| `app/src/App.tsx` | Remove RESULTS hat. Move toolbar outside `Show when={expanded}`. Add sparkline bar in collapsed state. Wire label row as toggle in expanded state. Flip default. |
| `app/src/ResultsBreakdown.tsx` | Add chevron + clickable label row. Accept `onToggle` prop. Export `SparkBars` component (or co-locate). |
| `app/src/SparkBars.tsx` (new) | Sparkline bar chart component. |

## Implementation plan

### 1. SparkBars component (`app/src/SparkBars.tsx`)

Create the sparkline component:

- Accepts `counts: number[]` and `colors: string | string[]`.
- Computes local max from `counts`.
- Renders a 48px-wide flex-column container with 1px gap.
- Each bar: 2px tall `<div>`, width = `(count / max) * 100%`, min-width 1px when count > 0.
- Color applied via `background-color` (single) or per-bar from the array.
- No interactive elements, no event handlers.

### 2. Sparkline bar (`app/src/App.tsx`)

Replace the RESULTS hat with a collapsed-state sparkline bar:

```
<div onClick={toggle} class="flex items-center gap-2 px-3 py-1 cursor-pointer ...">
  <chevron />
  <span class="font-mono text-[10px] ...">mv:</span>
  <SparkBars counts={histograms().manaValue} colors={MV_BAR_COLOR} />
  <span class="font-mono text-[10px] ...">ci:</span>
  <SparkBars counts={histograms().colorIdentity} colors={CI_SPARK_COLORS} />
  <span class="font-mono text-[10px] ...">t:</span>
  <SparkBars counts={histograms().cardType} colors={TYPE_BAR_COLOR} />
</div>
```

Where `CI_SPARK_COLORS` is the per-bar color array `[CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS[31]]`.

### 3. Expanded label row toggle (`app/src/ResultsBreakdown.tsx`)

Modify the histogram header to be clickable:

- Wrap the three column headers in a flex container.
- Add a chevron (▾) as the first element.
- The entire row gets `cursor-pointer`, hover state, and an `onClick` that calls `props.onToggle()`.
- Add `onToggle: () => void` to the component's props.

### 4. Always-visible toolbar (`app/src/App.tsx`)

Move the toolbar `<div>` (Scryfall link, bug report, Oracle text) outside the `<Show when={expanded}>` block so it renders regardless of histogram state.

### 5. Default flip (`app/src/App.tsx`)

Change the signal initialization:

```typescript
const [histogramsExpanded, setHistogramsExpanded] = createSignal(
  localStorage.getItem('frantic-results-options-expanded') === 'true'
)
```

### 6. Transition animation

Add `overflow: hidden` and a `max-height` or `grid-template-rows` transition (150ms ease-out) to the histogram area container to animate between collapsed and expanded states.

### 7. Cleanup

- Remove the RESULTS hat markup (chevron + "RESULTS" label + gear icon).
- Remove the `resultsOptionsExpanded` signal name in favor of `histogramsExpanded` (or rename in place).
- Update Spec 026 status to note modification by this spec.

## Edge cases

### No histogram data

When `histograms()` is null (empty query or pre-first-result), the sparkline bar is not rendered. The results container starts directly with the toolbar, then card rows. This avoids rendering an empty sparkline bar with all-zero bars.

### All buckets zero except one

A single non-zero bar renders as a full-width 2px line in the sparkline. The remaining bars are invisible. This is correct — it communicates a concentrated distribution.

### Very small result sets

With 1–2 matching cards, most sparkline bars will be zero-width. The one or two visible bars will be full-width (or proportional to each other). The sparkline still communicates useful information: "results are concentrated in these buckets."

### Existing localStorage state

Users who previously had the drawer expanded (`localStorage` = `'true'`) will see the histograms start expanded — their preference is preserved. Users who had it collapsed (`'false'`) or new users (`null`) will see the sparkline bar. The only behavioral change is for new users, who now default to collapsed instead of expanded.

### Dark mode

Sparkline bar colors are the same as the full histogram bar colors, which already have adequate contrast in dark mode. The muted label text and chevron use the same dark mode classes as the removed RESULTS hat.

## Acceptance criteria

1. The RESULTS hat (toggle row with "RESULTS" label and gear icon) is removed.
2. The toolbar (Scryfall link, bug report, Oracle text toggle) is always visible when results exist, regardless of histogram expanded/collapsed state.
3. When collapsed, a sparkline bar appears at the top of the results container showing three miniature bar charts labeled `mv:`, `ci:`, and `t:`.
4. Sparkline bars are 2px tall with 1px gaps, 48px wide, non-interactive, with per-chart proportional scaling.
5. The color identity sparkline uses per-bar colors matching the full histogram (colorless gray, W yellow, U blue, B dark, R red, G green, M gradient).
6. Clicking anywhere on the sparkline bar expands to the full interactive histograms.
7. When expanded, the histogram label row ("Mana Value" / "Color Identity" / "Card Type") has a chevron at the far left and acts as the collapse toggle.
8. Clicking anywhere on the expanded label row collapses back to the sparkline bar.
9. The transition between states uses a 150ms ease-out animation.
10. The histogram area defaults to collapsed for new users.
11. The expanded/collapsed state is persisted to `localStorage` under `'frantic-results-options-expanded'`.
12. Existing users' persisted preference is honored (expanded stays expanded, collapsed stays collapsed).
13. Neither sparkline bar nor full histograms render when `histograms()` is null (no query / no results).
14. The toolbar still renders when results exist, even without histogram data.
