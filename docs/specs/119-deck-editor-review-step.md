# Spec 119: Deck Editor Review Step

**Status:** Implemented

**Depends on:** Spec 110 (Hybrid Deck Editor), Spec 113 (Deck Editor Toolbar), Spec 109 (Deck Instance Model)

**See also:** Spec 116 (Index-Based Deck Validation Protocol), Spec 118 (Deck Editor Bug Report)

## Goal

Insert a **Review** step between Edit and Save in the deck editor pipeline. When the user has valid changes that add or remove cards (diff has additions or removals), tapping "Review" (instead of committing immediately) enters a diff view where they can inspect Added, Removed, and Unchanged lines before choosing to Save or return to Edit. If the draft differs from baseline but the diff is empty (e.g. reordering only), there is nothing to save — Review and Save are not shown.

## Background

Spec 113 § 5 removed the confirmation popover: Apply commits directly when validation passes. The diff summary ("+N / −M cards") appears in the Status box, but the user never sees a per-line breakdown before committing.

This spec adds a dedicated Review mode: a fourth editor mode where the textarea is replaced by a read-only diff view. The user can filter by category (Added, Removed, Unchanged), switch output format to see the diff in different representations, and then Save or return to Edit.

## Design

### 1. Mode Flow

```
Display → Edit (unchanged) → Edit (errors) → Edit (no errors) → Review → Save
```

| Stage | Description |
|-------|-------------|
| **Display** | Read-only rendered list. Edit button enters Edit mode. |
| **Edit (unchanged)** | Draft equals baseline. Cancel exits Edit. |
| **Edit (errors)** | Validation reports errors. Revert resets draft. |
| **Edit (no errors, diff empty)** | Draft valid, but diff has no additions or removals (e.g. reordering only). Revert, Bug, Copy only — no Review or Save; nothing to save. |
| **Edit (no errors, diff has changes)** | Draft valid, diff has additions or removals. Revert resets; Review enters Review mode. |
| **Review** | Diff view. Edit returns to Edit; Save commits. |
| **Save** | Same as current Apply — import, diff, write, clear draft, return to Display or Init. |

### 2. Rename: Apply → Save

The commit action is renamed from "Apply" to "Save" throughout the deck editor. This applies to:

- Toolbar in Edit mode (when diff has changes): Shows `[ Review * ]` — user taps Review to enter Review mode, then Save in Review mode to commit.
- Toolbar button label in Review mode: `[ Save * ]` (renamed from Apply)
- `aria-label`: "Save changes" instead of "Apply changes"
- Context/handler names: `handleSave` instead of `handleApply`, `applyInProgress` → `saveInProgress`

Spec 113, 118, and other specs that reference "Apply" should be updated: Edit-with-changes shows Review (not Apply); Save appears in Review mode; handler/aria-label use "Save" instead of "Apply".

### 3. Back Button Semantics

The left-side action changes by mode:

| Mode | Left button | Label | Icon | Effect |
|------|-------------|-------|------|--------|
| **Edit, no changes** | Cancel | "Cancel" | X | Exits Edit. Clears draft. Returns to Display or Init. |
| **Edit, errors or no errors** | Revert | "Revert" | ↶ | Resets draft to baseline. Stays in Edit. |
| **Review** | Edit | "Edit" | ↶ (same as Revert) | Returns to Edit mode. Draft intact. Diff view dismissed. |

The Review-mode "Edit" button uses the same back-arrow icon as Revert to convey "go back to editing." The label "Edit" clarifies the destination. Alternative labels considered: "Back to Edit", "← Edit". "Edit" is preferred for brevity; the icon provides the "back" affordance.

### 4. Toolbar in Review Mode

| Left | Right |
|------|-------|
| `[ Edit ]` (↶ icon) | `[ Save * ]` `[ Bug ]` `[ Copy ]` |

- **Edit** — Returns to Edit mode. Draft and baseline unchanged.
- **Save** — Commits changes (same as current Apply). On success: clear draft, return to Display or Init.
- **Bug** — Same as Edit mode. Opens deck report (Spec 118).
- **Copy** — Copies the **resulting list** (post-apply canonical form) to clipboard. Same as Copy in Display mode for the would-be-committed state.

### 5. Review Mode Layout

Replace the textarea with a diff view. The view grows as long as necessary; the user scrolls the page to see it (no inner scroll container). Layout:

1. **Status area** — Filter chips: `[ Added (N) ]` `[ Removed (M) ]` `[ Unchanged (K) ]`
2. **Compatible with bar** — Format selector (same as Display mode). User can switch format to see the diff in Arena, Moxfield, Archidekt, etc.
3. **Diff list** — Read-only, grouped and sorted lines (see § 6, § 7).

### 6. Filter Chips

Three toggleable chips in the Status area:

| Chip | Count | Behavior |
|------|-------|----------|
| **Added (N)** | `diff.additions.length` | Toggle visibility of added lines. Disabled (deemphasized, not clickable) when N = 0. |
| **Removed (M)** | `diff.removals.length` | Toggle visibility of removed lines. Disabled when M = 0. |
| **Unchanged (K)** | Matched instances (cancel out in diff) | Toggle visibility of unchanged lines. Disabled when K = 0. |

- **Default state:** Added and Removed visible; Unchanged hidden (reduces noise).
- **Disabled chips:** Grayed out, `pointer-events: none`, no hover. Count still shown for context.
- **Active chip:** Selected styling (e.g. filled background). Inactive but enabled: outline or muted.

### 7. Sort Order and Grouping

**Group by zone first.** Zones appear in this order:

1. Commander  
2. Companion  
3. Deck (main deck; `zone === null` treated as main deck)  
4. Sideboard  
5. Maybeboard  
6. Any other zone (e.g. unknown headers) — last, alphabetically by zone name  

**Within each zone group:** Sort alphabetically by **card name** (case-insensitive). Strip the leading quantity prefix (e.g. `1x `, `4 `) before comparing. Card name is the first token after the quantity; for DFCs, use the front face or full "A // B" per the serializer. Reuse parse outputs where available (e.g. from the lexer/validator) rather than re-parsing for sort keys.

**Canonical form:** Each line is serialized using the selected format (from the Compatible with bar). Added lines come from `ImportCandidate[]`; Removed from `InstanceState[]`; Unchanged from the matched subset. Serialization requires `display` and `printingDisplay` for name/set resolution — same as Display mode. This ensures auto-corrections (e.g. wrong set code, `000`, applied quick fixes) appear as their canonical final form. Review is the user's last chance to see the changes before Save.

**Deduplication:** Lines are deduplicated by card identity (oracle_id, scryfall_id, finish, zone, tags, collection_status — per format). Multiple instances of the same card (e.g. 7× Forest) are consolidated into a single line with the aggregated count (e.g. `7x Forest (tmt) 319 [Land]`). The serializers in `list-serialize.ts` use `aggregateInstances` for this; the Review view batches instances by zone before serializing so that aggregation produces the correct counts.

### 8. Diff Computation

Same as Spec 109 § 5: run `importDeckList` on the draft, then `diffDeckList(candidates, currentInstances)`. The result has `additions` and `removals` only. No "Changed" category — see Out of Scope.

### 9. Compatible With Bar in Review Mode

The "Compatible with:" bar (Spec 113 § 7) is **visible in Review mode**. Same layout as Display mode: label, format chips. Default selection: the **detected format** from the draft (same as Edit mode). User can switch to Arena, Moxfield, Archidekt, etc. to see the diff in different representations.

This mitigates format loss: if the user had earlier pasted Archidekt (with tags) and is now editing via Arena (which elides tags), switching to Moxfield or Archidekt in Review mode shows the full line including tags.

### 10. Status Box in Review Mode

The filter chips are **persistent** in the Status box — always visible, no collapsed/expanded state. The chips themselves serve as the status; no alternate summary view.

## Out of Scope

- **Changed (J):** The dumb diff (Spec 109) never produces "changed" entries. A printing change, tag change, or zone change appears as one removal + one addition. A future "smart diff" could pair these by `oracle_id` and present them as "Changed." If that is implemented, this spec will be updated to add a "Changed (J)" chip and the corresponding UI. For now, only Added, Removed, and Unchanged are in scope.

## Component Architecture

- **DeckEditor** — Adds `mode === 'review'`. In Review mode, renders `DeckEditorReviewView` instead of `DeckEditorTextarea`. Toolbar and Status adapt per mode.
- **DeckEditorReviewView** — New component. Props: `diff: DiffResult`, `matchedInstances: InstanceState[]`, `format: DeckFormat`, `display`, `printingDisplay`, `onFormatSelect`. Renders filter chips, Compatible with bar, and the diff list. Needs a way to serialize `ImportCandidate` and `InstanceState` to canonical lines — may require a shared helper or extending the serializer interface.
- **DeckEditorContext** — Adds `handleReview` (enters Review when valid + diff has additions or removals), `handleSave` (renamed from `handleApply`), `handleBackToEdit` (Review → Edit). Mode transitions updated.

## Data Flow

1. **Edit mode, valid + diff has changes:** Compute diff via `importDeckList` + `diffDeckList`. If `additions.length > 0` or `removals.length > 0`, toolbar shows `[ Revert ]` … `[ Review * ]` `[ Bug ]` `[ Copy ]`. If diff is empty, toolbar shows `[ Revert ]` … `[ Bug ]` `[ Copy ]` only (no Review, no Save).
2. **User taps Review:** Set `mode('review')`. Store diff and matched instances for the Review view.
3. **Review mode:** Render diff view. User toggles chips, switches format. Tapping Edit sets `mode('edit')`. Tapping Save runs the commit pipeline (`handleSave` → `cardListStore.applyDiff`), clears draft, returns to Display or Init.
4. **Baseline:** Unchanged in Review. Same baseline as Edit mode.

## Acceptance Criteria

1. Edit mode, valid + diff has additions or removals: Toolbar shows `[ Revert ]` … `[ Review * ]` `[ Bug ]` `[ Copy ]`. No Save button in Edit mode.
2. Edit mode, valid + diff empty: Toolbar shows `[ Revert ]` … `[ Bug ]` `[ Copy ]` only. No Review or Save button.
3. Tapping Review enters Review mode. Textarea is replaced by diff view.
4. Review mode toolbar: `[ Edit ]` (left), `[ Save * ]` `[ Bug ]` `[ Copy ]` (right).
5. Tapping Edit in Review mode returns to Edit mode. Draft unchanged.
6. Tapping Save in Review mode commits changes. Same behavior as current Apply. Draft cleared, editor returns to Display or Init.
7. Filter chips: Added (N), Removed (M), Unchanged (K). Chips with count 0 are disabled (deemphasized, not clickable).
8. Default: Added and Removed visible, Unchanged hidden.
9. Diff list is grouped by zone (Commander, Deck, Sideboard, Companion, Maybeboard, other). Within each zone, sorted alphabetically by card name (quantity prefix stripped).
10. Diff lines are deduplicated by card identity (oracle_id, scryfall_id, finish, zone, tags, collection_status, per format). Multiple instances of the same card appear as one line with the aggregated count (e.g. `7x Forest`, not seven separate `1x Forest` lines).
11. Compatible with bar visible in Review mode. Format selector works; changing format re-renders the diff list in the new format.
12. Copy in Review mode copies the would-be-committed list (canonical form in selected format).
13. Apply is renamed to Save in the deck editor. Button label "Save", `aria-label="Save changes"`. `applyInProgress` → `saveInProgress`.
14. Cancel (Edit, no changes) and Revert (Edit, with changes) behavior unchanged from Spec 113.

## Implementation Notes

- **Deduplication (AC 10):** `buildDiffLines` in `DeckEditorReviewView.tsx` batches instances by zone before calling `serialize()`. The serializers in `list-serialize.ts` use `aggregateInstances` internally, so passing all instances from a zone produces one line per unique card with the correct count. Previously each instance was serialized individually, yielding `1x` per line.
