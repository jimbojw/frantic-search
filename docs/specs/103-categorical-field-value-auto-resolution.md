# Spec 103: Categorical Field Value Auto-Resolution

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 032 (`is:` / `not:` prefix evaluation exception — Spec 032 § Value resolution), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 058 (View Mode Query Term), Spec 072 (in: Query Qualifier), Spec 104 (Bonus Rarity Tier), Spec 174 (`otag` / `atag` prefix evaluation exception), Spec 176 (`kw` / `keyword` prefix evaluation exception), Spec 179 (`set_type:`), Spec 182 (`frame:` operator split), ADR-022 (Categorical field operators — eval vs canonicalize split)

**GitHub Issue:** [#111](https://github.com/jimbojw/frantic-search/issues/111)

## Goal

For all categorical fields, automatically resolve abbreviated values to the full field value when there is **exactly one** candidate that matches the typed prefix. This allows `view:i` to behave as `view:images`, `f:c` as `f:commander`, `set:9` as `set:9ED`, and similar shorthand without requiring users to type full values.

## Background

Currently, terms like `view:i` have no effect because Frantic Search only recognizes full field values (`slim`, `detail`, `images`, `full`). The same applies to `unique:a`, `set:9`, `f:c`, `f:e`, and other categorical fields. Users must type complete values or rely on autocomplete (Spec 089).

Scryfall and many CLI tools support prefix-based auto-resolution: when a prefix uniquely identifies a value, it is accepted. This spec brings Frantic Search in line with that expectation.

## Design

### 1. Resolution rule

For fields that accept a **closed set** of values (categorical fields), when the user provides a value for the `:` or `=` operator:

1. **Normalize** the typed value and all candidate values: lowercase, remove punctuation and whitespace.
2. **Match**: A candidate matches if the normalized candidate **starts with** the normalized typed value.
3. **Resolve**: If exactly one candidate matches, treat the term as if the user had typed that full value. Otherwise, do not resolve (existing validation applies).

### 2. Normalization

```typescript
function normalizeForResolution(s: string): string {
  return normalizeAlphanumeric(s);  // NFD + strip diacritics + lowercase + [a-z0-9]
}
```

- Lowercase for case-insensitivity.
- Strip punctuation and whitespace so `"9ED"` and `"9 ed"` both normalize to `"9ed"`, and `"9"` matches as a prefix.

### 3. Categorical fields and candidate sources

| Field(s) | Candidate source | Build-time / Runtime |
|----------|------------------|----------------------|
| `view`, `v` | `VIEW_MODES` (`slim`, `detail`, `images`, `full`) | Build-time |
| `unique` | `["cards", "prints", "art"]` | Build-time |
| `sort` | Keys of `SORT_FIELDS` | Build-time |
| `include` | `["extras"]` | Build-time |
| `legal`, `f`, `format`, `banned`, `restricted` | Keys of `FORMAT_NAMES` | Build-time |
| `rarity`, `r` | Keys of `RARITY_NAMES` (Spec 104 adds `bonus` as distinct tier) | Build-time |
| `game` | Keys of `GAME_NAMES` | Build-time |
| `frame` | Keys of `FRAME_NAMES` | Build-time |
| `is` | Supported keywords (face + printing) from `eval-is.ts` | Build-time |
| `set`, `s`, `e`, `edition` | `PrintingIndex.knownSetCodes` | Runtime |
| `in` | **Union** of game names, set codes, and rarity names (see §4) | Runtime |
| `otag` | Oracle tag vocabulary (when loaded) | Runtime |
| `atag`, `art` | Illustration tag vocabulary (when loaded) | Runtime |
| `kw`, `keyword` | Keys of `keywords_index` (when loaded) | Runtime |

### 4. Special case: `in:`

The `in:` qualifier disambiguates by value type: **game** → **set** → **rarity** (Spec 072). For auto-resolution, the candidate set is the **union** of all three namespaces:

- Game names: keys of `GAME_NAMES` (`paper`, `mtgo`, `arena`, `astral`, `sega`)
- Set codes: `PrintingIndex.knownSetCodes`
- Rarity names: keys of `RARITY_NAMES` (includes `bonus` per Spec 104)

**Resolution rule for `in:`:** Resolve only when there is exactly one matching value **across the entire union**. It is necessary but **not sufficient** for there to be exactly one match within a single namespace (game, set, or rarity).

Examples:

- `in:a` — If only `arena` (game) matches across game + set + rarity → resolve to `arena`.
- `in:a` — If both `arena` (game) and `a25` (set) match → two matches → **no resolution**.
- `in:9` — If only `9ed` (set) matches → resolve to `9ed`.

### 5. Implementation approach: Resolve at lookup time

Apply resolution **at each evaluation site** when a categorical field value is looked up. The AST is never mutated; it always reflects what the user typed.

**Benefits:**
- The query breakdown shows the user's typed value (e.g. `v:i`), not the resolved form (`v:images`). Same for `reconstructQuery` when clicking chips.
- The AST stays as the parser's source of truth; resolution is semantic interpretation in the evaluator layer.
- No new AST fields or normalization pass to maintain.

**Mechanics:** Each lookup site (eval-leaves, eval-printing for fields **other than** `set`, `set_type`, `frame`, and **legalities** (`legal` / `banned` / `restricted`), evaluator branches for view/unique/include/sort, extractViewMode, getUniqueModeFromAst, canonicalize) calls `resolveCategoricalValue` / `resolveForField` before doing its lookup where applicable. If resolution returns a value, use it for the lookup; otherwise use the original value. When resolution context is absent (e.g. before printings load), runtime fields (`set`, `in`, `otag`, `atag`, `kw`, `keyword`) skip resolution and retain the typed value — **except** that **`otag` / `atag` query evaluation** does not use `resolveForField` at all (Spec 174), **`kw` / `keyword` query evaluation** does not use `resolveForField` at all (Spec 176), **`is` / `not` query evaluation** does not use `resolveForField` for semantic matching (Spec 032), and **legalities query evaluation** does not use `resolveForField` for semantic matching (Spec 182); only non-eval sites such as **canonicalize** call `resolveForField` for those fields.

**Exception — `set` query evaluation (Spec 047, [issue #234](https://github.com/jimbojw/frantic-search/issues/234)):** The printing-domain **`set`** leaf does **not** use `resolveForField` before semantic matching. The AST **operator** selects **prefix** (**`:`**) vs **exact** (**`=`**) on **precomputed** normalized set codes per printing row (Spec 047 / Spec 182 performance). Short or ambiguous tokens with **`:`** (e.g. `set:u`) intentionally match **many** printings for discovery; they are **not** collapsed to a single code when that code would be uniquely resolvable from `knownSetCodes`. A **non-empty** trimmed value with **no** printing matching under the active operator yields **`unknown set "…"`** with passthrough (Spec 039). Empty **`=`** is neutral (all printings). **`resolveForField("set", …)`** remains used for **canonicalize** (`toScryfallQuery`) and any other non-eval sites that need unique-prefix resolution to a full code.

**Exception — `frame` query evaluation (Spec 047 / Spec 182):** The printing-domain **`frame`** leaf does **not** use `resolveForField` before semantic matching. The AST **operator** selects **prefix** (**`:`**) vs **exact** (**`=`**) vs **`!=`** (negation of **`=`** exact mask only) on **precomputed** normalized keys of **`FRAME_NAMES`** (build-time vocabulary). **`:`** ORs the frame bits for every key whose normalized form **starts with** **`u`**; **`=`** ORs bits for keys with **normalized equality** to **`u`**; **`!=`** uses the same **`combinedBit`** as **`=`** and matches printings with **no** overlap. A **non-empty** trimmed value with **no** key matching for **`:`** / **`=`** / **`!=`** positive mask yields **`unknown frame "…"`** with passthrough (Spec 039). Empty **`frame:`** / **`frame=`** / **`frame!=`** are neutral (all printings), same as **`kw:`** / **`keyword:`** (Spec 176). **`resolveForField("frame", …)`** remains for **canonicalize** and other non-eval consumers that need unique-prefix resolution when exactly one candidate matches.

**Exception — legalities query evaluation (Spec 182):** Face-domain **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** leaves do **not** use `resolveForField` before semantic matching. The AST **operator** selects **prefix** (**`:`**) vs **exact** (**`=`**) vs **`!=`** (negation of **`=`** exact mask only) on **precomputed** normalized keys of **`FORMAT_NAMES`**. **`:`** ORs legality bits for every key whose normalized form **starts with** **`u`**; **`=`** ORs bits for keys with **normalized equality** to **`u`**; **`!=`** uses the same **`combinedBit`** as **`=`** and matches faces with **no** overlap on the active column (**legal** / **banned** / **restricted**). A **non-empty** trimmed value with **no** key matching for **`:`** / **`=`** / **`!=`** positive mask yields **`unknown format "…"`** with passthrough (Spec 039). Empty **`=`** / **`!=`** / **`:`** are neutral (all faces in the leaf). **`resolveForField`** for **`legal`**, **`f`**, **`format`**, **`banned`**, **`restricted`** remains for **canonicalize** and other non-eval consumers that need unique-prefix resolution when exactly one candidate matches.

**Exception — `otag` / `atag` query evaluation (Spec 174):** Face-domain **`otag:`** and printing-domain **`atag:`** / **`art:`** leaves do **not** use `resolveForField` before matching. They apply **normalized prefix** matching over **all** tag keys in the loaded index and **union** matching face or printing indices. A prefix that matches no key yields **zero** results with **no** leaf error (no `unknown tag`). **`resolveForField("otag", …)`** and **`resolveForField("atag", …)`** remain for **canonicalize** and other non-eval consumers that need unique-prefix resolution to a single label.

**Exception — `kw` / `keyword` query evaluation (Spec 176):** Face-domain **`kw:`** / **`keyword:`** / **`kw=`** / **`keyword=`** leaves do **not** use `resolveForField` before matching. The AST **operator** selects **prefix** (**`:`**) vs **exact** (**`=`**) on normalized index keys; matching keys **union** face indices. A **non-empty** value that matches **no** key under that operator yields **`unknown keyword "…"`** with **passthrough** (Spec 039), same family as **`set:`** / **`set_type:`** (Spec 047 / 179); unlike **`otag:`** / **`atag:`** (Spec 174), which stay silent zero-hit when no key matches. **`resolveForField("kw", …)`** and **`resolveForField("keyword", …)`** remain for **canonicalize** and other non-eval consumers that need unique-prefix resolution to a single keyword string.

**Exception — `is` / `not` query evaluation (Spec 032):** **`is:`** and **`not:`** leaves do **not** use `resolveForField` for **semantic** matching. They apply **normalized prefix** matching over the closed **`is:`** vocabulary (`IS_KEYWORDS`) and **union** per Spec 032 (face and/or printing domain). A **non-empty** value that matches **no** vocabulary keyword yields **`unknown keyword "…"`** with **passthrough** (Spec 039). **`resolveForField("is", …)`** remains for **canonicalize** and other non-eval consumers that need unique-prefix resolution to a single keyword string when exactly one candidate matches.

### 6. Resolution helper

```typescript
/**
 * @param typed - The value as typed by the user
 * @param candidates - Iterable of valid values for this field
 * @returns The single matching candidate, or null if 0 or 2+ matches
 */
function resolveCategoricalValue(
  typed: string,
  candidates: Iterable<string>,
  normalize: (s: string) => string = normalizeForResolution
): string | null
```

Logic: normalize `typed`, iterate candidates, collect those where `normalize(candidate).startsWith(normalizedTyped)`. If length === 1, return that candidate; else return null.

### 7. Error handling

- **No resolution (0 or 2+ matches):** Existing behavior applies for categorical fields that still validate against a closed set at lookup sites that use **`resolveForField`** before eval. **Legalities evaluation** (Spec 182): a **non-empty** value that matches **no** vocabulary key under **`:`** (prefix) or **`=`** / **`!=`** (exact positive mask) yields **`unknown format "…"`** (passthrough, Spec 039). **`set` evaluation** (Spec 047): a **non-empty** value that matches **no** printing under the active operator (**`:`** prefix vs **`=`** exact) yields **`unknown set "…"`** (passthrough, Spec 039). **`set_type` / `st:`** (Spec 179): same with **`unknown set_type "…"`**. **`frame` evaluation** (Spec 047 / 182): a **non-empty** value that matches **no** vocabulary key under the active operator yields **`unknown frame "…"`** (passthrough, Spec 039). **`otag` / `atag` evaluation** (Spec 174): a prefix that matches no tag key yields **zero** faces or printings, not `unknown tag`. **`kw` / `keyword` evaluation** (Spec 176): when **no** keyword key matches under the active operator — **prefix** for **`:`**, **exact** for **`=`** — (non-empty value), the leaf errors with **`unknown keyword "…"`** (passthrough, Spec 039). **`is` / `not` evaluation** (Spec 032): when **no** `is:` vocabulary keyword matches the normalized prefix (non-empty value), the leaf errors with **`unknown keyword "…"`** (passthrough, Spec 039).
- **Resolved value:** The term is evaluated as if the user had typed the full value. No special error handling; resolution is transparent.

### 8. Display and canonicalization

- **Query breakdown:** The breakdown shows the user's typed value (e.g. `v:i`) because the AST is never mutated. `leafLabel` in worker-search builds `field + operator + value` from the AST; `value` stays as typed. The `@@`, `++`, and `**` aliases already use `sourceText` for display and are unaffected.
- **reconstructQuery:** When the user clicks a chip, the query is reconstructed from the breakdown labels, which reflect the typed form. No expansion needed.
- **extractViewMode, getUniqueModeFromAst:** These walk the AST and must call `resolveCategoricalValue` before validating, so `v:i` resolves to `images` for display-mode selection.
- **canonicalize:** When building Scryfall outlinks, resolve categorical values before serializing so the outlink uses canonical values (e.g. `f:commander` not `f:c`). `view:` and similar modifiers are stripped per existing behavior.
- **Scryfall outlinks:** `canonicalize` strips `view:`, etc. The resolved value is used only when serializing filter terms; the modifier strip remains unchanged.

## Scope of changes

| File | Change |
|------|--------|
| `shared/src/search/categorical-resolve.ts` (new) | `normalizeForResolution`, `resolveCategoricalValue`, `resolveForField(field, value, context)` — registry of field → candidate source + resolution. Export `ResolutionContext` type for runtime data. |
| `shared/src/search/eval-leaves.ts` | **Legalities** (`legal` / `banned` / `restricted`): no `resolveForField` on the eval path — operator-selected prefix / exact / `!=` on precomputed normalized **`FORMAT_NAMES`** keys (Spec 182). |
| `shared/src/search/eval-printing.ts` | Before **rarity** / **game** / **in** lookup: `resolveForField`; use resolved value. **`set`** / **`set_type`** use operator-selected prefix or exact on precomputed normalized row strings (no `resolveForField` in the leaf; Specs 047 / 179). **`frame`** uses operator-selected prefix or exact on precomputed normalized **`FRAME_NAMES`** keys (no `resolveForField` in the leaf; Specs 047 / 182). |
| `shared/src/search/evaluator.ts` | Before view/unique/include/sort branches: resolve; use resolved value. |
| `shared/src/search/canonicalize.ts` | When serializing FIELD nodes, resolve categorical values before emitting. |
| `app/src/view-query.ts` | In `extractViewMode`, resolve view values before `isValidViewValue` check. |
| `app/src/worker-search.ts` | Pass `ResolutionContext` (knownSetCodes, tag vocabularies) when invoking runSearch; evaluator receives it. |
| `cli/` | Pass minimal context (no printings) for CLI; build-time fields still resolve. |

## Acceptance criteria

1. `view:i` and `v:i` produce the same behavior as `view:images` and `v:images`.
2. `unique:a` produces the same behavior as `unique:art`.
3. `set:9` matches every printing whose normalized set code starts with `9` (Spec 047). `set=9ed` matches only printings whose normalized code **equals** that form (exact). **`resolveForField("set", …)`** for canonicalize may still resolve short values when unique.
4. **`resolveForField("legal", "c")`** (and canonicalize when unique) may still resolve to **`commander`** when **`commander`** is the sole matching **`FORMAT_NAMES`** key for the prefix. **Evaluation** **`f:c`** ORs bits for **every** key whose normalized form starts with **`c`** (Spec 182 prefix union) — wider than unique-prefix resolution when multiple keys share a prefix (e.g. **`f:p`** ORs pioneer, pauper, penny, predh).
5. **`resolveForField("legal", "e")`** may resolve to **`edh`** when unique; **evaluation** **`f=e`** matches exact normalized key **`edh`** (and **`f=commander`** matches **`commander`**); alias keys OR to the same bit when normalized forms match.
6. `rarity:r` produces the same behavior as `rarity:rare` (when `r` is the only rarity prefix match).
7. `game:a` produces the same behavior as `game:arena`.
8. `in:a` resolves to `arena` only when `arena` is the sole match across game + set + rarity.
9. `in:a` does **not** resolve when both `arena` (game) and `a25` (set) match.
10. `set:xyz` or `set=xyz` with no printing matching under the active operator yields **`unknown set "xyz"`** with passthrough (Spec 047 / [issue #234](https://github.com/jimbojw/frantic-search/issues/234)).
11. When multiple **`FORMAT_NAMES`** keys match a typed prefix, **`resolveForField`** does not resolve (canonicalize keeps abbreviated form or passes through). **Evaluation** **`f:p`** (Spec 182) ORs legality bits for **all** matching keys — **not** an error.
12. Normalization strips punctuation/whitespace: `set:9ED` and `set:9 ed` both match `9ed` when that is the only candidate.
13. The query breakdown chip displays `v:i` when the user types `v:i`, not `v:images`. Same for all categorical fields — the chip shows the user's typed value.
14. **`otag:`** / **`atag:`** evaluation uses prefix union per Spec 174; no `unknown tag` when the prefix matches no key (zero results).
15. **`kw:`** / **`keyword:`** / **`kw=`** / **`keyword=`** evaluation uses Spec 176 (**`:`** prefix union, **`=`** exact); when no key matches a non-empty value under that operator, **`unknown keyword`** with passthrough (Spec 039).
16. **`is:`** / **`not:`** evaluation uses prefix union per Spec 032; when no vocabulary keyword matches a non-empty prefix, **`unknown keyword`** with passthrough (Spec 039).
17. **`frame:`** / **`frame=`** / **`frame!=`** evaluation (Spec 047 / 182) does **not** use **`resolveForField`** for semantic matching; **`:`** ORs **`FRAME_NAMES`** bits for every key whose normalized form starts with **`u`**; **`=`** uses normalized exact key match; **`!=`** negates that exact mask. Non-empty no match → **`unknown frame "…"`** (passthrough). Empty **`frame:`** / **`frame=`** / **`frame!=`** neutral (all printings). **`resolveForField("frame", …)`** remains for canonicalize when unique.
18. **`frame:2`** ORs frame bits for **`1997`**, **`2003`**, and **`2015`** (normalized keys starting with **`2`**). **`frame=2`** yields **`unknown frame`** (no exact vocabulary key).
19. **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** evaluation (Spec 182) does **not** use **`resolveForField`** for semantic matching; **`:`** ORs **`FORMAT_NAMES`** bits for prefix matches; **`=`** uses normalized exact key match; **`!=`** negates that exact mask. Non-empty no match → **`unknown format "…"`** (passthrough). Empty **`=`** / **`!=`** / **`:`** neutral. **`f!=standard`** inverts the exact **`f=standard`** mask, not **`f:standard`** prefix union. **`resolveForField`** remains for canonicalize when unique.

## Out of scope

- Auto-expanding the query bar display to show resolved values (e.g. `view:i` → `view:images`).
- Autocomplete changes (Spec 089); resolution is independent.
- Open-ended fields (`name`, `oracle`, `type`, etc.) — no resolution; substring match semantics unchanged.
