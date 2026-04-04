# Spec 181: Query breakdown prefix-branch hint

**Status:** Draft

**References:** [GitHub #177](https://github.com/jimbojw/frantic-search/issues/177)

**Depends on:** [Spec 009](009-query-breakdown.md) (superseded by 021; breakdown wire format), [Spec 021](021-inline-query-breakdown.md), [Spec 079](079-consolidated-query-accordion.md), [Spec 103](103-categorical-field-value-auto-resolution.md) (`normalizeForResolution`), [Spec 032](032-is-operator.md) (`is:` / `not:` prefix union), [Spec 047](047-printing-query-fields.md) (`set:`), [Spec 179](179-set-type-query-field.md) (`set_type:`), [Spec 182](182-prefix-union-format-frame-in-collector.md) (`frame:`), [Spec 174](174-otag-atag-prefix-query-semantics.md), [Spec 176](176-kw-keyword-prefix-query-semantics.md)

## Goal

When a query leaf uses **normalized prefix matching** that can match **multiple** vocabulary entries (prefix “expansion” / union semantics), the breakdown chip should add a **dense continuation hint** so users discover what they could type next—without changing the query string, evaluation, or chip click / remove behavior.

Examples: user types `kw:f`; chip label stays `kw:f`; a muted suffix might show distinct next characters among matching keyword keys after normalization, e.g. `(a|i|o|…)`, capped for width. User types `is:` with an empty value (still matches the whole `is:` domain per Spec 032); a hint can show the distinct **first** characters of the closed vocabulary, e.g. `(a|b|c|d|…)`, so new users see how to narrow from “everything” without opening docs.

**Non-goal:** Replace [Spec 089](089-inline-autocomplete.md) or the suggestion system ([Spec 151](151-suggestion-system.md)); this is **inline discoverability** on the breakdown only.

## Background

Several fields intentionally **union** all entries whose normalized form starts with the user’s prefix (see Spec 103 evaluation exceptions). The chip label uses the user’s typed text (`app/src/worker-breakdown.ts` uses `sourceText ?? value`), so users cannot see which stems matched. [GitHub #177](https://github.com/jimbojw/frantic-search/issues/177) predates broader prefix-union fields; this spec covers **all** eval-time prefix-union families below.

## Fields in scope (prefix union at evaluation)

These are the fields where **evaluation** applies `normalizeForResolution` + `startsWith` over a vocabulary (or per-row string) and **ORs** matches together. Breakdown hints **MUST** eventually support **every** row in this table (implementation may land in one PR or be phased; the spec is the full target set).

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

**Normalization:** Hints use the same `normalizeForResolution` as evaluation (Spec 103) on both the user value and each candidate string.

**Operators:** Only leaves that run **prefix** (**`:`**) union eval (Specs 176, 174, 032, 047, 179, 182). Fields such as **`set=`** / **`set_type=`** / **`frame=`** / **`frame!=`** use **exact** (or exact-negated) match — **no** prefix-branch hint (optional future: exact-resolution hint). Range or unsupported operators: no hint.

## Fields explicitly out of scope (for this spec)

| Field / area | Reason |
|--------------|--------|
| `in:` | Spec 072: **unique-prefix resolution** across a union of namespaces, then **exact** game / set / rarity match—not eval-time prefix union over a single OR’d vocabulary like `kw:`. A separate UX spec could add “ambiguous `in:` candidates” later. |
| `f:` / `legal:` / `format:` / `banned:` / `restricted:`, `view:`, `unique:`, `sort:` / `order:`, `include:`, `rarity:` / `r:`, `game:` | Spec 103: **unique** categorical resolution to one token when unambiguous; evaluation uses the resolved single value, not OR of all prefix matches. |
| `flavor:` / `ft:`, `artist:` / `a:` | Substring / index semantics differ from normalized-prefix vocabulary union (see `eval-printing`). |
| `collector number`, numeric fields, regex, bare text | Not categorical prefix union. |

## Hint behavior

### When to show

- Canonical field is in **Fields in scope** above.
- Operator is the prefix-union operator(s) for that field (per existing specs, typically `:` and `=`).
- Trimmed value may be **empty** or **non-empty**. Empty is **in scope**: e.g. `is:`, `kw:`, `set:` (broad match) should still be able to show a first-character digest over the field’s candidate set so new users can discover how to narrow the query.
- Leaf has **no** evaluator error for that term (e.g. omit hint for `unknown keyword`, `unknown set`, etc.).
- **Non-empty trimmed value:** Show a hint only when **at least two** distinct vocabulary entries (or set codes / set types on disk) match the normalized prefix—otherwise the prefix is already unambiguous for discovery and the hint adds little. *(Optional later enhancement: single-match case from #177—muted full resolved token—can be a follow-up.)*
- **Empty trimmed value:** Show a hint when the candidate set yields **at least one** distinct first character after the same continuation logic (subject to cap). Omit only if there is no usable candidate (e.g. index not loaded where required).

### Content

- Let the **normalized prefix** be `normalizeForResolution(trimmed user value)` (may be `""`).
- Collect all **matching** candidates (same rule as eval: normalized candidate `startsWith` normalized prefix). For an empty prefix, every non-empty normalized candidate matches; **exclude** candidates whose normalized form is empty so the continuation step is well-defined.
- From the substring of each candidate **after** the shared normalized prefix, take the **first code unit** (or first meaningful unit per normalization) of the **remainder** in normalized space; **dedupe**; **sort** deterministically. When the prefix is empty, this is the **first character of each candidate’s normalized form**.
- Render a compact string, e.g. `(a|b|c|…)`, appended or shown as a sibling span—not merged into `BreakdownNode.label`.
- **Cap** the number of displayed branches (specify constant in implementation, e.g. 8–12); if truncated, end with `…`.
- **Exact-prefix / prefix-of-longer:** If some candidate’s normalized form **equals** the typed prefix while others extend it, include an explicit marker in the hint (character TBD in implementation, e.g. `·` or `∅`) so users see “stop here” vs “keep typing”.

### Where it lives

- Extend `BreakdownNode` in `shared/src/worker-protocol.ts` with an optional presentation-only field, e.g. `prefixBranchHint?: string` (exact name chosen at implementation). The worker fills it when building the breakdown payload; the main thread only renders it.

### UI

- `BreakdownChip` in `app/src/InlineBreakdown.tsx` (and parallel chip renderers in `app/src/UnifiedBreakdown.tsx`): show `label` unchanged; render `prefixBranchHint` in **muted** / smaller text. Must **not** affect query reconstruction, pin, or remove handlers.

### Query mirror (deferred)

- Optional follow-up: align `app/src/QueryHighlight.tsx` ([Spec 088](088-syntax-highlight-eval-feedback.md)) with the same hint—out of scope for initial implementation unless trivial.

## Acceptance criteria

1. For each **canonical** field in the in-scope table, a query whose trimmed value is **non-empty** and matches **two or more** eval candidates produces a breakdown `FIELD` node whose chip shows the typed term plus a non-empty `prefixBranchHint` (subject to cap rules), when the leaf is not errored.
2. For each **canonical** field in the in-scope table, a query whose trimmed value is **empty** (e.g. `is:`, `kw:`) produces a `prefixBranchHint` over **first characters** of that field’s candidate set when data is loaded and the leaf is not errored, subject to the same cap rules (may truncate to `…`).
3. Hints use **`normalizeForResolution`** consistently with evaluation (Spec 103).
4. `BreakdownNode.label` remains the user-facing term as today; hint is separate wire data.
5. Chip interactions (pin, remove, click-to-edit) behave as before; hint string is not part of those code paths.
6. **Errored** leaves produce **no** hint.
7. Aliases (`kw:`, `s:`, `st:`, `art:`, `function:`, `not:`, etc.) behave the same as their canonical field after alias resolution.

## Implementation notes (for implementers)

- **Single helper in `shared/`** (TDD): given typed value (may be `""` after trim) + candidate strings + options → `string | null`; worker and tests call it. Empty trimmed value must use prefix `""` and the “first character of normalized candidate” branch logic described above.
- **`is:` / `not:`** candidate list must match **evaluation** (including `IS_PREFIX_VOCABULARY` expansions such as land cycles if present in eval), not only display keys—avoid drift vs `shared/src/search/eval-is.ts`.
- **`set:` / `set_type:`** hints should derive candidates from the **same** distinct values the printing evaluator scans (or an equivalent precomputed distinct list on `PrintingIndex`) so the hint never shows continuations that would still match zero rows.

## Non-goals

- Changing AST, parser, or evaluator semantics.
- Listing full completion strings in the chip (density target is **next-branch summary**, not a menu).
- CLI / worker-only consumers beyond the existing worker → UI breakdown path.
