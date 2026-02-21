# Spec 013: URL State & History

**Status:** Draft

## Goal

Sync the search query to the URL so that queries are shareable, bookmarkable, and navigable with the browser back button. Establish history semantics that distinguish continuous editing (typing) from discrete navigation events (tapping a link, loading a URL).

## Background

Today the app stores the query entirely in a SolidJS signal. The URL never changes. This means:

- Users cannot share or bookmark a query.
- The browser back button does nothing useful within the app.
- Features that want to programmatically change the query (e.g., tapping a help example, Spec 014) have no way to let the user "go back" to what they were doing.

This spec introduces a lightweight URL state layer that solves all three. It is a prerequisite for Spec 014 (Syntax Help Overlay), which needs `pushState` for clickable examples, but is independently valuable.

## URL Format

| State | URL | Example |
|---|---|---|
| Empty query | Bare path (no query string) | `https://frantic.search/` |
| Active query | `?q=<encoded>` | `?q=t%3Acreature+c%3Agreen` |
| Help page | `?help` (with optional `&q=<encoded>`) | `?help&q=c%3Ared` |

The `q` parameter uses standard `encodeURIComponent` encoding. This matches Scryfall's URL convention (`?q=...`), so users can copy a URL from one and paste it into the other.

When the help page is open, the `q` parameter preserves the user's current query so it survives a round-trip through the help page and back.

## History Semantics

Two categories of query change produce different history behavior:

| Action | API | URL effect | History effect |
|---|---|---|---|
| Keystroke in search input | `replaceState` | URL updates to reflect current query | No new history entry. Typing is continuous editing. |
| Clear query (backspace to empty) | `replaceState` | `q` param removed | No new history entry. |
| Tap help icon | `pushState` | `?help&q=...` | New history entry. Back returns to search. |
| Tap help example | `pushState` | `?q=<example>` | New history entry. Back returns to help. |
| Close help (X button) | `back()` | Restores previous URL | Pops history entry. |
| Page load with `?q=...` | (read only) | — | Query signal hydrated from URL. |
| Page load with `?help` | (read only) | — | Help view shown. |

### Invariant

`replaceState` is used for continuous changes (typing). `pushState` is used for discrete navigation events (opening help, selecting an example). This ensures the back button always moves between meaningful states, not individual keystrokes.

## View Routing

The app has two views, derived from the URL:

```typescript
type View = 'search' | 'help'
```

The active view is determined by whether the `help` parameter is present in the URL search string. No router library is needed — a single derived signal is sufficient:

```typescript
const [view, setView] = createSignal<View>(
  new URLSearchParams(location.search).has('help') ? 'help' : 'search'
)
```

The `App` component conditionally renders based on `view()`. The search view includes the header, search input, and results. The help view is a full-page scrollable overlay (Spec 014).

## Integration with Existing State

The `query` signal remains the single source of truth for the current query text. The URL is a projection of this signal, not a replacement.

### Data flow

```
URL → (on mount / popstate) → setQuery()
query signal → (on change) → replaceState
help icon / example tap → pushState → triggers popstate → setQuery()
```

### `popstate` handler

A single `popstate` event listener reads the URL and updates both `view` and `query`:

```typescript
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search)
  setView(params.has('help') ? 'help' : 'search')
  setQuery(params.get('q') ?? '')
})
```

### On mount

On initial load, hydrate the query from the URL:

```typescript
const initialParams = new URLSearchParams(location.search)
const [query, setQuery] = createSignal(initialParams.get('q') ?? '')
```

### `replaceState` on keystrokes

A reactive effect syncs the query signal to the URL without creating history entries:

```typescript
createEffect(() => {
  const q = query().trim()
  const params = new URLSearchParams(location.search)
  if (q) {
    params.set('q', q)
  } else {
    params.delete('q')
  }
  const url = params.toString() ? `?${params}` : location.pathname
  history.replaceState(null, '', url)
})
```

This effect preserves other URL parameters (e.g., `help`) when updating `q`.

### Navigation helpers

Two helper functions encapsulate `pushState` for discrete navigation:

```typescript
function navigateToHelp() {
  const params = new URLSearchParams(location.search)
  params.set('help', '')
  history.pushState(null, '', `?${params}`)
  setView('help')
}

function navigateToQuery(q: string) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  const url = params.toString() ? `?${params}` : location.pathname
  history.pushState(null, '', url)
  setQuery(q)
  setView('search')
}
```

## GitHub Pages Compatibility

The app deploys to GitHub Pages with `base: './'` (relative paths). GitHub Pages does not support server-side routing — navigating directly to a URL with query params works because query params are not part of the path. No `404.html` redirect hack is needed.

## Standalone PWA

In standalone mode (`display: standalone` in the web app manifest), the browser chrome is hidden but `history.pushState` / `popstate` still works. The back gesture (swipe-right on iOS, system back on Android) navigates the history stack. This means help-as-a-page and back-to-dismiss work naturally in the installed PWA without any special handling.

## Acceptance Criteria

1. On page load with `?q=t%3Acreature`, the search input is pre-filled with `t:creature` and results display.
2. Typing in the search input updates the URL via `replaceState`. The browser back button does not step through individual keystrokes.
3. The `?help` parameter controls which view is shown. Direct navigation to `?help` shows the help view.
4. `pushState` is called for discrete navigation events (help icon tap, example tap). `replaceState` is called for keystrokes.
5. Browser back from the help view returns to the search view with the previous query intact.
6. Browser back from a query set by a help example returns to the help view.
7. The URL always reflects the current app state (query and view).
8. Works correctly in standalone PWA mode (back gesture navigates history).
9. Works on GitHub Pages (no server-side routing required).
