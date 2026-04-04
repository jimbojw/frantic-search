# Collector number (`cn`) parity with Scryfall — research notes

This document records findings from investigating [GitHub #250](https://github.com/jimbojw/frantic-search/issues/250) (`cn=4` returns fewer unique cards locally than on Scryfall) and what approaching **search parity** on collector number would entail.

## Summary

Frantic Search implements `cn:` / `number:` / `collectornumber:` as **normalized string** matching (prefix for `:`, exact for `=`). Scryfall appears to treat collector number as a **numeric** (or at least richer) field for equality and supports **comparison operators** (e.g. `cn>4`). That semantic gap explains systematic set differences in the CLI `diff` output, not a one-off data bug.

## What we observed

### User-reported numbers (#250)

- **Frantic:** 429 unique cards (702 printings) for `cn=4`.
- **Scryfall:** 444 unique cards ([search link](https://scryfall.com/search?q=cn%3D4)).
- **Breakdown confusion:** A breakdown line such as `cn=4  1,062` counts **printing-level** matches for that leaf, not unique cards — it is not comparable to the 429 card figure.

### CLI `diff "cn=4"` (reproducible after ETL)

With `data/dist/columns.json` built from a current `oracle-cards` pipeline:

| Bucket | Count |
|--------|------:|
| In both | 420 |
| Only Frantic Search | 9 |
| Only Scryfall | 24 |

Those counts reconcile the headline totals: 420 + 9 = **429**, 420 + 24 = **444**.

### Representative discrepancies

- **Scryfall only:** Many printings whose **wire** collector strings are not literally `"4"` after Frantic’s normalization — e.g. `G4`, `4a`, `4J`, `IFIYW-4`, `WS4`. Frantic normalizes each side with `normalizeForResolution` (accent fold, lowercase, **strip all non `[a-z0-9]`**), then requires **exact** equality to `"4"` for `cn=`. So `g4`, `4a`, `ifiyw4`, etc. do **not** match `cn=4`.
- **Frantic only:** Printings whose normalized collector string **is** `4` (e.g. `tmd1/4`, `ulst/4`, some promo sheet rows) but which **do not** appear in Scryfall’s API results for the same query — plausibly due to Scryfall’s **default inclusion** rules or catalog indexing, which are only partially characterized (see `docs/guides/scryfall-comparison.md` and `docs/research/scryfall-default-result-filtering.md`).

## How Frantic works today (normative)

- **Spec:** [Spec 182](docs/specs/182-prefix-union-format-frame-in-collector.md) — `cn:` uses **prefix union** after `normalizeForResolution`; `cn=` uses **exact** match after the same normalization. **`!=`** and ordering operators (`>`, `<`, …) are **not** specified for `cn` in that spec.
- **Evaluator:** `shared/src/search/eval-printing.ts` — `collectornumber` accepts **only** `:` and `=`; any other operator returns an error string (`does not support operator`).
- **Normalization:** `normalizeForResolution` → `normalizeAlphanumeric` in `shared/src/normalize.ts` (NFD, strip combining marks, lowercase, keep only `a-z` and `0-9`).

## Hypothesis: Scryfall’s model

Scryfall likely interprets `cn` in queries using a **numeric** (or multi-part) reading of collector numbers, so:

- `cn=4` can match strings whose **numeric component** is 4 (e.g. promo codes ending in `4`).
- `cn>4`, `cn>=4`, etc. are meaningful — which is **not** true in Frantic’s current evaluator for this field.

This hypothesis fits the diff lists above without requiring ad hoc explanations per card.

## Trade-offs if we pursue parity

### 1. Product semantics (spec + ADR)

- **Define** parity targets explicitly (ADR-019: not all Scryfall behavior must be copied, but divergences should be documented). Choices include:
  - **Full numeric parity:** Match Scryfall’s rules for extracting or comparing the “collector number as number” (needs authoritative behavior description or exhaustive golden tests against the API).
  - **Partial:** e.g. only extend `cn=` to match a defined numeric suffix/prefix model without implementing every Scryfall edge case.
- **Spec 182** would need a **revision or successor spec** for `cn:` / `cn=` (and possibly `cn!=`, comparisons) so behavior is testable and stable.

### 2. Implementation scope

- **Evaluator:** Extend `eval-printing.ts` `collectornumber` handling — likely a **precomputed per-printing numeric key** (or structured parse) on `PrintingIndex`, analogous to existing precomputed `collectorNumbersNormResolved`, to keep the hot path allocation-free.
- **Parser / AST:** If comparisons are added, ensure leaf nodes carry operators consistently with other numeric fields (e.g. `usd`).
- **Edge cases:** Collector strings with no digits, multiple digit groups, unicode, serialized `★` / unicode numbers, etc. need defined behavior (match Scryfall vs explicit Frantic rules).
- **Downstream:** [Spec 114](docs/specs/114-worker-deck-list-validation.md) / deck validation paths that rely on collector matching may need review so **query** semantics and **deck line** semantics stay coherent.

### 3. Testing and compliance

- **TDD in `shared/`:** New tests for `cn=`, `cn:`, and any new operators against fixtures and/or Scryfall API snapshots.
- **CLI `diff`:** Becomes a regression harness for curated queries once semantics are chosen.
- **Breakdown / hints:** [Spec 181](docs/specs/181-breakdown-prefix-branch-hint.md) ties collector hints to `collectorNumbersNormResolved`; a numeric model may require parallel hint vocabulary.

### 4. Risks

- **Breaking change:** Users or scripts that rely on today’s **string-normalized** `cn=` (e.g. treating `cn=4` as “collector normalizes to exactly `4`”) would see **more** matches after a Scryfall-like numeric rule.
- **Performance:** Extra columns or parse steps at index build time are likely fine; per-keystroke eval must stay O(printings) with no per-row allocations in the inner loop (per `shared/AGENTS.md`).

### 5. What we are *not* proposing here

- A concrete numeric extraction algorithm (requires locking to Scryfall behavior or accepting intentional divergence).
- Changing ETL wire format unless a new indexed column is required (could stay entirely in `PrintingIndex` construction).

## References

- Issue: [#250](https://github.com/jimbojw/frantic-search/issues/250)
- Comparison workflow: `docs/guides/scryfall-comparison.md`
- Default filtering research: `docs/research/scryfall-default-result-filtering.md`
- Spec 182: `docs/specs/182-prefix-union-format-frame-in-collector.md`

---

*Written from investigation on 2026-04-04; engine behavior cited from the repository state at that time.*
