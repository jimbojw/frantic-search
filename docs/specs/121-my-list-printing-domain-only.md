# Spec 121: My List Printing-Domain Only

**Status:** Implemented

**Depends on:** Spec 076 (Worker Protocol and List Caching), Spec 077 (Query Engine — my:list), Spec 046 (Printing Data Model), Spec 048 (Printing-Aware Display), Spec 075 (Card List Data Model and Persistence), Spec 120 (CLI list-diff)

## Goal

Redesign My List so it operates entirely in the printing domain. Eliminate the face/printing dual-domain model, fix the Dawn of Hope bug (printing-only list showing extra printings), and simplify evaluator logic.

## Background

Spec 077 defines `my:` with a dual-domain model: list entries can be oracle-level (face domain) or printing-level (printing domain). The evaluator branches on which masks have bits: face-only, printing-only, or mixed. For mixed lists, it expands `faceMask` to the printing domain via `promoteFaceToPrinting` or `promoteFaceToPrintingCanonicalNonfoil` (when `unique:prints` is in the query), then ORs with `printingMask`.

This causes a bug: when a list has only printing-level entries (e.g. `1x Dawn of Hope (ltc) 164 [Draw]`), the mask builder sets both `faceMask[cf] = 1` and `printingMask[printingIndex] = 1`. The evaluator's mixed-mode path expands faceMask (adding the canonical nonfoil, GRN 8) and ORs printingMask (LTC 164), producing both printings. The list contains only LTC 164; the search incorrectly returns both.

Spec 121 simplifies by making My List always printing-domain. Generic entries (e.g. "1x Lightning Bolt") resolve to a canonical printing at mask-build time. No face domain, no expansion at eval time.

## Scope

- **In scope:** Mask building changes (printing-only output); protocol update; evaluator simplification; CLI and app integration.
- **Out of scope:** List management UI; `my:trash` / `my:deck:*` variants (same semantics apply).

## Technical Details

### Mask Semantics

My List is represented by a single `printingIndices` (sparse inverted index). No `faceMask`.

- **Printing-level entries** (e.g. `1x Dawn of Hope (ltc) 164 [Draw]`): Add that printing index to the indices array.
- **Generic entries** (e.g. `1x Lightning Bolt`): Resolve to the canonical printing at mask-build time. Add `canonicalPrintingIndex` to the indices array.

**Data model note:** In Frantic Search, "printing" includes finish — each printing row is a distinct (scryfall_id, finish) pair. Unlike Scryfall (where different finishes share the same scryfall_id), we have unique rows per finish. When a deck list entry omits finish (e.g. `1x Dawn of Hope (ltc) 164` with no foil marker), it resolves to the first printing row with that scryfall_id — almost always nonfoil, but foil-only printings would resolve to foil. So printing-level entries always resolve to a specific row.

**Canonical printing resolution:** For each canonical face, pick a canonical printing using this priority order:

1. First standard nonfoil (`!(printingFlags[i] & (PrintingFlag.GoldBorder | PrintingFlag.Oversized))` and `finish[i] === 0`)
2. First standard printing (any finish)
3. First nonfoil (fallback when all printings are gold-bordered/oversized)
4. First printing in the face's group

Standard means not gold-bordered, oversized, or 30A-style (checked via `PrintingFlag.GoldBorder | PrintingFlag.Oversized`). When `printing_flags` is absent, treat all printings as standard. This is a display heuristic for canonical printing selection, independent of search default filtering ([Spec 178](178-default-search-inclusion-filter.md)).

### New Helper: buildCanonicalPrintingPerFace

Add to `shared/src/list-mask-builder.ts`:

```typescript
export function buildCanonicalPrintingPerFace(
  pd: PrintingDisplayColumns,
): Map<number, number>
```

- Input: `PrintingDisplayColumns` with `canonical_face_ref`, `finish`, and optionally `printing_flags`.
- Output: `Map<canonicalFaceIndex, printingIndex>`.
- Logic: `PrintingDisplayColumns` is flat (one row per printing). Iterate rows by index; for each canonical face `cf`, collect printing indices where `pd.canonical_face_ref[i] === cf`. For each `cf`, apply the four-step canonical printing selection (tournament-legal nonfoil, then tournament-legal any, then nonfoil, then first). Use `printing_flags` when present; when absent, treat all printings as tournament-legal. Store `map.set(cf, printingIndex)`.

### Mask Building Changes

**buildMasksForList** and **buildMasksFromParsedEntries**:

- Add `canonicalPrintingPerFace?: Map<number, number>` to options.
- Collect unique printing indices into a `Set<number>` (instead of allocating `Uint8Array(printingCount)` and setting bits).
- For each instance:
  - **Printing-level** (`scryfall_id` + finish): add `printingLookup.get(key)` to the set when present.
  - **Generic** (no `scryfall_id`): add `canonicalPrintingPerFace.get(cf)` to the set when `cf` is in map; skip if not (e.g. printings not loaded).
- Convert the set to `Uint32Array` for return. Empty list: return `printingIndices: Uint32Array(0)` or omit.

When `canonicalPrintingPerFace` is absent (printings not loaded): generic entries contribute nothing; only explicit printing-level entries add indices. Empty list or oracle-only list before printings load: `Uint32Array(0)` or omit.

### Protocol

**list-update:** `printingIndices?: Uint32Array` replaces `printingMask`. Sparse: indices only. When `printingCount > 0` (printings loaded), include `printingIndices`. When printings are not loaded (`printingCount === 0`), omit — evaluator treats as empty list. Empty list: omit or send `Uint32Array(0)`.

**getListMask:** Returns `{ printingIndices?: Uint32Array } | null`. Evaluator expands indices to mask when evaluating `my:` leaf.

### Evaluator

`my:` leaf logic simplifies to:

1. Call `getListMask(listId)`. If null → error node.
2. If `_printingIndex` is null → error "printing data not loaded".
3. If returns `printingIndices`, allocate `Uint8Array(printingCount)`, set `buf[idx] = 1` for each index in `printingIndices`; return buffer. If null/omitted, return zeroed mask. Domain = printing.
4. Remove: face-only branch, mixed-mode branch.

`_hasPrintingLeaves`: `my:` always implies printing conditions (`printingIndices` is present when list is known).

### Override removal (dead code)

The `unique:prints` override and its supporting machinery become dead with printing-only masks. Remove:

- **`_rootAstForOverride`** — NodeCache field; no longer used.
- **`options?.effectiveAst`** — `evaluate(ast, options?)` parameter; remove the parameter and all call sites. The worker (`worker-search.ts`) passes it for pinned+live queries so the override could see the combined query (Issue #96).
- **Cache invalidation block** — The `if (ast.type === "FIELD" && ... my ... && _rootAstForOverride && getUniqueModeFromAst(...) === "prints")` block at the top of `computeTree`; mixed masks never occur, so it never triggers.
- **`useMatchesOverride`** — The mixed-mode branch is removed entirely; this variable disappears with it.

### Startup and printings-ready

- **On list load (before printings-ready):** Build indices with `canonicalPrintingPerFace` undefined. Generic entries contribute nothing; printing-level entries add indices. Oracle-only list → `Uint32Array(0)` or omit. Send `list-update`.
- **On printings-ready:** Rebuild indices for **all** lists with `canonicalPrintingPerFace` now available. Re-send `list-update` for each. Generic entries now resolve to canonical printing.

**App integration:** The printings-ready handler must rebuild indices for **all** lists (or all non-empty lists), not just those with printing-level entries. Today it filters by `hasPrintingLevelEntries`; that filter must be removed or broadened, since generic entries now contribute to `printingIndices`.

Brief window: oracle-only list may show nothing in `my:list` until printings load. Acceptable; printings typically load with or shortly after main data.

### Behavioral Change

**Before:** `my:list is:foil` with generic "Lightning Bolt" in list → matches (generic expands to all Bolt printings, one is foil).

**After:** `my:list is:foil` with generic "Lightning Bolt" in list → **no match**. Generic = canonical printing only (typically nonfoil). User querying for foils in their list expects explicit foil entries; showing generic cards would be confusing.

## Acceptance Criteria

- [ ] Printing-only list (e.g. `1x Dawn of Hope (ltc) 164`) returns exactly that printing; no extra printings (fixes Dawn of Hope bug).
- [ ] Generic entry (e.g. `1x Lightning Bolt`) resolves to canonical nonfoil (or first available if no nonfoil).
- [ ] Mixed list: generic entries + explicit printings both contribute to printingIndices correctly.
- [ ] `my:list is:foil` with only generic entries in list returns 0 results.
- [ ] `my:list is:foil` with explicit foil printing in list matches.
- [ ] Empty list sends `Uint32Array(0)` or omits `printingIndices`; `my:list` returns 0.
- [ ] list-diff passes for Dawn of Hope case: Expected 1, Actual 1, Only in Search 0.
- [ ] Evaluator has no face-domain or mixed-mode branches for `my:`.
- [ ] `unique:prints` no longer affects `my:` evaluation (no override).
- [ ] Override machinery removed: `_rootAstForOverride`, `effectiveAst` parameter, cache invalidation block.
- [ ] CLI `search --list` and `list-diff` work with new mask building.

## list-diff

list-diff's expected set (`buildExpectedFromParsedEntries`) already uses canonical nonfoil for generic entries with `unique:prints`. No changes needed there; it aligns with the new mask semantics.

## Test Updates

- **evaluator-my.test.ts:** Update fixtures to pass printing-only masks. The "oracle-only list + my:list is:foil matches" test must change — it should now expect 0 results (behavioral change). Remove or repurpose the "my:list unique:prints override" and "effectiveAst: pinned my:list + live unique:prints applies override" tests; the override no longer exists.
- **list-mask-builder.test.ts:** Add `canonicalPrintingPerFace` to options; expect `printingIndices` set for generic entries. Update or add tests for printing-only output.

## Implementation Notes

- 2026-03-12: Replaced `printingMask` with `printingIndices`. Sparse representation reduces transfer size and worker storage.
- 2026-03-13: Canonical printing resolution now prefers tournament-legal printings. Fixes generic entries (e.g. Yawgmoth's Will) resolving to gold-bordered printings that require `include:extras` to display.
