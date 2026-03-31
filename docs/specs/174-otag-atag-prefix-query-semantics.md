# Spec 174: `otag:` / `atag:` prefix query semantics

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields, `set:` prefix precedent), Spec 093 (Evaluator Tag Query Support), Spec 103 (Categorical Field Value Auto-Resolution), Spec 159 (otag/atag bare-term prefix suggestions)

## Goal

Align **`otag:`** (face domain) and **`atag:`** / **`art:`** (printing domain) **query evaluation** with **`set:`**: normalized **prefix** matching over the loaded tag vocabulary, **union** of all matching tag keys, and **no leaf error** when the prefix matches no key (zero results). Optionally treat **empty** values like **`set:`** (match every entity that has at least one tag in the loaded index).

## Background

Spec 103 unique-prefix resolution (`resolveForField`) plus exact key lookup made `otag:ram` resolve to a single tag when unambiguous, and `otag:nonexistent` an error. Spec 047 and [issue #234](https://github.com/jimbo/checkout/public/frantic-search/issues/234) moved **`set:`** evaluation off that path: prefix-on-rows, zero hits without `unknown set`.

Tag discovery should behave the same: short or shared prefixes intentionally match **many** tags; impossible prefixes yield **zero** faces or printings, not `unknown tag`.

## Operators

Only **`:`** and **`=`** are supported (unchanged from Spec 093). Other operators continue to produce the existing error strings (`otag: requires : or = operator`, etc.).

## Normalization

Use **Spec 103** `normalizeForResolution` (same as `normalizeAlphanumeric`: NFD, strip combining marks, lowercase, keep `[a-z0-9]` only) on **both**:

- the user value (after trim for empty detection), and  
- each **storage key** in `OracleTagData` / the illustration tag `Map`.

A tag key **matches** the query when:

`normalizeForResolution(key).startsWith(normalizeForResolution(userValue))`

When the trimmed user value is **empty**, treat **`normalizeForResolution(userValue)`** as matching **all keys** for the purpose of union (equivalent to: every face or printing that appears in **any** tag’s index array). This parallels **`set:`** / **`set=`** with no value matching printings with a non-empty normalized set code: here, **`otag:`** / **`otag=`** with no value matches every face that has **≥1** oracle tag in the loaded object; **`atag:`** / **`atag=`** matches every printing that has **≥1** illustration tag in the loaded map.

## Matching semantics (union)

- **`otag:`** — For **every** oracle tag key whose normalized key **starts with** the normalized user prefix, OR the face indices from that key’s array into the face buffer (`buf[face] = 1`). Duplicate indices across keys are idempotent.
- **`atag:`** / **`art:`** — Same for illustration tags over printing indices.

If **no** key matches (non-empty prefix with no hits), the leaf buffer stays all zeros — **no error** (same UX as `set:xyz` with no code prefix).

## Tag data not loaded

Unchanged from Spec 093: **`oracle tags not loaded`** / **`illustration tags not loaded`** when the corresponding ref is null.

## Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** call **`resolveForField`** for **`otag`** or **`atag`**. The AST value is passed through (trimmed) and interpreted as a prefix per this spec.
- **`resolveForField("otag", …)`** and **`resolveForField("atag", …)`** remain for **`toScryfallQuery`** and any other non-eval consumer that needs **unique-prefix** collapse to a single canonical label (Spec 103).

## Relation to Spec 159 (suggestions)

Bare-term and multi-word **suggestions** use **`key.toLowerCase().startsWith(slug)`** on hyphenated keys (Spec 159). **Evaluation** uses Spec 103 normalization (**hyphens removed** from keys and values). Typed queries and suggestion slugs can therefore differ slightly at the edge; aligning Spec 159 with `normalizeForResolution` is optional follow-up.

## Scryfall

Scryfall tag filters target **exact** (or effectively exact) labels. Frantic adds **prefix-on-normalized-key** discovery; documented in `app/src/docs/reference/scryfall/differences.mdx`.

## Acceptance criteria

1. **`otag:ramp`** with keys `ramp` and `ramp-artifact` matches faces tagged with **either** key (union).
2. **`otag:zzz`** with tags loaded matches **zero** faces, **no** leaf error (no `unknown tag`).
3. **`atag:`** prefix union and zero-hit behavior mirror **`otag:`** in the printing domain.
4. Normalization: e.g. user value that normalizes to the same prefix as a hyphenated key matches that key (e.g. `mana` prefixes `mana-rock` after both sides are normalized).
5. **`-otag:…`** / **`-atag:…`** still work via the existing NOT node.
6. **`otag:…` `t:creature`**, **`atag:…` `set:mh2`**, and **`art:`** alias behave as before aside from prefix/union semantics.
7. **Empty** **`otag:`** / **`otag=`** (trimmed) matches every face in **any** oracle tag array; empty **`atag:`** / **`atag=`** matches every printing in **any** illustration tag array.
8. **`resolveForField`** for **`otag`** / **`atag`** still used in **`canonicalize`** / Scryfall outlinks when context provides vocabularies.

## Implementation Notes

- 2026-03-31: Implemented prefix union evaluation in `eval-tags.ts`; evaluator passes trimmed AST values without `resolveForField` on the eval path. Spec 093 superseded for “unknown tag on missing label” by this spec’s zero-hit rule; Spec 103 amended for `otag`/`atag` exception alongside `set`.
