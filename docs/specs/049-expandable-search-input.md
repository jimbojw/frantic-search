# Spec 049: Expandable Search Input

**Status:** Implemented

**Depends on:** Spec 044 (Terms Drawer Redesign)

## Goal

Allow the user to toggle the search input between a single-line `<input>` (default) and a multi-line `<textarea>` for editing long queries. The toggle is activated by tapping a chevron–magnifying-glass button on the left side of the search field, following the codebase's established chevron-means-expandable convention.

## Background

### Problem

The search input is a single-line `<input type="text">`. Short queries work fine, but complex queries (multiple terms, nested expressions) become difficult to read and edit in a narrow horizontal strip. On mobile this is especially painful: the OS keyboard and browser chrome consume ~50% of the viewport, and the platform affordances for repositioning the cursor within a long single-line input are poor.

### Design intent

Rather than always showing a textarea (which wastes vertical space when it's not needed), the user opts in to the expanded view via a toggle. The toggle uses the same right-pointing-chevron → rotate-90° convention already established by InlineBreakdown and the histogram sparkline bar. The collapsed state (single-line input) is the default and costs zero additional vertical space.

## Design

### Toggle control

A clickable surface is added to the left side of the search field, containing two elements:

1. **Chevron**: The standard codebase chevron (`size-2.5 fill-current transition-transform`, path `M8 5l8 7-8 7z`). Points right (▸) when collapsed, rotates 90° (▾) when expanded.
2. **Magnifying glass**: The existing search icon SVG (`size-5`, stroke-based).

Both sit inside a single `<button>` that replaces the current `pointer-events-none` search icon SVG. The button has no visible background but gains a hover/active state for discoverability.

### Layout

#### Collapsed (default)

```
┌─────────────────────────────────────────────────────┐
│ ▸ 🔍 [Search cards… e.g. "t:creature c:green"] [⫏] │
└─────────────────────────────────────────────────────┘
```

Identical to today's layout except the chevron appears to the left of the magnifying glass, and the left icon area is now clickable. The input's left padding increases to accommodate the chevron (from `pl-11` to approximately `pl-14`).

#### Expanded

```
┌─────────────────────────────────────────────────────┐
│ ▾ 🔍 [t:creature c:green pow>3              ] [⫏] │
│      [c:wu f:commander                       ]      │
│      [                                       ]      │
└─────────────────────────────────────────────────────┘
```

The `<input>` is replaced by a `<textarea>`. The chevron + magnifying glass button pins to the top-left (not vertically centered). The filter toggle button also pins to the top-right. The textarea has a modest default height (`rows="3"`).

### Textarea behavior

- **Resizing**: The textarea uses browser-native vertical resize (`resize-y` in Tailwind). On desktop, users can drag the resize handle. On mobile, browsers typically don't show a resize handle, but the textarea is scrollable.
- **No auto-expand**: The textarea does not grow automatically with content. This avoids unbounded vertical growth on mobile where screen real estate is scarce.
- **Attributes**: The textarea inherits all the same attributes as the input: `autocapitalize="none"`, `autocomplete="off"`, `autocorrect="off"`, `spellcheck={false}`, `placeholder`, `disabled`.
- **Bindings**: Same `value`, `onInput`, `onFocus`, `onBlur` bindings as the input.

### Focus management

When toggling between input and textarea, focus transfers to the newly rendered element. The cursor position (`selectionStart` / `selectionEnd`) is preserved across the switch so the user doesn't lose their place.

### State

A single boolean signal `textareaMode` controls which element renders. Defaults to `false` (single-line input). Not persisted to localStorage — the expanded state is transient and resets on page load.

### Accessibility

- The toggle button has `aria-label="Toggle multi-line editor"`.
- The `aria-expanded` attribute on the button reflects the current state.
- The textarea and input both have the same implied role, so screen readers see a seamless text field.

## Scope of changes

| File | Change |
|------|--------|
| `app/src/App.tsx` | Add `textareaMode` signal. Replace search icon SVG with toggle button containing chevron + icon. Conditionally render `<input>` or `<textarea>`. Adjust icon vertical alignment in expanded mode. Increase left padding. |

## Implementation plan

### 1. Add signal

```typescript
const [textareaMode, setTextareaMode] = createSignal(false);
```

### 2. Replace left icon area

Replace the current `pointer-events-none` SVG with a `<button>` containing the chevron and the magnifying glass. The button is absolutely positioned on the left.

```
<button onClick={toggleTextareaMode} class="absolute left-0 top-0 h-full/top-3 ...">
  <svg chevron />
  <svg magnifying-glass />
</button>
```

In collapsed mode the button uses `top-0 bottom-0` with `items-center` (vertically centered). In expanded mode the button uses `top-3` positioning (aligned to first line of text).

### 3. Conditional element rendering

Use SolidJS `<Show>` with `fallback` to render either the textarea or the input. Both share the same class string and bindings. The textarea adds `resize-y rows="3"`.

### 4. Focus transfer

Store a ref for both elements. On toggle, after the DOM updates, call `.focus()` on the new element and restore `selectionStart` / `selectionEnd` from the previous element.

### 5. Adjust filter button

The filter toggle button on the right currently uses `top-0 bottom-0` (full height, centered). In expanded mode, switch to `top-0` with a fixed height to pin it to the top-right corner.

### 6. Left padding

Increase the input/textarea left padding from `pl-11` to `pl-14` to accommodate the chevron + magnifying glass.

## Edge cases

### Empty query

Toggling with an empty query works identically — the placeholder text appears in both input and textarea.

### TermsDrawer interaction

The TermsDrawer renders above the input area (inside the same rounded container). It is unaffected by the input/textarea toggle — the conditional rendering is scoped to the input wrapper `<div>`.

### InlineBreakdown interaction

The InlineBreakdown renders below the input area. It is unaffected by the toggle.

### URL state sync

The query signal is the single source of truth for both the input and textarea. URL sync (Spec 013) is unaffected.

### Header collapse on scroll

The header collapse behavior keys off scroll position, not input height. A taller textarea doesn't interfere.

## Acceptance criteria

1. A chevron appears to the left of the magnifying glass in the search field.
2. Clicking the chevron + magnifying glass area toggles between single-line input and multi-line textarea.
3. The chevron points right when collapsed and rotates 90° when expanded, using the standard `transition-transform` animation.
4. The textarea defaults to `rows="3"` and supports browser-native vertical resize.
5. Focus and cursor position transfer to the new element on toggle.
6. The filter toggle button pins to the top-right (not vertically centered) when the textarea is active.
7. The chevron + magnifying glass button pins to the top-left (not vertically centered) when the textarea is active.
8. All input attributes (`autocapitalize`, `autocomplete`, `autocorrect`, `spellcheck`, `placeholder`, `disabled`) apply identically to the textarea.
9. The toggle button has `aria-label` and `aria-expanded` attributes.
10. The textarea mode is transient — it resets to single-line input on page reload.
