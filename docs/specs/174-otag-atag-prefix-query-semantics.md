# Spec 174: `otag:` / `atag:` query semantics (ADR-022)

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 093 (Evaluator Tag Query Support), Spec 103 (Categorical Field Value Auto-Resolution), Spec 159 (otag/atag bare-term prefix suggestions), ADR-022 (Categorical field operators)

## Goal

Align **`otag:`** (face domain) and **`atag:`** / **`art:`** (printing domain) **query evaluation** with [ADR-022](../adr/022-categorical-field-operators.md) and the same operator convention as [Spec 176](176-kw-keyword-prefix-query-semantics.md) / [Spec 182](182-prefix-union-format-frame-in-collector.md):

- **`:`** — **prefix union** after `normalizeForResolution`: every tag key whose normalized form **starts with** **`u`** contributes its face or printing indices (**OR**).
- **`=`** — **exact match** after `normalizeForResolution`: every key whose normalized form **equals** **`u`** contributes (**OR** if several wire keys normalize identically).
- **`!=`** — **Frantic extension:** negates the **positive mask built for `=`** (exact normalized match), not the **`:`** prefix union (use **`NOT`** / **`-`** to exclude a prefix union).

A **non-empty** value that matches **no** key under the active operator (**`:`** prefix vs **`=`** / **`!=`** exact positive mask) yields a **leaf error** with **passthrough** ([Spec 039](039-non-destructive-error-handling.md)): **`unknown oracle tag "…"`** (face / **`otag`** and aliases **`function`**, **`oracletag`**) and **`unknown illustration tag "…"`** (printing / **`atag`** and alias **`art`**). Use the **trimmed** user value inside the quotes.

## ADR-022 exception — empty value

When the trimmed user value is **empty**, **`otag:`** / **`otag=`** / **`atag:`** / **`atag=`** / **`art:`** / **`art=`** still match every face or printing that appears in **any** tag’s index array in the loaded data (same as pre-migration Spec 174). This **narrows** relative to “neutral all faces / all printings” (cf. empty **`kw:`** in Spec 176) and is an **explicit ADR-022 intentional exception** ([ADR-022](../adr/022-categorical-field-operators.md) §5): empty tag filters mean “has at least one tag in the loaded index,” not “no filter.”

**Empty `!=`:** Build the same positive mask as empty **`:`** / **`=`** (union over all keys — faces or printings with **≥1** tag), then **invert** in domain so **`otag!=`** / **`atag!=`** with empty value matches entities with **no** tags in the loaded index.

## Background

Historically, **`otag:`** / **`atag:`** used **prefix union for both `:` and `=`** and returned **zero** matches with **no** error when no key matched. That diverged from ADR-022 and from **`set:`** / **`kw:`**. This spec **migrates** tags to the shared categorical operator model.

## Operators

**`:`**, **`=`**, and **`!=`** are supported. Any other operator yields **`otag: requires :, =, or != operator`** / **`atag: requires :, =, or != operator`**.

## Normalization

Use **Spec 103** `normalizeForResolution` on:

- the user value (after **trim** for empty detection and for the quoted substring in errors), and  
- each **wire key** in oracle tag data / illustration tag map.

**Precomputation (performance):** Build a prepared eval index when constructing the tag ref (worker / CLI), storing **`normKey`** per wire key **once**. Per-query, normalize the user value **once** → **`u`**; compare with **`startsWith`** / **`===`** only — **do not** call **`normalizeForResolution`** on every wire key inside the hot eval loop. Observational equivalence: cached **`normKey`** must equal **`normalizeForResolution(wireKey)`** for each entry.

Let **`trimmed`** be the value after **trim**. For **non-empty** **`trimmed`**, let **`u = normalizeForResolution(trimmed)`**.

- **`:` (prefix):** A wire key **matches** when **`normKey.startsWith(u)`**.
- **`=` (exact):** A wire key **matches** when **`normKey === u`**.
- **`!=`:** Compute the **exact `=`** positive face or printing set; the leaf’s buffer is **all ones** in domain, then clear indices that appear in that positive set (invert **`=`** only).

If **no** key matches for **`:`** or **`=`** (non-empty), return **`unknown oracle tag "${trimmed}"`** or **`unknown illustration tag "${trimmed}"`**. For **`!=`**, if the **exact `=`** positive set is **empty** (no key equals **`u`**), return the same **unknown** error (same family as **`unknown frame`** for impossible **`frame!=`**).

## Matching semantics (union for `:` / `=`)

- **`otag:`** / **`otag=`** — For **every** matching oracle tag key under the active rule, OR face indices into **`buf`**.
- **`atag:`** / **`atag=`** / **`art:`** / **`art=`** — Same for illustration tags over printing indices.

Duplicate indices across keys are idempotent.

## Tag data not loaded

Unchanged from Spec 093: **`oracle tags not loaded`** / **`illustration tags not loaded`** when the corresponding ref is null.

## Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** call **`resolveForField`** for **`otag`** or **`atag`**. The AST **operator** selects prefix vs exact vs **`!=`** per this spec.
- **`resolveForField("otag", …)`** and **`resolveForField("atag", …)`** remain for **`toScryfallQuery`** and any other non-eval consumer that needs **unique-prefix** collapse to a single canonical label (Spec 103).

## Relation to Spec 159 (suggestions)

Bare-term and multi-word **suggestions** use **`key.toLowerCase().startsWith(slug)`** on hyphenated keys (Spec 159). **Evaluation** uses Spec 103 normalization (**hyphens removed** from keys and values). Typed queries and suggestion slugs can therefore differ slightly at the edge; aligning Spec 159 with `normalizeForResolution` is optional follow-up.

## Scryfall

Scryfall tag filters target **exact** (or effectively exact) labels. Frantic documents **`:`** vs **`=`** vs **`!=`** and prefix discovery in `app/src/docs/reference/scryfall/differences.mdx`.

## Acceptance criteria

1. **`otag:ramp`** with keys `ramp` and `ramp-artifact` matches faces tagged with **either** key (prefix union).
2. **`otag=ramp`** matches only keys whose **normalized** form **equals** **`ramp`** (exact); does **not** match **`ramp-artifact`** unless a separate key normalizes to **`ramp`**.
3. **`otag:zzz`** with tags loaded → **`unknown oracle tag "zzz"`** (passthrough), not silent zero-hit.
4. **`otag=zzz`** with no key normalizing to **`zzz`** → **`unknown oracle tag "zzz"`**.
5. **`atag:`** / **`atag=`** / **`atag!=`** mirror **`otag`** behavior in the printing domain with **`unknown illustration tag "…"`**.
6. **`otag!=ramp`** with a **`ramp`** key: faces **without** that exact normalized tag match (invert exact **`ramp`** mask). **`otag!=zzz`** when no key is exactly **`zzz`** → **`unknown oracle tag "zzz"`**.
7. Normalization: e.g. **`mana`** prefixes **`mana-rock`** under **`:`**; **`otag=mana`** errors or matches only an exact **`mana`** key, not **`mana-rock`**, per **`=`** rules.
8. **`-otag:…`** / **`-atag=…`** still work via the existing NOT node.
9. **`otag:…` `t:creature`**, **`atag:…` `set:mh2`**, and **`art:`** alias share **`atag`** semantics.
10. **Empty** **`otag:`** / **`otag=`** (trimmed) matches every face in **any** oracle tag array; empty **`atag:`** / **`atag=`** matches every printing in **any** illustration tag array (**ADR-022 §5 exception**).
11. **`resolveForField`** for **`otag`** / **`atag`** still used in **`canonicalize`** / Scryfall outlinks when context provides vocabularies.
12. **`otag:xyz t:creature`** with invalid tag: same card set as **`t:creature`** alone (passthrough, Spec 039).
13. Eval does **not** re-normalize every wire key on every evaluation; prepared index is built at ref construction.

## Implementation Notes

- 2026-03-31 (historical): Prefix union only for both operators; unknown non-empty → silent zero-hit.
- 2026-04-02 (historical): Clarified contrast with Spec 047 / 179 for silent zero-hit.
- 2026-04-04: **Migrated to ADR-022:** **`:`** / **`=`** split, **`!=`** negates **`=`**, **`unknown oracle tag`** / **`unknown illustration tag`** on non-match; precomputed **`normKey`** per wire key; empty **≥1 tag** behavior retained as **ADR-022 §5** exception. Implemented in **`eval-tags.ts`**; **`TagDataRef`** carries prepared indices; worker / CLI attach indices when loading tag JSON.
