# Spec 176: `kw:` / `keyword:` prefix query semantics

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields, `set:` prefix precedent), Spec 103 (Categorical Field Value Auto-Resolution), Spec 105 (Keyword Search), Spec 174 (`otag` / `atag` prefix query semantics)

## Goal

**Prefix union** for keyword discovery (like **`set:`** / **`otag:`** / **`atag:`**): normalized **prefix** over loaded keyword index keys; **union** all matching keys’ face indices so e.g. **`kw:first`** matches **first strike** without quotes.

**Unlike** tags and set codes: when the trimmed value is **non-empty** and **no** index key’s normalized form has the query as a prefix, the leaf returns **`unknown keyword "…"`** and participates in **passthrough** (Spec 039) — the term does not silently match zero faces.

**Related:** **`is:`** / **`not:`** use the same **closed-vocabulary prefix union** evaluation model over the `is:` keyword list — **[Spec 032](032-is-operator.md)** § Value resolution.

## Background

Spec 103 unique-prefix resolution (`resolveForField`) plus exact key lookup meant `kw:pro` did not resolve when multiple keywords shared a prefix. Spec 174 uses prefix union for tags with **zero hits, no error** when nothing matches. Keywords are **closed vocabulary** names users expect to recognize: a typo or nonsense token should surface as an error while other query clauses still apply (passthrough), not as an empty result set.

## Operators

Only **`:`** and **`=`** are supported (unchanged from Spec 105). Other operators continue to produce the existing error string (`kw: requires : or = operator`, etc.).

## Normalization

Use **Spec 103** `normalizeForResolution` (same as `normalizeAlphanumeric`: NFD, strip combining marks, lowercase, keep `[a-z0-9]` only) on **both**:

- the user value (after trim for non-empty matching), and  
- each **storage key** in `KeywordData` (`keywords_index` keys).

A keyword key **matches** the query when:

`normalizeForResolution(key).startsWith(normalizeForResolution(userValue))`

The trimmed user value must be **non-empty** for this rule; see **Empty value** below.

## Matching semantics (union)

- **`kw:`** / **`keyword:`** — For **every** keyword index key whose normalized key **starts with** the normalized user prefix, OR the face indices from that key’s array into the face buffer (`buf[face] = 1`). Duplicate indices across keys are idempotent.

If **no** key matches (non-empty value with no hits), return **`unknown keyword "<trimmed value>"`** (same message shape as invalid **`is:`** / **`not:`** values). The evaluator marks the leaf as errored; combination with other terms follows Spec 039 **passthrough** (errored leaves are skipped in AND, so `kw:xyz t:creature` behaves like `t:creature` alone).

## Empty value

**Unchanged from Spec 105:** When the value is empty (after trim), **`kw:`** / **`keyword:`** fills the face buffer with **1** on every index (match **all** faces / neutral filter). This is **not** the same as Spec 174 empty **`otag:`** (which matches only faces that appear in some tag array). Keyword empty semantics stay special-cased in `eval-keywords.ts`.

## Keywords not loaded

Unchanged from Spec 105: **`keywords not loaded`** when the keyword ref is null.

## Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** call **`resolveForField`** for **`kw`** or **`keyword`**. The AST value is passed through and interpreted as a prefix per this spec.
- **`resolveForField("kw", …)`** and **`resolveForField("keyword", …)`** remain for **`toScryfallQuery`** / **canonicalize** and any other non-eval consumer that needs **unique-prefix** collapse to a single canonical keyword string (Spec 103).

## Scryfall

Scryfall keyword filters target **effectively exact** names. Frantic adds **prefix-on-normalized-key** discovery with union; invalid tokens error instead of matching zero cards. Documented in `app/src/docs/reference/scryfall/differences.mdx`.

## Acceptance criteria

1. **`kw:fly`** (or any prefix) with keys `flying` and `fly` (if both exist) matches faces in **either** keyword’s index (union).
2. **`kw:zzz`** with keywords loaded → **`unknown keyword "zzz"`** (passthrough); not a silent zero-hit leaf.
3. **`-kw:…`** still works via the existing NOT node (including NOT of a valid prefix union).
4. Normalization: e.g. user value and multi-word keys align when both normalize to the same prefix (e.g. spaced input vs storage key with spaces).
5. **Empty** **`kw:`** / **`kw=`** fills every face buffer slot with **1** (match all faces).
6. **`resolveForField`** for **`kw`** / **`keyword`** still used in **canonicalize** when context provides the vocabulary.
7. **`keywords not loaded`** when the ref is null.
8. **`kw:xyz t:creature`** (invalid keyword + valid type): same card set as **`t:creature`** alone (passthrough, Spec 039).

## Implementation Notes

- 2026-03-31: Prefix union in `eval-keywords.ts`; evaluator passes `ast.value` without `resolveForField` on the eval path. No matching key for a non-empty value → `unknown keyword "…"` (passthrough, Spec 039); differs from `otag:` / `atag:` / `set:` silent zero-hit behavior.
