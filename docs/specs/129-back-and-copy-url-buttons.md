# Spec 129: Back and Copy URL Buttons for PWA

**Status:** Implemented

**Modified by:** Spec 137 (Persistent Search App Bar — bar is always visible from first load)

**Depends on:** Spec 013 (URL State), Spec 086 (Dual Wield)

**Modifies:** Spec 086 (adds Copy URL button to left rail)

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

- **Visibility:** Shown only when `!viewportWide()` (narrow viewport) **and** a query is present.
- **Rationale:** Desktop users have easy access to the browser back button. Back is primarily for mobile web and PWA.
- **Action:** Calls `history.back()` on click.
- **Icon:** `IconChevronLeft` from the internal icon library.
- **aria-label:** "Go back" (or equivalent).
- **Dual Wield:** Not shown. Dual Wield is desktop-only (`viewportWide`), so Back is never visible in that layout.

### Copy URL button

- **Visibility:** Shown whenever a query is present (single pane or Dual Wield).
- **Label:** "Copy URL" — the button is named for what it does.
- **Action:** Copies `location.href` to the clipboard via `navigator.clipboard.writeText(location.href)`.
- **Feedback:** On successful copy, show brief "Copied!" feedback (e.g., icon swap to checkmark for ~2 seconds, matching `CopyButton` pattern).
- **Icon:** `IconClipboardDocument` from the internal icon library.
- **aria-label:** "Copy URL" (or "Copied" when feedback is active).

### Single-pane layout

Left-aligned next to the Home button. Order: Home, Split view (wide only), Back (if visible), Copy URL (if visible).

```
[ Home ] [ Split View ] [ Back ] [ Copy URL ] ... [ My List ] [ Menu ]
```

- **Left group:** Home (always), Split view (when `viewportWide`), Back (narrow only), Copy URL — conditionally visible per rules above.
- **Right group:** My List, Menu — unchanged.

The app bar is **persistent** (Spec 137): always visible from first load, including when the hero is shown.

### Dual Wield layout

Copy URL appears in the **left rail**, after the Home button:

```
[ Menu (hamburger) ]
[ Home ]
[ Copy URL ]
```

- **Left rail:** Menu (top), Home, Copy URL (when query present).
- **Right rail:** Unchanged (Menu, My list, Leave).
- **Back:** Not shown in Dual Wield (desktop-only layout).

### Viewport breakpoint

Use the existing `useViewportWide()` hook (1024px breakpoint). Back is shown when `!viewportWide()`.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/App.tsx` | Add Back and Copy URL buttons to single-pane header. Condition on `viewportWide`, query presence. Wire Back to `history.back()`, Copy URL to clipboard write + feedback. |
| `app/src/DualWieldLayout.tsx` | Add Copy URL button to left rail, after Home. Condition on query presence (q1 or q2). Wire to clipboard write + feedback. |
| `docs/specs/086-dual-wield.md` | Add "Modified by Spec 129" note: left rail gains Copy URL button. |

## Acceptance Criteria

1. **Single pane, narrow viewport:** When a query is present and viewport &lt; 1024px, Back and Copy URL buttons appear left of My List, after Home.
2. **Single pane, wide viewport:** When a query is present and viewport ≥ 1024px, Back is hidden; Copy URL is shown.
3. **Single pane, no query:** Neither Back nor Copy URL is shown.
4. **Copy URL action:** Clicking Copy URL copies the current `location.href` to the clipboard. Brief "Copied!" feedback is shown (e.g., checkmark icon for ~2 seconds).
5. **Back action:** Clicking Back calls `history.back()`.
6. **Dual Wield:** Copy URL appears in the left rail after Home when q1 or q2 is non-empty. Back is not shown.
7. **Icons:** Back uses `IconChevronLeft`; Copy URL uses `IconClipboardDocument`.
8. **Accessibility:** Both buttons have appropriate `aria-label` values.
