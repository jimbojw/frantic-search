# Spec 158: Nonexistent Field Name Suggestions (Pedagogical Field Mapping)

**Status:** Draft

**Depends on:** Spec 151 (Suggestion System), Spec 036 (Source Spans), Spec 002 (Query Engine)

**Related:** Spec 153 (Wrong Field) — same splice mechanics and teaching pattern, but different trigger semantics (see **Different from Spec 153** below).

## Goal

When the query contains a **field name that Frantic Search and Scryfall do not support**, but the product can infer a **single obvious supported field** the user likely meant, offer a **rewrite suggestion** that replaces the mistaken field while preserving operator, value, and negation.

This is **pedagogy first**: the chip teaches correct syntax. **Do not** require zero results for the overall query, and **do not** require (or compute) alternative result counts for the rewritten query unless we later opt in for display polish.

**MVP example class:** Users familiar with rules vocabulary sometimes type `supertype:` or `subtype:`; Scryfall uses **`t:`** (type line) for substring matching across supertypes, card types, and subtypes. Those pseudo-fields are **not** in `FIELD_ALIASES`; the evaluator reports an unknown field, which may still allow **other** clauses to return cards (e.g. `ci:g subtype:elf` matches green cards while `subtype:elf` is erroneous).

## Background

- The parser produces `FIELD` nodes for `word operator value` shapes and `REGEX_FIELD` for `word operator /regex/` even when `word` is not a known field (`shared/src/search/parser.ts`).
- Unknown fields fail in `evalLeafField` with `unknown field "…"` and do not match cards (`shared/src/search/eval-leaves.ts`).
- In **compound** queries, the user may see **non-empty** results from sibling terms while the breakdown still shows the bad field as an error. Hiding a fix until `totalCards === 0` would miss the clearest teaching moment.
- Spec 153 **wrong-field** suggestions assume the field **exists** but is the wrong *bucket* for the value, and they **gate** on `totalCards === 0` and on **positive** alternative counts. This spec deliberately **does not** reuse those gates.

## Different from Spec 153

| Aspect | Spec 153 (wrong-field) | Spec 158 (nonexistent-field) |
|--------|-------------------------|------------------------------|
| Field in query | Known field, wrong semantics for the value | Field name **not** in `FIELD_ALIASES` (and not otherwise special-cased) |
| Typical user mental model | "I used `is:` but meant color" | "I used rules jargon / another product's syntax" |
| `totalCards === 0` | Required | **Not** required |
| `evaluateAlternative` / counts | Required for emitted chips (alternatives must match) | **Not** required for MVP; **omit** `count` / `printingCount` on the suggestion |
| Placement | Empty state only | **Empty state and rider** (non-empty results allowed) |

## Design

### Registry (normative)

Maintain an explicit **mapping table** from **lowercase mistaken field name** (the parser’s `field` token **without** a colon, e.g. `subtype` for input `subtype:elf`) → **rewrite template**. Match **after** `field.toLowerCase()`; registry keys never include `:`.

MVP rows:

| Mistaken field (case-insensitive) | Canonical field | Notes |
|-----------------------------------|-----------------|--------|
| `supertype` | `t` | Type line substring covers supertypes (e.g. Legendary). |
| `subtype` | `t` | Type line substring covers creature / artifact types, etc. |

**Extension rule:** New rows are added only when the team agrees there is a **single** unambiguous supported field and high user confusion; avoid fuzzy typo expansion here (reserve typos for a separate near-miss / spellcheck style trigger if ever added).

**Non-goals for MVP:** Guessing from arbitrary unknown fields; suggesting multiple competing fields for one mistake.

### Detection

1. Parse the **effective** query with `parseBreakdown(effectiveQuery)` (same string family as Spec 153). Recurse through `AND` / `OR` / `NOT` like other suggestion walkers.
2. Walk **positive** `FIELD` nodes: if `field.toLowerCase()` is a registry key **and** the value is **non-empty** (after the parser’s normal unquoting), the clause is eligible. **Skip** registry-matched fields with an **empty** value (e.g. `subtype:` with no right-hand side): the query is incomplete and a `t:`-only chip is not useful.
3. Walk **positive** `REGEX_FIELD` nodes the same way: if `field.toLowerCase()` is a registry key and the regex pattern is non-empty, eligible. Rewrite keeps the operator and `/pattern/` (e.g. `subtype:/elf/` → `t:/elf/`).
4. Walk **negated** clauses: `NOT` whose single child is an eligible `FIELD` or `REGEX_FIELD` (e.g. `-subtype:elf`, `-subtype:/elf/`) — same span replacement shape as Spec 153 negation handling.
5. **Quoted values, operators:** Preserve the clause’s operator and value (word, quoted, or regex) exactly; only the **field identifier** changes (e.g. `subtype:elf` → `t:elf`, `-supertype:legendary` → `-t:legendary`).

### Rewrite and splice

- Use **`spliceQuery`** from `app/src/query-edit-core.ts` on the **effective** query string at the node span (Spec 036 coordinates), identical in spirit to Spec 153:
  - **Canonical spelling:** For registry rows that map to the type-line field, the spliced **`label` and `query` must use `t:`** (not `type:`), even though `type:` is a valid alias — one spelling avoids mixed chips and matches docs.
  - Positive `FIELD`: replace the node span with `t:{operator}{value}` using the same operator and value the user typed (including quotes if present in the span).
  - Positive `REGEX_FIELD`: replace the node span with `t:{operator}/{pattern}/`.
  - Negated: replace the **`NOT` node span** with `-t:…` (or `-t:/…/` for regex) so the leading minus is preserved.
- **One suggestion per offending breakdown span** after deduplication: if two spans would yield the **same** `query` string, emit **one** chip.

**Implementation note:** Breakdown nodes carry `label` but not a separate `field` property. Walk the **AST** from the same effective query parse if you need `field` / `pattern` / `operator` structurally; or derive replacement text from `label` + `valueSpan` / spans with tests. Either way, behavior must match the acceptance criteria.

### Suggestion model

- **`id`:** `nonexistent-field` — add to the `Suggestion.id` union in `shared/src/suggestion-types.ts` and to the Spec 151 type block when implementing.
- **`variant`:** `rewrite`.
- **`priority`:** **14** — corrects an **invalid field name** before `bare-term-upgrade` (16) and oracle (20): the clause is actively wrong for the engine, not merely a missing prefix on an otherwise legal bare term.
- **`label`:** The replacement clause as the user would type it (e.g. `t:elf`, `-t:legendary`).
- **`query`:** Full effective query with that clause spliced.
- **`explain`:** Short teaching line, e.g. for supertype/subtype: Scryfall does not define separate `supertype:` / `subtype:` fields; **`t:`** searches the type line. Wording can vary per registry row.
- **`docRef`:** `reference/fields/face/type` (or current path for the `t:` / type line field doc).
- **`count` / `printingCount`:** **Omit** for MVP (no alternative evaluation required).

### Trigger summary

| Condition | Required? |
|-----------|-----------|
| Effective query contains at least one registry-matched `FIELD` or `REGEX_FIELD` with non-empty value/pattern (or negated equivalent) | Yes |
| `totalCards === 0` | **No** |
| Rewritten query matches any cards | **No** |

### Placement (Spec 151)

- **Empty state:** Include `nonexistent-field` in the empty-state suggestion list; sort with other empty-state ids by **`priority`**.
- **Rider (non-empty results):** Include `nonexistent-field` in the rider allowlist. **`SuggestionList`** today uses a **fixed `RIDER_ORDER`** (`app/src/SuggestionList.tsx`); extend it so this id appears in a defined position. **Recommended order:** `empty-list`, **`nonexistent-field`**, `unique-prints`, `include-extras` — teach bogus-field fixes before dedup / extras riders.

### Dedup and interaction

- If the rewritten `query` is **identical** to another suggestion’s `query` from the same `buildSuggestions` pass, emit **one** chip.
- **Pinned + live:** Spans are in **effective** query coordinates; the worker’s `query` field is the full effective string after splice (same as Spec 153). The app applies via `setQuery` per existing behavior.

### Analytics

- Tapping the chip fires **`suggestion_applied`** (Spec 085 / Spec 151) with `suggestion_id: 'nonexistent-field'`, `mode: 'empty' | 'rider'` as appropriate.

## Scope of Changes (implementation checklist)

| Area | Change |
|------|--------|
| `shared/src/suggestion-types.ts` | Add `'nonexistent-field'` to `Suggestion.id`. |
| `shared/src/` (new or existing util) | Registry map + helper: `getNonexistentFieldRewrite(fieldLower): { canonical: string, explain: string } \| null` (`canonical` is the short field token for output, e.g. `t`). |
| `app/src/worker-suggestions.ts` | In `buildSuggestions`, detect registry matches on effective breakdown; push suggestions **without** `totalCards` or `evaluateAlternative` gates. |
| `app/src/SuggestionList.tsx` | Add id to `EMPTY_STATE_IDS`; append to `RIDER_ORDER` per placement above. |
| `docs/specs/151-suggestion-system.md` | Keep placement / priority / migration in sync; **§ Implementation notes** `RIDER_ORDER` must list `nonexistent-field` (Spec 158). |
| Tests | Worker or integration tests: `subtype:elf` alone; `ci:g subtype:elf` with **non-zero** results — suggestion still present; negated `-subtype:elf`; `subtype:/elf/` → `t:/elf/`; **`subtype:`** (empty value) — **no** suggestion; dedup when two mistakes collapse to same query. |

## Acceptance Criteria

1. `subtype:elf` produces a suggestion whose label/query uses `t:elf` (or agreed canonical), with teaching `explain` and type-line `docRef`, **regardless** of card count for the full query or the rewritten query.
2. `supertype:legendary` produces an equivalent `t:legendary` suggestion under the same rules.
3. `ci:g subtype:elf` with **positive** results from `ci:g` still shows the `t:elf` suggestion (rider context), and tapping applies `ci:g t:elf` (spacing per normal effective query rules).
4. `-subtype:elf` suggests `-t:elf` with negation preserved.
5. `subtype:/elf/` (or equivalent non-empty regex value) suggests `t:/elf/` with the same operator and pattern preserved.
6. Multiple distinct offending clauses in one query produce **distinct** suggestions when the rewritten full queries differ; identical outcomes dedupe to one chip.
7. Known real fields (e.g. `t:elf`) do **not** trigger this path.
8. `subtype:` (or `supertype:`) with **no** value after the operator does **not** emit a nonexistent-field suggestion.
9. Spec 151 rider and empty-state documentation matches implemented `RIDER_ORDER` and priority.

## Implementation Notes

- *(None yet — append when implementation deviates from this draft.)*
