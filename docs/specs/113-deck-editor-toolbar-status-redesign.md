# Spec 113: Deck Editor Toolbar and Status Box Redesign

**Status:** In Progress

**Depends on:** Spec 110 (Hybrid Deck Editor), Spec 112 (Deck Editor Quick Fixes)

## Goal

Simplify the Deck Editor toolbar to two persistent actions (Edit, Copy) and move all edit-mode–specific actions (Cancel, Revert, Apply) into the Status box. The Status box becomes the single place for contextual feedback and actions during editing.

## Background

Spec 110 placed Revert, Edit, Apply, and Copy in the toolbar. The Status box displayed validation errors and diff summary but no actions. This predates the Status box as the natural home for contextual controls. Consolidating edit-mode actions into the Status box reduces toolbar clutter and keeps actions co-located with the feedback they affect.

## Design

### 1. Toolbar

The toolbar contains **only** two buttons, always visible (when not Init):

| Button | Init | Display | Edit |
|--------|------|---------|------|
| **Edit** | Disabled | Enabled (primary/blue); enters Edit mode | Disabled |
| **Copy** | Disabled | Enabled; copies rendered text | Enabled; copies draft text |

Layout: `[ Edit ]` … `[ Copy ]` — Copy is right-aligned (e.g. `ml-auto`) to create visual separation.

Revert, Cancel, and Apply are **removed** from the toolbar.

### 2. Status Box — Edit Mode States

In Edit mode, the Status box shows different content and buttons depending on whether the user has made changes and whether validation passes.

#### 2a. Edit mode, no changes

```
[ Cancel ]
Editing: No changes
```

- **Cancel** — Exits Edit mode (clears draft, returns to Display or Init). Same semantics as current Revert when there is nothing to revert.
- **Message** — "Editing: No changes" (colon, not ellipsis; ellipsis implies a background process).

#### 2b. Edit mode, changes, validation errors

```
[ Revert ]
<error table as currently rendered>
```

- **Revert** — Resets the draft text to the committed state (last Apply or initial Edit). User stays in Edit mode. After Revert, the state becomes "no changes" and the UI switches to 2a.
- **Error table** — Unchanged from Spec 112: line number, syntax-highlighted card line, error message, quick fix buttons.

#### 2c. Edit mode, changes, valid

```
[ Revert ] … [ Apply ]
Editing: +100 cards / −135 cards
```

- **Revert** — Same as 2b.
- **Apply** — Commits the changes. On success, draft is cleared and editor returns to Display or Init.
- **Message** — Diff summary: "+N cards / −M cards" (or "No changes" if diff is empty, though that would imply we're in 2a).

### 3. Revert vs Cancel Semantics

| Action | Effect |
|--------|--------|
| **Cancel** | Exits Edit mode. Clears draft and localStorage. Returns to Display (if list has instances) or Init. |
| **Revert** | Resets draft to committed state. User remains in Edit mode. After Revert, there are no changes → show Cancel. |

**Two-tap discard:** When there are changes (with or without errors), the user must Revert first (to reset), then Cancel (to exit). A little friction to discard work is acceptable.

### 4. Baseline Text

To determine "has changes" and to implement Revert, the editor needs a **baseline** — the text representing the committed list state when Edit was entered.

- **On Edit (Display → Edit):** Baseline = `serializedText()` at click time. Draft = baseline.
- **On Revert:** Draft = baseline. Debounce and storage are updated.
- **On restore from cache (Edit on mount):** Baseline = serialized form of `props.instances` (sync `serialize()` or async `onSerializeRequest`). Populated when entering Edit mode with cached draft.

### 5. Apply Flow

The Apply button in the Status box (2c) commits directly. The diff summary is already visible inline ("Editing: +N cards / −M cards"), so a confirmation popover is not required. The current Apply popover is removed.

If a confirmation step is desired later, it can be reintroduced without changing this spec.

### 6. Status Box — Init and Display Modes

| Mode | Content |
|------|---------|
| **Init** | "List is empty. Paste a deck list or add cards from search results." |
| **Display** | Format chips on first row, card count on second row: `[Moxfield] [Archidekt] [Arena] …` then `N card(s)` |

No buttons in Init or Display.

### 7. Format Chips

Format chips move into the status box. Visible only in Display mode (when the list has content).

- **Init mode:** No chips (list is empty).
- **Edit mode:** No chips; format is shown in the status line ("Editing: … (Moxfield)").
- **Display mode:** Chips are interactive; selecting one changes the output format and persists to localStorage. Same behavior as Spec 110 § 5 for Display mode.

## Acceptance Criteria

1. Toolbar shows only Edit and Copy. Copy is right-aligned.
2. Revert, Cancel, and Apply are removed from the toolbar.
3. Edit mode, no changes: Status box shows `[ Cancel ]` and "Editing: No changes".
4. Edit mode, changes, errors: Status box shows `[ Revert ]` and the error table.
5. Edit mode, changes, valid: Status box shows `[ Revert ]` `[ Apply ]` and "Editing: +N cards / −M cards".
6. Cancel exits Edit mode (clears draft, returns to Display or Init).
7. Revert resets draft to baseline; user stays in Edit mode; UI switches to "no changes" state.
8. Apply commits changes; on success, draft cleared, editor returns to Display or Init.
9. Apply popover is removed; Apply commits directly from the Status box.
10. Baseline is correctly set on Edit and on restore from cache.
11. Format chips appear in the status box in Display mode only.
12. Format chips are removed from above the toolbar.

## Implementation Notes

- (To be filled as implementation proceeds.)
