# Spec 113: Deck Editor Toolbar and Status Box Redesign

**Status:** Implemented

**Depends on:** Spec 110 (Hybrid Deck Editor), Spec 112 (Deck Editor Quick Fixes)

## Goal

Unify the Deck Editor layout into three contiguous parts: **TOOLBAR** | **STATUS** | **DECK LIST**. All actions live in a flush toolbar (no bordered-box illusion). The Status box displays mode-appropriate information only — no buttons.

## Background

Spec 110 placed Revert, Edit, Apply, and Copy in the toolbar. A prior revision of this spec moved Cancel, Revert, and Apply into the Status box. The current design returns all actions to the toolbar for a cleaner separation: toolbar = actions, status = feedback. The toolbar uses a flush, segmented-control style (single border, buttons contiguous to edges) to avoid the optical illusion of bordered buttons within a bordered box.

## Layout

Three or four contiguous sections with shared borders (no gaps):

1. **TOOLBAR** — Flush bar of action buttons. Rounded top corners.
2. **STATUS** — Mode-appropriate info (help text, card count, edit messages, error table). Connects to toolbar and deck list (or Compatible With bar when in Display mode).
3. **COMPATIBLE WITH** — Display mode only. Two-column bar: `| Compatible with: | [Arena] [Moxfield] … |` with help text `(for export to)` below the label. Chips use MenuDrawer styling (min-h-11, rounded, gray/outline when selected). Label block center-aligns vertically when chips wrap.
4. **DECK LIST** — Textarea with syntax-highlight overlay. Rounded bottom corners.

## Design

### 1. Toolbar

The toolbar contains all actions. Layout: left group … right group. Copy is always on the right; Apply (when shown) sits immediately left of Copy. Primary actions (Edit, Apply) use attention styling (blue fill).

| Mode | Left | Right |
|------|------|-------|
| **Display** | `[ View * ]` `[ Edit ]` (eye, pencil icons) | `[ Bug ]` `[ Copy ]` |
| **Edit, no changes** | `[ Cancel ]` (X icon) | `[ Bug ]` `[ Copy ]` |
| **Edit, with changes** | `[ Revert ]` (↶ icon) | `[ Review * ]` `[ Bug ]` `[ Copy ]` |
| **Review** | `[ Edit ]` (↶ icon) | `[ Save * ]` `[ Bug ]` `[ Copy ]` |

`*` = primary/attention styling.

- **View** — Display mode only. Navigates to search with `v:images unique:prints include:extras my:list` (or `my:trash` for trash). Primary action; users discover Edit when they see View emphasized. Eye icon. `aria-label="View list in search"`.
- **Edit** — Display mode only. Enters Edit mode. Secondary styling (transparent, gray).
- **Cancel** — Edit mode, no changes. Exits Edit mode (clears draft, returns to Display or Init).
- **Revert** — Edit mode, has changes. Resets draft to baseline; user stays in Edit mode.
- **Review** — Edit mode, has changes, no validation errors, diff has additions or removals. Enters Review mode (Spec 119).
- **Save** — Review mode only. Commits changes (same as former Apply).
- **Bug** — Display and Edit modes (disabled in Init). Opens deck report (Spec 118).
- **Copy** — Display and Edit modes (disabled in Init). Copies rendered or draft text.

**Flush bar:** Single border around the toolbar. Buttons have no individual borders; they fill the bar edge-to-edge. Right-group buttons are separated from the left by a flex spacer; Review/Save and Copy share a `border-l` between them. Avoids "bordered button within bordered box."

**Error state:** Toolbar styling is unchanged when validation fails. The Status box turns red; Review is simply hidden (errors block review). Industry standard: keep toolbar neutral, surface errors in the feedback area.

### 2. Status Box — Content Only (No Buttons)

In Edit mode, the Status box shows messages and the error table. No buttons.

#### 2a. Edit mode, no changes

```
Editing: No changes (Moxfield)
```

#### 2b. Edit mode, changes, validation errors

When validation reports errors, the Status box shows a collapsible accordion. See § 2d.

#### 2c. Edit mode, changes, valid

```
Editing: +100 cards / −135 cards (Moxfield)
```

#### 2d. Edit mode, changes, validation errors — Accordion

When there are validation errors, the error section is collapsible to keep the Status box height stable and avoid shifting the textarea as the user types.

- **Header row (fixed height):** Chevron (left) + status text ("Editing: N error(s) (Moxfield)") + right-aligned control.
- **Right-aligned control:**
  - If any error has `quickFixes?.length > 0`: Button "Apply all quick fixes". On click: `stopPropagation()`, then apply the first fix for each fixable error (sorted by `lineStart` descending).
  - If no errors have quick fixes: Text "No quick fixes available" (not a button). Tapping the bar expands the accordion (same as tapping the chevron).
- **Expand/collapse:** Whole header row is tappable to toggle. Chevron indicates state (▼ expanded, ▶ collapsed). Default: collapsed. User preference persisted in `localStorage` (`frantic-deck-editor-errors-expanded`), same pattern as breakdown/options accordions. When collapsed, error list is hidden; Status box height is stable.
- **Error table:** Unchanged from Spec 112 when expanded — line number, syntax-highlighted line, message, per-error quick fix buttons.

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

### 5. Review and Save Flow (Spec 119)

The Review button in Edit mode enters Review mode when validation passes and the diff has additions or removals. In Review mode, the Save button commits changes. The diff summary is visible in the Status box ("Editing: +N cards / −M cards"); a confirmation popover is not required. See Spec 119 for the full Review step design.

### 6. Status Box — Init and Display Modes

| Mode | Content |
|------|---------|
| **Init** | "List is empty. Paste a deck list or add cards from search results." |
| **Display** | Card count only: `N card(s)` |

No buttons in Init or Display. Format chips are in the Compatible With bar (§ 7), not the Status box.

### 7. Compatible With Bar

A separate bar below the Status box, **visible only in Display mode**. Two-column layout:

```
| Compatible with:    | [Arena] [Moxfield] [Archidekt] … |
| (for export to)     | [Melee.gg] [MTGGoldfish] [TappedOut] … |
```

- **Label** — "Compatible with:" on the left. Help text "(for export to)" below, smaller and muted. Label block center-aligns vertically when chips wrap.
- **Chips** — Same styling as MenuDrawer chips: `min-h-11`, `rounded`, `bg-gray-100`/`bg-blue-500` for unselected/selected. Selecting a chip changes the output format and persists to localStorage.
- **Init mode:** Bar not shown (list is empty).
- **Edit mode:** Bar not shown; format is shown in the status line ("Editing: … (Moxfield)").

## Acceptance Criteria

1. Layout: TOOLBAR | STATUS | [DISPLAY FORMATS] | DECK LIST — three sections always; four when in Display mode.
2. Toolbar is a flush bar: single border, buttons contiguous to edges (no bordered-box illusion).
3. Display mode: Toolbar shows `[ View * ]` `[ Edit ]` … `[ Bug ]` `[ Copy ]`. Status shows card count. Compatible With bar shows `| Compatible with: | [Arena] [Moxfield] … |` with "(for export to)" help text.
4. Edit mode, no changes: Toolbar shows `[ Cancel ]` … `[ Copy ]`. Status shows "Editing: No changes".
5. Edit mode, changes, errors: Toolbar shows `[ Revert ]` … `[ Copy ]`. Status shows error accordion (collapsible header with chevron; "Apply all quick fixes" or "No quick fixes available"; error table when expanded).
6. Edit mode, changes, valid, diff has additions/removals: Toolbar shows `[ Revert ]` … `[ Review * ]` `[ Bug ]` `[ Copy ]`. Status shows diff summary.
7. Cancel exits Edit mode (clears draft, returns to Display or Init).
8. Revert resets draft to baseline; user stays in Edit mode; UI switches to "no changes" state.
9. Save (in Review mode) commits changes; on success, draft cleared, editor returns to Display or Init.
10. Review enters Review mode; Save commits directly from the toolbar.
11. Baseline is correctly set on Edit and on restore from cache.
12. Format chips appear in the Compatible With bar in Display mode only; chips use MenuDrawer styling (outline when selected).
13. Status box turns red on validation errors; toolbar remains neutral.
14. Error accordion defaults to collapsed; expand/collapse preference persisted in `localStorage` (`frantic-deck-editor-errors-expanded`).

## Implementation Notes

- Validation runs in the worker per Spec 114 (Worker-Based Deck List Validation). The DeckEditor receives validation results asynchronously via `onValidateRequest`.

## Changelog

- 2026-03-10: Initial design — toolbar Edit+Copy only; Cancel, Revert, Apply in Status box.
- 2026-03-10: Revised — all actions moved to toolbar; Status box content-only; flush toolbar (single border, contiguous buttons); three-part layout TOOLBAR | STATUS | DECK LIST with shared borders.
- 2026-03-10: Display Formats bar — format chips moved below Status box in Display mode; two-column layout (Display: | chips); chips use MenuDrawer styling; Status box shows card count only in Display mode.
- 2026-03-10: Compatible With bar — label changed to "Compatible with:" with "(for export to)" help text; selected chip uses outline style (de-emphasized vs Edit button).
- 2026-03-11: View button — Display mode left group extended to `[ View * ]` `[ Edit ]`. View navigates to search with `v:images unique:prints include:extras my:list` (or `my:trash`). View is primary; Edit demoted to secondary.
- 2026-03-11: Error accordion — Validation errors folded under collapsible header; "Apply all quick fixes" button; "No quick fixes available" when none; preference persisted in localStorage.
