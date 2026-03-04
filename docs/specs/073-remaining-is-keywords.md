# Spec 073: Remaining Unsupported `is:` Keywords

**Status:** Implemented

**Depends on:** Spec 032 (is: Operator), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields)

## Goal

Implement the remaining `is:` keywords from [Issue #73](https://github.com/jimbojw/frantic-search/issues/73) that map to simple Scryfall fields: `is:spotlight`, `is:booster`, and the `frame_effects`-based keywords (`is:masterpiece`, `is:colorshifted`, `is:showcase`, `is:inverted`, `is:nyxtouched`).

## Scope

### In scope

| Keyword | Scryfall source | Implementation |
|---------|-----------------|----------------|
| `is:spotlight` | `story_spotlight` boolean | New `PrintingFlag` bit; encode in ETL |
| `is:booster` | `booster` boolean | New `PrintingFlag` bit; encode in ETL |
| `is:masterpiece` | `frame_effects` contains `"masterpiece"` | New `PrintingFlag` bit |
| `is:colorshifted` | `frame_effects` contains `"colorshifted"` | New `PrintingFlag` bit |
| `is:showcase` | `frame_effects` contains `"showcase"` | New `PrintingFlag` bit |
| `is:inverted` | `frame_effects` contains `"inverted"` | New `PrintingFlag` bit |
| `is:nyxtouched` | `frame_effects` contains `"nyxtouched"` | New `PrintingFlag` bit |

### Out of scope (deferred)

- **`is:newinpauper`** — Requires rarity history across printings; complex data model.
- **`is:meldpart` / `is:meldresult`** — Requires `all_parts` encoding; new column; design work.

## Design

### PrintingFlag bit layout

Add 7 bits to `PrintingFlag` in `shared/src/bits.ts`:

| Bit | Name | ETL condition |
|-----|------|---------------|
| `1 << 10` | `Spotlight` | `story_spotlight === true` |
| `1 << 11` | `Booster` | `booster === true` |
| `1 << 12` | `Masterpiece` | `frame_effects` contains `"masterpiece"` |
| `1 << 13` | `Colorshifted` | `frame_effects` contains `"colorshifted"` |
| `1 << 14` | `Showcase` | `frame_effects` contains `"showcase"` |
| `1 << 15` | `Inverted` | `frame_effects` contains `"inverted"` |
| `1 << 16` | `Nyxtouched` | `frame_effects` contains `"nyxtouched"` |

Total: 17 bits. Fits in uint32. Update Spec 046 to document `printing_flags` as supporting up to 32 bits.

### ETL changes

- Add `story_spotlight?: boolean` and `booster?: boolean` to `DefaultCard` in `etl/src/process-printings.ts`.
- Extend `encodePrintingFlags()` with checks for each new source field.

### Evaluator changes

- Add the 7 keywords to `PRINTING_IS_KEYWORDS` in `shared/src/search/eval-is.ts`.
- Keep them in `UNSUPPORTED_IS_KEYWORDS` so face-domain fallback (when printings are not loaded) returns "unsupported" rather than "unknown".
- Add 7 `case` branches in `evalPrintingIsKeyword()`.

## Acceptance Criteria

1. `is:spotlight` matches printings where `story_spotlight === true`.
2. `is:booster` matches printings where `booster === true`.
3. `is:masterpiece`, `is:colorshifted`, `is:showcase`, `is:inverted`, `is:nyxtouched` match printings with the corresponding `frame_effects` value.
4. When printings are not loaded, these keywords produce "printing data not loaded" (same as other printing-domain keywords like `is:foil`).
5. Unit tests cover each new keyword with synthetic data.
6. Spec 046 updated with new bit assignments.

## Changes by Layer

| File | Changes |
|------|---------|
| `shared/src/bits.ts` | Add 7 `PrintingFlag` bits (10–16) |
| `etl/src/process-printings.ts` | Add `story_spotlight`, `booster` to `DefaultCard`; extend `encodePrintingFlags()` |
| `shared/src/search/eval-is.ts` | Add 7 keywords to `PRINTING_IS_KEYWORDS`; keep spotlight/booster/masterpiece/colorshifted in `UNSUPPORTED_IS_KEYWORDS` for face fallback; add 7 cases in `evalPrintingIsKeyword()` |
| `docs/specs/046-printing-data-model.md` | Update printing_flags bit table |
| `shared/src/search/evaluator.test-fixtures.ts` | Add test rows with new flags |
| `shared/src/search/evaluator-printing.test.ts` | Add tests for new keywords |

## Implementation Notes

- 2026-03-04: Implemented all 7 keywords. Added PrintingFlag bits 10–16. Extended DefaultCard with story_spotlight and booster. Updated evaluator-is.test.ts: is:meldpart now used for unsupported-keyword test; is:spotlight without printings returns "printing data not loaded". See Issue #73.
