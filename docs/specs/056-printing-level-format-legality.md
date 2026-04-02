# Spec 056: Printing-Level Format Legality

**Status:** Superseded by [Spec 178](178-default-search-inclusion-filter.md) (updated)

**Depends on:** Spec 002 (Query Engine), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), ADR-017 (Dual-Domain Query Evaluation)

## Goal

Make `f:` / `legal:` / `format:` (and `banned:`, `restricted:`) evaluate in the printing domain when printing data is available, so that non-tournament-usable printings are excluded from format-filtered results. Add `is:oversized` as a printing-level keyword. Fall back to face-domain evaluation when printing data is not yet loaded.

## Background

Scryfall's `legalities` object is a card-level (oracle-level) property — all printings of the same card share the same legality status. However, some printings of otherwise legal cards are not usable in sanctioned tournament play:

- **Gold-bordered printings** — World Championship Decks (WCD), Collector's Edition (CED), International Collector's Edition (CEI). Scryfall exposes these as `border_color: "gold"`.
- **Oversized printings** — Commander oversized cards, Archenemy, Planechase. Scryfall exposes `oversized: true`.
- **30th Anniversary Edition** (set code `30a`) — Has standard black front borders but a non-standard gold card back. Scryfall reports `border_color: "black"` for these, so they are not caught by a gold-border check alone.

Currently, `f:commander` evaluates only at the face (card) level. A query like `f:commander unique:prints !"Static Orb"` includes gold-bordered and oversized printings that cannot actually be played.

## Design

### New Printing Flags

Add two bits to `PrintingFlag` in `shared/src/bits.ts`:

| Bit | Name | ETL condition |
|-----|------|---------------|
| `1 << 8` | `GoldBorder` | `border_color === "gold"` OR set code in `NON_TOURNAMENT_BACK_SETS` (currently `{"30a"}`) |
| `1 << 9` | `Oversized` | `oversized === true` |

The `GoldBorder` flag covers both gold-front-bordered printings and 30th Anniversary Edition printings (gold card back). Both share the same tournament consequence: the printing is not a valid authorized game card.

### Non-Tournament Mask

A derived constant in `eval-printing.ts`:

```typescript
export const NON_TOURNAMENT_MASK = PrintingFlag.GoldBorder | PrintingFlag.Oversized;
```

### Legality as a Printing-Domain Field

`legal`, `banned`, and `restricted` move from face-only fields to **face-fallback printing fields**: they evaluate in the printing domain when printing data is available, and fall back to face-domain evaluation when it is not.

### Printing-Domain Semantics

For each printing row `p`:

- `f:commander` matches iff:
  1. `legalitiesLegal[canonicalFaceRef[p]] & Format.Commander` (card is legal), AND
  2. `!(printingFlags[p] & NON_TOURNAMENT_MASK)` (printing is tournament-usable)
- `-f:commander` (NOT): inverts the printing buffer — matches printings where the card is NOT legal in commander, OR the printing is non-tournament-usable.
- Analogous logic for `banned:` and `restricted:`.
- When promoted to face domain via AND/OR: standard promotion — "card has at least one matching printing."

### Face-Domain Fallback

When printing data is not loaded:

- `legal`/`banned`/`restricted` fall back to face-domain evaluation (existing behavior).
- `_hasPrintingLeaves()` returns `false` for these fields when printing data is unavailable, preventing incorrect `hasPrintingConditions` / `printingsUnavailable` flags.
- When printing data arrives via `setPrintingIndex()`, all cached nodes are invalidated so legality fields re-evaluate in the printing domain.

### `is:oversized` Keyword

Added to `PRINTING_IS_KEYWORDS` and handled in `evalPrintingIsKeyword()`:

```
is:oversized → printingFlags[i] & PrintingFlag.Oversized
```

This enables queries like `-is:oversized` to exclude oversized printings, and composes with format legality: `f:commander -is:oversized`.

## Changes by Layer

### `shared/src/bits.ts`

Add `GoldBorder: 1 << 8` and `Oversized: 1 << 9` to `PrintingFlag`.

### `etl/src/process-printings.ts`

- Add `oversized?: boolean` to `DefaultCard` interface.
- Define `NON_TOURNAMENT_BACK_SETS = new Set(["30a"])`.
- In `encodePrintingFlags()`: set `GoldBorder` for `border_color === "gold"` or set in `NON_TOURNAMENT_BACK_SETS`; set `Oversized` for `oversized === true`.

### `shared/src/search/eval-is.ts`

- Add `"oversized"` to `PRINTING_IS_KEYWORDS`.
- Add case in `evalPrintingIsKeyword()` for `"oversized"`.

### `shared/src/search/eval-printing.ts`

- Add `"legal"`, `"banned"`, `"restricted"` to `PRINTING_FIELDS`.
- Export `FACE_FALLBACK_PRINTING_FIELDS` set containing these three.
- Export `NON_TOURNAMENT_MASK`.
- Add `CardIndex` parameter to `evalPrintingField()`.
- Implement `legal`/`banned`/`restricted` cases using card-level legality cross-referenced with `NON_TOURNAMENT_MASK`.

### `shared/src/search/evaluator.ts`

- Pass `this.index` to `evalPrintingField()`.
- Face-domain fallback: when `isPrintingDomain && !this._printingIndex`, check `FACE_FALLBACK_PRINTING_FIELDS` — if match, fall through to face-domain `evalLeafField`.
- `_hasPrintingLeaves()`: return `false` for face-fallback fields when `this._printingIndex` is null.
- `setPrintingIndex()`: invalidate all cached nodes (not just printing-domain) so fallback fields re-evaluate.

## Acceptance Criteria

1. `f:commander unique:prints !"Static Orb"` excludes gold-bordered and oversized printings.
2. `!"Static Orb" -f:commander` finds non-tournament-usable printings (gold-bordered, oversized, 30A).
3. `is:oversized` matches oversized printings.
4. `-is:oversized` excludes oversized printings.
5. When printing data is not loaded, `f:commander` falls back to face-domain evaluation (existing behavior, no regression).
6. When printing data loads after initial evaluation, legality results update to include printing-level filtering.
7. `f:commander` without `unique:prints` still returns the correct set of cards (face-level result unchanged for card-level dedup). The display layer shows one row per card in Images and Full (first matching printing), not multiple printings.

## Not in Scope

- `border:gold` / `is:goldbordered` printing query keyword (separate spec).
- Silver-border printing-level filtering (already handled at card level via `not_legal` status).
- Digital-only printing filtering.

## Supersession Notes

This spec's core rationale — that format/legality evaluation should operate in the printing domain gated by `NON_TOURNAMENT_MASK` — has been invalidated by empirical observation of Scryfall behavior. Scryfall's `f:` / `legal:` / `banned:` / `restricted:` are oracle-level (card-level) properties; printing-level hiding of gold-bordered and oversized printings is performed by Scryfall's default result filter, not by format evaluation. Evidence: `!"Static Orb" unique:prints` excludes the WC01 gold-bordered printing from default results but `!"Static Orb" unique:prints set:wc01` recovers it — behavior consistent with a default-filter pass, not format gating.

**Reversed:** Format/legality returns to face-domain-only evaluation. `NON_TOURNAMENT_MASK` is deleted. Default-search hiding of gold-bordered and oversized printings is now handled by [Spec 178](178-default-search-inclusion-filter.md)'s updated default inclusion passes (expanded wholesale omit-set list for gold-bordered product lines; new oversized omission pass with `is:oversized` widening).

**Surviving contributions:** `PrintingFlag.GoldBorder` (1 << 8) and `PrintingFlag.Oversized` (1 << 9) in `shared/src/bits.ts` remain for ETL encoding, `is:oversized` queries, and display heuristics (e.g. canonical printing selection in `list-mask-builder.ts`).
