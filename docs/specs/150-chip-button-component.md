# Spec 150: ChipButton Component

**Status:** Implemented

**Used by:** SuggestionList (Spec 151) for suggestion chips

**Depends on:** Spec 083 (MenuDrawer), Spec 044 (Terms Drawer Redesign), Spec 057 (include:extras), Spec 139 (unique:prints hint), Spec 131 (oracle did-you-mean)

**Addresses:** [Issue #169](https://github.com/jimbojw/frantic-search/issues/169) — Chip buttons should be uniform height

## Goal

Introduce a shared `ChipButton` component and refactor existing chip-style buttons to use it. This ensures consistent sizing (`min-h-11`), styling, and accessibility across all chip buttons in the app — MenuDrawer filter chips, SearchResults suggestion chips, DeckEditorFormatChips, and ListControlsPopover.

## Background

### Current state

Chip buttons appear throughout the app with nearly identical base styling but duplicated markup:

- **MenuDrawer** — TermChip, ViewChip, UniqueChip, IncludeExtrasChip, MetadataTagChip, PercentileTermChip, SortChip, IdentityColorChip, IdentityNumericChip, IdentityMulticolorChip, and others. Each uses `inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors` plus `CHIP_CLASSES` for state.
- **SearchResults** — Four suggestion chips (`include:extras`, `unique:prints`, oracle hint) with the same sizing and neutral gray styling.
- **DeckEditorFormatChips** — Format selection chips with `min-h-11` and border-based selection state.
- **ListControlsPopover** — List control chips with `min-h-11 min-w-11`.

Issue #169 reported that suggestion chips were smaller on desktop due to responsive overrides (`md:min-h-0 md:py-0.5`). A quick fix removed those overrides. This spec consolidates the shared chip pattern so future chips cannot drift.

### Out of scope

- **BreakdownChip** (InlineBreakdown) — Different structure (pin icon, count, remove button); uses `span`, not a button. Stays as-is.
- **TagChip** (CardDetail) — Copy/navigate behavior and flex-col layout. Stays as-is.
- **DeckEditorStatus** chips — Intentionally `min-h-8` per Spec 122 ("Chips are small... to avoid crowding"). May adopt ChipButton with a `compact` variant in a follow-up, or remain custom.

## Design

### ChipButton API

```tsx
// app/src/ChipButton.tsx
export function ChipButton(props: {
  /** Visual state for tri-state chips (neutral/positive/negative). 'alt-negative' = purple (SortChip descending). */
  state?: 'neutral' | 'positive' | 'negative' | 'alt-negative'
  /** Alternative to state: binary active/inactive for ViewChip, UniqueChip, IncludeExtrasChip. */
  active?: boolean
  /** Layout: 'row' (default) or 'col' for two-line content (e.g. oracle hint). */
  layout?: 'row' | 'col'
  /** Override base size. 'compact' uses min-h-8 (for future DeckEditorStatus use). */
  size?: 'default' | 'compact'
  /** Additional class names. Merged after base + state classes. */
  class?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  /** Accessibility. Default: 'button' */
  role?: string
  /** For pressed-state chips. */
  'aria-pressed'?: boolean
  children: JSX.Element
})
```

### Base styles

All variants share:

- `inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors`
- `compact` size: `min-h-8 min-w-8` (no `min-w-11`)
- `layout="col"`: add `flex-col`, `items-start`, and `text-left` (replaces `items-center` for two-line content)

### State classes

```ts
const CHIP_CLASSES: Record<'neutral' | 'positive' | 'negative' | 'alt-negative', string> = {
  neutral: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300',
  positive: 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500',
  negative: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 line-through hover:bg-red-200 dark:hover:bg-red-900/60',
  'alt-negative': 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60',
}
```

**Derivation rules:**
- `state` prop: use `CHIP_CLASSES[state]` directly.
- `active` prop (no `state`): `active` → positive, `!active` → neutral.

### Children

ChipButton renders a `button` with `children` as the label. Callers pass:

- Plain text
- `HighlightedLabel` (SearchResults)
- `buildSpans` output with `ROLE_CLASSES` (MenuDrawer chips with syntax highlighting)
- Custom layout (oracle hint: two spans with `formatDualCount`)
- Mana symbol + prefix (IdentityColorChip, IdentityMulticolorChip)

### Selection variant (DeckEditorFormatChips)

DeckEditorFormatChips use border-based selection rather than fill. Options:

1. **Extend ChipButton** with `variant?: 'filter' | 'selection'` — selection uses `border-2` + transparent/blue border instead of fill.
2. **Keep DeckEditorFormatChips custom** — Simpler if the border pattern is one-off.

This spec recommends **(2)** — migrate DeckEditorFormatChips only if the selection styles fit cleanly; otherwise leave as custom to avoid over-generalizing.

## Implementation

### 1. Create ChipButton component

- **File:** `app/src/ChipButton.tsx`
- Export `ChipButton` and `CHIP_CLASSES` (for callers that need raw classes, e.g. SortChip with appended arrow).

### 2. Refactor MenuDrawer

Replace local `TermChip`, `ViewChip`, `UniqueChip`, `IncludeExtrasChip`, `MetadataTagChip`, `PercentileTermChip`, `IdentityColorChip`, `IdentityNumericChip`, and `IdentityMulticolorChip` with `<ChipButton state={...} active={...} onClick={...}>...</ChipButton>`.

**SortChip** — Uses `state="alt-negative"` when descending (purple styling). Appends directional arrow (`↑` / `↓`) to the label. Options:
- Pass `children` as `<>{label}{sortArrow(...)}</>`
- Or keep SortChip as a thin wrapper that composes ChipButton with appended text

Use wrapper for SortChip since it has unique content logic (arrow suffix). SortChip maps its three states to ChipButton: `neutral` → neutral, `positive` → positive, descending → `alt-negative`.

### 3. Refactor SearchResults

Replace the four suggestion button elements with:

```tsx
<ChipButton state="neutral" onClick={...}>
  <HighlightedLabel label="include:extras" />
</ChipButton>
```

Oracle hint (two-line):

```tsx
<ChipButton state="neutral" layout="col" onClick={...}>
  <span class="flex items-center gap-1">
    <HighlightedLabel label={h.label} />
  </span>
  <span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
    {formatDualCount(h.count, h.printingCount)}
  </span>
</ChipButton>
```

### 4. Optional: DeckEditorFormatChips

If selection variant is added:

```tsx
<ChipButton
  variant="selection"
  active={isSelected()}
  onClick={...}
>
  {fmt.label}
</ChipButton>
```

Otherwise, leave DeckEditorFormatChips as-is per "Selection variant" above.

### 5. Optional: ListControlsPopover

If the list control chip styling matches ChipButton neutral + border, migrate. Otherwise leave as-is.

## Files to Touch

| File | Changes |
|------|---------|
| `app/src/ChipButton.tsx` | **New** — ChipButton component and CHIP_CLASSES |
| `app/src/MenuDrawer.tsx` | Replace TermChip, ViewChip, UniqueChip, IncludeExtrasChip, MetadataTagChip, PercentileTermChip, IdentityColorChip, IdentityNumericChip, IdentityMulticolorChip with ChipButton; keep SortChip as wrapper |
| `app/src/SearchResults.tsx` | Replace four suggestion buttons with ChipButton |
| `app/src/deck-editor/DeckEditorFormatChips.tsx` | Optional — migrate to ChipButton if selection variant added |
| `app/src/ListControlsPopover.tsx` | Optional — migrate if styling aligns |

## Spec Updates

| Spec | Update |
|------|--------|
| 083 | Add "Extended by Spec 150 (ChipButton)" note |
| 044 | Reference ChipButton for chip styling |
| 057 | Note suggestion chips use ChipButton |
| 139 | Note unique:prints hint uses ChipButton |
| 131 | Note oracle hint uses ChipButton |

## Acceptance Criteria

1. `ChipButton` component exists in `app/src/ChipButton.tsx` with `state`, `active`, `layout`, and `size` props.
2. All MenuDrawer filter chips (TermChip, ViewChip, UniqueChip, IncludeExtrasChip, MetadataTagChip, PercentileTermChip, IdentityColorChip, IdentityNumericChip, IdentityMulticolorChip) use ChipButton. SortChip may wrap ChipButton.
3. All four SearchResults suggestion chips use ChipButton with uniform `min-h-11` sizing.
4. Chip styling (neutral/positive/negative/alt-negative) matches the existing CHIP_CLASSES visual treatment.
5. No visual regression — chips look identical before and after refactor.
6. DeckEditorFormatChips and ListControlsPopover migration is optional; document decision in Implementation Notes if skipped.
