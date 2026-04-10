# Spec 129: Back and Copy URL Buttons for PWA

**Status:** Implemented

**Modified by:** Spec 137 (Persistent Search App Bar — bar is always visible from first load)

**Depends on:** Spec 013 (URL State), Spec 086 (Dual Wield)

**Modifies:** Spec 086 (adds copy control to left rail)

## Goal

Add Back and Copy URL buttons to support PWA and mobile web users who lack browser chrome. In standalone PWA mode or on mobile, the native back button and URL bar are absent or less accessible. These buttons afford navigation and sharing via pasted URL.

Addresses: [GitHub #10](https://github.com/jimbojw/frantic-search/issues/10) (navigation buttons), [GitHub #49](https://github.com/jimbojw/frantic-search/issues/49) (share button).

## Background

### Current behavior

- **Desktop:** Users have browser back/forward and can copy the URL from the address bar.
- **Mobile web / PWA:** In standalone mode (`display: standalone`), the browser chrome is hidden. Users cannot easily go back or share the current search URL.

### Problem

Installed PWA users and mobile web users have no reliable way to navigate back or copy the current URL for sharing. Spec 013 ensures the URL reflects the query; we need UI affordances to use it.

## Design

### Visibility rules

Both buttons appear **only when there is a query**:

| Mode | Query present when |
|------|---------------------|
| Single pane | `q` is non-empty |
| Dual Wield | `q1` or `q2` is non-empty |

When no query is present, neither button is shown.

### Back button

- **Visibility (single pane):** Shown whenever a query is present (`q` non-empty), **at any viewport width**. Independent of `viewportWide()`.
- **Rationale:** Mobile web and standalone PWA users still lack reliable browser chrome; wide screens also benefit from a consistent in-app control immediately after Home (before Split view), while desktop users may still use the browser back button.
- **Action:** Calls `history.back()` on click.
- **Icon:** `IconChevronLeft` from the internal icon library.
- **aria-label:** "Go back" (or equivalent).
- **Dual Wield:** Not shown. Dual Wield is desktop-only (`viewportWide`), so Back is never visible in that layout.

### Copy link control (Spec 164)

- **Visibility:** Shown whenever a query is present (single pane or Dual Wield).
- **Label:** "Copy…" (header); icon-only in Dual Wield rail with accessible name "Copy…".
- **Action:** Opens a small menu. The first item copies `location.href` (plain URL). Additional items copy Markdown links; see [Spec 164](164-copy-link-menu.md).
- **Feedback:** On successful copy, show brief "Copied!" feedback (e.g., icon swap to checkmark for ~2 seconds, matching `CopyButton` pattern).
- **Icon:** `IconClipboardDocument` from the internal icon library.
- **aria-label:** "Copy…" / "Copied" when feedback is active (see Spec 164 for `aria-expanded` / menu semantics).

### Single-pane layout

Left-aligned next to the Home button. Order: Home, Back (if visible), Split view (wide only), Copy… (if visible).

```
[ Home ] [ Back ] [ Split View ] [ Copy… ] ... [ My List ] [ Menu ]
```

- **Left group:** Home (always), Back (when query present), Split view (when `viewportWide`), Copy… — conditionally visible per rules above.
- **Right group:** My List, Menu — unchanged.

The app bar is **persistent** (Spec 137): always visible from first load, including when the hero is shown.

### Dual Wield layout

Copy… appears in the **left rail**, after the Home button:

```
[ Menu (hamburger) ]
[ Home ]
[ Copy… ]
```

- **Left rail:** Menu (top), Home, Copy… (when query present).
- **Right rail:** Unchanged (Menu, My list, Leave).
- **Back:** Not shown in Dual Wield (desktop-only layout).

### Viewport breakpoint

Use the existing `useViewportWide()` hook (1024px breakpoint) for **Split view** and Dual Wield layout only. Single-pane Back visibility does **not** depend on this breakpoint.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/App.tsx` | Add Back and copy control to single-pane header. Back when query present (all viewports); Split view when `viewportWide`. Wire Back to `history.back()`; copy menu per Spec 164. |
| `app/src/DualWieldLayout.tsx` | Add Copy control to left rail, after Home. Condition on query presence (q1 or q2). See Spec 164 for menu behavior. |
| `docs/specs/086-dual-wield.md` | Add "Modified by Spec 129" note: left rail gains copy control. |

## Acceptance Criteria

1. **Single pane, query present:** Back and Copy… appear left of My List, after Home; Back is immediately after Home, then Split view when viewport ≥ 1024px, then Copy…, at any viewport width.
2. **Single pane, no query:** Neither Back nor Copy… is shown.
3. **Copy menu:** The control opens a menu (Spec 164). Choosing the URL item copies the current `location.href` to the clipboard. Brief "Copied!" feedback is shown (e.g., checkmark icon for ~2 seconds).
4. **Back action:** Clicking Back calls `history.back()`.
5. **Dual Wield:** Copy… appears in the left rail after Home when q1 or q2 is non-empty. Back is not shown.
6. **Icons:** Back uses `IconChevronLeft`; Copy… uses `IconClipboardDocument`.
7. **Accessibility:** Both buttons have appropriate `aria-label` values.
