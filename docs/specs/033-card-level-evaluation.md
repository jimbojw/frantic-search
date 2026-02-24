# Spec 033: Card-Level Evaluation Semantics

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), ADR-012 (Face-Per-Row Data Model)

## Goal

Fix the evaluator so that AND/OR/NOT operate at card granularity, matching Scryfall's actual behavior. Currently, conditions are combined at face granularity, causing cross-face queries to return zero results when the matching conditions span different faces of the same card.

## Background

### The bug

The query `f:edh t:sorcery t:creature` returns 71 cards on Scryfall (mostly Adventure cards where one face is a Creature and the other is a Sorcery) but returns 0 in Frantic Search. No single face has both "sorcery" and "creature" in its type line, so the face-level AND produces all zeros.

Similarly, `o:transform ci=u pow>2 tou<2` returns 3 cards on Scryfall (including Delver of Secrets, whose front face is 1/1 and back face is 3/2) but 0 for us. The `pow>2` condition matches only the back face while `tou<2` matches only the front face — no single face satisfies both.

### Root cause

Spec 002 and ADR-012 both state:

> Scryfall evaluates all query conditions against each face independently. A card matches when at least one face satisfies the entire query expression.

This turns out to be **incorrect**. Empirical testing shows Scryfall uses card-level semantics: each leaf condition is independently evaluated across all faces (a card matches a leaf if *any* face matches), and then AND/OR/NOT combine those card-level booleans.

### Evidence

| Query | Scryfall | Frantic Search | Why it diverges |
|---|---|---|---|
| `f:edh t:sorcery t:creature` | 71 | 0 | Adventure cards: creature face + sorcery face |
| `o:transform ci=u pow>2 tou<2` | 3 | 0 | Delver: back face pow=3, front face tou=1 |
| `is:mdfc f:edh t:land t:creature` | 13 | 0 | ZNR MDFCs: land face + creature face |

These queries prove card-level promotion applies to **all field types** — string fields (type, oracle), numeric fields (power, toughness), and bitmask fields (legality, color identity) alike.

### A second bug: inflated face counts

`matchCount` (the popcount of each node's buffer) currently counts matching faces, not cards. A Transform card like Delver of Secrets where both faces are creatures contributes 2 to `t:creature`'s matchCount, even though only one card matched. The UI displays this count in the query breakdown, making it misleading. The current workaround in the UI is to show both "X cards (Y faces)", but the face count is an implementation artifact, not a useful signal.

## Design

### Core invariant: only canonical face slots carry data

Buffers remain `Uint8Array`s of length `faceCount`, but a new invariant is enforced: **only the slot at `canonicalFace[i]` is ever set to 1**. Non-canonical face slots are always 0. This means:

- A card matches a leaf condition if *any* of its faces match — the "Scryfall any-face" semantics fall out naturally.
- `popcount` (sum of all bytes) counts cards, not faces, with no changes.
- AND and OR combine card-level booleans via the existing byte-wise `&=` / `|=` — non-canonical slots are 0 on both sides, so the invariant is preserved through composition.
- Result collection yields only canonical face indices (the only slots that are ever 1), so results are inherently deduplicated.

### 1. Leaf evaluation: write to canonical slot

Every leaf evaluator (FIELD, BARE, EXACT, REGEX_FIELD) changes its write target. Instead of `buf[i] = match ? 1 : 0`, the pattern becomes:

```typescript
for (let i = 0; i < n; i++) {
  if (/* face i matches */) {
    buf[canonicalFace[i]] = 1;
  }
}
```

If a face matches, write 1 to the canonical face's slot. If it doesn't match, do nothing (the slot stays at its default 0, or stays at 1 if a sibling face already matched). Setting the same slot to 1 twice when both faces match is harmless.

For single-face cards, `canonicalFace[i] === i`, so this is equivalent to the current `buf[i] = 1`.

### 2. NOT: flip only canonical slots

NOT must respect the invariant. Instead of flipping every byte:

```typescript
for (let i = 0; i < n; i++) {
  buf[i] = (canonicalFace[i] === i) ? (childBuf[i] ^ 1) : 0;
}
```

Only canonical face slots are flipped. Non-canonical slots remain 0.

### 3. Empty AND identity: fill only canonical slots

The empty AND (which matches everything) must also respect the invariant:

```typescript
for (let i = 0; i < n; i++) {
  buf[i] = (canonicalFace[i] === i) ? 1 : 0;
}
```

### 4. AND / OR: unchanged

The existing byte-wise AND (`buf[i] &= cb[i]`) and OR (`buf[i] |= cb[i]`) loops are unchanged. Since both operands maintain the invariant (non-canonical slots are 0), the result also maintains it. `0 & 0 = 0` and `0 | 0 = 0`.

### 5. Popcount: unchanged

The existing `popcount` function (sum of all bytes) now naturally gives the card count, since only canonical face slots carry 1s. No signature or logic change needed.

### 6. Result collection: pre-allocated Uint32Array

Since only canonical face slots are ever 1, the root buffer is already deduplicated. The root node's `matchCount` (popcount) is known before result collection, so we can pre-allocate a `Uint32Array` of exact size and fill it in a single pass — no dynamic `push()`, no intermediate `number[]`, no conversion step:

```typescript
const count = root.computed!.matchCount;
const indices = new Uint32Array(count);
let j = 0;
const buf = root.computed!.buf;
for (let i = 0; i < this.index.faceCount; i++) {
  if (buf[i]) indices[j++] = i;
}
```

The evaluator returns this `Uint32Array` directly. The worker skips the `deduplicateMatches()` call and the `number[]` → `Uint32Array` conversion that currently happens. The typed array is directly transferable via `postMessage`.

### 7. Simplify UI display

The `totalMatches` field on the wire protocol becomes redundant — it equals `indices.length`. It can be removed from the result message or kept as a convenience.

The "X cards (Y faces)" display in `InlineBreakdown` simplifies to just "X cards". The `faceCount` prop is no longer needed.

## Scope of changes

| File | Change |
|---|---|
| `shared/src/search/evaluator.ts` | Leaf evals write to `buf[canonicalFace[i]]`; NOT flips only canonical slots; empty AND fills only canonical slots; popcount and AND/OR unchanged; `evaluate()` returns pre-allocated `Uint32Array` of matching canonical indices |
| `shared/src/search/evaluator.test.ts` | Add cross-face test cases; update matchCount expectations to reflect card-level counts |
| `shared/src/search/card-index.ts` | Delete `deduplicateMatches()` (no longer needed) |
| `shared/src/search/card-index.test.ts` | Remove `deduplicateMatches` tests |
| `app/src/worker.ts` | Remove `deduplicateMatches` call and `number[]` → `Uint32Array` conversion; transfer evaluator's `Uint32Array` directly |
| `cli/src/index.ts` | Replace `deduplicateMatches` call with evaluator's new return value |
| `app/src/InlineBreakdown.tsx` | Remove `faceCount` prop; simplify display to "X cards" |
| `app/src/App.tsx` | Remove `totalMatches` signal (use `totalCards()` everywhere) |
| `shared/src/worker-protocol.ts` | Remove `totalMatches` from result message (indices length suffices) |
| `docs/specs/002-query-engine.md` | Add Implementation Note; correct face-per-row rationale; strike acceptance criterion 8 |
| `docs/adr/012-face-per-row-data-model.md` | Add note correcting Scryfall semantics claim |

## Test Strategy

### Extend synthetic card pool

Add an Adventure card to the existing test dataset to exercise cross-face type queries:

| Row | Name | Type | Layout | canonical_face |
|---|---|---|---|---|
| #10 | Bonecrusher Giant | Creature — Giant | adventure | 10 |
| #11 | Stomp | Sorcery — Adventure | adventure | 10 |

Add an MDFC with land + creature:

| Row | Name | Type | Layout | canonical_face |
|---|---|---|---|---|
| #12 | Tangled Florahedron | Creature — Elemental | modal_dfc | 12 |
| #13 | Tangled Vale | Land | modal_dfc | 12 |

### New test cases

| Query | Expected | Why |
|---|---|---|
| `t:sorcery t:creature` | ≥ 1 (Bonecrusher) | Cross-face type AND on Adventure |
| `t:land t:creature` | ≥ 1 (Tangled Florahedron) | Cross-face type AND on MDFC |
| `t:creature pow>3` | Cards where any face is creature AND any face has pow>3 | Card-level promotion for numeric + string |
| `is:adventure t:sorcery` | ≥ 1 (Bonecrusher) | Layout + type across faces |
| `-t:creature` | Cards with NO creature face | NOT after promotion excludes all faces |

### Updated matchCount expectations

All existing `matchCount` tests need updating to reflect card-level counts. For the current pool, the only multi-face card is Ayara (rows 7+8). Anywhere Ayara currently contributes 2 to a matchCount (e.g., `t:creature` hits both faces), it should contribute 1 after this change.

## Acceptance Criteria

1. `f:edh t:sorcery t:creature` returns > 0 results (Adventure cards).
2. `o:transform ci=u pow>2 tou<2` returns > 0 results (Delver-style DFCs).
3. `is:mdfc t:land t:creature` returns > 0 results (ZNR-style MDFCs).
4. `matchCount` on every node in the breakdown tree reflects card count, not face count.
5. `-t:creature` excludes cards where *any* face is a creature (NOT operates on card-level result).
6. Single-face cards behave identically to before — `canonicalFace[i] === i` makes the write-to-canonical pattern a no-op.
7. The canonical-only invariant holds through all node types: after any node's buffer is computed, non-canonical face slots are 0.
8. The UI displays a single card count; the "faces" display is removed.
9. No performance regression: the write-to-canonical pattern adds no extra passes and does not increase the algorithmic complexity class.

## Out of Scope

- Buffer pool changes. The buffers remain face-length `Uint8Array`s. Non-canonical face slots are dead weight (~3% of bytes for multi-face cards) but not worth optimizing.
- Changing the face-per-row data model itself. The columnar layout is correct and useful for per-face display (card detail view, oracle text rendering). Only the *evaluation semantics* change.
