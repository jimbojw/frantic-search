# Spec 179: `set_type:` / `st:` printing query field

**Status:** Implemented

**Depends on:** Spec 047 (Printing Query Fields), Spec 046 (Printing Data Model), Spec 103 (categorical resolution / `normalizeForResolution`)

## Goal

Expose Scryfall’s printing-level **`set_type`** string as a searchable field: **`set_type:`** with alias **`st:`**. Semantics mirror **`set:`** (prefix on normalized value, `:` and `=` only, zero hits with no error for unknown prefix) so users can discover printings by set taxonomy (e.g. `st:memorabilia`, `set_type:exp`).

## Background

Each `default_cards` row already includes Scryfall **`set_type`** (e.g. `expansion`, `masters`, `memorabilia`, `funny`). The ETL uses it for `is:alchemy`, `is:unset`, and related flags but does not expose it as a query field. Scryfall’s documented `set_type:` filter targets **exact** set type tokens; Frantic uses **prefix matching on normalized strings** for discovery, consistent with Frantic’s `set:` behavior vs Scryfall (Spec 047, issue #234).

## Wire format (Spec 046)

Add optional **`set_type`** on each **`SetLookupEntry`** in `printings.json`:

- Stored **lowercase** at ETL time.
- Populated when a set code is **first** seen in `process-printings` from that printing’s `card.set_type` (first wins if bulk data were ever inconsistent).
- **No** per-printing string column: `set_indices[i]` continues to index `set_lookup`; `PrintingIndex` derives per-row type from the lookup row (minimal bytes on the wire).

Legacy `printings.json` without `set_type` on lookup rows: treat as empty string for every printing in that set.

## Evaluation

- **Printing domain** only (`PRINTING_FIELDS`, `evalPrintingField`).
- **Operators:** `:` and `=` only (same as `set:`); other operators return a field error string.
- **Matching:** `normalizeForResolution(userValue)` and `normalizeForResolution(setTypesLower[i])`; printing matches when `normalize(type).startsWith(normalize(userValue))`.
- **Empty value** (after trim): match every printing whose normalized `set_type` is **non-empty** (parallel to empty `set:`).
- **Unknown prefix:** zero matching printings, **no** leaf error (parallel to `set:`).

**Query evaluation** does **not** call `resolveForField` for matching (same split as `set:` in Spec 047). **`resolveForField` / enumerated candidates** use **`knownSetTypes`** (unique non-empty types from `set_lookup`) where Spec 103 applies (e.g. canonical outlinks).

## Aliases

| User-facing | Canonical |
|-------------|-----------|
| `set_type` | `set_type` |
| `st` | `set_type` |

## Spec 178 (default inclusion filter)

Positive **`set_type:`** / **`st:`** terms participate in **printing-wide widening** alongside **`set:`**: see Spec 178 (**Widening** table and **`positiveSetTypePrefixes`**). Prefix semantics match **`set_type`** field evaluation (`normalizeForResolution` + `startsWith`).

## Acceptance

1. ETL emits `set_type` on `set_lookup` rows; fresh pipeline produces valid `printings.json`.
2. `PrintingIndex` exposes `setTypesLower` and `knownSetTypes`.
3. Queries `set_type:expansion`, `st:mem`, `-st:token` compose with face and printing domain as other printing fields.
4. Unit tests in `eval-printing.test.ts` + fixture updates; compliance rows in `cli/suites/printing.yaml`.
5. In-app reference: `set_type.mdx`, syntax table, fields index, nav; Scryfall differences note exact vs prefix.

## Changelog

- **2026-04-02:** Initial spec.
- **2026-04-02:** Spec 178 integration — `st:` / `set_type:` contribute to default-inclusion widening (`positiveSetTypePrefixes`).
