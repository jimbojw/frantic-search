# Spec 171: `is:unset` (printing domain)

**Status:** Implemented

**Depends on:** Spec 032 (The `is:` Operator), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields)

## Goal

Match Scryfall’s printing query [`is:unset`](https://scryfall.com/search?q=is%3Aunset) by encoding unset-expansion membership from Scryfall bulk **default_cards** data and evaluating it in the **printing** domain. Closes [Issue #213](https://github.com/jimbojw/frantic-search/issues/213).

## Background

Frantic Search already reads each printing’s Scryfall **`set_type`** on `DefaultCard` in `etl/src/process-printings.ts` (same field used for `is:alchemy` parity). Today nothing maps that field to `is:unset`, so the keyword is unknown in `evalPrintingIsKeyword()` and queries return no useful matches (breakdown shows an error-style contribution).

Scryfall classifies unset-style expansions (e.g. Unglued, Unhinged, Unstable, Unsanctioned, Unfinity) with **`set_type: "funny"`** on the set / denormalized card object. That is the same taxonomy field already used in oracle ETL for one branch of face-level `is:funny` logic (`etl/src/process.ts`), but **`is:unset` is not the same as `is:funny`:** oracle `is:funny` unions acorn stamps, silver/gold borders, playtest promos, and other rules, while **`is:unset` is “this printing belongs to a funny-type set”** — a per-printing, set-metadata predicate. Implementation therefore belongs in the printing pipeline alongside `is:alchemy`, not as a reuse of `CardFlag.Funny`.

## Approach (parallel to `is:alchemy`)

**Spec 046 / `encodePromoTypesFlags`:** For `is:alchemy`, Scryfall parity requires OR-ing the existing **`alchemy`** promo bit when `set_type === "alchemy"` (case-insensitive), even when `promo_types` omits `alchemy`, because bulk data encodes Alchemy products at the set level.

**This spec:** Apply the **same parity principle** — derive the search keyword from **`set_type` on each default_cards row** — but there is **no** `promo_types` value that means “unset”, so the signal is stored as a **new `PrintingFlag` bit** in `printing_flags`, not in `promo_types_flags_*`.

| Keyword | Scryfall source on printing | Storage | Evaluator |
|---------|----------------------------|---------|-----------|
| `is:alchemy` | `promo_types` and/or `set_type === "alchemy"` | `promo_types_flags_0` bit 0 | `evalPrintingIsKeyword` via `PROMO_TYPE_FLAGS.alchemy` |
| `is:unset` | `set_type === "funny"` (case-insensitive) | New `PrintingFlag.Unset` in `printing_flags` | `evalPrintingIsKeyword` `case "unset"` |

## Design

### PrintingFlag bit

Add **`PrintingFlag.Unset`** in `shared/src/bits.ts` at **`1 << 17`** (next free after `Nyxtouched` at `1 << 16`). `printing_flags` remains a uint32; 18 bits used after this change. Update the `PrintingFlag` block comment there from **“17 bits”** to **“18 bits”** so it stays accurate.

### ETL

- In `etl/src/encode-printing-flags.ts`, extend `encodePrintingFlags()`:
  - If `(card.set_type ?? "").toLowerCase() === "funny"`, OR `PrintingFlag.Unset` into the flags word.
- `process-printings.ts` imports the encoder; extend the `DefaultCard` comment on `set_type` to document both alchemy (via `encodePromoTypesFlags`) and unset (via `encodePrintingFlags`), consistent with Spec 046.

No change to `encodePromoTypesFlags` or promo bit layout.

### Evaluator

- In `shared/src/search/eval-is.ts`:
  - Add `"unset"` to `PRINTING_IS_KEYWORDS` (this is enough for autocomplete: `IS_KEYWORDS` already unions `PRINTING_IS_KEYWORDS`).
  - Add `case "unset":` in `evalPrintingIsKeyword()` that matches rows where `(pIdx.printingFlags[i] & PrintingFlag.Unset) !== 0`.
- **No face-domain fallback:** unlike `is:universesbeyond` / `is:ub`, do not add `FACE_FALLBACK_IS_KEYWORDS`. When `PrintingIndex` is absent, behavior matches other printing-only `is:` keywords (“printing data not loaded”).

### Documentation updates (at implementation time)

- **Spec 046** — Add row `17 | unset` to the `printing_flags` bit table; note that the bit is set from `set_type: "funny"` for Scryfall `is:unset` parity (reference this spec).
- **Spec 047** — Add an **`is:unset`** subsection mirroring **`is:alchemy`** (Spec 047 § printing `is:` keywords): printing-domain evaluation, promotion semantics at AND/OR/NOT with face-domain terms, and pointer to Spec 046 for the bit definition.
- **Spec 032** — Optional one-line in “Printing-level attributes” that `is:unset` is printing-domain per Spec 047 / this spec.

## Acceptance criteria

1. `is:unset` evaluates with status `"ok"` when printings are loaded (not `unknown keyword`).
2. After a full ETL refresh, result counts for `is:unset` are in line with Scryfall when compared **like for like** (e.g. same `include:` / extras assumptions as `npm run cli -- diff` and Scryfall’s query). Issue #213 cited ~792 Scryfall rows — that may count printings or differ from Frantic’s oracle-unique cardinality; **order-of-magnitude** parity matters more than an exact integer. If bulk `set_type` and Scryfall’s live engine ever diverge, document the principled rule here and in `docs/guides/scryfall-comparison.md`.
3. When printings are not loaded, the keyword reports the same class of error as `is:foil` / other printing-only `is:` terms (no silent face fallback).
4. Unit tests cover `evalPrintingIsKeyword("unset", …)` with synthetic `printing_flags`, plus ETL coverage for the `set_type → Unset` rule. **`encodePrintingFlags` is not exported today** — follow the same pattern as **`etl/src/encode-promo-types-flags.test.ts`** (focused tests against a small exported encoder or a thin test-only export from `process-printings.ts`), rather than assuming a new `process-printings.test.ts` without an import path.

## Changes by layer

| Layer | File | Changes |
|-------|------|---------|
| Shared | `shared/src/bits.ts` | `PrintingFlag.Unset = 1 << 17`; refresh `PrintingFlag` bitmask line count comment (17 → 18 bits) |
| ETL | `etl/src/encode-printing-flags.ts`, `etl/src/process-printings.ts` | `encodePrintingFlags`: OR `Unset` when `set_type` is `funny` (case-insensitive); `DefaultCard.set_type` JSDoc |
| ETL tests | `etl/src/encode-printing-flags.test.ts` | `set_type: "funny"` / `Funny` / non-funny — mirror `encode-promo-types-flags.test.ts` |
| Evaluator | `shared/src/search/eval-is.ts` | `PRINTING_IS_KEYWORDS`, `evalPrintingIsKeyword` branch |
| Tests | `shared/src/search/evaluator-printing.test.ts`, `evaluator-is.test.ts` | Synthetic `printing_flags` + keyword wiring |
| Fixtures | `shared/src/search/evaluator.test-fixtures.ts` | Optional: printing row with `PrintingFlag.Unset` for integration-style tests |
| Docs | `docs/specs/046-printing-data-model.md`, `docs/specs/047-printing-query-fields.md` | Bit table + `is:unset` subsection |
| Compliance (optional) | `cli/suites/printing.yaml` | Regression case with `scryfall_query` for `is:unset` (and matching `include:` if needed), similar to other printing `is:` rows |

## Out of scope

- Redefining oracle-level `is:funny` or merging it with `is:unset`.
- New columns beyond `printing_flags`; legacy `printings.json` without recomputation simply lacks the bit until users re-run ETL.

## Implementation notes

- **2026-03-30:** `PrintingFlag.Unset` (`1 << 17`); ETL [`encode-printing-flags.ts`](../../etl/src/encode-printing-flags.ts) ORs it when `set_type` is `funny`; [`eval-is.ts`](../../shared/src/search/eval-is.ts) `PRINTING_IS_KEYWORDS` + `evalPrintingIsKeyword` branch. Compliance: [`printing.yaml`](../../cli/suites/printing.yaml).
- **Scryfall parity:** Match bulk `set_type: "funny"`; see `docs/guides/scryfall-comparison.md` for comparison to oracle `is:funny` and count expectations vs Scryfall `is:unset`.
