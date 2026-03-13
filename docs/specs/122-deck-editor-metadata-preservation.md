# Spec 122: Deck Editor Metadata Preservation

**Status:** Implemented

**Depends on:** Spec 109 (Deck Instance Model), Spec 119 (Deck Editor Review Step)

**See also:** Spec 113 (Deck Editor Toolbar), Spec 116 (Index-Based Deck Validation Protocol)

## Goal

Add optional **preserve** toggles (tags, collection status, variants) to the Deck Editor so that when re-importing or pasting an updated deck list, existing deck-level metadata is not lost. When a toggle is active, paired removals and additions are merged at apply time: the new instance receives the union of incoming and existing metadata. The diff remains dumb (removal + addition); no new "modified" row type. The user sees `-` and `+` lines in Review; sorting and deduplication place them adjacent so changes are visible by inspection.

## Background

The current dumb diff (Spec 109 § 5, `diffDeckList` in `shared/src/list-diff.ts`) matches on full identity: `oracle_id`, `scryfall_id`, `finish`, `zone`, `tags`, `collection_status`, `variant`. All must match exactly.

**Problem:** A user imports a Moxfield deck with `1 Biomancer's Familiar (RNA) 158 #Combo`. Later they paste an updated list where that line is `1 Biomancer's Familiar (RNA) 158 #Dude`. The diff sees different `tags` → one removal, one addition. On Save, the old instance goes to trash and a new one is created with only `#Dude`; the `#Combo` tag is lost.

**Desired behavior:** With "Preserve tags" enabled, when we have a removal and addition with the same card identity (oracle_id, scryfall_id, finish), we merge metadata at apply time. The new instance gets `#Combo` ∪ `#Dude` = `#Combo #Dude`. In Review, the user sees:
```
- 1 Biomancer's Familiar (RNA) 158 #Combo
+ 1 Biomancer's Familiar (RNA) 158 #Combo #Dude
```
Sorting and deduplication ensure these appear next to each other; the user sees that `#Dude` is new by visual inspection. No special "modified" UI needed.

## Design

### 1. Preserve Options

Three independent toggles, each controlling one metadata field:

| Toggle | Field | Effect when ON |
|--------|-------|----------------|
| **Preserve tags** | `tags` | When a removal and addition pair by card identity, merge tags (union) into the addition before apply and display. |
| **Preserve collection status** | `collection_status` | Same; collection_status uses incoming ?? existing. |
| **Preserve variants** | `variant` | Same; variant uses incoming ?? existing. |

- **Default:** All ON until the user interacts with a toggle. Rationale: data loss (losing tags on a speed-run paste) is worse than extra metadata (merged tags the user can later remove). If no preference is stored, treat as ON.
- **Persistence:** Stored in `localStorage` under `frantic-deck-editor-preserve-tags`, `frantic-deck-editor-preserve-collection-status`, `frantic-deck-editor-preserve-variants`. Boolean values. Read on mount; write only when the user toggles (so first-time users get the ON default). Scope is global (not per-list) — user preference applies across all deck edits.
- **Scope:** Applies to both Edit and Review modes. Toggles are visible in the Status box in both modes so the user sets them before Review and sees consistent behavior.
- **Placement:** Always show the preserve bar and all three toggles when the list has instances (Edit and Review modes only; Init mode has no instances so the bar is hidden). Do not hide the bar or individual toggles when there is "nothing to preserve" — consistent placement rewards muscle memory and avoids "where did it go?" when switching lists or after edits. The preserve bar is the **first** element at the top of the Status box (it applies to the whole editing process). It has a label, like "Reviewing list edits:" — e.g. "Preserve when merging:" followed by the chips.
- **Disable when irrelevant:** Optionally disable (gray out) a toggle when the current list has no instances with that metadata type: Preserve tags when no instance has `tags.length > 0`; Preserve collection status when no instance has `collection_status`; Preserve variants when no instance has `variant`. If disabled, show a tooltip (e.g. "No tags in this list to preserve") so the user understands why.
- **Count in chip:** Each toggle shows the number of **baseline instances** (current list before applying changes) with that metadata type, e.g. `[Tags (3)]`, `[Collection (0)]`, `[Variants (0)]`. This makes the scope of the effect clear and explains why a toggle is disabled (count 0 = nothing to preserve).

### 2. Diff Unchanged

`diffDeckList` and `DiffResult` remain unchanged. The diff is always dumb: full-identity match. Different tags, collection_status, or variant → removal + addition. No core-identity matching in the diff algorithm.

### 3. Pairing and Merge (Post-Diff)

After computing the diff, we pair removals with additions by **card identity**: `oracle_id`, `scryfall_id`, `finish`. Zone is excluded so that cross-zone moves (e.g. Deck → Sideboard) can pair. Greedy one-to-one match within each card-identity group: pair in array order (first removal with first addition, etc.) so behavior is deterministic when multiple copies exist (e.g. 4× Lightning Bolt with varying tags).

**Merge semantics** (when a pair exists and the preserve toggle for that field is ON):

- **tags:** `[...new Set([...existing.tags, ...incoming.tags])]` — order: existing first, then incoming, deduplicated.
- **collection_status:** `incoming ?? existing` — incoming wins if present (non-null, non-empty), else keep existing. Treat empty string as null.
- **variant:** `incoming ?? existing` — same. Treat empty string as null.

**No-op pairs:** When the merged metadata equals the removal's metadata (e.g. user removed a tag from draft, we preserve it, so merged = removal), skip both the removal and the addition. No churn: no move to trash, no new instance. These pairs are filtered out before display and apply.

**Output:** An enriched diff: `{ removals, additions }` where:
- Removals exclude those in no-op pairs.
- Additions exclude those in no-op pairs; paired additions have merged metadata applied.

### 4. Where Pairing/Merge Lives

A helper in `shared/src/enrich-diff-for-preserve.ts` performs pairing and merge. Develop test-first per shared/AGENTS.md: write `shared/src/enrich-diff-for-preserve.test.ts` before implementation.

```typescript
export interface PreserveOptions {
  preserveTags?: boolean
  preserveCollectionStatus?: boolean
  preserveVariants?: boolean
}

export function enrichDiffForPreserve(
  diff: DiffResult,
  options: PreserveOptions
): { removals: InstanceState[]; additions: ImportCandidate[] }
```

- Pairs removals with additions by card identity (greedy).
- For each pair: merge metadata per options. If no-op, exclude both. Else, apply merged metadata to the addition.
- Return filtered removals and additions (additions with merged metadata where paired).

### 5. Apply Pipeline

`CardListStore.applyDiff` signature is unchanged: `applyDiff(listId, removals, additions)`.

The caller passes the **enriched** diff: removals and additions after `enrichDiffForPreserve`. Paired additions already carry merged metadata. Unpaired additions use incoming metadata as-is. Removals go to trash; additions create new instances. No in-place updates; no `updates` parameter.

### 6. Zone Moves (Main ↔ Sideboard)

A zone move (e.g. card moved from Deck to Sideboard) produces removal + addition (different `zone`). Pairing uses card identity (`oracle_id`, `scryfall_id`, `finish`) — zone excluded — so removal (Deck) and addition (Sideboard) pair. The addition's zone (from the draft) wins; metadata is merged per preserve toggles. So 1-for-1 main↔sideboard swaps pair correctly.

**Note:** Pairing happens regardless of preserve toggle state. The preserve toggles only affect metadata merge (tags, collection_status, variant); zone always comes from the addition.

### 7. Edit Mode Diff Summary

`editDiffSummary` computes the raw diff, then runs `enrichDiffForPreserve` with the current preserve options. It **depends on** `preserveTags`, `preserveCollectionStatus`, and `preserveVariants` (in addition to draft, validation, etc.) so the "+N / −M" display updates when the user toggles. The display uses enriched counts (after no-op filtering). So when preserve collapses a pair to no-op, the summary reflects the smaller numbers. When all pairs are no-ops, enriched counts are 0/0 — same as today's empty diff: toolbar shows no Review or Save.

### 8. Review Mode Behavior

- **Display:** Uses the enriched diff. Within each zone section, sorting by card name places the same card at the same relative position, so paired removal/addition lines are visually comparable.
- **Would-be-committed list:** Removals (to trash) + additions (with merged metadata where paired). Same as today; additions already carry the correct metadata.
- **Reactive diff:** When preserve toggles change in Review mode, the diff is recomputed. `reviewDiff` (or its source) must depend on preserve options, draft, and baseline — e.g. a memo that runs `diffDeckList` → `enrichDiffForPreserve` with current options. The Review view and filter chip counts update immediately.
- **Empty diff:** When all pairs are no-ops, enriched diff has zero removals and zero additions. Status box shows "No changes to review"; Save disabled; Edit remains available. The user stays in Review mode and can tap Edit to return to Edit mode. (This can occur when the user toggles preserve in Review and all pairs collapse to no-ops.)

### 9. Status Box UI

The preserve bar has a **label** (e.g. "Preserve when merging:") followed by the chips, same pattern as "Reviewing list edits:" in Review mode. It is the **first** element at the top of the Status box when the list has instances, since it applies to the whole editing process.

**Edit mode:** Preserve bar first, then the diff summary below. Same chip styling as Review filter chips (Spec 119 § 6): toggleable, active = filled, inactive = outline.

Layout (compact):

```
Preserve when merging: [Tags (3)] [Collection (0)] [Variants (0)]

Editing: +N / −M (Moxfield)
```

Each chip shows the count of baseline instances with that metadata type. Count 0 → toggle disabled (nothing to preserve).

Or on a second row if space is tight. Chips are small (e.g. `text-xs`, `min-h-7`) to avoid crowding.

**Review mode:** Preserve bar first, then the Added/Removed/Unchanged filter chips below. User can toggle before Save; diff and would-be-committed state update reactively.

**Empty diff in Review:** When enriched diff has no removals and no additions, Status box shows "No changes to review"; Save disabled; Edit available. User stays in Review mode until they tap Edit.

### 10. Draft Text Unchanged

The user's literal draft text is never modified. `1 Biomancer's Familiar (RNA) 158 #Dude` stays as entered. Only the pairing, merge, display, and apply behavior change.

## Out of Scope

- **Smart diff / "Changed" category:** Pairing removals and additions by `oracle_id` into a single "Changed" line (Spec 119 Out of Scope) remains out of scope. This spec uses pairing only for metadata merge; it does not introduce a Changed chip. A future spec could add one.
- **CLI list-diff:** The CLI `list-diff` command (Spec 120) diffs a list against *query results*, not against another list. There is no merge problem — no existing list metadata to preserve.

## Component Architecture

- **DeckEditor** — Holds preserve toggle state (signals). Passes options to `enrichDiffForPreserve` when computing `editDiffSummary`, `handleReview`, and `handleSave`. In Review mode, the enriched diff is derived from a memo (or equivalent) that depends on preserve options, draft, and baseline — so toggling preserve updates the diff and view reactively. Passes enriched diff to `applyDiff`.
- **DeckEditorStatus** — Renders preserve chips in Edit and Review modes. Reads/writes localStorage on toggle.
- **DeckEditorContext** — Adds `preserveTags`, `preserveCollectionStatus`, `preserveVariants` (accessors) and setters.
- **DeckEditorReviewView** — Receives enriched diff (removals, additions with merged metadata). No changes to filter chips or layout; Added/Removed display uses enriched data.
- **shared/list-diff.ts** — Unchanged. `diffDeckList` returns `{ additions, removals }`.
- **shared/enrich-diff-for-preserve.ts** — New file. `enrichDiffForPreserve(diff, options)` performs pairing, merge, no-op filter. Developed test-first; tests in `enrich-diff-for-preserve.test.ts`.
- **CardListStore** — `applyDiff` unchanged. Accepts removals and additions; no `updates` parameter.

## Data Flow

1. **Edit mode:** User toggles preserve options. `editDiffSummary` (memo depending on preserve options, draft, validation) runs `diffDeckList` → `enrichDiffForPreserve` with options. "+N / −M" uses enriched counts.
2. **Review:** User taps Review. `handleReview` enters Review mode. The enriched diff is derived from a memo (or equivalent) that depends on preserve options, draft, and baseline — so when the user toggles preserve in Review, the diff recomputes and the view updates.
3. **Save:** `handleSave` calls `applyDiff(listId, enrichedRemovals, enrichedAdditions)`. Store applies removals and additions; additions already have merged metadata where paired.

## Acceptance Criteria

1. Three preserve toggles (Tags, Collection, Variants) appear in the Status box in Edit and Review modes when the list has instances. Each chip shows the count of baseline instances with that metadata type, e.g. `[Tags (3)]` `[Collection (0)]`. The bar has a label (e.g. "Preserve when merging:") and is the first element at the top of the Status box. The bar and all three toggles are always shown (never hidden when "nothing to preserve"). A toggle with count 0 is disabled; optionally show a tooltip when disabled.
2. Toggles default to ON until the user interacts with a toggle (no stored preference → ON). Once toggled, state persists in localStorage across sessions (global scope, not per-list).
3. With all toggles OFF, behavior is identical to current (no merge; additions use incoming metadata as-is).
4. With "Preserve tags" ON: User has `1 Biomancer's Familiar (RNA) 158 #Combo`, pastes `1 Biomancer's Familiar (RNA) 158 #Dude`. Review shows `- ... #Combo` and `+ ... #Combo #Dude` adjacent. Save creates new instance with `#Combo` and `#Dude`.
5. With "Preserve tags" ON: User has `1 Biomancer's Familiar (RNA) 158 #Combo`, pastes `1 Biomancer's Familiar (RNA) 158` (no tag). Merge = `[Combo]`. No-op: merged equals removal. Pair is filtered out. Diff shows no changes; Save disabled.
6. Same semantics for "Preserve collection status" and "Preserve variants" (incoming ?? existing; empty string treated as null).
7. Draft text is never modified; user sees literal input.
8. `applyDiff` receives enriched removals and additions; no `updates` parameter. Removals to trash, additions create new instances with merged metadata where paired.
9. Review mode shows merged metadata with difference from baseline as an addition/removal. Paired lines appear at the same relative position in each section (zone grouping, then card name sort).
10. Copy in Review mode copies the would-be-committed list including merged metadata.
11. **Zone fallback:** 1-for-1 main↔sideboard swap pairs correctly. Removal (Deck) + addition (Sideboard) → one removal, one addition with zone from addition and merged metadata when preserve toggles ON.
12. **Empty diff:** When all pairs are no-ops (e.g. user removed tags, we preserve, merged = removal), enriched diff is empty. Status box shows "No changes to review"; Save disabled; Edit available.
13. **Reactive toggles in Review:** When the user toggles a preserve option while in Review mode, the diff and would-be-committed list update immediately. Filter chip counts (Added/Removed/Unchanged) reflect the enriched diff.
