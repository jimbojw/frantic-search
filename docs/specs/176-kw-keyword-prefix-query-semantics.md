# Spec 176: `kw:` / `keyword:` query semantics

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields, `set:` prefix precedent), Spec 103 (Categorical Field Value Auto-Resolution), Spec 105 (Keyword Search), Spec 174 (`otag` / `atag` prefix query semantics), Spec 182 (prefix vs exact operator split and precomputed normalization — **aligned** with this spec for `kw` / `keyword`), ADR-022 (Categorical field operators)

## Goal

**Operator split** (same convention as [Spec 182](182-prefix-union-format-frame-in-collector.md)):

- **`:`** — **prefix union** after `normalizeForResolution`: every keyword index key whose normalized form **starts with** **`u`** contributes its face indices (**OR** into the buffer).
- **`=`** — **exact match** after `normalizeForResolution`: every key whose normalized form **equals** **`u`** contributes (**OR** if several wire keys normalize identically).

This gives **discovery** via incomplete **`:`** tokens (e.g. **`kw:first`** matches **first strike**) and an **escape hatch** via **`=`** when the user wants no prefix widening (e.g. **`kw=fly`** matches only a key that normalizes to **`fly`**, not **`flying`**).

When the trimmed value is **non-empty** and **no** index key matches under the active operator, the leaf returns **`unknown keyword "…"`** and participates in **passthrough** (Spec 039). **`set:`** / **`set_type:`** (Spec 047 / 179) and **`otag:`** / **`atag:`** (Spec 174: **`unknown oracle tag`** / **`unknown illustration tag`**) use the same **unknown token error** model.

**Related:** **`is:`** / **`not:`** use the same **`:`** / **`=`** / **`!=`** operator split as this spec (ADR-022) — **[Spec 032](032-is-operator.md)** § Operators and § Value resolution.

## Background

Spec 103 unique-prefix resolution (`resolveForField`) plus exact key lookup meant `kw:pro` did not resolve when multiple keywords shared a prefix. **[Spec 174](174-otag-atag-prefix-query-semantics.md)** aligns **`otag:`** / **`atag:`** with the same **`:`** / **`=`** / **`!=`** and unknown-token model as keywords; for **`:`**, tags use **boundary-aligned** prefix union and **`normalizeForTagResolution`**, not full-string **`startsWith`** on **`normalizeForResolution`**-stripped keys. **`set:`** / **`set_type:`** error on a non-empty non-matching prefix (Spec 047 / 179). Keywords are **closed vocabulary** names users expect to recognize: a typo or nonsense token should surface as an error while other query clauses still apply (passthrough), not as an empty result set.

Historically **`kw:`** treated **`:`** and **`=`** identically (prefix union only). This spec now **splits** them to match Spec 182’s cross-field convention.

## Operators

Only **`:`** and **`=`** are supported (unchanged from Spec 105). Other operators continue to produce the existing error string (`kw: requires : or = operator`, etc.).

## Normalization

Use **Spec 103** `normalizeForResolution` (same as `normalizeAlphanumeric`: NFD, strip combining marks, lowercase, keep `[a-z0-9]` only) on:

- the user value (after trim for non-empty matching), and  
- each **wire key** in `KeywordData` (`keywords_index` keys), **precomputed once** for evaluation (see **Implementation performance**).

Let **`trimmed`** be the user value after **trim**. For **non-empty** **`trimmed`**, let **`u = normalizeForResolution(trimmed)`**.

- **`:` (prefix):** A wire key **matches** when **`normalizeForResolution(key).startsWith(u)`** (equivalently: when its cached normalized form **starts with** **`u`**).
- **`=` (exact):** A wire key **matches** when **`normalizeForResolution(key) === u`**. If several keys share the same normalized form, **OR** all their face index arrays into the buffer (duplicate face indices are idempotent).

The trimmed user value must be **non-empty** for these rules; see **Empty value** below.

## Matching semantics

- **`kw:`** / **`keyword:`** with **`:`** — For **every** matching key under the prefix rule, OR face indices into **`buf`**.
- **`kw=`** / **`keyword=`** with **`=`** — For **every** matching key under the exact rule, OR face indices into **`buf`**.

If **no** key matches (non-empty value, active operator), return **`unknown keyword "<trimmed value>"`**. Combination with other terms follows Spec 039 **passthrough**.

## Empty value

When the value is empty (after trim), **`kw:`**, **`keyword:`**, **`kw=`**, and **`keyword=`** fill the face buffer with **1** on every index (match **all** faces / neutral filter). Same idea as Spec 182 **empty `=`** neutral behavior. Spec 174 empty **`otag:`** / **`otag=`** instead matches only faces that appear in some oracle tag array (**ADR-022 §5** exception). Implemented in `eval-keywords.ts`.

## Keywords not loaded

**`keywords not loaded`** when the keyword ref is null (no `keywords_index` attached).

## Implementation performance (precompute and cache)

**Observational equivalence:** Precomputed normalized keys must match **`normalizeForResolution(wireKey)`** for each index key.

**Per-query hot path:** Normalize the user value **once** → **`u`**. Compare **`u`** to **cached** normalized strings per entry using only **`startsWith`** / **`===`** — **do not** call **`normalizeForResolution`** on every wire key inside the per-keystroke eval loop. Build the prepared structure when the worker (or CLI) constructs **`KeywordDataRef`** from **`keywords_index`**. See **`buildKeywordEvalIndex`** in [`shared/src/search/eval-keywords.ts`](../../shared/src/search/eval-keywords.ts).

## Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** call **`resolveForField`** for **`kw`** or **`keyword`**. The AST **operator** (**`:`** vs **`=`**) selects prefix vs exact matching per this spec.
- **`resolveForField("kw", …)`** and **`resolveForField("keyword", …)`** remain for **`toScryfallQuery`** / **canonicalize** and any other non-eval consumer that needs **unique-prefix** collapse to a single canonical keyword string (Spec 103).

## Scryfall

Scryfall keyword filters target **effectively exact** names. Frantic adds **prefix-on-normalized-key** discovery with **`:`** and **exact normalized match** with **`=`**; invalid tokens error instead of matching zero cards. Documented in `app/src/docs/reference/scryfall/differences.mdx`.

## Acceptance criteria

1. **`kw:fly`** with only a **`flying`** key (normalized prefix **`fly`** on **`flying`**) matches faces with Flying (**`:`** prefix).
2. **`kw=fly`** with only a **`flying`** key and **no** separate **`fly`** key → **`unknown keyword "fly"`** (**`=`** exact, no false prefix widen).
3. **`kw:fly`** (or any prefix) with keys **`flying`** and **`fly`** (if both exist) matches faces in **either** keyword’s index (union).
4. **`kw:zzz`** with keywords loaded → **`unknown keyword "zzz"`** (passthrough); not a silent zero-hit leaf.
5. **`-kw:…`** / **`-kw=…`** still work via the existing NOT node.
6. Normalization: user value and multi-word keys align when both normalize to the same prefix or exact string (spacing / punctuation).
7. **Empty** **`kw:`** / **`kw=`** fills every face buffer slot with **1** (match all faces).
8. **`resolveForField`** for **`kw`** / **`keyword`** still used in **canonicalize** when context provides the vocabulary.
9. **`keywords not loaded`** when the ref is null.
10. **`kw:xyz t:creature`** (invalid keyword + valid type): same card set as **`t:creature`** alone (passthrough, Spec 039).
11. Eval does **not** re-normalize every wire key on every evaluation; prepared index is built at ref construction (equivalent to normalizing each key once per load).

## Implementation Notes

- **`eval-keywords`** logic: [`shared/src/search/eval-keywords.ts`](../../shared/src/search/eval-keywords.ts) — **`evalKeyword`**, **`buildKeywordEvalIndex`**.
- Evaluator branch: [`shared/src/search/evaluator.ts`](../../shared/src/search/evaluator.ts) — passes **`ast.operator`** and **`keywordEvalIndex`** from **`KeywordDataRef`**.
- Ref construction: [`app/src/worker.ts`](../../app/src/worker.ts), [`cli/src/cli-eval-refs.ts`](../../cli/src/cli-eval-refs.ts) — attach **`keywordEvalIndex`** alongside **`keywords`**.
- 2026-03-31 (historical): Prefix union only for both operators; unknown non-empty prefix → passthrough error.
- 2026-04-04: **`otag:`** / **`atag:`** migrated to the same unknown-token model (Spec 174); historical contrast removed.
- 2026-04-04: **`:`** vs **`=`** split aligned with Spec 182; precomputed normalized keys on ref build.
