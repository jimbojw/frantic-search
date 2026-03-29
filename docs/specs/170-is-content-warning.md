# Spec 170: `is:content_warning`

**Status:** Implemented

**Depends on:** Spec 032 (The `is:` Operator), ADR-007 (Bit-packed data representation)

## Goal

Match Scryfall’s oracle query `is:content_warning` by encoding Scryfall’s `content_warning` boolean from oracle bulk data into the existing per-face `flags` bitmask and evaluating it in the face-domain `is:` handler. Closes [Issue #224](https://github.com/jimbojw/frantic-search/issues/224).

## Background

Scryfall marks a small set of cards with `content_warning: true` in `oracle-cards.json`. Frantic Search previously had no `is:content_warning` branch in `evalIsKeyword`, so the keyword was treated as unknown (error / zero useful matches).

## Design

### CardFlag bit

Add `CardFlag.ContentWarning` in `shared/src/bits.ts` at bit **`1 << 5`** (next free after `MeldResult` at `1 << 4`).

### ETL

- Extend the `Card` interface in `etl/src/process.ts` with `content_warning?: boolean`.
- In `encodeFlags`, if `card.content_warning` is true, OR `CardFlag.ContentWarning` into the flags word.
- Flags are card-level; duplicate across faces of multi-face cards like other `encodeFlags` fields.

### Evaluator

- In `shared/src/search/eval-is.ts`, add a `case "content_warning":` that sets `buf[cf[i]] = 1` when `(index.flags[i] & CardFlag.ContentWarning) !== 0`, mirroring `is:reserved` / `is:gamechanger`.
- Add `"content_warning"` to `IS_KEYWORDS` for autocomplete.

## Out of scope

- Printing-only fields: oracle bulk is the source of truth for face-level search; no `PrintingIndex` changes.
- A separate inverted index in `columns.json` (use the existing `flags` column only).

## Acceptance criteria

1. `is:content_warning` evaluates with status `"ok"` (not `unknown keyword`).
2. After a full ETL refresh, result counts align with Scryfall for this keyword (on the order of seven oracle cards).
3. Negation `-is:content_warning` works via the existing `NOT` node behavior.
4. Unit tests cover the evaluator path with synthetic `flags` and ETL encoding with a minimal card object.

## Files

| Area | File |
|------|------|
| Bitmask | `shared/src/bits.ts` |
| ETL | `etl/src/process.ts` |
| Evaluator / autocomplete | `shared/src/search/eval-is.ts` |
| ETL tests | `etl/src/process.test.ts` (or new sibling) |
| Shared tests | `shared/src/search/evaluator-is.test.ts` or `eval-is.test.ts` |
| Canonical `is:` doc | `docs/specs/032-is-operator.md` (flag table + AC + note) |
| Compliance | `cli/suites/is-keywords.yaml` (local `count: 7` after `npm run etl -- process`) |

## Implementation Notes

- 2026-03-29: `encodeFlags` and `Card` are exported from `etl/src/process.ts` for `process-flags.test.ts`. Vitest for `-is:content_warning` asserts canonical-row NOT semantics (`matchCount` 43 in the extended Spec 032 fixture pool), not raw face-row count.
