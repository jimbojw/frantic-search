# Spec 151: Unified Suggestion System for Alternative Queries and Syntax Education

**Status:** Implemented

**Depends on:** Spec 057 (include:extras), Spec 126 (Empty List CTA), Spec 131 (Oracle Did You Mean), Spec 139 (unique:prints hint), Spec 150 (ChipButton)

**Addresses:** [Issue #171](https://github.com/jimbojw/frantic-search/issues/171), [Issue #258](https://github.com/jimbojw/frantic-search/issues/258) (rewrite `query` = live-only when applying through `setQuery`)

## Goal

Unify the existing ad-hoc suggestion mechanisms under a consistent control flow and UI pattern, and establish an extensible architecture for new suggestion triggers. Zero-result searches must never be a dead end — every empty state offers at least one actionable next step.

## Background

### Current state

Four suggestions exist today, implemented independently:

| Trigger | Spec | Source | Placement |
|---------|------|--------|-----------|
| Empty list (`my:list` / `#` with no instances) | 126 | Main thread | Replaces empty state |
| Playable filter hides results | 057 | Worker | Empty state or rider |
| Printings hidden (dedup) | 139 | Main thread | Rider only |
| Bare tokens → oracle alternative works | 131 | Worker | Empty state only |

Priority is hardcoded in `SearchResults.tsx`: empty-list CTA > include:extras > oracle hint. The `unique:prints` rider appears only when results exist, so it lives outside the empty-state cascade. Each suggestion uses separate `Show` blocks and different protocol shapes (`oracleHint`, `indicesBeforeDefaultFilter`, `defaultListEmpty`, etc.).

### Problem

- **Inconsistent surfacing:** New triggers (card type tokens, artist/atag confusion, near-miss syntax, small-result relaxations) would each require ad-hoc wiring.
- **No composition:** Multiple suggestions can apply (e.g., empty list + include:extras) but only one is shown due to strict priority. Future triggers need a principled way to rank and compose.
- **Scattered logic:** Worker and main thread each own different pieces; there is no single place that understands "what suggestions apply right now."

### Design principles (from Issue #171)

1. **Never fail silently.** A 0-result search always offers at least one actionable next step.
2. **High visibility.** Suggestions are prominent, not footnotes.
3. **Composable.** Multiple suggestions may apply; the system can surface more than one, ranked by usefulness.
4. **Narrowest suggestion first.** Where multiple reformulations exist, offer the most specific first. Example: for `draw two`, suggest `o:"draw two"` (phrase) before `o:draw o:two` (per-word) — a two-word sequence is more specific than two one-word oracle queries.
5. **Teach, don't just fix.** Where possible, show *why* a suggestion works (e.g., "Use `a:` for artist search when available"). Deep-link into the docs when relevant — e.g., an oracle hint can link to `?doc=reference/fields/face/oracle`; an `include:extras` suggestion to `?doc=reference/modifiers/include-extras`.
6. **Consistent UI pattern.** All suggestions use the same visual component and interaction model.

## Design

### Data model: Suggestion

A suggestion is a single actionable item the user can tap.

```typescript
/** Single suggestion shown to the user. */
export type Suggestion = {
  /** Unique id for this trigger; used for deduplication and analytics. */
  id: 'empty-list' | 'include-extras' | 'unique-prints' | 'oracle' | 'wrong-field' | 'bare-term-upgrade' | 'nonexistent-field' | 'field-value-gap' | 'card-type' | 'artist-atag' | 'name-typo' | 'near-miss' | 'relaxed' | 'stray-comma' | 'example-query'
  /** Live query string to apply when user taps (`setQuery`; Spec 054). Omit for CTA-style (navigate, paste). See § Rewrite `query` and pinned query. */
  query?: string
  /** Short label for the chip, e.g. "include:extras", "o:scry". */
  label: string
  /** Optional teaching copy: explains why this helps. */
  explain?: string
  /** Optional doc param for deep-link (e.g. "reference/fields/face/oracle"). Rendered as "Learn more" link when present. */
  docRef?: string
  /** Card count when tapping would change results; for two-line chip display. */
  count?: number
  /** Printing count when relevant. */
  printingCount?: number
  /** 0 = highest; lower values appear first. */
  priority: number
  /** 'rewrite' = setQuery; 'cta' = custom action (navigate, paste). */
  variant: 'rewrite' | 'cta'
  /** For CTA variant: function key to invoke (e.g. 'navigateToLists'). */
  ctaAction?: 'navigateToLists' | 'pasteList'
  /** For empty-list: distinguishes my: vs # for right-column copy. */
  emptyListVariant?: 'my' | 'tag'
}
```

### Rewrite `query` and pinned query (Spec 054)

For `variant: 'rewrite'`, **`query` is always the live-query string** passed to `setQuery` on tap ([`SearchResults`](app/src/SearchResults.tsx) → [`SuggestionList`](app/src/SuggestionList.tsx)). The search input edits **live** query only; pinned criteria are separate ([Spec 054](054-pinned-search-criteria.md)).

- The worker may **evaluate** alternatives using `sealQuery(pinned) + ' ' + sealQuery(live)` (or the same shape the evaluator uses for the effective query). That combined string is for **`evaluateAlternative`** and must **not** be copied into `query` when the rewrite only changes the live slice (or when the apply semantics are expressible as updating live only). Duplicating pinned text into `query` would repeat pinned terms at evaluation time ([Issue #258](https://github.com/jimbojw/frantic-search/issues/258)).

- For rewrites computed by splicing the **effective** query string, **`query`** must still be the string assigned to the live buffer—typically by stripping a leading `sealQuery(pinnedTrim) + ' '` prefix from the new effective string when the pinned half is unchanged, or by splicing `msg.query` when spans lie in the live range only. When a mistake sits **only** in the pinned region, applying through `setQuery` alone is insufficient; dual apply (update pinned + live) is **out of scope** until the UI supports it.

- **Analytics (Spec 085 / PostHog):** `suggestion_applied` **`applied_query`** should match what appears in the live input after tap, not a shadow “effective-only” payload.

### Control flow

1. **Worker** produces the full `suggestions: Suggestion[]` array. It has everything needed to do so:
   - Query (live + pinned), `getListMask` (list cache), parse/eval results, `appendTerm`, `sealQuery`
   - Empty-list: query references `my:list`/`my:default`/`#` and `getListMask("default")` is empty
   - include-extras, oracle, unique-prints: already computed or derivable from search output
   - Lists/Import CTA is always available (persistent header button); no conditional filtering

2. **Main thread** receives `suggestions` from the worker result and passes through to SearchResults. No merge, no main-thread context, no translation.

3. **SearchResults** consumes `suggestions: Suggestion[]` and renders a single `SuggestionList` component that:
   - When `totalCards === 0`: SuggestionList for empty-state suggestions (including empty-list when applicable), then Results Summary Bar (Spec 152) when the effective query is non-empty (Spec 155 omits the bar when empty).
   - When `totalCards > 0`: SuggestionList for rider suggestions (including empty-list when applicable) directly beneath the results list when any apply, then Results Summary Bar.
   - Single SuggestionList for both contexts; empty-list can appear in either. All chips use `ChipButton` (Spec 150).

### Placement rules

| Context | Eligible suggestion ids | Max shown | Placement |
|---------|-------------------------|-----------|-----------|
| Empty state | empty-list, include-extras, bare-term-upgrade, nonexistent-field, field-value-gap, name-typo, oracle, wrong-field, stray-comma, relaxed, card-type, artist-atag, near-miss, example-query | All that apply, priority-ordered; example-query as fallback when none others apply | Above Results Summary Bar (Spec 152) when the bar is shown; bar shows effective query + actions |
| Non-empty riders | empty-list, nonexistent-field, wrong-field, unique-prints, include-extras | All that apply | Above Results Summary Bar (Spec 152); riders sit directly beneath the results list; **fixed order:** empty-list, then nonexistent-field (Spec 158), then wrong-field when present (e.g. Spec 153 unknown `is:`/`not:` while other clauses match), then unique-prints, then include-extras |

Results area footer unified by Spec 152 (Results Summary Bar).

### Example query fallback (example-query)

When the empty state has *no* context-specific suggestions (no include-extras, oracle hint, etc.), show an example query CTA so the user always has something to try. Example: "Find Commander legal cards with `f:commander`?" Tapping applies the query. We may end up with a rotating lineup — e.g. `f:commander`, `t:creature`, `ci:g` — to surface different syntax over time. One example per empty state; selection could be random, session-based, or curated.

**Empty-list (Spec 126):** When the worker includes `empty-list` suggestions (one per offending term), each appears as a row in SuggestionList. Chip shows the literal term in amber with "0 cards (0 prints)"; description varies by `emptyListVariant` ('my' vs 'tag'). Tap navigates to list view. Can appear in both empty state and rider context.

### Priority values (convention)

| id | priority | Rationale |
|----|----------|-----------|
| empty-list | 0 | Highest — user cannot get results without a list |
| nonexistent-field | 14 | Mistaken field name not in Scryfall; registry maps to a real field (Spec 158). Before bare-term-upgrade — invalid field clause is a hard engine error |
| field-value-gap | 15 | Space between field operator and value (#240 parse shape); merge removes gap when `evaluateAlternative` &gt; 0 (Spec 177). Before bare-term-upgrade — targeted syntax fix |
| bare-term-upgrade | 16 | Bare term matches a **non-tag** domain (kw:, t:, set:, f:, is:, game:, frame:, rarity:). Spec 154. |
| (future) card-type | TBD | Type token reformulation (e.g. "creatures" → t:creature). Priority to be chosen when specified — must sit relative to Spec 177 **15** and bare-term-upgrade **16** |
| name-typo | 17 | Misspelled bare name token → Levenshtein correction verified by search (Spec 163). After bare-term-upgrade, before oracle. |
| oracle | 20 | Reformulates bare tokens to oracle search (Spec 131): **one** chip whose label is either `o:"…"`, `o:/…/` (ordered words), per-word `o:` terms, or (when all primaries fail) a **single-token hybrid** (`o:` on one trailing word only), per Spec 131 selection. **Sorts before** `otag:` / `atag:` bare-term-upgrade chips (priority 21) when both apply. |
| bare-term-upgrade (otag/atag only) | 21 | Same `id` as other bare-term upgrades; label starts with `otag:` or `atag:` (Spec 154 exact + Spec 159 prefix). Lower priority than oracle so the oracle-text hint appears first. |
| wrong-field | 22 | Right value in wrong field; suggest correct field (Spec 153). Gate includes `totalCards === 0` **or** evaluated breakdown with `is:`/`not:` + `unknown keyword` error (so suggestions can appear as a rider when the rest of the query still matches cards). |
| stray-comma | 23 | Remove value-terminal commas mistaken for clause separators; Spec 157 |
| relaxed | 24 | Color / identity `=` → `:` / `>=` when exact match is too strict; Spec 156 |
| unique-prints | 30 | Rider context; expand printings |
| artist-atag | 25 | Cross-detect atag vs a; suggest the field that returns results. Unified by Spec 153. |
| (future) near-miss | 18 | Unquoted multi-word field value; suggest quoted form when it would match |
| example-query | 40 | Fallback — when no other empty-state suggestion applies; ensures we never fail silently |
| include-extras | 90 | Lowest among empty-state rewrites — broad escape hatch (non-playable printings); show after targeted field/oracle/wrong-field/bare-term hints and after reserved future tiers through example-query |

### Wire protocol

Add `suggestions: Suggestion[]` to the `result` variant of `FromWorker`. The worker produces the full array; no translation on the main thread.

Deprecate/remove `oracleHint`, `indicesBeforeDefaultFilter`, `printingIndicesBeforeDefaultFilter` from the result — they are folded into `suggestions`.

### UI component: SuggestionList

Unified flex-row layout for all suggestions. Header: "Try a query refinement?" — `text-lg font-semibold` with high-contrast foreground; the section uses a light sky-tinted panel and sky top border so it separates clearly from content above (results list or empty-state shell). Results Summary Bar (Spec 152) follows when shown. Each row: chip (left, shrink-0) | description (right, flex-1). Row copy remains `text-base` with muted body color. Suggestion `ChipButton`s use a neutral gray border (and amber border for empty-list CTAs) so chips separate from the sky panel.

| Suggestion type | Left (chip) | Right (description) |
|-----------------|--------------|---------------------|
| empty-list (my) | Term in amber, "0 cards (0 prints)", click → navigateToLists | "This term requires an imported deck list. [Import one now?](...)" |
| empty-list (tag) | Term in amber, "0 cards (0 prints)", click → navigateToLists | "This term requires a list with tags. [Import one now?](...)" |
| unique-prints, include-extras | Label + optional count, click → setQuery | From `explain` or derived; [Learn more] if docRef |
| wrong-field (Spec 153) | New term (e.g. ci:w), click → setQuery | From `explain`; [Learn more] if docRef |
| nonexistent-field (Spec 158) | New term (e.g. t:elf), click → setQuery | From `explain`; no counts in MVP; [Learn more] if docRef |
| stray-comma (Spec 157) | Fixed clause(s) as typed (e.g. `o=surveil`), space-separated if several; click → setQuery | From `explain`; optional counts like wrong-field; [Learn more] if docRef |
| field-value-gap (Spec 177) | Merged clause(s) (e.g. `ci:blue`), space-separated if several; click → setQuery | From `explain`; counts when &gt; 0; [Learn more] if docRef |
| relaxed (Spec 156) | New term (e.g. ci:u, c:u), click → setQuery | From `explain`; optional counts like wrong-field; [Learn more] if docRef |
| bare-term-upgrade (Spec 154) | New term (e.g. kw:landfall), click → setQuery | From `explain`; [Learn more] if docRef |
| artist-atag (Spec 153) | New term (e.g. a:frazier or atag:spear), click → setQuery | From `explain`; [Learn more] if docRef |
| name-typo (Spec 163) | Substituted name word (chip), click → setQuery | From `explain`; optional counts when &gt; 0 |
| oracle, etc. | Same | Same |

- All chips use `ChipButton`; empty-list uses `state` that yields amber styling (Spec 088).
- When `docRef` is set, show "Learn more" link navigating to `?doc={docRef}`.
- **PostHog (Spec 085):** When the user taps a suggestion chip, fire `suggestion_applied` with `suggestion_id`, `suggestion_label`, `variant`, `applied_query` (rewrite) or `cta_action` (CTA), and `mode` (empty vs rider). Capture point: SuggestionList onClick handlers before invoking onApplyQuery/onCta.

### Migration of existing behavior

| Existing | Worker produces |
|----------|-----------------|
| Empty-list (Spec 126) | One `Suggestion` per offending term: `{ id: 'empty-list', label: <term>, variant: 'cta', ctaAction: 'navigateToLists', emptyListVariant: 'my'\|'tag' }`. Trigger: `hasListSyntaxInQuery(bd)` (my: or #, positive or negated) and `getListMask("default")` empty. No totalCards constraint. |
| include:extras (Spec 178) | `Suggestion { id: 'include-extras', query, label, count, printingCount, docRef: 'reference/modifiers/include-extras' }`. Empty: totalCards === 0 and indicesBeforeDefaultFilter. Rider: totalCards > 0 and hidden default-filtered results. |
| unique:prints (Spec 139) | `Suggestion { id: 'unique-prints', query, label, docRef: 'reference/modifiers/unique' }`. Rider only. Trigger: uniqueMode !== 'prints' and `totalPrintingItems > totalDisplayItems`. |
| Oracle hint (Spec 131) | `Suggestion { id: 'oracle', query, label, count, printingCount, docRef: 'reference/fields/face/oracle' }` from existing oracleHint logic. Empty state only. |
| Bare-term-upgrade (Spec 154) | One `Suggestion` per (bare term, alternative field) pair: `{ id: 'bare-term-upgrade', query, label, explain, count, docRef }`. Trigger: totalCards === 0; BARE node value matches known domain (keyword, type-line, set, format, is, otag, atag, game, frame, rarity); chips emit even when count === 0 (Spec 154). Empty state only. Runs before oracle in `buildSuggestions`. **`oracleSuppressedBareValues`:** only **non-tag** upgrades (labels not starting with `otag:` / `atag:`) add the affected bare token **values** to this set; oracle trailing-node filter uses it (Spec 131). Tag upgrades do not suppress oracle. |
| Wrong-field (Spec 153) | One `Suggestion` per (offending term, alternative field) pair: `{ id: 'wrong-field', query, label, explain, count, docRef }`. Trigger: totalCards === 0 **or** evaluated effective breakdown contains `is:`/`not:` with `unknown keyword` error; plus other subdomains (color, format/is, is/not→kw/t, stray-comma, relaxed, artist-atag) per Spec 153. Empty state; **rider** when unknown `is:`/`not:` and totalCards > 0. |
| Stray comma (Spec 157) | At most one `Suggestion`: `{ id: 'stray-comma', query, label, explain, count, printingCount, docRef, priority: 23 }`. Trigger: totalCards === 0; effective query has unquoted FIELD values ending with `,`; cleaned query differs and returns > 0; omit if same `query` as another rewrite in the pass. Empty state only. |
| Relaxed operator (Spec 156) | One `Suggestion` per (matching term, alternative operator) pair: `{ id: 'relaxed', query, label, explain, count, printingCount, docRef, priority: 24 }`. Trigger: totalCards === 0; positive FIELD on color/identity with `=` and non-count color value; alternative `:` / `>=` returns > 0. Empty state only. |
| Artist-atag (Spec 153) | One `Suggestion` per offending term: `{ id: 'artist-atag', query, label, explain, count, docRef }`. Trigger: totalCards === 0; FIELD node is a:/artist: or atag:/art:; swapped field (atag: or a:) returns > 0. Empty state only. |
| Nonexistent field (Spec 158) | One `Suggestion` per offending span (deduped by `query`): `{ id: 'nonexistent-field', query, label, explain, docRef, priority: 14 }`. Trigger: effective query contains a registry-matched mistaken field (e.g. supertype:, subtype:); **no** totalCards gate; **no** alternative evaluation required for MVP (omit counts). Empty state and rider. |
| Field operator–value gap (Spec 177) | At most one `Suggestion`: `{ id: 'field-value-gap', query: <live apply string>, label, explain, count, printingCount, docRef: 'reference/syntax', priority: 15 }` — `query` is live after gap fixes (Spec 151 / 177). Trigger: `totalCards === 0`; same pinned-empty skip as Spec 131/154; AST has `FIELD` empty value + adjacent `BARE` with whitespace-only gap; `evaluateAlternative` &gt; 0. Empty state only. |

**Invariant:** Same triggers and tap actions as before. Placement and layout may be improved—looking good takes precedence over perfect parity with the status quo. "Learn more" links (docRef) are encouraged as part of the unified UI pattern.

## Future triggers (out of scope here)

Each future trigger gets its own spec. This document records the intended ids and rough priority:

| Trigger | id | Spec | Notes |
|---------|-----|------|------|
| Nonexistent / mistaken field names | nonexistent-field | Spec 158 | Registry maps bogus fields (e.g. `supertype:`, `subtype:`) to a real field (`t:`). Empty + rider; no result-count gate. Draft. |
| Card type tokens | card-type | TBD | "creatures" → `t:creature`; "creatures scry" → `t:creature o:scry`; narrowest first |
| Bare term field upgrade | bare-term-upgrade | Spec 154 | Bare terms matching known values (keywords, set, format, otag, atag, game, frame, rarity) → suggest field prefix. "landfall" → `kw:landfall`; "mh2" → `set:mh2`. Implemented. |
| Artist / atag confusion | artist-atag | Spec 153 | Reflexive: `atag:frazer` + 0 but `a:frazer` returns results → suggest `a:`; `a:spear` + 0 but `atag:spear` returns results → suggest `atag:`. [Issue #128 comment](https://github.com/jimbojw/frantic-search/issues/128) |
| Name-token spellcheck (zero results) | name-typo | Spec 163 | Levenshtein vs card-name word list; one token per suggestion; verify &gt; 0 results; chip shows corrected token; `query` is modified **live** only |
| Near-miss: unquoted multi-word | near-miss | TBD | Bare term(s) after a field term: `a:Dan Frazer` parsed as `a:Dan` + bare `Frazer`; when `a:"Dan Frazer"` would match → "Did you mean `a:"Dan Frazer"`?" Same for `atag:dan frazier` → `atag:"dan frazier"` |
| Operator–value whitespace (#240 UX) | field-value-gap | Spec 177 | `ci: blue` → suggest `ci:blue` when merge returns results |
| Small result set | (id TBD) | future spec | 1–3 results; broader query returns more. **Not** `relaxed` — Spec 156 reserves `relaxed` for **zero-result** color/identity `=` operator relaxation only. |
| Example query fallback | example-query | TBD | 0 results + no other suggestions → "Find Commander legal cards with `f:commander`?"; rotating lineup |

## Implementation notes

- **Worker suggestion building:** `runSearch` calls `buildSuggestions(params)` from `app/src/worker-suggestions.ts`. That module receives `getListMask` via params. For empty-list: when `hasListSyntaxInQuery(effectiveBd)` and `getListMask("default")` is empty, push one Suggestion per term from `collectListOffendingTerms(effectiveBd)` (label = term, emptyListVariant = 'my' or 'tag'). No totalCards constraint.
- **Name-token spellcheck (Spec 163):** After bare-term-upgrade, before oracle: `buildNameTypoSuggestion` in `app/src/name-typo-suggestion.ts` uses `index.nameWords` / `index.nameWordsByFirstChar`, `getBareNodes`, `levenshteinDistance`, `spliceQuery`, and `evaluateAlternative`. Priority **17**. Same pinned-zero skip as Spec 131. Tokens are **not** skipped merely because they appear in `nameWords` (zero hits can be “valid words that never appear together”). Chip **`label`** is the substituted name word only; **`query`** is the modified **live** query (evaluate with combined query internally; Issue #258).
- **Oracle hint (Spec 131):** After bare-term-upgrade, `buildSuggestions` picks **one** rewrite among phrase, ordered-regex (`o:/a.*b/`), per-word, and (if no primary wins) **single-token hybrid** splices, using counts and eligibility in Spec 131; implementation in `app/src/oracle-hint-edit.ts` + oracle block in `worker-suggestions.ts`.
- **Bare-term-upgrade (Spec 154):** In `buildSuggestions`, when totalCards === 0, call `getBareNodes(ast)` to collect positive BARE nodes; multi-word window pass then single-node pass; splice and evaluate each alternative; emit suggestions per Spec 154 (counts optional when > 0). Runs before the oracle block. Maintain **`oracleSuppressedBareValues`:** `Set` of lowercase bare **values** to omit from Spec 131’s trailing set. Add a value only when a **non-tag** alternative is emitted for that token: multi-word window — add all window token values **only if** `alts` includes at least one label that does **not** start with `otag:` or `atag:`; single-node loop — add `node.value` only for alternatives whose label is **not** `otag:`… / `atag:`…. **Multi-word:** `getMultiWordAlternatives` (keywords, artists, Spec 159 tag prefix on hyphen slug); **single-node:** `getBareTagPrefixAlternatives` after exact domains. **Priority:** non–tag domains use **16**; `otag:`… / `atag:`… use **21** (after oracle **20**).
- **Design note:** Future disambiguation specs (e.g. commander → name vs `f:` vs `is:commander`) may add new suggestion ids and priority slots between these tiers without collapsing oracle (**20**) and tag bare-term chips (**21**).
- **Wrong-field (Spec 153):** Unified by Spec 153. In `buildSuggestions`, when totalCards === 0, walk effectiveBd for FIELD/NOT nodes with trigger fields (is:, in:, type:) and known color values; suggest ci:/c:/produces: alternatives that return > 0. Uses `evaluateAlternative` from `worker-alternative-eval.ts`.
- **Artist-atag (Spec 153):** In `buildSuggestions`, when totalCards === 0, walk for a:/artist: and atag:/art: nodes; try swapped field; suggest if count > 0.
- **include-extras rider trigger:** `indicesBeforeDefaultFilter` defined and `(indicesBeforeDefaultFilter - totalCards) > 0`.
- **Rider order:** Fixed sequence `['empty-list', 'nonexistent-field', 'unique-prints', 'include-extras']` in `SuggestionList` (`RIDER_ORDER`; Spec 158). That order is unchanged by per-suggestion `priority` values — priority governs **empty-state** sort only (`mode="empty"`).
- **Field operator–value gap (Spec 177):** After the nonexistent-field block in `buildSuggestions`, when `totalCards === 0`, `hasLive`, and the Spec 131/154 pinned-empty skip passes: `buildFieldOperatorGapCleanup(effectiveQuery, parse(effectiveQuery))` from `shared/src/field-operator-gap-cleanup.ts`; emit `field-value-gap` with priority **15** only when `evaluateAlternative` returns `cardCount > 0` and `query` is not a duplicate rewrite. `SuggestionList` **`EMPTY_STATE_IDS`** must include `field-value-gap`.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/worker-protocol.ts` | Add `suggestions: Suggestion[]` to result; remove `oracleHint`, `indicesBeforeDefaultFilter`, `printingIndicesBeforeDefaultFilter` |
| `shared/src/suggestion-types.ts` | **New** — `Suggestion` type (worker-protocol carries it; shared is dependency-free) |
| `app/src/worker-search.ts` | Add `getListMask` to RunSearchParams; call `buildSuggestions` and include result in search result |
| `app/src/worker-suggestions.ts` | **New** — `buildSuggestions(params)` builds the full suggestions array (empty-list, include-extras, unique-prints, oracle, wrong-field, artist-atag) |
| `app/src/worker.ts` | Pass `getListMask` to runSearch |
| `app/src/SuggestionList.tsx` | **New** — Renders suggestion chips; empty-state vs rider layouts; fires `captureSuggestionApplied` on chip tap |
| `app/src/SearchResults.tsx` | Refactor: replace four `Show` blocks with `SuggestionList`; consume `suggestions` from context |
| `app/src/App.tsx` | Pass `suggestions` from worker result to pane state; remove `defaultListEmpty`, `oracleHint`, `indicesBeforeDefaultFilter` wiring |
| `app/src/pane-state-factory.ts` | Add `suggestions` to PaneState; remove `defaultListEmpty` |
| `app/src/DualWieldLayout.tsx` | Pass `suggestions` through `buildPaneContext` |

### Spec updates

| Spec | Update |
|------|--------|
| 057 | Add "Unified by Spec 151 (Suggestion System)" |
| 126 | Add "Unified by Spec 151" |
| 131 | Add "Unified by Spec 151" |
| 139 | Add "Unified by Spec 151" |
| 150 | Note SuggestionList uses ChipButton |

## Acceptance Criteria

1. After migration, empty-list CTA, include:extras, unique:prints, and oracle hint fire on the same triggers and perform the same actions. Layout may be improved; parity with pre-migration is not strict.
2. All suggestion chips use `ChipButton` with consistent styling.
3. Worker produces priority-ordered suggestions; when empty-list applies, SearchResults renders the Spec 126 block and skips inline chips.
4. Rider suggestions appear in fixed `RIDER_ORDER` when multiple apply (see placement table: `empty-list`, then `nonexistent-field` when Spec 158 applies, then `unique-prints`, then `include-extras`).
5. Works in single-pane and Dual Wield layouts.
6. `Suggestion` type and worker-owned logic support future triggers without main-thread changes.
