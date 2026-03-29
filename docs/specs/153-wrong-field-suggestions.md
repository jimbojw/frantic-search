# Spec 153: Right-Value-Wrong-Field Suggestions

**Status:** Implemented

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

1. **Trigger:** Either (a) the main query returns **zero** results, or (b) the **evaluated** effective breakdown (same query as the live search, with per-node `error` from the worker evaluator) contains an `is:` or `not:` leaf whose `error` text includes **`unknown keyword`**. Case (b) covers invalid `is:`/`not:` values that the engine **drops** from AND combination while still returning matches from other clauses (or, for a single invalid `is:` term alone, zero matches with a flagged error on that leaf).
2. **Detection:** Walk the **evaluated** `BreakdownNode` tree (from `toBreakdown(evaluate(effectiveQuery))`) for offending terms. Positive terms: `type === 'FIELD'` nodes. Negated terms: `type === 'NOT'` leaf nodes whose `label` is `-field:value`. For each domain, check the field trigger set and value / error rules below. Spans for `spliceQuery` come from these nodes (same offsets as the effective query string).
3. **Alternatives:** Build replacement terms by swapping the field while preserving the value (normalized as needed).
4. **Filter:** For most domains, evaluate each alternative and only suggest when `count > 0`. The **keyword / type-line in `is:`/`not:`** domain (below) uses a **pedagogical** rule for `kw:`: emit the chip even when the replacement query returns zero results; for `t:`, still require `count > 0`.
5. **Output:** One `Suggestion` per qualifying alternative. Tapping replaces the offending term via `spliceQuery`.

**Pinned dead-state:** When a pinned segment exists but matches zero cards (`hasPinned && pinnedIndicesCount === 0`), skip the entire wrong-field block (unchanged).

### Suggestion model

All suggestions in this category use `id: 'wrong-field'`. Each suggestion is a single chip: label = the new term (e.g. `ci:w`), query = full query with that term spliced in, explain = teaching copy.

- **Placement:** Primarily below the Results Summary Bar in the **empty** state. When the trigger is **unknown `is:`/`not:`** while other clauses still match cards, the same chips may appear as a **rider** below the bar (Spec 151 / `SuggestionList`) so users still see the fix.
- **Priority:** 22 (between oracle 20 and unique-prints 30).
- **Variant:** `rewrite`.
- **Negation:** Preserved. `-is:white` → suggest `-ci:w`, `-c:w`, `-produces:w` (only those that return results).

### Splice logic

- Use `spliceQuery` from `app/src/query-edit-core.ts` (same as Spec 131 oracle hint).
- For positive terms: replace the FIELD node's `span` with the new term. FIELD nodes carry `span` from the parser (Spec 036).
- For negated terms: replace the **NOT node's span** with `-{newTerm}`. The `parseBreakdown` NOT node's span covers the full `-is:white` (Spec 036). Replacing at that span with `-ci:w` produces the correct result.
- Build the full query by splicing in the effective query string. When pinned + live: the suggestion's `query` is the full effective query with the replacement. The app applies it via `setQuery` (which may update live only; app handles split).

### Domain: Color values in non-color fields

**Trigger fields:** `is:`, `in:`, `type:` (and aliases via `FIELD_ALIASES`, e.g. `t:`)

These fields do not accept color values. All field aliases from `FIELD_ALIASES` that resolve to these canonicals are matched. `is:` expects keywords (foil, dual, etc.). `in:` expects game/set/rarity. `type:` does substring match on type lines.

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

### Domain: Format / is: values in type: or in:

**Trigger fields:** `type:`, `in:` only (exclude `is:` — `is:commander` is correct). All field aliases from `FIELD_ALIASES` that resolve to these canonicals are matched (e.g. `t:`).

**Rationale:** `type:` does substring match on type lines; format/is values rarely appear there. `in:` expects game/set/rarity; format names and is: keywords are neither.

**Value recognition:** A value is a "format or is: value" if it matches (case-insensitive):

- Any key of `FORMAT_NAMES` (bits.ts): `commander`, `modern`, `standard`, `edh`, `brawl`, `vintage`, etc.
- Any entry in `IS_KEYWORDS` (eval-is.ts): `commander`, `brawler`, `vanilla`, `foil`, `dfc`, etc.

**Suggested fields:** `f:`, `is:` (depending on which the value matches)

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| f: | `f:{value}` | "Use f: for format legality." | reference/fields/face/legal |
| is: | `is:{value}` | "Use is: for card properties." | reference/fields/face/is |

**Order:** When both apply (e.g. `commander`), suggest f: first, then is:.

**Display:** Use value as typed (no normalization); both fields accept the same strings.

**Domain separation:** Color domain uses trigger fields `is:`, `in:`, `type:` + color values. Format/is domain uses `type:`, `in:` + format or is: values. A value cannot match both (e.g. `commander` is not a color; `white` is not a format). The worker runs both domains in sequence.

### Domain: Keyword / type-line values in `is:` or `not:`

**Trigger fields:** Only the literal field tokens **`is`** and **`not`** (no aliases — these are the only `FIELD_ALIASES` keys for those canonicals).

**Error predicate:** The node's `error` (FIELD node, or NOT leaf propagating the child's error) must contain the substring **`unknown keyword`** as produced by the evaluator for invalid `is:`/`not:` values. Do **not** trigger on `unsupported keyword` or `printing data not loaded`.

**Value overlap:** If the value is a **known color value** (`isKnownColorValue`, same as the color domain), **skip** `kw:` and `t:` suggestions for that term — the color subdomain already teaches `ci:`/`c:`/`produces:`.

**Keyword path (`kw:`):** `value.toLowerCase()` must appear in the same **keyword label set** as Spec 154 (worker `keywordLabels` / keyword index keys). **Always** emit the chip when it matches (even if `evaluateAlternative` returns `cardCount === 0`). Optionally attach counts when &gt; 0.

**Type path (`t:`):** `value.toLowerCase()` must appear in **`CardIndex.typeLineWords`** (same construction as Spec 154). Emit only when the replacement query returns **`cardCount > 0`**.

**Order:** When both apply, suggest **`kw:`** before **`t:`**.

**Explain / docRef:** Same as Spec 154 for `kw:` and `t:` (`bare-term-upgrade-utils` copy).

**Replacement strings** (splice at the FIELD span, or the NOT leaf span for negated `is:`/`not:`):

| Offending node | Example label | Replacement examples |
|----------------|---------------|----------------------|
| FIELD | `is:fly` | `kw:fly`, `t:fly` |
| NOT | `-is:fly` | `-kw:fly`, `-t:fly` |
| FIELD | `not:fly` | `-kw:fly`, `-t:fly` |
| NOT | `-not:fly` | `kw:fly`, `t:fly` |

**Parity with Spec 154:** Value recognition for keywords and type-line words uses the **same** sets as bare-term-upgrade; this domain only differs by operating on FIELD/NOT nodes and the `is:`/`not:` + unknown-keyword error trigger.

### Domain: Artist / atag reflexive

**Trigger fields:** `a:`, `artist:` and `atag:`, `art:` (all aliases via `FIELD_ALIASES`).

**Rationale:** Users confuse artist names with illustration tags. A user searching for Sol Ring illustrated by Dan Frazier may try `atag:frazier` (illustration tags like "chair", "spear") when they meant `a:frazier` (artist name). Conversely, `a:spear` may match nothing if "spear" is an illustration tag rather than part of an artist name. Reflexive suggestions swap the field when the value would work for the other.

**Value recognition:** None. Unlike color or format domains, we cannot statically recognize "artist-like" vs "tag-like" values. The evaluator is the source of truth: if the alternative query returns > 0 results, suggest it.

**Alternatives:**

| User field | Suggested field | Label form | Explain | docRef |
|------------|-----------------|------------|---------|--------|
| a:, artist: | atag | `atag:{value}` | "Use atag: for illustration tags." | reference/fields/face/atag |
| atag:, art: | a | `a:{value}` | "Use a: for artist name." | reference/fields/face/artist |

**Order:** One alternative per offending term. Evaluate the swapped query; suggest only if count > 0.

**Artist substring match:** The artist index uses full normalized names with substring match (e.g. `"dan frazier"`). Both `a:dan` and `a:frazier` match "Dan Frazier" because the full name contains each substring. No ETL word-split change is required for this domain.

**Dependencies:** Artist index must be loaded for `a:` suggestions; illustration tags must be loaded for `atag:` suggestions. If either is missing, skip that direction (e.g. no `a:` suggestion when `artistUnavailable`).

**Suggestion id:** Uses `id: 'artist-atag'` (Spec 151), priority 25. Same splice/negation logic as wrong-field. Tapping wrong-field or artist-atag chips fires `suggestion_applied` (Spec 085, Spec 151).

### Example mappings

| User query | Offending term | Alternatives (if each returns > 0) |
|------------|----------------|-----------------------------------|
| is:white | is:white | ci:w, c:w, produces:w |
| in:azorius | in:azorius | ci:azorius, c:azorius, produces:azorius |
| type:wubrg | type:wubrg | ci:wubrg, c:wubrg, produces:wubrg |
| is:c | is:c | ci:c, c:c, produces:c (colorless) |
| t:creature is:white | is:white | ci:w, c:w, produces:w |
| t:white | t:white | ci:w, c:w, produces:w |
| -is:white | -is:white | -ci:w, -c:w, -produces:w |
| type:commander | type:commander | f:commander, is:commander |
| type:modern | type:modern | f:modern |
| type:vanilla | type:vanilla | is:vanilla |
| in:commander | in:commander | f:commander, is:commander |
| -type:commander | -type:commander | -f:commander, -is:commander |
| t:commander | t:commander | f:commander, is:commander |
| a:spear | a:spear | atag:spear (if spear is a tag) |
| atag:frazier | atag:frazier | a:frazier (if frazier matches artist) |
| sol ring atag:frazier | atag:frazier | a:frazier |
| -atag:frazier | -atag:frazier | -a:frazier (if a:frazier returns > 0) |
| is:instant | is:instant | t:instant (if count > 0); kw: not shown unless in keyword set |
| is:flying | is:flying | kw:flying (always if flying ∈ keyword index); t: if applicable |
| not:creature | not:creature | -t:creature (if count > 0) |
| -not:creature | -not:creature | t:creature (if count > 0) |

### Multiple offending terms

When the query has multiple terms that match the pattern (e.g. `is:white type:azorius`), suggest for each. Each alternative is independent: one chip per (offending term, suggested field) pair that returns results. If this yields many chips, future refinements may cap (e.g. max 3 wrong-field suggestions per query).

### Worker integration

- In `runSearch`, after building empty-list, include-extras, unique-prints, oracle suggestions and before the final sort.
- **Gate:** Run the wrong-field block when **`totalCards === 0`** **or** the evaluated effective breakdown contains at least one **`is:`/`not:`** leaf with **`unknown keyword`** in `error`, and **`!(hasPinned && pinnedIndicesCount === 0)`**.
- Walk the **evaluated** effective breakdown (with errors and match counts) for the **is/not + unknown keyword** subdomain; for color, format/is, stray-comma, relaxed, and artist-atag, the same walk uses the same tree so spans stay aligned with evaluation (structure matches `parse(effectiveQuery)`).
- **Color domain:** If field ∈ color trigger set and value is a known color value, build ci:/c:/produces: alternatives.
- **Format/is domain:** If field ∈ format-is trigger set and value is format or is: keyword, build f:/is: alternatives.
- **Keyword/type in is/not:** As above; dedupe suggestion `query` strings against chips already emitted in the pass.
- **Artist/atag domain:** If field ∈ artist trigger set, try atag:{value}; if field ∈ atag trigger set, try a:{value}. No value predicate — evaluation decides.
- For each alternative: evaluate the query with the term replaced when a positive count is required; if count > 0, push a Suggestion (except `kw:` in the is/not domain, which may emit with zero count).
- Use `spliceQuery(effectiveQuery, node.span, newTerm)` — the node's span is in effective-query coordinates. The suggestion's `query` is the full effective query with that replacement.

### Suggestion type extension

Add `'wrong-field'` to the `Suggestion.id` union in `shared/src/suggestion-types.ts`.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/suggestion-types.ts` | Add `'wrong-field'` to Suggestion.id union |
| `app/src/worker-suggestions.ts` | Add wrong-field detection and suggestion building in `buildSuggestions` when totalCards === 0; call spliceQuery for each alternative; add artist-atag domain loop; uses `evaluateAlternative` |
| `app/src/worker-alternative-eval.ts` | `evaluateAlternative` — evaluate alt query, apply playable filter, return counts (shared by oracle and wrong-field) |
| `shared/src/wrong-field-utils.ts` | Add `isKnownColorValue`, `getColorAlternatives` (color domain); add `isFormatOrIsValue`, `getFormatOrIsAlternatives` (format/is domain); add `ARTIST_TRIGGER_FIELDS`, `ATAG_TRIGGER_FIELDS` for artist-atag; add is/not + kw/t helpers (unknown-keyword subdomain) |
| `app/src/worker-search.ts` | Pass evaluated `effectiveBreakdown` into `buildSuggestions` for wrong-field walks |
| `app/src/SuggestionList.tsx` / `SearchResults.tsx` | Show `wrong-field` in rider when suggestions include it (unknown is/not with non-empty results) |
| `app/src/SuggestionList.tsx` | Add `'wrong-field'` to EMPTY_STATE_IDS; artist-atag already in EMPTY_STATE_IDS; both use `suggestion.explain` |
| `docs/specs/151-suggestion-system.md` | Add wrong-field to placement/priority table; add "Unified by Spec 153" note for this trigger |

## Implementation Notes

- **Negation handling:** When the offending term is under a NOT node (e.g. `-is:white`), replace the **NOT node's span** with `-{newTerm}`. The NOT node's span covers the full negated term.
- **Pinned + live:** The effective query is `sealQuery(pinned) + ' ' + sealQuery(live)`. Detection walks `parseBreakdown(effectiveQuery)`, so spans are byte offsets into the effective query string. Splice at the node's span to produce the replacement; the suggestion's `query` is the full effective query with that splice. The app applies it via `setQuery`. When the offending term is in the live portion, span offsets are correct as-is; the worker constructs the full `query` by splicing the effective string.

## Future domains (out of scope)

This spec establishes the pattern. Future domains may include:

- **Set codes in wrong field:** e.g. `is:mh2` → suggest `set:mh2`, `in:mh2` (when `in:` would disambiguate)
- **Rarity in wrong field:** e.g. `type:mythic` → suggest `rarity:mythic` when value matches RARITY_NAMES

Each would be a new section in this spec (or a separate spec if complex). Artist/atag reflexive is implemented (see Domain: Artist / atag reflexive).

**Related:** Spec 154 (Bare-Term Field Upgrade) handles the inverse case: bare terms (no field) that match known values — e.g. `landfall` → `kw:landfall`, `mh2` → `set:mh2`. That spec operates on BARE nodes; this spec operates on FIELD nodes.

**Related:** Spec 158 (Nonexistent Field) handles **field names that are not supported at all** (not in `FIELD_ALIASES`), mapped by an explicit registry to a supported field — e.g. `supertype:` / `subtype:` → `t:`. Unlike this spec, Spec 158 does **not** require zero results or positive alternative counts, and it appears as a **rider** when other clauses still match cards.

## Acceptance Criteria

1. `is:white` with zero results shows up to three chips: ci:w, c:w, produces:w — only those that return results.
2. `in:azorius` with zero results shows ci:azorius, c:azorius, produces:azorius (or letter form if preferred for display) when each returns results.
3. Tapping a chip applies the full query with the offending term replaced.
4. `-is:white` suggests -ci:w, -c:w, -produces:w (negation preserved).
5. `t:creature is:white` suggests for is:white only; tapping ci:w produces `t:creature ci:w`.
6. Wrong-field suggestions appear when `totalCards === 0`, or when the evaluated breakdown has an `is:`/`not:` **unknown keyword** error (including rider placement when other clauses still match cards).
7. Wrong-field suggestions appear below the Results Summary Bar alongside oracle and include-extras.
8. Each chip shows explain text and "Learn more" link when docRef is set.
9. Works in single-pane and Dual Wield layouts.
10. `type:commander` with zero results shows f:commander and is:commander chips (only those that return results).
11. `in:commander` with zero results shows f:commander and is:commander chips.
12. `type:vanilla` with zero results shows is:vanilla only; `type:modern` shows f:modern only.
13. `a:spear` with zero results shows atag:spear chip when atag:spear returns > 0 (value is illustration tag).
14. `atag:frazier` with zero results shows a:frazier chip when a:frazier returns > 0 (value matches artist name).
15. `sol ring atag:frazier` with zero results suggests a:frazier; tapping applies `sol ring a:frazier`.
16. Negation preserved: `-atag:frazier` suggests `-a:frazier` when that returns > 0.
17. Artist-atag suggestions use id `artist-atag`, priority 25, and docRef for Learn more link.
18. `is:instant` suggests `t:instant` when that replacement returns &gt; 0 (and does not suggest `kw:` unless `instant` is in the keyword index).
19. `is:flying` suggests `kw:flying` when `flying` is in the keyword index, even when the replacement returns 0 cards.
20. `is:white` does not emit `kw:`/`t:` wrong-field chips (color value excluded); color chips still apply when the wrong-field gate is open.
21. `not:creature` suggests `-t:creature` when count &gt; 0; `-not:creature` suggests `t:creature` when count &gt; 0.
22. Duplicate `query` strings in the same suggestion pass are not emitted twice.
