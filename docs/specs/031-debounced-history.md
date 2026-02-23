# Spec 031: Debounced Browser History

**Status:** In Progress

**Depends on:** Spec 013 (URL State & History), Spec 022 (View Transition Scroll Management)

## Goal

Periodically commit the search query to browser history so that the back button returns to meaningful intermediate states, not just the pre-session starting point. Guarantee that discrete interactions (histogram bar clicks, breakdown token edits) preserve the pre-interaction query in history.

## Background

Spec 013 established the invariant: `replaceState` for continuous changes (typing), `pushState` for discrete navigation events (opening help, selecting a card). This prevents the back button from stepping through individual keystrokes — but it also means that all typing within a session collapses into a single history entry.

If a user types `t:creature`, then clicks a histogram bar to append `ci>=r`, and then presses back, the entire search session is lost. The user wanted to undo the histogram click; instead they land on whatever preceded the search session entirely.

## Design

### Mental model: working draft

The current history entry is a **working draft**. Every so often — or immediately before a discrete in-view interaction — the draft is **committed** (pushed) and a new draft begins. The URL bar always shows the current draft; `replaceState` keeps it accurate on every keystroke.

### State

Two pieces of module-level state track the commit lifecycle:

| Variable | Type | Initial value | Purpose |
|---|---|---|---|
| `needsPush` | `boolean` | `false` | When true, the next URL change should push the current URL to history first (preserving it as a back-navigable entry) before applying `replaceState`. |
| `debounceTimer` | `ReturnType<typeof setTimeout> \| null` | `null` | Handle for the pending debounced commit. |

### Constants

| Name | Value | Rationale |
|---|---|---|
| `HISTORY_DEBOUNCE_MS` | `2000` | Long enough that normal typing does not spam history; short enough that pausing between thoughts creates a restore point. |

### Primitives

Four functions compose the mechanism:

#### `pushIfNeeded()`

If `needsPush` is true, call `saveScrollPosition()` then `pushState(history.state, '', location.href)` and reset `needsPush` to false. This is the single code path that creates in-view history entries. It runs inside the query→URL effect, *before* `replaceState`, so the pushed entry preserves the pre-change URL while `replaceState` immediately writes the new URL into the fresh entry.

The key insight: the push happens lazily at the moment of the *next* URL change, not eagerly when the debounce fires. This avoids creating duplicate entries (the eager approach pushes the current URL into a new slot, then `replaceState` overwrites that same slot, leaving two entries with the same URL).

#### `scheduleDebouncedCommit()`

Cancel any pending timer, then set a new one for `HISTORY_DEBOUNCE_MS`. When it fires, set `needsPush = true`. No `pushState` call — the flag is consumed lazily by `pushIfNeeded()` on the next URL change.

#### `flushPendingCommit()`

Clear the debounce timer and set `needsPush = true`. Called before discrete in-view interactions (histogram clicks, breakdown token edits) to guarantee the pre-interaction query is pushed on the next effect run.

#### `cancelPendingCommit()`

Clear the debounce timer and set `needsPush = false`. Called by view-navigation functions (`navigateToCard`, `navigateToHelp`, etc.) and the `popstate` handler. Navigation functions already call `pushState` for their own view transition, which inherently preserves the current URL as the back entry — an extra push would create a duplicate. `popstate` means the user navigated away, so any pending draft is abandoned.

### Wiring

#### Query → URL effect

The existing `createEffect` (Spec 013 § `replaceState` on keystrokes) gains `pushIfNeeded()` before `replaceState` and `scheduleDebouncedCommit()` after:

```typescript
createEffect(() => {
  // ...existing URL computation...
  pushIfNeeded()
  history.replaceState(history.state, '', url)
  scheduleDebouncedCommit()
})
```

Every query change — whether from typing, `appendQuery`, or `setQuery` — first consumes any pending push flag, then updates the URL, then resets the debounce timer.

#### Discrete in-view interactions

Functions that programmatically modify the query within the search view call `flushPendingCommit()` before mutating the signal:

| Call site | Current code | Change |
|---|---|---|
| `appendQuery()` | `setQuery(q => ...)` | Add `flushPendingCommit()` before `setQuery` |
| `onNodeClick` (InlineBreakdown) | `setQuery` passed directly | Wrap: `(q) => { flushPendingCommit(); setQuery(q) }` |
| `onNodeRemove` (InlineBreakdown) | `setQuery` passed directly | Wrap: `(q) => { flushPendingCommit(); setQuery(q) }` |

After the flush sets `needsPush = true`, the query mutation triggers the effect. `pushIfNeeded()` fires inside the effect, pushing the pre-interaction URL. Then `replaceState` writes the new URL. The pushed entry now sits behind the new draft.

#### View-navigation functions

`navigateToHelp`, `navigateToCard`, `navigateToReport`, and `navigateHome` call `cancelPendingCommit()` at the top, before `saveScrollPosition()`. Their own `pushState` already preserves the current search URL as the back entry, so no extra push is needed.

#### `popstate` handler

On `popstate`, call `cancelPendingCommit()` to clear the timer and the push flag. The user navigated away from the draft:

```typescript
window.addEventListener('popstate', () => {
  cancelPendingCommit()
  // ...existing signal updates and scroll restoration...
})
```

## Example Walkthrough

### Typing then clicking a histogram bar

```
User types "t:creature"
  → effect: pushIfNeeded (no-op), replaceState(?q=t:creature), debounce starts
  ...500ms later, user clicks histogram bar for ci>=r...
  → flushPendingCommit(): clears timer, needsPush=true
  → appendQuery → setQuery("t:creature ci>=r")
  → effect: pushIfNeeded → pushState(?q=t:creature), replaceState(?q=t:creature+ci>=r)
  ...2s pass, timer fires → needsPush=true...

History: [?q=t:creature] → [?q=t:creature ci>=r]
Back:    t:creature ci>=r → t:creature
```

### Typing with natural pauses

```
User types "t:creature"
  → effect: replaceState(?q=t:creature), debounce starts
  ...2s pass, timer fires → needsPush=true...
User types " c:green"
  → effect: pushIfNeeded → pushState(?q=t:creature), replaceState(?q=t:creature+c:green)
  ...2s pass, timer fires → needsPush=true...

History: [?q=t:creature] → [?q=t:creature c:green]
Back:    t:creature c:green → t:creature
```

### Typing then navigating to card detail

```
User types "t:creature"
  → effect: replaceState(?q=t:creature), debounce starts
  ...800ms later, user clicks a card...
  → navigateToCard: cancelPendingCommit(), saveScrollPosition()
  → pushState(?card=abc&q=t:creature)

History: [?q=t:creature (scroll)] → [?card=abc&q=t:creature]
Back from card → search with "t:creature"
```

Navigation functions don't need an extra push — their own `pushState` inherently preserves the current URL as the back entry.

## Edge Cases

### No pending changes

`pushIfNeeded()` checks `needsPush` and returns early when false. `flushPendingCommit()` is safe to call at any time — it sets the flag, and if no subsequent URL change occurs, the flag is inert.

### Empty query

Clearing the input triggers the effect, which removes `?q` and schedules a debounced commit. If `needsPush` was true (from a prior debounce), `pushIfNeeded` saves the non-empty URL before replacing with the empty one. This means back from an empty search bar returns to the last query.

### Rapid discrete interactions

If the user clicks two histogram bars in quick succession (< 2s apart), each click calls `flushPendingCommit()`. The first click sets `needsPush=true` and the effect pushes the pre-click URL. The second click does the same for its pre-click URL. Each click is individually undoable.

### Page load

`needsPush` starts as `false`. The browser already placed the page-load URL in history. No push occurs until the first debounce fires and a subsequent URL change consumes the flag.

### `popstate` cancels pending draft

If the user types, then immediately hits back (before the debounce fires), `cancelPendingCommit()` clears the timer and resets `needsPush=false`. The in-progress typing is abandoned. This matches expectation: back means "undo," not "commit and undo."

### No duplicate entries

Because the push happens lazily (inside the effect, before `replaceState`), the pushed URL and the replaced URL are always different — the push captures the *old* URL, and `replaceState` writes the *new* URL into the fresh entry. This eliminates the duplicate-entry problem that occurs with eager pushing.

## Acceptance Criteria

1. Typing a query, pausing ≥ 2s, then typing more: a single back returns to the first query (not the pre-session state, and not a duplicate requiring double-back).
2. Typing a query, then clicking a histogram bar: back returns to the pre-click query.
3. Typing a query, then clicking a breakdown token to edit it: back returns to the pre-edit query.
4. Navigating to card detail after typing a query: back returns to the search view with the query intact (existing behavior, preserved).
5. Rapid typing (no pauses ≥ 2s) does not create intermediate history entries.
6. Clearing the query (backspace to empty) preserves the previous query in history.
7. `popstate` cancels any pending debounce timer and does not re-push stale URLs.
8. No duplicate history entries are created — every adjacent pair of entries has a distinct URL.
