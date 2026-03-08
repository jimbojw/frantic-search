# Spec 103: Categorical Field Value Auto-Resolution

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 058 (View Mode Query Term), Spec 072 (in: Query Qualifier), Spec 104 (Bonus Rarity Tier)

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
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
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

**Mechanics:** Each lookup site (eval-leaves, eval-printing, evaluator branches for view/unique/include/sort, extractViewMode, getUniqueModeFromAst, canonicalize) calls `resolveCategoricalValue(field, value, context)` before doing its lookup. If resolution returns a value, use it for the lookup; otherwise use the original value. When resolution context is absent (e.g. before printings load), runtime fields (`set`, `in`, `otag`, `atag`) skip resolution and retain the typed value.

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

- **No resolution (0 or 2+ matches):** Existing behavior applies. Unknown values produce errors per Spec 039 (e.g. `unknown format "x"`, `unknown set "x"`).
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
| `shared/src/search/eval-leaves.ts` | Before format/legal/banned/restricted lookup: `resolveForField(field, value, context)`; use resolved value for lookup. |
| `shared/src/search/eval-printing.ts` | Before set/rarity/game/frame/in/legal/banned/restricted lookup: resolve; use resolved value. |
| `shared/src/search/evaluator.ts` | Before view/unique/include/sort branches: resolve; use resolved value. |
| `shared/src/search/canonicalize.ts` | When serializing FIELD nodes, resolve categorical values before emitting. |
| `app/src/view-query.ts` | In `extractViewMode`, resolve view values before `isValidViewValue` check. |
| `app/src/worker-search.ts` | Pass `ResolutionContext` (knownSetCodes, tag vocabularies) when invoking runSearch; evaluator receives it. |
| `cli/` | Pass minimal context (no printings) for CLI; build-time fields still resolve. |

## Acceptance criteria

1. `view:i` and `v:i` produce the same behavior as `view:images` and `v:images`.
2. `unique:a` produces the same behavior as `unique:art`.
3. `set:9` produces the same behavior as `set:9ED` (when 9ED exists and is the only set code starting with "9").
4. `f:c` produces the same behavior as `f:commander`.
5. `f:e` produces the same behavior as `f:edh` (alias for commander).
6. `rarity:r` produces the same behavior as `rarity:rare` (when `r` is the only rarity prefix match).
7. `game:a` produces the same behavior as `game:arena`.
8. `in:a` resolves to `arena` only when `arena` is the sole match across game + set + rarity.
9. `in:a` does **not** resolve when both `arena` (game) and `a25` (set) match.
10. `set:xyz` with no matching set code continues to produce `unknown set "xyz"` (no resolution, existing error).
11. When multiple candidates match (e.g. `f:p` matches `pioneer`, `pauper`, `penny`, `predh`), no resolution occurs; the typed value is passed through and produces an error per existing validation.
12. Normalization strips punctuation/whitespace: `set:9ED` and `set:9 ed` both match `9ed` when that is the only candidate.
13. The query breakdown chip displays `v:i` when the user types `v:i`, not `v:images`. Same for all categorical fields — the chip shows the user's typed value.

## Out of scope

- Auto-expanding the query bar display to show resolved values (e.g. `view:i` → `view:images`).
- Autocomplete changes (Spec 089); resolution is independent.
- Open-ended fields (`name`, `oracle`, `type`, etc.) — no resolution; substring match semantics unchanged.
