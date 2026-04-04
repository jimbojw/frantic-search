# Spec 181: Query breakdown prefix-branch hint

**Status:** Draft

**References:** [GitHub #177](https://github.com/jimbojw/frantic-search/issues/177)

**Depends on:** [ADR-022](../adr/022-categorical-field-operators.md) (normative **`:`** prefix union vs **`=`** exact for categorical fields), [Spec 009](009-query-breakdown.md) (superseded by 021; breakdown wire format), [Spec 021](021-inline-query-breakdown.md), [Spec 079](079-consolidated-query-accordion.md), [Spec 103](103-categorical-field-value-auto-resolution.md) (`normalizeForResolution`), [Spec 032](032-is-operator.md) (`is:` / `not:` prefix union), [Spec 047](047-printing-query-fields.md) (`set:`), [Spec 068](068-game-query-qualifier.md) (`game:`), [Spec 072](072-in-query-qualifier.md) (`in:`), [Spec 179](179-set-type-query-field.md) (`set_type:`), [Spec 182](182-prefix-union-format-frame-in-collector.md) (`frame:`, legalities, `in:`, `cn:`), [Spec 174](174-otag-atag-prefix-query-semantics.md), [Spec 176](176-kw-keyword-prefix-query-semantics.md)

## Goal

When a query leaf uses **normalized prefix matching** on **`:`** (prefix union per ADR-022 §4), the breakdown chip should add a **dense presentation hint** so users see what the successful term is doing—**without** changing the query string, evaluation, or chip click / remove behavior.

Typical cases:

- **Several** vocabulary entries share the typed prefix (e.g. `kw:f` → flying, fight, first strike, …): show **next-branch** digest, e.g. `(a|i|o|…)`.
- **Exactly one** entry matches the normalized prefix (e.g. `game:p` → only **paper**): show the **completion suffix** in normalized space so the resolved token is obvious, e.g. `(aper)` after `game:p`, or `(ommander)` after `f:c` when the canonical field is `legal` and the only matching format key is **commander**. The chip **label** stays the user’s text (`game:p`); the hint is a sibling span—visually `game:p` + muted `(aper)`.
- **Empty** trimmed value on **`:`** (e.g. `is:`, `kw:`, `in:`): show distinct **first** characters over the field’s candidate set, e.g. `(a|b|c|d|…)`, so new users see how to narrow from “everything” without opening docs.

**Non-goal:** Replace [Spec 089](089-inline-autocomplete.md) or the suggestion system ([Spec 151](151-suggestion-system.md)); this is **inline discoverability** on the breakdown only—not a completion menu or popover.

## Background

Many categorical fields use **`normalizeForResolution`** plus **`startsWith`** on **`:`** to **OR** matches (ADR-022 §4; field specs). The chip label uses the user’s typed text (`app/src/worker-breakdown.ts` uses `sourceText ?? value`), so users cannot see which vocabulary entries fired. This spec lists every field where **`:`** evaluation uses that prefix-union shape (or the **`in:`** three-namespace union per Spec 072 / 182) and requires matching breakdown hints.

**Eval alignment:** Hints **MUST** use the **same** normalization and **same** candidate-matching rule as **`:`** evaluation for that field.

## Fields in scope (`:` prefix union at evaluation)

These are the fields where **evaluation** on **`:`** applies `normalizeForResolution` + `startsWith` over the vocabulary (or per-row strings, or the **`in:`** union of namespaces below) and **ORs** matches. Breakdown hints **MUST** eventually support **every** row (implementation may land in one PR or be phased; the spec is the full target set).

| Canonical field | User aliases (from `FIELD_ALIASES` in `shared/src/search/eval-leaves.ts`) | Vocabulary / data source for hints | Primary specs |
|-----------------|-------------------------------------------------------------------------------|------------------------------------|---------------|
| `keyword` | `kw` → `keyword`, `keyword` | Distinct keys of loaded keyword index (`KeywordData`) | 176, 105 |
| `otag` | `otag`, `function` → `otag`, `oracletag` → `otag` | Oracle tag labels (loaded index) | 174 |
| `atag` | `atag`, `art` → `atag` | Illustration tag labels (loaded index) | 174 |
| `is` | `is` | Closed vocabulary used for **eval** prefix expansion (`IS_PREFIX_VOCABULARY` / `expandIsKeywordsFromPrefix` in `shared/src/search/eval-is.ts`), not merely `IS_KEYWORDS` if the two differ | 032 |
| `not` | `not` | Same closed vocabulary as `is:` for semantic matching | 032 |
| `set` | `set`, `s` → `set`, `e` → `set`, `edition` → `set` | **Distinct** normalized set codes present on loaded printings (same strings `eval-printing` prefix-matches for **`:`**; align with `PrintingIndex`) | 047 |
| `set_type` | `set_type`, `st` → `set_type` | **Distinct** normalized set-type strings on loaded printings (prefix-union path for **`:`** only) | 179 |
| `frame` | `frame` | Keys of **`FRAME_NAMES`** in `shared/src/bits.ts` (normalize each key with `normalizeForResolution` for hint candidates; align with `eval-printing` prefix path for **`:`**) | 047, 182 |
| `collectornumber` | `cn` → `collectornumber`, `number` → `collectornumber`, `collectornumber` | **Distinct** normalized collector strings on loaded printings (`collectorNumbersNormResolved` / equivalent on `PrintingIndex`) | 182 |
| `game` | `game` | Keys of **`GAME_NAMES`** in `shared/src/bits.ts` (normalize each key with `normalizeForResolution`; **`:`** must OR all games whose normalized key **starts with** `u`) | 068, ADR-022 |
| `rarity` | `rarity`, `r` → `rarity` | Keys of **`RARITY_NAMES`** in `shared/src/bits.ts` (same normalization; **`:`** must OR all rarities whose normalized key **starts with** `u`) | 047, 104, ADR-022 |
| `in` | `in` | **Union** of: (1) keys of **`GAME_NAMES`**, (2) keys of **`RARITY_NAMES`**, (3) **distinct** normalized set codes on loaded printings (`knownSetCodes` / `setCodeNormByLower` alignment with `eval-printing`). Same single-`u` prefix scan as Spec 072 / 182 **`in:`** **`:`** branch. | 072, 182 |
| `legal` | `f` → `legal`, `format` → `legal` | Keys of **`FORMAT_NAMES`** in `shared/src/bits.ts` (same normalization as `eval-leaves` prefix path for **`:`**) | 182 |
| `banned` | `banned` | Keys of **`FORMAT_NAMES`** | 182 |
| `restricted` | `restricted` | Keys of **`FORMAT_NAMES`** | 182 |

**Normalization:** Hints use the same `normalizeForResolution` as evaluation (Spec 103) on both the user value and each candidate string.

**Operators:** Only leaves that run **prefix** (**`:`**) union eval as above. **`=`** / **`!=`** use **exact** (or exact-negated) match — **no** hint under this spec (optional future: exact-resolution hint). Range or unsupported operators: no hint.

## Fields explicitly out of scope (for this spec)

| Field / area | Reason |
|--------------|--------|
| `view:`, `unique:`, `sort:` / `order:`, `include:` | Spec 103: **unique** categorical resolution at canonicalize / directive sites; evaluation does not use **`:`** prefix union over a discoverable vocabulary in the sense of this spec. |
| `flavor:` / `ft:`, `artist:` / `a:` | Substring / index semantics differ from normalized-prefix vocabulary union (see `eval-printing`). |
| `produces:`, `color:` / `identity:`, `type:`, `oracle:`, `name:`, numeric / comparison-heavy fields, regex, bare text | Not normalized-prefix **`:`** union over a categorical vocabulary (different operators or semantics). |

## Hint behavior

### When to show

- Canonical field is in **Fields in scope** above.
- Operator is **`:`** only (see **Operators**).
- Trimmed value may be **empty** or **non-empty**. Empty is **in scope** for first-character digest when the candidate set supports it.
- Leaf has **no** evaluator error for that term (e.g. omit hint for `unknown keyword`, `unknown set`, `unknown in value`, etc.).
- **`in:`:** If the trimmed value is a **known unsupported language** token (Spec 072), the leaf errors—**no** hint.
- **Non-empty trimmed value:** Show a hint when **at least one** matching candidate exists (after the same matching rule as eval). Use **single-completion** vs **multi-branch** rendering below.
- **Empty trimmed value:** Show a hint when the candidate set yields **at least one** distinct first character after the continuation logic. Omit only if there is no usable candidate (e.g. index not loaded where required).

### Content

Let the **normalized prefix** be `normalizeForResolution(trimmed user value)` (may be `""`).

Collect all **matching** candidates (same rule as eval: normalized candidate `startsWith` normalized prefix). For an empty prefix, every non-empty normalized candidate matches; **exclude** candidates whose normalized form is empty so the continuation step is well-defined.

**Rendering (non-empty prefix):**

1. **Exactly one** matching candidate: let `c` be its normalized form. The hint is **`(`** + **`c.slice(prefix.length)`** + **`)`** — the **suffix** that completes the normalized token after what the user typed (examples: `game:p` → `(aper)`; `f:c` with only **commander** matching → `(ommander)`). If `c === prefix` (typed value already equals the full normalized key), use the **exact-prefix marker** from (3) instead of an empty pair.
2. **Two or more** matching candidates: take the substring of each candidate **after** the shared normalized prefix; take the **first code unit** of each remainder in normalized space; **dedupe**; **sort** deterministically. Render **`(a|b|c|…)`** listing **all** distinct branch units (no branch-count cap unless reintroduced later for UX).
3. **Exact-prefix / prefix-of-longer:** If some candidate’s normalized form **equals** the typed prefix while others extend it, include an explicit marker in the multi-branch hint (character TBD in implementation, e.g. `·` or `∅`) so users see “stop here” vs “keep typing”. For **single** candidate with `c === prefix`, show that marker as the hint body, e.g. `(·)`, or a spec-defined minimal glyph—implementation chooses for clarity.

**Rendering (empty prefix):** First character of each non-empty normalized candidate; dedupe, sort → **`(a|b|c|…)`** (all distinct first characters, same rules as multi-branch).

**Wire / UI:** Extend `BreakdownNode` in `shared/src/worker-protocol.ts` with an optional presentation-only field, e.g. `prefixBranchHint?: string` (exact name chosen in implementation). The worker fills it when building the breakdown payload; the main thread only renders it next to the chip label in **muted** / smaller text. **`BreakdownNode.label` is unchanged** (user’s typed fragment); the hint is never merged into `label` and must **not** affect query reconstruction, pin, or remove handlers (`BreakdownChip` in `app/src/InlineBreakdown.tsx`, parallel chip renderers in `app/src/UnifiedBreakdown.tsx`).

### Query mirror (deferred)

Optional follow-up: align `app/src/QueryHighlight.tsx` ([Spec 088](088-syntax-highlight-eval-feedback.md)) with the same hint—out of scope for initial implementation unless trivial.

## Acceptance criteria

1. For each **canonical** field in the in-scope table, a query whose trimmed value is **non-empty**, matches **two or more** **`:`** candidates, and does not error produces a breakdown `FIELD` node with a non-empty `prefixBranchHint` using the **multi-branch** form `(a|b|…)` (all distinct branch units).
2. For each **canonical** field in the in-scope table, a query whose trimmed value is **non-empty**, matches **exactly one** **`:`** candidate, and does not error produces a `prefixBranchHint` using the **single-completion** form `(suffix)` — the normalized candidate with the normalized prefix removed (subject to exact-prefix marker when candidate equals prefix).
3. For each **canonical** field in the in-scope table, a query whose trimmed value is **empty** on **`:`** (e.g. `is:`, `kw:`, `in:`) produces a `prefixBranchHint` over **all distinct first characters** of that field’s candidate set when data is loaded and the leaf is not errored.
4. Hints use **`normalizeForResolution`** consistently with **`:`** evaluation (Spec 103).
5. `BreakdownNode.label` remains the user-facing term as today; hint is separate wire data.
6. Chip interactions (pin, remove, click-to-edit) behave as before; hint string is not part of those code paths.
7. **Errored** leaves produce **no** hint.
8. Aliases (`kw:`, `s:`, `st:`, `art:`, `function:`, `not:`, `r:`, `f:`, `cn:`, etc.) behave the same as their canonical field after alias resolution.

## Implementation notes (for implementers)

- **Single helper in `shared/`** (TDD): given typed value (may be `""` after trim) + candidate strings + options (single-completion vs multi-branch mode) → `string | null`; worker and tests call it. Empty trimmed value uses prefix `""` and the “first character of normalized candidate” branch.
- **`is:` / `not:`** candidate list must match **evaluation** (including `IS_PREFIX_VOCABULARY` expansions such as land cycles if present in eval), not only display keys—avoid drift vs `shared/src/search/eval-is.ts`.
- **`set:` / `set_type:` / `collectornumber:`** hints should derive candidates from the **same** distinct per-printing values the evaluator scans (or an equivalent precomputed distinct list on `PrintingIndex`) so the hint never shows continuations that match zero rows.
- **`in:`** hints must build candidates as the **union** of game keys, rarity keys, and distinct normalized set codes, matching `combinedInGameMask` / `combinedInRarityMask` / `matchedSetNormsPrefix` logic in `shared/src/search/eval-printing.ts` (Spec 072).
- **`game:` / `rarity:`** hints use **`GAME_NAMES` / `RARITY_NAMES`** keys with the same normalization as eval ([Spec 068](068-game-query-qualifier.md), [Spec 047](047-printing-query-fields.md) § Rarity, Spec 182).

## Non-goals

- Replacing autocomplete or the suggestion system.
- A scrollable or selectable completion **menu** in the breakdown (only a short parenthesized suffix or branch digest).
- CLI / worker-only consumers beyond the existing worker → UI breakdown path.
