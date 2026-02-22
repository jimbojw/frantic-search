# Spec 022: View Transition Scroll Management

**Status:** Implemented 

**Depends on:** Spec 013 (URL State & History), Spec 015 (Card Detail Page)

## Goal

Scroll to the top of the page on forward navigation (e.g., search → card) and restore the previous scroll position on back navigation (e.g., card → search), matching the behavior users expect from a multi-page website. This is especially important in standalone PWA mode where the browser's native scroll restoration is absent.

## Background

The app manages views via conditional rendering (`<Show>`) and the History API (Spec 013). When a user scrolls down through search results and taps a card, the browser preserves `window.scrollY` because the document never unloads. The card detail page appears pre-scrolled to an arbitrary position — sometimes past all its content.

Browsers implement automatic scroll restoration for `popstate` events (`history.scrollRestoration = 'auto'`), but this is unreliable in SPAs because the DOM is destroyed and rebuilt between views. The conditionally rendered result list does not exist when the card view is active, so the browser has no content to scroll within. By the time the list re-renders on back navigation, the browser's restoration has already fired against a shorter document.

## Design

### Opt Out of Browser Scroll Restoration

Set `history.scrollRestoration = 'manual'` on app startup. This prevents the browser from interfering with our explicit scroll management.

### Save Scroll Position Before Leaving

Each `navigateTo*` function that calls `pushState` first persists the current scroll offset into the **current** history entry's state via `replaceState`:

```typescript
function saveScrollPosition() {
  history.replaceState(
    { ...history.state, scrollY: window.scrollY },
    '',
  )
}
```

This is called at the top of `navigateToCard`, `navigateToHelp`, and `navigateToReport` — before the `pushState` call that creates the new entry.

### Scroll to Top on Forward Navigation

After each `pushState` + signal update in a `navigateTo*` function, call `window.scrollTo(0, 0)`. The new view always starts at the top.

### Restore Scroll on Back/Forward (`popstate`)

In the existing `popstate` handler, after updating `view`, `query`, and `cardId` signals, restore the scroll position stored in the history entry's state:

```typescript
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search)
  setView(parseView(params))
  setQuery(params.get('q') ?? '')
  setCardId(params.get('card') ?? '')

  const scrollY = history.state?.scrollY ?? 0
  requestAnimationFrame(() => window.scrollTo(0, scrollY))
})
```

`requestAnimationFrame` defers the scroll until after SolidJS has flushed the DOM update. Because the result list renders synchronously from the `results()` signal (data is already in memory — no worker round-trip), a single frame is sufficient for the DOM to reach its full height.

### Preserve State in `replaceState` Effect

The existing `createEffect` that syncs the query to the URL via `replaceState` currently passes `null` as the state argument, which would erase any saved `scrollY`. Update it to preserve existing state:

```typescript
createEffect(() => {
  const q = query().trim()
  if (view() !== 'search') return
  const params = new URLSearchParams(location.search)
  if (q) {
    params.set('q', query())
  } else {
    params.delete('q')
  }
  const url = params.toString() ? `?${params}` : location.pathname
  history.replaceState(history.state, '', url)
})
```

This change is safe: `history.state` is `null` on a fresh page load (preserving current behavior) and carries forward any `scrollY` we saved.

### `navigateHome` Reset

`navigateHome` uses `pushState` to clear the query and return to the landing state. It should also save scroll and scroll to top for consistency, even though the landing page is short.

## Affected Functions

| Function           | Change                                               |
|--------------------|------------------------------------------------------|
| App startup        | Set `history.scrollRestoration = 'manual'`           |
| `navigateToCard`   | Call `saveScrollPosition()` before `pushState`; `scrollTo(0, 0)` after |
| `navigateToHelp`   | Same pattern                                         |
| `navigateToReport` | Same pattern                                         |
| `navigateHome`     | Same pattern                                         |
| `popstate` handler | Restore `history.state?.scrollY` via `requestAnimationFrame` |
| `replaceState` effect | Pass `history.state` instead of `null`            |

## Edge Cases

### Empty results on back navigation

If the user navigates back to the search view but the results are empty (e.g., the worker hasn't responded yet after a query change), the DOM is too short to scroll. This is harmless — `scrollTo` to a position beyond the document height is clamped to the maximum scrollable offset by the browser.

### Deep history stacks

A user may navigate: search → card A → back → card B → back → help → back. Because scroll positions are stored per history entry (in `history.state`), each back/forward step restores the correct position independently.

### Page refresh

`history.state` survives page refreshes. However, a refresh re-fetches card data from the worker, so the result list may differ. Restoring a stale scroll offset to a different-length list is harmless (the browser clamps) and matches browser-native scroll restoration behavior.

### Standalone PWA

In standalone mode (`display: standalone`), there is no browser chrome, but the History API and `popstate` events work identically. iOS swipe-back and Android system back trigger `popstate`. The scroll restoration logic requires no PWA-specific handling.

## Acceptance Criteria

1. Navigating from search results to a card detail page scrolls to the top of the card view.
2. Pressing back (browser button, swipe gesture, or on-screen back arrow) from the card detail page returns to the search view at the scroll position where the user left.
3. Navigating to the help page scrolls to the top.
4. Pressing back from the help page restores the previous scroll position.
5. Navigating to the bug report page scrolls to the top.
6. The query-sync `replaceState` effect does not erase saved scroll state.
7. Scroll restoration works in standalone PWA mode (iOS swipe-back, Android system back).
8. `history.scrollRestoration` is set to `'manual'` to prevent browser interference.
