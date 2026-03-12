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

My List is represented by a single `printingMask`. No `faceMask`.

- **Printing-level entries** (e.g. `1x Dawn of Hope (ltc) 164 [Draw]`): Set `printingMask[printingIndex] = 1` for that printing. Unchanged from current behavior.
- **Generic entries** (e.g. `1x Lightning Bolt`): Resolve to the canonical printing at mask-build time. Set `printingMask[canonicalPrintingIndex] = 1`.

**Data model note:** In Frantic Search, "printing" includes finish — each printing row is a distinct (scryfall_id, finish) pair. Unlike Scryfall (where different finishes share the same scryfall_id), we have unique rows per finish. When a deck list entry omits finish (e.g. `1x Dawn of Hope (ltc) 164` with no foil marker), it resolves to the first printing row with that scryfall_id — almost always nonfoil, but foil-only printings would resolve to foil. So printing-level entries always resolve to a specific row.

**Canonical printing resolution:** For each canonical face, pick the first available finish: prefer nonfoil (finish === 0), else the first printing in the face's printing list. Matches the logic in `promoteFaceToPrintingCanonicalNonfoil` (shared/src/search/eval-printing.ts).

### New Helper: buildCanonicalPrintingPerFace

Add to `shared/src/list-mask-builder.ts`:

```typescript
export function buildCanonicalPrintingPerFace(
  pd: PrintingDisplayColumns,
): Map<number, number>
```

- Input: `PrintingDisplayColumns` with `canonical_face_ref` and `finish`.
- Output: `Map<canonicalFaceIndex, printingIndex>`.
- Logic: `PrintingDisplayColumns` is flat (one row per printing). Iterate rows by index; for each canonical face `cf`, collect printing indices where `pd.canonical_face_ref[i] === cf`. For each `cf`, pick first row with `pd.finish[i] === 0` (nonfoil), else first in the group. Store `map.set(cf, printingIndex)`.

### Mask Building Changes

**buildMasksForList** and **buildMasksFromParsedEntries**:

- Add `canonicalPrintingPerFace?: Map<number, number>` to options.
- Always allocate `printingMask` when `printingCount > 0` (required for My List).
- For each instance:
  - **Printing-level** (`scryfall_id` + finish): `printingMask[printingLookup.get(key)] = 1`.
  - **Generic** (no `scryfall_id`): `printingMask[canonicalPrintingPerFace.get(cf)] = 1` when `cf` is in map; skip if not (e.g. printings not loaded).
- **Remove** all `faceMask[cf] = 1` assignments. Return `faceMask` as zeroed for protocol compatibility during transition, or omit per protocol update.

When `canonicalPrintingPerFace` is absent (printings not loaded): generic entries contribute nothing; only explicit printing-level entries set bits. Empty list or oracle-only list before printings load: zeroed `printingMask`.

### Protocol

**list-update:** `printingMask` required when `printingCount > 0` (printings loaded). When printings are not loaded (`printingCount === 0`), omit `printingMask` — evaluator treats as empty list. `faceMask` optional (zeroed) for backward compatibility during transition; can be removed once evaluator no longer expects it.

**getListMask:** Returns `{ printingMask: Uint8Array }` (or `{ faceMask, printingMask }` with zeroed faceMask for transition). Evaluator uses only `printingMask`.

### Evaluator

`my:` leaf logic simplifies to:

1. Call `getListMask(listId)`. If null → error node.
2. If `_printingIndex` is null → error "printing data not loaded".
3. Copy `printingMask` into printing-domain buffer. Domain = printing.
4. Remove: face-only branch, mixed-mode branch.

`_hasPrintingLeaves`: `my:` always implies printing conditions (printingMask is always present).

### Override removal (dead code)

The `unique:prints` override and its supporting machinery become dead with printing-only masks. Remove:

- **`_rootAstForOverride`** — NodeCache field; no longer used.
- **`options?.effectiveAst`** — `evaluate(ast, options?)` parameter; remove the parameter and all call sites. The worker (`worker-search.ts`) passes it for pinned+live queries so the override could see the combined query (Issue #96).
- **Cache invalidation block** — The `if (ast.type === "FIELD" && ... my ... && _rootAstForOverride && getUniqueModeFromAst(...) === "prints")` block at the top of `computeTree`; mixed masks never occur, so it never triggers.
- **`useMatchesOverride`** — The mixed-mode branch is removed entirely; this variable disappears with it.

### Startup and printings-ready

- **On list load (before printings-ready):** Build mask with `canonicalPrintingPerFace` undefined. Generic entries contribute nothing; printing-level entries set bits. Oracle-only list → zeroed printingMask. Send `list-update`.
- **On printings-ready:** Rebuild masks for **all** lists with `canonicalPrintingPerFace` now available. Re-send `list-update` for each. Generic entries now resolve to canonical printing.

**App integration:** The printings-ready handler must rebuild masks for **all** lists (or all non-empty lists), not just those with printing-level entries. Today it filters by `hasPrintingLevelEntries`; that filter must be removed or broadened, since generic entries now contribute to `printingMask`.

Brief window: oracle-only list may show nothing in `my:list` until printings load. Acceptable; printings typically load with or shortly after main data.

### Behavioral Change

**Before:** `my:list is:foil` with generic "Lightning Bolt" in list → matches (generic expands to all Bolt printings, one is foil).

**After:** `my:list is:foil` with generic "Lightning Bolt" in list → **no match**. Generic = canonical printing only (typically nonfoil). User querying for foils in their list expects explicit foil entries; showing generic cards would be confusing.

## Acceptance Criteria

- [ ] Printing-only list (e.g. `1x Dawn of Hope (ltc) 164`) returns exactly that printing; no extra printings (fixes Dawn of Hope bug).
- [ ] Generic entry (e.g. `1x Lightning Bolt`) resolves to canonical nonfoil (or first available if no nonfoil).
- [ ] Mixed list: generic entries + explicit printings both contribute to printingMask correctly.
- [ ] `my:list is:foil` with only generic entries in list returns 0 results.
- [ ] `my:list is:foil` with explicit foil printing in list matches.
- [ ] Empty list sends zeroed printingMask; `my:list` returns 0.
- [ ] list-diff passes for Dawn of Hope case: Expected 1, Actual 1, Only in Search 0.
- [ ] Evaluator has no face-domain or mixed-mode branches for `my:`.
- [ ] `unique:prints` no longer affects `my:` evaluation (no override).
- [ ] Override machinery removed: `_rootAstForOverride`, `effectiveAst` parameter, cache invalidation block.
- [ ] CLI `search --list` and `list-diff` work with new mask building.

## list-diff

list-diff's expected set (`buildExpectedFromParsedEntries`) already uses canonical nonfoil for generic entries with `unique:prints`. No changes needed there; it aligns with the new mask semantics.

## Test Updates

- **evaluator-my.test.ts:** Update fixtures to pass printing-only masks. The "oracle-only list + my:list is:foil matches" test must change — it should now expect 0 results (behavioral change). Remove or repurpose the "my:list unique:prints override" and "effectiveAst: pinned my:list + live unique:prints applies override" tests; the override no longer exists.
- **list-mask-builder.test.ts:** Add `canonicalPrintingPerFace` to options; expect `faceMask` zeroed and `printingMask` set for generic entries. Update or add tests for printing-only output.

## Implementation Notes

(To be added during implementation.)
