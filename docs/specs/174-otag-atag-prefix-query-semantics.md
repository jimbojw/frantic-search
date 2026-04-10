# Spec 174: `otag:` / `atag:` query semantics (ADR-022)

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 093 (Evaluator Tag Query Support), Spec 103 (Categorical Field Value Auto-Resolution), Spec 159 (otag/atag bare-term prefix suggestions), ADR-022 (Categorical field operators)

## Goal

Align **`otag:`** (face domain) and **`atag:`** / **`art:`** (printing domain) **query evaluation** with [ADR-022](../adr/022-categorical-field-operators.md) and the same operator convention as [Spec 176](176-kw-keyword-prefix-query-semantics.md) / [Spec 182](182-prefix-union-format-frame-in-collector.md):

- **`:`** — **prefix union** after **tag normalization** (see below): every tag key that **matches** under the **boundary-aligned prefix** rule contributes its face or printing indices (**OR**). This is **not** the same as full-string `startsWith` on [Spec 103](103-categorical-field-value-auto-resolution.md) `normalizeForResolution` (which strips hyphens and caused spurious matches; see [GitHub #253](https://github.com/jimbojw/frantic-search/issues/253)).
- **`=`** — **exact match** after tag normalization on the **full** wire key: every key whose **`normKey`** **equals** **`u`** contributes (**OR** if several wire keys normalize identically).
- **`!=`** — **Frantic extension:** negates the **positive mask built for `=`** (exact tag-normalized match), not the **`:`** prefix union (use **`NOT`** / **`-`** to exclude a prefix union).

A **non-empty** value that matches **no** key under the active operator (**`:`** prefix vs **`=`** / **`!=`** exact positive mask) yields a **leaf error** with **passthrough** ([Spec 039](039-non-destructive-error-handling.md)): **`unknown oracle tag "…"`** (face / **`otag`** and aliases **`function`**, **`oracletag`**) and **`unknown illustration tag "…"`** (printing / **`atag`** and alias **`art`**). Use the **trimmed** user value inside the quotes.

## ADR-022 exception — empty value

When the trimmed user value is **empty**, **`otag:`** / **`otag=`** / **`atag:`** / **`atag=`** / **`art:`** / **`art=`** still match every face or printing that appears in **any** tag’s index array in the loaded data (same as pre-migration Spec 174). This **narrows** relative to “neutral all faces / all printings” (cf. empty **`kw:`** in Spec 176) and is an **explicit ADR-022 intentional exception** ([ADR-022](../adr/022-categorical-field-operators.md) §5): empty tag filters mean “has at least one tag in the loaded index,” not “no filter.”

**Empty `!=`:** Build the same positive mask as empty **`:`** / **`=`** (union over all keys — faces or printings with **≥1** tag), then **invert** in domain so **`otag!=`** / **`atag!=`** with empty value matches entities with **no** tags in the loaded index.

## Background

Historically, **`otag:`** / **`atag:`** used **prefix union for both `:` and `=`** and returned **zero** matches with **no** error when no key matched. That diverged from ADR-022 and from **`set:`** / **`kw:`**. This spec **migrates** tags to the shared categorical operator model.

Tag labels are **hyphenated slugs** (e.g. `mana-rock`, `death-trigger`). Using global **`normalizeForResolution`** (alphanumeric only, **hyphens stripped**) for **`:`** made tokens such as `on-` collapse to `on` and incorrectly match unrelated tags (`one-off`, `one-sided-fight`). Tag evaluation therefore uses a dedicated **tag normalizer** that **preserves ASCII hyphens** and **`:`** uses **boundary-aligned** prefix matching so discovery aligns with hyphen boundaries, not arbitrary in-word substrings.

## Operators

**`:`**, **`=`**, and **`!=`** are supported. Any other operator yields **`otag: requires :, =, or != operator`** / **`atag: requires :, =, or != operator`**.

## Tag normalization

**Do not** use Spec 103 **`normalizeForResolution`** (i.e. **`normalizeAlphanumeric`**) for oracle or illustration **tag keys** or for **user values** in tag eval. That strips hyphens and breaks tag semantics ([#253](https://github.com/jimbojw/frantic-search/issues/253)).

Instead use **`normalizeForTagResolution`** (name in code may match): Unicode **NFD**, strip combining diacritics, **ASCII lowercase**, then keep **`[a-z0-9-]`** only (hyphen **U+002D** preserved; strip other punctuation and whitespace). Implementation lives alongside **`normalizeAlphanumeric`**; it is the single normalizer for both **wire keys** and **typed values** in this spec.

**Precomputation (performance):** Build a prepared eval index when constructing the tag ref (worker / CLI), storing **`normKey`** per wire key **once** with **`normalizeForTagResolution`**. Per-query, compute **`u = normalizeForTagResolution(trimmed)`** once. Compare using the rules below — **do not** re-normalize every wire key inside the hot eval loop. Observational equivalence: cached **`normKey`** must equal **`normalizeForTagResolution(wireKey)`** for each entry.

Let **`trimmed`** be the value after **trim**. For **non-empty** **`trimmed`**, let **`u = normalizeForTagResolution(trimmed)`**.

## Matching rules (non-empty value)

Let **`T`** be a candidate wire key’s **`normKey`**.

### `:` (boundary-aligned prefix union)

A wire key **matches** when there exists an index **`i`** in **`T`** such that **`i === 0` or `T[i - 1] === '-'`**, and **`T.slice(i).startsWith(u)`**.

Intuition: **hyphen** separates **word boundaries**; the query must match as a **prefix** starting at the beginning of the full tag **or** at the start of any hyphen-separated segment. It must **not** match starting in the middle of a segment (no in-word “substring” discovery).

Examples (oracle tags; same for **`atag:`**):

- **`otag:on-`** does **not** match tags whose only connection is a stripped-key prefix like `one-off` / `one-sided-fight` (previously buggy under alphanumeric-only normalization).
- **`otag:mana-r`** matches **`mana-ramp`** (prefix from boundary `i = 0`).
- **`otag:mana-r`** does **not** match a sole **`mana`** key (too short for prefix `mana-r`).
- **`otag:trigger`** matches **`death-trigger`** (prefix from boundary before **`trigger`**).
- **`otag:ana`** does **not** match **`mana`** (would require starting inside the segment **`mana`**).
- **`otag:amp`** does **not** match **`ramp`**, **`mana-ramp`**, etc. (no boundary-aligned prefix **`amp`**).

### `=` (exact)

A wire key **matches** when **`normKey === u`** (full slug equality after tag normalization).

### `!=`

Compute the **exact `=`** positive face or printing set; the leaf’s buffer is **all ones** in domain, then clear indices that appear in that positive set (invert **`=`** only).

If **no** key matches for **`:`** or **`=`** (non-empty), return **`unknown oracle tag "${trimmed}"`** or **`unknown illustration tag "${trimmed}"`**. For **`!=`**, if the **exact `=`** positive set is **empty** (no key equals **`u`**), return the same **unknown** error (same family as **`unknown frame`** for impossible **`frame!=`**).

## Matching semantics (union for `:` / `=`)

- **`otag:`** / **`otag=`** — For **every** matching oracle tag key under the active rule, OR face indices into **`buf`**.
- **`atag:`** / **`atag=`** / **`art:`** / **`art=`** — Same for illustration tags over printing indices.

Duplicate indices across keys are idempotent.

## Tag data not loaded

Unchanged from Spec 093: **`oracle tags not loaded`** / **`illustration tags not loaded`** when the corresponding ref is null.

## Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** call **`resolveForField`** for **`otag`** or **`atag`**. The AST **operator** selects boundary-aligned prefix vs exact vs **`!=`** per this spec.
- **`resolveForField("otag", …)`** and **`resolveForField("atag", …)`** remain for **`toScryfallQuery`** and any other non-eval consumer that needs **unique-prefix** collapse to a single canonical label (Spec 103). Those paths must use **tag-normalized** candidates and **`normalizeForTagResolution`** for comparison (aligned with this spec), not global **`normalizeForResolution`**.

## Relation to Spec 159 (suggestions)

Bare-term and multi-word **suggestions** use **`key.toLowerCase().startsWith(slug)`** on hyphenated wire keys (Spec 159). **Evaluation** uses **`normalizeForTagResolution`** and **boundary-aligned** **`:`** matching as above. Suggestion slugs are already lowercase prefix checks on full keys; they remain consistent with hyphen-preserving tags. Optional follow-up: tighten suggestion ordering or matching to mirror boundary semantics exactly.

## Scryfall

Scryfall tag filters target **exact** (or effectively exact) labels. Frantic documents **`:`** vs **`=`** vs **`!=`** and discovery in `app/src/docs/reference/scryfall/differences.mdx`.

## Acceptance criteria

1. **`otag:ramp`** with keys `ramp` and `ramp-artifact` matches faces tagged with **either** key (prefix union at boundary `i = 0`).
2. **`otag=ramp`** matches only keys whose **`normKey`** **equals** **`ramp`** (exact); does **not** match **`ramp-artifact`** unless a separate key normalizes to **`ramp`**.
3. **`otag:zzz`** with tags loaded → **`unknown oracle tag "zzz"`** (passthrough), not silent zero-hit.
4. **`otag=zzz`** with no key equal to **`zzz`** after tag normalization → **`unknown oracle tag "zzz"`**.
5. **`atag:`** / **`atag=`** / **`atag!=`** mirror **`otag`** behavior in the printing domain with **`unknown illustration tag "…"`**.
6. **`otag!=ramp`** with a **`ramp`** key: faces **without** that exact **`normKey`** match (invert exact **`ramp`** mask). **`otag!=zzz`** when no key equals **`zzz`** → **`unknown oracle tag "zzz"`**.
7. **Boundary-aligned `:`:** **`otag:mana-r`** matches **`mana-ramp`**; does **not** match **`mana`** alone. **`otag:trigger`** matches **`death-trigger`**. **`otag:ana`** does **not** match **`mana`**. **`otag:amp`** does **not** match **`ramp`** or **`mana-ramp`**.
8. **[#253](https://github.com/jimbojw/frantic-search/issues/253):** **`otag:on-`** does **not** spuriously match tags such as **`one-off`** / **`one-sided-fight`** solely because a hyphen-stripped prefix would match **`on`**.
9. **`otag=mana`** errors or matches only an exact **`mana`** key, not **`mana-rock`**, per **`=`** rules.
10. **`-otag:…`** / **`-atag=…`** still work via the existing NOT node.
11. **`otag:…` `t:creature`**, **`atag:…` `set:mh2`**, and **`art:`** alias share **`atag`** semantics.
12. **Empty** **`otag:`** / **`otag=`** (trimmed) matches every face in **any** oracle tag array; empty **`atag:`** / **`atag=`** matches every printing in **any** illustration tag array (**ADR-022 §5 exception**).
13. **`resolveForField`** for **`otag`** / **`atag`** still used in **`canonicalize`** / Scryfall outlinks when context provides vocabularies, using tag normalization per Spec 103 alignment.
14. **`otag:xyz t:creature`** with invalid tag: same card set as **`t:creature`** alone (passthrough, Spec 039).
15. Eval does **not** re-normalize every wire key on every evaluation; prepared index is built at ref construction.

## Implementation Notes

- 2026-03-31 (historical): Prefix union only for both operators; unknown non-empty → silent zero-hit.
- 2026-04-02 (historical): Clarified contrast with Spec 047 / 179 for silent zero-hit.
- 2026-04-04: **Migrated to ADR-022:** **`:`** / **`=`** split, **`!=`** negates **`=`**, **`unknown oracle tag`** / **`unknown illustration tag`** on non-match; precomputed **`normKey`** per wire key; empty **≥1 tag** behavior retained as **ADR-022 §5** exception. Implemented in **`eval-tags.ts`**; **`TagDataRef`** carries prepared indices; worker / CLI attach indices when loading tag JSON.
- 2026-04-10: **Tag normalization** (**`normalizeForTagResolution`**, hyphens preserved) replaces Spec 103 **`normalizeForResolution`** for tag keys and values. **`:`** uses **boundary-aligned prefix union** per § Matching rules. Motivation: [GitHub #253](https://github.com/jimbojw/frantic-search/issues/253). Breakdown prefix-branch hints use **`..`** range notation for collapsed runs where **`:`** candidates may contain hyphens ([Spec 181](181-breakdown-prefix-branch-hint.md)).
