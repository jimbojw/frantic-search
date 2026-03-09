# Spec 110: Hybrid Import/Export Deck Editor

**Status:** In Progress

**Depends on:** Spec 075 (Card List Data Model), Spec 108 (List Import Textarea), Spec 109 (Deck Instance Model)

## Goal

Define the three-mode behavior of a unified, syntax-highlighted textarea that serves as both the import interface and the formatted output view for a card list. The editor has three modes — Init, Display, and Edit — and at any moment the textarea reflects exactly one: an empty editable surface (Init), a read-only rendering of the internal list state (Display), or the user's uncommitted draft text (Edit).

## Background

Spec 108 implemented a syntax-highlighted textarea and deck list lexer/validator. Spec 109 (draft) extends the Instance data model with zone, tags, collection status, and variant fields, and defines the import procedure that maps parsed tokens to Instances. Currently the `ListImportTextarea` component is a stateless input — text goes in, syntax highlighting comes out, but there is no connection to the persistent list model, no concept of modes, and no draft persistence.

The goal is a single textarea that serves triple duty:

- In **Init mode**, the list is empty. The textarea is editable with placeholder text, inviting the user to paste a decklist. External add actions (+ buttons) also work.
- In **Display mode**, the list has content. The textarea is read-only and shows a formatted rendering of the internal state. Format chips control the output format.
- In **Edit mode**, the user has a draft that diverges from the internal state. The draft is aggressively cached to `localStorage`. Committing the draft is a deliberate action (Apply).

This spec covers the modal state machine, toolbar, format chips, draft persistence, and external mutation gating. It does **not** cover the diff calculation, the apply/commit procedure, or the confirmation modal — those are deferred to a follow-on spec.

## Design

### 1. Editor Modes

The editor has three modes:

| Mode | Textarea | Toolbar | Format Chips | External Mutations |
|------|----------|---------|--------------|-------------------|
| **Init** | Editable; empty with placeholder | No Apply, no Revert, no Edit; Copy hidden | Disabled | **Allowed** |
| **Display** | Read-only; rendered internal state | Edit button (pencil icon), Copy | Active | **Allowed** |
| **Edit** | Editable; user's draft text | Apply (enabled when valid), Revert, Copy | Disabled | **Gated** |

Mode is derived from two inputs — whether a draft exists and whether the internal list has instances:

| Draft exists? | List has instances? | Mode |
|---------------|-------------------- |------|
| No | No | **Init** |
| No | Yes | **Display** |
| Yes | (either) | **Edit** |

### 2. Mode Transitions

```
              ┌──────────────────────────┐
              │        Init Mode         │
              │  (editable, empty, open) │
              └─────┬──────────┬─────────┘
                    │          │
   user types/pastes│          │ external + adds
                    │          │ first instance
                    ▼          ▼
  ┌─────────────────────┐   ┌────────────────────────┐
  │     Edit Mode       │   │     Display Mode       │
  │  (editable, draft)  │   │  (read-only, rendered) │
  └──────────┬──────────┘   └──────────┬─────────────┘
             │                         │
             │  ┌──────────────────────┘
             │  │ user clicks Edit button
             │  │
             │  ▼
             │  (enters Edit with rendered
             │   text as initial draft)
             │
     ┌───────┴───────┐
     │               │
  Apply (*)     Revert/Clear
     │               │
     ▼               ▼
  Resulting       Internal
  list empty?     state empty?
   │    │          │    │
  yes   no        yes   no
   │    │          │    │
   ▼    ▼          ▼    ▼
 Init Display    Init Display
```

(*) Apply triggers the import/diff/commit pipeline defined in Spec 109. From this spec's perspective, Apply is a callback that receives the current draft text. On success, the draft is cleared. The resulting mode depends on whether the list now has instances.

**Init → Edit:** The user types or pastes into the empty textarea. A draft is created, `localStorage` caching begins, and the toolbar shows Apply/Revert. The placeholder text disappears.

**Init → Display:** An external action (e.g., + button on a search result card) adds the first instance to the list. The textarea switches to read-only and renders the new internal state. No draft is involved.

**Display → Edit:** The user clicks the Edit button (pencil icon). The current rendered text becomes the initial draft. The textarea becomes editable, the toolbar shows Apply/Revert (replacing the Edit button), and format chips are disabled.

**Edit → Display:** Apply succeeds and the resulting list is non-empty, OR Revert is clicked and the internal state is non-empty. The draft is cleared (memory and `localStorage`), and the textarea re-renders from internal state.

**Edit → Init:** Apply succeeds and the resulting list is empty (user deleted all cards), OR Revert is clicked and the internal state is empty. The draft is cleared and the textarea returns to empty with placeholder.

**Display → Init:** An external action (e.g., - button) removes the last instance from the list. The textarea switches from read-only rendered state to editable empty with placeholder.

**Page load:** On mount, the component checks `localStorage` for a cached draft and inspects the internal list state. If a cached draft exists, the editor starts in Edit mode regardless of list contents. Otherwise, the mode is Init (empty list) or Display (non-empty list).

### 3. Toolbar

A horizontal bar above the textarea with state-dependent actions:

| Action | Init Mode | Display Mode | Edit Mode |
|--------|-----------|-------------|-----------|
| **Edit** | Hidden | Visible (pencil icon); enters Edit mode | Hidden |
| **Apply** | Hidden | Hidden | Visible; enabled when validation reports zero errors, disabled otherwise |
| **Revert** | Hidden | Hidden | Visible; discards draft, returns to Display or Init |
| **Copy** | Hidden | Visible; copies rendered text to clipboard | Visible; copies draft text to clipboard |

Apply invokes an `onApply(draftText: string)` callback. The parent owns the diff/commit logic (follow-on spec). The callback returns a boolean (or Promise) indicating success; on success, the editor clears the draft and transitions to Display or Init depending on whether the resulting list has instances.

### 4. Format Chips

A horizontal row of selectable chips, positioned above (or inline with) the toolbar. Each chip maps to an export format.

**Init mode:** Chips are disabled (nothing to render or detect).

**Display mode:** Chips are interactive. Selecting a chip re-renders the textarea using that format's serializer. The selected format persists in `localStorage` so it survives navigation and reload.

**Edit mode:** Chips are non-interactive (visually muted, no pointer cursor, no click handler). However, the chip matching the **detected format** of the current draft is visually indicated — distinct from the interactive "selected" style used in Display mode, but clearly distinguishable from the other unmatched chips (e.g., outlined or subtly highlighted vs. filled). This communicates: "the system recognizes this as format X." If no format-specific tokens are present (ambiguous input), no chip is indicated.

On Apply, the detected format becomes the selected Display mode format. This avoids a jarring reformat — the user sees their list rendered in the same format they just pasted.

**Format detection:** A function in `shared/` examines the lexer token stream for format-discriminating tokens:

| Discriminating tokens | Detected format |
|----------------------|-----------------|
| `CATEGORY`, `CATEGORY_TAG`, `COLLECTION_STATUS_TEXT` | Archidekt |
| `FOIL_MARKER`, `ALTER_MARKER`, `ETCHED_MARKER` | Moxfield |
| `VARIANT`, `SET_CODE_BRACKET`, `FOIL_PAREN`, `ETCHED_PAREN` | MTGGoldfish |
| `SECTION_HEADER` value matches `MainDeck` / `Main Deck` | Melee.gg |
| `SECTION_HEADER` only (no format-specific tokens) | Arena |
| No format-specific tokens | Ambiguous (no chip indicated) |

Detection uses a "most-specific wins" heuristic — if Archidekt-specific tokens are present alongside generic section headers, the result is Archidekt. Plain `quantity name` lines are valid in all formats and do not discriminate. Mixed format-specific tokens from different formats (unusual, likely manual editing) fall back to ambiguous.

**Initial formats:** A minimal set to start — the serializer interface is designed so new formats can be added independently.

**Serializer interface:**

```typescript
type DeckSerializer = (instances: InstanceState[], metadata: ListMetadata) => string
```

Each chip maps to a serializer function that receives the active list's instances and metadata and returns the formatted text for the textarea. Serializer implementations are out of scope for this spec.

### 5. Draft State Persistence (localStorage)

The draft is aggressively cached so it survives page reloads, navigation, and accidental tab closure.

**Key:** `frantic-search-draft:{list_id}`

**Value:** JSON-serialized object:

```typescript
interface DraftCache {
  text: string
  timestamp: number
}
```

**Write timing:** On every `input` event — not debounced. Deck lists are small (typically <5 KB), so this has negligible performance cost. The purpose is crash safety, not periodic sync.

**Restore:** On component mount, check for a cached draft for the active `list_id`. If one exists, enter Edit mode with the cached text. The Apply/Revert buttons serve as the dirty-state indicator.

**Clear:** Remove the key from `localStorage` on successful Apply, on Revert, or when the user clears the editor. No automatic expiration for stale drafts — Revert lets the user discard them explicitly.

**Cross-tab sync:** `localStorage` fires a `storage` event in all other same-origin tabs when a key is written or removed. The component listens for `storage` events on the draft key. When another tab creates a draft, the receiving tab enters Edit mode (and gates mutations) for that list. When another tab clears the draft (Apply or Revert), the receiving tab exits Edit mode. The originating tab updates its own state directly — the `storage` event only fires in other tabs. No additional `BroadcastChannel` is needed for draft state; the existing `frantic-search-card-lists` channel (Spec 075) handles instance log changes independently.

### 6. External Mutation Gating

While the editor is in Edit mode, the user has a draft representing their intended list state. If external actions (add/remove buttons on search results, quantity adjustments) modified the internal model concurrently, the rendered state the user expects to see on Revert (or after Apply) would be unpredictable.

To prevent this:

- When Edit mode is active, UI elements that write to the `instance_log` for the **active list** are disabled (visually dimmed, non-interactive).
- The gating signal is a reactive boolean (`isDraftActive`) exposed from the editor via callback or shared context.
- **Gated actions:** Add-to-list, remove-from-list, quantity increment/decrement, and any other operation that appends to the active list's instance log.
- **Ungated actions:** Operations on other lists, search queries, navigation, and read-only interactions remain fully functional.

Init mode and Display mode do **not** gate external mutations. In Init mode, + buttons are the expected way to start building a list. In Display mode, +/- buttons trigger immediate re-render of the read-only textarea.

### 7. Component Architecture

`ListImportTextarea` is refactored into a `DeckEditor` component that owns:

- Mode state (derived from draft presence and list emptiness)
- Draft text signal + `localStorage` sync
- Format chip selection signal
- Serializer dispatch (Display mode rendering)
- Toolbar rendering (Edit, Apply, Revert, Copy — state-dependent)
- The existing syntax-highlighting overlay layer (Spec 108)
- Validation memo (Spec 108)

**Props:**

```typescript
interface DeckEditorProps {
  listId: string
  instances: InstanceState[]
  metadata: ListMetadata
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  onApply: (draftText: string) => Promise<boolean>
  onDraftActiveChange?: (active: boolean) => void
}
```

`ListHighlight` remains an inner implementation detail. The highlight layer renders in all three modes — Init shows nothing (or placeholder), Display and Edit text is syntax-highlighted.

## Out of Scope

- **Diff calculation** (+M cards, -N cards, ~K modified) — Spec 109 § 5.
- **Apply/commit procedure** (parsing draft, computing delta, writing to IndexedDB) — Spec 109 §§ 4, 7.
- **Confirmation modal** — Spec 109 § 6.
- **Fuzzy matching / auto-correction** for card names.
- **Serializer implementations** — this spec defines the interface; individual format serializers are implemented separately.
- **Tag editing UX**, zone drag-and-drop, or structural editing beyond text.

## Acceptance Criteria

1. When the list is empty and no draft is cached, the editor is in Init mode: textarea is editable with placeholder text, no toolbar actions except that the user can type or paste.
2. In Init mode, external + actions add instances and transition to Display mode.
3. In Display mode, the textarea is read-only and shows the rendered internal list state.
4. In Display mode, clicking the Edit button transitions to Edit mode with the rendered text as the initial draft.
5. Format chips are interactive in Display mode, disabled in Init mode, and non-interactive in Edit mode.
6. Selecting a format chip re-renders the Display mode textarea in that format.
7. In Edit mode, the chip matching the detected format is visually indicated (distinct from the Display mode selected style). No chip is indicated when detection is ambiguous.
8. On Apply, the detected format (if any) becomes the selected Display mode format.
9. In Edit mode, the Apply button is visible and enabled only when validation reports zero errors.
10. In Edit mode, the Revert button is visible; clicking it discards the draft and returns to Display (list non-empty) or Init (list empty).
11. Apply returns to Display (resulting list non-empty) or Init (resulting list empty).
12. Copy-to-clipboard works in Display and Edit modes.
13. Draft text is written to `localStorage` on every input event.
14. On mount, a cached draft is restored and the editor enters Edit mode regardless of list contents.
15. On successful Apply or Revert, the `localStorage` draft is cleared.
16. While in Edit mode, add/remove actions for the active list are disabled. Init and Display modes do not gate mutations.
17. Syntax highlighting (Spec 108) works in Display and Edit modes.
18. Removing the last instance via external - action transitions Display → Init.

## Implementation Notes

- 2026-03-09: Initial implementation of the three-mode state machine, toolbar, format chips, draft persistence, cross-tab sync, and mutation gating signal. Apply shows a placeholder popover ("Apply is not yet supported") and on OK discards the draft, returning to Display or Init. The DeckEditor component replaces ListImportTextarea and the Lists page was stripped to back button + title + DeckEditor.
- 2026-03-09: Format detection (`shared/src/list-format.ts`) examines token stream for format-discriminating tokens per the spec's heuristic table. Serializers (`shared/src/list-serialize.ts`) implement Arena (quantity + name) and Moxfield (quantity + name + set/collector + finish markers). Other format chips are visible but fall back to Arena when selected. The serializer interface takes `(instances, display, printingDisplay)` rather than the spec's `(instances, metadata)` since card name and printing resolution require display columns.
- 2026-03-09: On Apply → OK, the detected format (if any) becomes the selected Display mode format per spec § 4, preserving the user's format context even though the actual apply/commit is stubbed.
