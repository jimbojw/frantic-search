# Spec 179: `set_type:` / `st:` printing query field

**Status:** Implemented

**Depends on:** Spec 047 (Printing Query Fields), Spec 046 (Printing Data Model), Spec 103 (categorical resolution / `normalizeForResolution`), ADR-022 (Categorical field operators)

## Goal

Expose Scryfall’s printing-level **`set_type`** string as a searchable field: **`set_type:`** with alias **`st:`**. Semantics mirror **`set:`** (Spec 047): **`:`** = normalized prefix union, **`=`** = normalized exact match, `:` and `=` only, and **non-empty no match under the active operator** → **`unknown set_type "…"`** with Spec 039 passthrough (same as **`unknown set`** for `set:`).

## Background

Each `default_cards` row already includes Scryfall **`set_type`** (e.g. `expansion`, `masters`, `memorabilia`, `funny`). The ETL uses it for `is:alchemy`, `is:unset`, and related flags but does not expose it as a query field. Scryfall’s documented `set_type:` filter targets **exact** set type tokens; Frantic uses **`:`** for prefix discovery and **`=`** for exact match on normalized strings (Spec 047, issue #234).

## Wire format (Spec 046)

Add optional **`set_type`** on each **`SetLookupEntry`** in `printings.json`:

- Stored **lowercase** at ETL time.
- Populated when a set code is **first** seen in `process-printings` from that printing’s `card.set_type` (first wins if bulk data were ever inconsistent).
- **No** per-printing string column: `set_indices[i]` continues to index `set_lookup`; `PrintingIndex` derives per-row type from the lookup row (minimal bytes on the wire).

Legacy `printings.json` without `set_type` on lookup rows: treat as empty string for every printing in that set.

**Card detail (Spec 183 / Spec 024):** `PrintingDisplayColumns.set_types` repeats the same lowercase `set_type` string per printing row (from `set_lookup[set_indices[i]].set_type`). Query chips use that value for `st:` navigation so UI and evaluator stay aligned.

## Evaluation

- **Printing domain** only (`PRINTING_FIELDS`, `evalPrintingField`).
- **Operators:** `:` and `=` only (same as `set:`); other operators return a field error string.
- **Matching:** Let `u = normalizeForResolution(trimmedUserValue)`. **`:`** — printing matches when `normalizeForResolution(rowType).startsWith(u)` (prefix union). **`=`** — printing matches when `normalizeForResolution(rowType) === u` (OR rows if two types normalize identically). Per-row normalized strings are **precomputed** on `PrintingIndex` (Spec 047 / Spec 182); the hot path does not re-normalize every printing each evaluation.
- **Empty value** (after trim): **`=`** is **neutral** (all printings match in the leaf). **`:`** matches every printing whose normalized `set_type` is **non-empty** (parallel to empty `set:`).
- **Unknown token:** If the trimmed value is **non-empty** and **no** printing matches under the active operator, the leaf returns **`unknown set_type "<trimmed value>"`** with Spec 039 passthrough; **`NOT`** propagates the error (Spec 047).

**Query evaluation** does **not** call `resolveForField` for semantic matching (same split as `set:` in Spec 047). **`resolveForField` / enumerated candidates** use **`knownSetTypes`** (unique non-empty types from `set_lookup`) where Spec 103 applies (e.g. canonical outlinks).

## Aliases

| User-facing | Canonical |
|-------------|-----------|
| `set_type` | `set_type` |
| `st` | `set_type` |

## Spec 178 (default inclusion filter)

Positive **`set_type:`** / **`st:`** with **`:`** contribute **prefix** widening; positive **`set_type=`** / **`st=`** contribute **exact** widening. See Spec 178 (**Widening** table, **`positiveSetTypePrefixes`**, **`positiveSetTypeExact`**).

## Acceptance

1. ETL emits `set_type` on `set_lookup` rows; fresh pipeline produces valid `printings.json`.
2. `PrintingIndex` exposes `setTypesLower`, precomputed normalized per-row type strings for eval, and `knownSetTypes`.
3. Queries `set_type:expansion`, `st:mem`, `-st:token` compose with face and printing domain as other printing fields.
4. Unit tests in `eval-printing.test.ts` + fixture updates; compliance rows in `cli/suites/printing.yaml`.
5. In-app reference: `set_type.mdx`, syntax table, fields index, nav; Scryfall differences note exact vs prefix.

## Changelog

- **2026-04-02:** Initial spec.
- **2026-04-02:** Spec 178 integration — `st:` / `set_type:` contribute to default-inclusion widening (`positiveSetTypePrefixes`).
- **2026-04-02:** Unknown non-empty prefix → **`unknown set_type "…"`** (aligned with Spec 047 `set:`); supersedes silent zero-hit wording in the initial spec.
- **2026-04-04:** **`:`** vs **`=`** split (prefix vs exact); empty **`=`** neutral; cached normalization; Spec 178 exact widening list.
