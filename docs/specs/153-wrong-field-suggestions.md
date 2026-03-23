# Spec 153: Right-Value-Wrong-Field Suggestions

**Status:** Draft

**Depends on:** Spec 151 (Suggestion System), Spec 036 (Source Spans), Spec 002 (Query Engine)

## Goal

When the user uses a valid value in the wrong field (e.g. `is:white` instead of `ci:w`), offer reformulation suggestions that swap the field while keeping the value. This class of suggestions teaches users the correct field for values they already understand.

## Background

Users sometimes pair a value with a field that does not accept it. For example:

- `is:white` — `is:` expects keywords like `foil`, `dual`, `permanent`; `white` is a color value
- `in:azorius` — `in:` resolves to game/set/rarity; `azorius` is a guild (color identity)
- `type:wubrg` — `type:` does substring match on type lines; `wubrg` is a color letter sequence

In each case, the value is valid for color-related fields (`ci:`, `c:`, `produces:`). The user likely meant one of those. Zero-result searches that match this pattern should offer targeted suggestions.

## Design

### Pattern

1. **Trigger:** Main query returns zero results.
2. **Detection:** Walk the `BreakdownNode` tree from `parseBreakdown(effectiveQuery)` for offending terms. Positive terms: `type === 'FIELD'` nodes. Negated terms: `type === 'NOT'` nodes whose `label` matches the trigger pattern (e.g. `-is:white`). For each, check that the field is in the trigger set and the value matches a "right-value" pattern.
3. **Alternatives:** Build replacement terms by swapping the field while preserving the value (normalized as needed).
4. **Filter:** Evaluate each alternative; only suggest alternatives that return at least one result.
5. **Output:** One `Suggestion` per alternative that returns results. Tapping replaces the offending term via `spliceQuery`.

### Suggestion model

All suggestions in this category use `id: 'wrong-field'`. Each suggestion is a single chip: label = the new term (e.g. `ci:w`), query = full query with that term spliced in, explain = teaching copy.

- **Placement:** Empty state only (below Results Summary Bar, alongside oracle, include-extras, etc.).
- **Priority:** 22 (between oracle 20 and unique-prints 30).
- **Variant:** `rewrite`.
- **Negation:** Preserved. `-is:white` → suggest `-ci:w`, `-c:w`, `-produces:w` (only those that return results).

### Splice logic

- Use `spliceQuery` from `app/src/query-edit-core.ts` (same as Spec 131 oracle hint).
- For positive terms: replace the FIELD node's `span` with the new term. FIELD nodes carry `span` from the parser (Spec 036).
- For negated terms: replace the **NOT node's span** with `-{newTerm}`. The `parseBreakdown` NOT node's span covers the full `-is:white` (Spec 036). Replacing at that span with `-ci:w` produces the correct result.
- Build the full query by splicing in the effective query string. When pinned + live: the suggestion's `query` is the full effective query with the replacement. The app applies it via `setQuery` (which may update live only; app handles split).

### Domain: Color values in non-color fields

**Trigger fields:** `is:`, `in:`, `type:`

These fields do not accept color values. `is:` expects keywords (foil, dual, etc.). `in:` expects game/set/rarity. `type:` does substring match on type lines.

**Value recognition:** A value is a "known color value" if it matches:

- Keys of `COLOR_NAMES` (bits.ts): `white`, `blue`, `black`, `red`, `green`, `azorius`, `dimir`, …, `colorless`, `multicolor`, etc.
- Valid WUBRG letter sequences: non-empty strings of letters `w`/`u`/`b`/`r`/`g` (case-insensitive), e.g. `w`, `wu`, `wubrg`. Reuse the evaluator's color-value parsing logic for letter sequences — `COLOR_FROM_LETTER` defines single letters; multi-letter sequences follow the same pattern (each letter maps to a color bit).

**Suggested fields:** `ci:`, `c:`, `produces:`

| Suggested field | Label form | Explain | docRef |
|----------------|------------|---------|--------|
| ci: | `ci:{value}` | "Use ci: for color identity." | reference/fields/face/identity |
| c: | `c:{value}` | "Use c: for card color." | reference/fields/face/color |
| produces: | `produces:{value}` | "Use produces: for mana the card can produce." | reference/fields/face/produces |

**Value normalization for display:** Use WUBRG letter form for single colors when applicable (`white` → `w`, `red` → `r`) to keep chips compact. Keep full names for multi-color (`azorius`, `wubrg`, `colorless`, `multicolor`). All three fields accept both forms per eval-leaves; normalization is for chip label brevity only.

**Order:** Suggest in the order ci, c, produces. Each alternative is evaluated; only those with `count > 0` are added to suggestions.

### Example mappings

| User query | Offending term | Alternatives (if each returns > 0) |
|------------|----------------|-----------------------------------|
| is:white | is:white | ci:w, c:w, produces:w |
| in:azorius | in:azorius | ci:azorius, c:azorius, produces:azorius |
| type:wubrg | type:wubrg | ci:wubrg, c:wubrg, produces:wubrg |
| is:c | is:c | ci:c, c:c, produces:c (colorless) |
| t:creature is:white | is:white | ci:w, c:w, produces:w |
| -is:white | -is:white | -ci:w, -c:w, -produces:w |

### Multiple offending terms

When the query has multiple terms that match the pattern (e.g. `is:white type:azorius`), suggest for each. Each alternative is independent: one chip per (offending term, suggested field) pair that returns results. If this yields many chips, future refinements may cap (e.g. max 3 wrong-field suggestions per query).

### Worker integration

- In `runSearch`, after building empty-list, include-extras, unique-prints, oracle suggestions and before the final sort.
- When `totalCards === 0`, walk `effectiveBd` (from `parseBreakdown(effectiveQuery)`) for offending terms: FIELD nodes and NOT nodes whose child is a FIELD.
- For each node: parse `label` to get field and value; if field ∈ trigger set and value is a known color value, build alternatives.
- For each alternative: evaluate the query with the term replaced; if count > 0, push a Suggestion.
- Use `spliceQuery(effectiveQuery, node.span, newTerm)` — the node's span is in effective-query coordinates. The suggestion's `query` is the full effective query with that replacement.

### Suggestion type extension

Add `'wrong-field'` to the `Suggestion.id` union in `shared/src/suggestion-types.ts`.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/suggestion-types.ts` | Add `'wrong-field'` to Suggestion.id union |
| `app/src/worker-search.ts` | Add wrong-field detection and suggestion building when totalCards === 0; call spliceQuery for each alternative |
| `shared/` or `app/` | Add `isKnownColorValue(value: string): boolean` (checks COLOR_NAMES + letter sequence); add `getColorAlternatives(node): { field, label, value }[]` |
| `app/src/SuggestionList.tsx` | Add `'wrong-field'` to EMPTY_STATE_IDS; wrong-field uses `suggestion.explain` in getDescription (no special branch needed) |
| `docs/specs/151-suggestion-system.md` | Add wrong-field to placement/priority table; add "Unified by Spec 153" note for this trigger |

## Implementation Notes

- **Negation handling:** When the offending term is under a NOT node (e.g. `-is:white`), replace the **NOT node's span** with `-{newTerm}`. The NOT node's span covers the full negated term.
- **Pinned + live:** The effective query is `sealQuery(pinned) + ' ' + sealQuery(live)`. Detection walks `parseBreakdown(effectiveQuery)`, so spans are byte offsets into the effective query string. Splice at the node's span to produce the replacement; the suggestion's `query` is the full effective query with that splice. The app applies it via `setQuery`. When the offending term is in the live portion, span offsets are correct as-is; the worker constructs the full `query` by splicing the effective string.

## Future domains (out of scope)

This spec establishes the pattern. Future domains may include:

- **Set codes in wrong field:** e.g. `is:mh2` → suggest `set:mh2`, `in:mh2` (when `in:` would disambiguate)
- **Rarity in wrong field:** e.g. `type:mythic` → suggest `rarity:mythic` when value matches RARITY_NAMES
- **Format in wrong field:** similar pattern for FORMAT_NAMES

Each would be a new section in this spec (or a separate spec if complex).

## Acceptance Criteria

1. `is:white` with zero results shows up to three chips: ci:w, c:w, produces:w — only those that return results.
2. `in:azorius` with zero results shows ci:azorius, c:azorius, produces:azorius (or letter form if preferred for display) when each returns results.
3. Tapping a chip applies the full query with the offending term replaced.
4. `-is:white` suggests -ci:w, -c:w, -produces:w (negation preserved).
5. `t:creature is:white` suggests for is:white only; tapping ci:w produces `t:creature ci:w`.
6. Wrong-field suggestions do not appear when totalCards > 0 (empty state only).
7. Wrong-field suggestions appear below the Results Summary Bar alongside oracle and include-extras.
8. Each chip shows explain text and "Learn more" link when docRef is set.
9. Works in single-pane and Dual Wield layouts.
