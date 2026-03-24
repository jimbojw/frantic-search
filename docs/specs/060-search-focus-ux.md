# Spec 060: Search Focus UX

**Status:** Implemented

**Depends on:** Spec 013 (URL State)

## Goal

Make the search bar the primary entry point with platform-aware behavior: pressing `/` focuses it from anywhere; on desktop, the cursor starts in the search bar on load; on mobile, we wait for a tap to avoid popping the keyboard. Header collapse is tied to user engagement, not focus alone.

## State Model

### Platform

| Platform | Detection | Implication |
|----------|-----------|-------------|
| **Coarse pointer** (touch) | `matchMedia('(pointer: coarse)').matches` | Do not auto-focus on load — focusing would bring up the virtual keyboard |
| **Fine pointer** (mouse/stylus) | `matchMedia('(pointer: fine)').matches` | Auto-focus on load; cursor ready to type |

### User Engagement

| State | Meaning | When it changes |
|-------|---------|-----------------|
| **Idle** | User has not interacted with search | Initial load, or after `navigateHome` reset |
| **Engaged** | User has interacted with search | First user-initiated focus (click/tap) or **pointer down on the search input**, first keystroke, or pressing `/` |

Programmatic focus (e.g. initial load on desktop) does **not** set engaged.

**Desktop edge case:** On fine-pointer devices the textarea is auto-focused on load without setting engaged. If the user clicks the textarea while it is *already* focused, the browser does not fire a second `focus` event, so `onFocus` alone would never set engaged. Treat **`pointerdown` on the search textarea** as engagement (same outcome as clicking in after a blur). This keeps URL sync (e.g. empty `?q=`) and other engaged-only behavior consistent with user intent.

### Header Collapse

The header (art, title, subtitle) collapses when any of:

1. **Query non-empty** — user is searching
2. **Terms drawer open** — user is using filters
3. **Engaged and focused** — user has interacted and the input is focused

So: `headerCollapsed = query().trim() !== '' || termsExpanded() || (inputFocused() && userEngaged())`

Previously, `inputFocused` alone triggered collapse. That caused the header to collapse on initial load when we auto-focused on desktop, before the user had done anything.

### State Transitions

```
                         PAGE LOAD
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
  Coarse pointer                              Fine pointer
    (mobile)                                   (desktop)
         │                                         │
         │ No auto-focus                           │ Auto-focus
         │ userEngaged = false                     │ userEngaged = false
         │ header = expanded                       │ header = expanded
         │                                         │
         └────────────────────┬────────────────────┘
                              │
                              │ User taps/clicks input (incl. click while already focused)
                              │ OR pointerdown on textarea OR types (e.g. via /)
                              ▼
                       userEngaged = true
                              │
                              │ header collapses (if input focused)
                              ▼
                       User blurs → userEngaged stays true
                              │
                              │ User focuses again → header collapses
```

## Requirements

1. **`/` keyboard shortcut** — When the user presses `/` without modifier keys, focus moves to the search bar. If on another view (card, help, report), navigate to search first, then focus. Treat as user engagement (header collapses).
2. **Initial focus on desktop** — When the app loads with search view on a fine-pointer device, focus the search bar once the input is ready. Do **not** set user engagement; header stays expanded.
3. **No initial focus on mobile** — On coarse-pointer devices, do not auto-focus; wait for a tap.
4. **Header collapse** — Collapse only when query non-empty, terms drawer open, or (input focused and user engaged).

## Technical Details

### Signals and flags

| Name | Type | Purpose |
|------|------|---------|
| `inputFocused` | signal | Input has focus |
| `userEngaged` | signal | User has interacted (replaces `hasEverFocused`) |
| `programmaticFocusInProgress` | variable | When true, `onFocus` does not set `userEngaged` |

### Platform detection

```typescript
const prefersFinePointer = () => matchMedia('(pointer: fine)').matches
```

Use at focus time; no need to react to changes (e.g. plugging in a mouse on a tablet).

### Programmatic vs user-initiated focus

- **Programmatic**: `focusSearchInput(true)` — sets `programmaticFocusInProgress` before `focus()`. Used for initial-load auto-focus on desktop.
- **User-initiated**: `focusSearchInput()` or `focusSearchInput(false)` — no flag. Used for `/` key.

In `onFocus`: if `programmaticFocusInProgress`, clear it and do not set `userEngaged`. Otherwise, set `userEngaged(true)`.

### User engagement from pointer on the textarea

On the search textarea, `onPointerDown` (or equivalent) calls `setUserEngaged(true)` (idempotent). This covers the desktop case where the field already has focus from initial auto-focus and a click does not retrigger `onFocus`. Programmatic focus does not synthesize a pointer event, so engagement is still unset until the user acts.

### User engagement from typing

In `onInput`, set `userEngaged(true)` on first keystroke (idempotent).

### Initial focus effect

```typescript
createEffect(() => {
  if (view() !== 'search') return
  if (!prefersFinePointer()) return
  queueMicrotask(() => focusSearchInput(true))
})
```

### `/` keydown handler

Unchanged from before: global listener, skip when focus is in input/textarea/select/contenteditable, navigate if needed, then `queueMicrotask(() => focusSearchInput())` (user-initiated).

### navigateHome

- `isAtHome` uses `!userEngaged()` instead of `!hasEverFocused()`.
- Reset calls `setUserEngaged(false)`.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Focus in TermsDrawer input | Do not intercept `/` |
| Focus in BugReport textarea | Same |
| View is card, help, or report | `/` navigates to search, focuses, sets engaged |
| Input disabled (worker error) | Skip focus; `/` still navigates |
| Search bar | Focus `textareaRef` (always a textarea) |
| Desktop with touchscreen | `(pointer: fine)` typically true; auto-focus |
| Desktop: click textarea after auto-focus (no blur) | `pointerdown` sets engaged even though `focus` does not refire |

## Acceptance Criteria

- [x] On desktop load with search view, search bar receives focus; header stays expanded.
- [x] On mobile load, no auto-focus; header stays expanded until user taps.
- [x] After user taps/clicks input or types, header collapses when input is focused.
- [x] On desktop, after auto-focus without `q` in the URL, a click on the textarea (still focused) sets engaged the same as refocusing after blur (e.g. empty `?q=` appears per URL-sync rules).
- [x] Pressing `/` focuses search bar; `/` not typed; header collapses.
- [x] Pressing `/` on card/help/report navigates to search and focuses.
- [x] `navigateHome` resets `userEngaged`; header can expand again.

## Implementation Notes

- 2026-03-23: Added `pointerdown` on the single-pane search textarea so engagement (and thus empty `q=` URL projection) updates when the user clicks the field that already has focus from desktop auto-focus (`onFocus` does not run again).
