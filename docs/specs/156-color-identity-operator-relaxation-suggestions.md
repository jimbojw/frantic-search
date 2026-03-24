# Spec 156: Color / Color Identity Operator Relaxation Suggestions

**Status:** Implemented

**Depends on:** Spec 151 (Suggestion System), Spec 036 (Source Spans), Spec 002 (Query Engine), Spec 055 (Color / Color Identity Number Queries)

**Addresses:** [GitHub issue #179](https://github.com/jimbojw/frantic-search/issues/179) (color / `ci` operator relaxation; dedicated “comma as separator” education is a separate follow-up, but see **Replacement canonicalization** below)

## Goal

When a search returns zero results and the query uses **`=`** on **color** or **color identity** with a **non-numeric color value**, offer rewrite suggestions that relax the operator to the more common Scryfall-style meanings of **`:`** and (for identity only) **`>=`**. This teaches users that `=` requests an **exact** color bitmask match, while most intent is **subset** (identity) or **superset** (face color).

## Background

Users often type comma-separated pseudo-filters (see issue #179) and use **`=`** because it reads like “equals.” For `c` and `ci`, **`=`** means **exact** match on the color bitmask. That is much stricter than:

- **`ci:`** — for identity, `:` is treated as **subset** (card identity fits within the given colors; deck-building style).
- **`ci>=`** — identity **includes** at least the listed colors (superset of the query mask).
- **`c:`** — for face color, `:` is treated as **superset** (face has at least those colors).

So `ci=u` matches only cards whose identity is **exactly** blue, while `ci:u` matches any card legal in a mono-blue deck, and `ci>=u` matches any card whose identity includes blue. Similarly, `c=u` is exact monocolor blue on the face; `c:u` relaxes to “face includes blue.”

Evaluator semantics (canonical fields `color` and `identity`) are defined in `shared/src/search/eval-leaves.ts` (comments on colon vs `=` for these fields).

### Different from Spec 153 (Wrong Field)

Spec 153 swaps the **field** when the value belongs elsewhere (e.g. `is:white` → `ci:w`). This spec keeps **`c` / `ci` / `id` / `commander` / `cmd` (and other aliases for the same canonical fields)** and only changes the **comparison operator** when `=` is overly strict.

### Negation out of scope

**Do not** suggest relaxations for negated terms (e.g. `-c=u`, `-ci=wub`).

Rationale: a negated exact term is already a **broad** predicate. Replacing it with a **broader** positive operator under negation (e.g. `-c:u` instead of `-c=u`) **narrows** the result set, which is the opposite of “relaxation” from the user’s perspective and is easy to misread. Defer any negation story to a future spec if needed.

### Commas: education out of scope, canonicalization in scope

A **separate** spec or follow-up may teach users that commas are not field separators and suggest stripping stray commas more broadly. This spec does **not** require general comma detection or copy about separator mistakes.

**Replacement canonicalization (in scope):** When building the relaxed query, the rewritten clause must be **clean** — no spurious trailing comma left stuck to that clause. Example: if the user typed `ci=u,` (comma intended as a separator before the next pseudo-filter), the suggested full query must use **`ci:u`**, not **`ci:u,`**. Implementation may widen the splice span to consume a single trailing comma after the field term, post-process the segment, or equivalent; the observable rule is the suggested `query` string after tap.

## Trigger conditions

All of the following must hold:

1. **Zero results** — `totalCards === 0` for the effective (combined) query, consistent with Specs 131, 153, and 154.
2. **Pinned / live** — Match the **wrong-field** empty-state gate in `app/src/worker-suggestions.ts`: suggest only when `totalCards === 0`, the effective query produces a breakdown (`effectiveBd`), and **`!(hasPinned && pinnedIndicesCount === 0)`** (when a pinned segment exists but matches zero cards, skip — same as Spec 153 so empty-state suggestions stay consistent).
3. **Positive terms only** — The leaf is a **positive** `FIELD` node for color or identity. Skip nodes under **`NOT`** entirely.
4. **Operator is `=`** — Only the explicit **equals** operator triggers. Other operators (`:`, `>=`, `<=`, etc.) are already non-exact or numeric-count paths; do not suggest.
5. **Non-numeric value** — If the field value matches **`/^\d+$/`** (Spec 055 color/identity **count** path in `eval-leaves.ts`, e.g. `ci=2`, `c=01`), **do not** trigger. Relaxation is for **named / letter-sequence color masks**, not count semantics.
6. **Recognized color value** — The value must be a known color / identity literal in the same sense as Spec 153’s color domain: use **`isKnownColorValue`** from `shared/src/wrong-field-utils.ts` (keys of `COLOR_NAMES`, `colorless` / `multicolor`, valid WUBRG letter sequences per that helper). Require **`isKnownColorValue(value)`** and **not** `/^\d+$/` so count queries never slip through.

## Design

### Pattern

1. **Detection** — Walk the effective query AST (or breakdown derived from `parseBreakdown(effectiveQuery)`) and collect **positive** `FIELD` nodes whose resolved canonical field is **`color`** or **`identity`**, with operator **`=`**, satisfying the value rules above. Match every alias in `FIELD_ALIASES` that resolves to those canonicals — notably **`c` / `color`** (face) and **`ci` / `id` / `identity` / `commander` / `cmd`** (identity), per `shared/src/search/eval-leaves.ts`.
2. **Alternatives** — For each matching node, build replacement terms per the tables below. **Preserve the user’s field token exactly** as written (e.g. `commander=w` → `commander:w` or `id=w` → `id:w`, not `ci:w`) so the diff is minimal and matches how Spec 153 preserves labels when swapping fields. Only the **operator** changes (`=` → `:` or `>=`).
3. **Filter** — Evaluate each alternative query with `evaluateAlternative` (same as Spec 153). **Only** add a suggestion when **`cardCount > 0`**.
4. **Dedup** — If two alternatives produce **identical** full query strings or identical semantics (e.g. for **`c:`**, `:` may coincide with **`>=`** on bitmask values), emit **at most one** chip.
5. **Output** — One `Suggestion` per surviving alternative. Tapping replaces the **whole field term** via `spliceQuery` (or equivalent) using spans in effective-query coordinates (Spec 036). Apply **replacement canonicalization** so a trailing comma attached to that term is not carried into `newTerm` (see § Commas above).

### Suggestion model

- **`id`:** `relaxed` — aligns with the reserved union member in Spec 151 for “broader” reformulations.
- **Placement:** Empty state only (below Results Summary Bar), same as wrong-field and oracle.
- **Priority:** **24** — after wrong-field (22), before artist–atag (25). Spec 151’s priority table lists this row; keep the two docs aligned.
- **Variant:** `rewrite`.
- **Label:** The replacement term (e.g. `ci:u`, `ci>=u`).
- **Explain:** Short teaching copy distinguishing exact vs subset vs includes (see table).
- **`count` / `printingCount`:** When `evaluateAlternative` reports `cardCount > 0`, set both the same way as **wrong-field** suggestions in `worker-suggestions.ts` (two-line chip counts). Omit when zero (those alts are not emitted).
- **docRef:** Use the same slugs as Spec 153 for the field being relaxed: **`reference/fields/face/identity`** for identity (`ci`, `id`, `commander`, `cmd`, …) chips; **`reference/fields/face/color`** for color (`c`, …) chips.

### Alternatives by canonical field

#### Identity (`ci`, `id`, `identity`, `commander`, `cmd`, …)

| Replacement | Meaning (user-facing explain) |
|-------------|-------------------------------|
| `{field}:{value}` | Identity **fits within** these colors (subset). Typical for deck legality style queries. |
| `{field}>={value}` | Identity **includes** at least these colors (superset). |

**Order:** Suggest **`:`** before **`>=`** when both are emitted. This is **deck-building / teaching order** (subset-style `:` first, then includes-style `>=`), not a strict guarantee that one alternative is always a subset of the other in **card-count** terms — Spec 151 “narrowest first” applies where alternatives are strictly ordered by specificity; here prefer **most common user intent** first.

#### Color (`c`, …)

| Replacement | Meaning (user-facing explain) |
|-------------|-------------------------------|
| `{field}:{value}` | Face color **includes** at least these colors (colon is superset for `c`). |

Do **not** emit a separate `{field}>={value}` chip when it is **semantically identical** to `{field}:{value}` for bitmask values on the color field.

### Examples

| Query (illustrative) | Matching term | Suggestions (if counts > 0) |
|----------------------|---------------|-----------------------------|
| `ci=u o:surveil t:pl` | `ci=u` | `ci:u`, `ci>=u` |
| `ci=u, o=surveil …` | `ci=u` (with trailing comma in source) | Full suggested `query` contains `ci:u` / `ci>=u` — **not** `ci:u,` |
| `ci=wub` | `ci=wub` | `ci:wub`, `ci>=wub` |
| `c=u t:creature` | `c=u` | `c:u` |
| `id=azorius` | `id=azorius` | `id:azorius`, `id>=azorius` |
| `commander=azorius` | `commander=azorius` | `commander:azorius`, `commander>=azorius` |

### Multiple matching terms

If several positive color or identity `=` terms appear (any alias, e.g. `c=`, `ci=`, `commander=`), evaluate suggestions **per term** independently (same pattern as Spec 153 multi-offender). Optional future cap on total chips if the UI becomes noisy.

## Out of scope

- **Negated** color / identity terms (`-c=…`, `-ci=…`).
- Standalone **comma-as-separator** suggestions or teaching copy (broader than canonicalizing the relaxed clause).
- **`produces:`** and other non-`c` / non-`ci` color-adjacent fields (may be a later spec if the same confusion appears).
- Changing parser or evaluator semantics — suggestions only.

## Worker and UI integration

- Add detection and suggestion building in `buildSuggestions` (or a small dedicated module called from it), after higher-priority empty-state suggestions as appropriate, reusing `evaluateAlternative` and `spliceQuery` on the **effective** query string.
- Ensure `relaxed` is included in `EMPTY_STATE_IDS` in `SuggestionList.tsx` — **required** for empty-state rendering; without it, worker-emitted `relaxed` suggestions are filtered out.
- No change to `shared/src/suggestion-types.ts` — `id: 'relaxed'` is already in the `Suggestion` union; this spec is the first concrete trigger that uses it.

## Tests

- **Unit tests** (shared): helper that lists alternatives for a given canonical field + user field token + value; tests for **`/^\d+$/` exclusion**, **`isKnownColorValue` false → no alts**, negation handled at worker (no positive `FIELD` under `NOT`).
- **Worker / integration tests:** Zero-result queries with `ci=u`-style terms produce expected chips when the relaxed query would match cards in the test index; negated queries produce **no** relaxation chips. Include a case where the source term is written `ci=u,` and assert the suggestion’s `query` does not contain `ci:u,`.

## Acceptance criteria

1. `ci=u` (with other terms that force zero combined results) can show `ci:u` and/or `ci>=u` chips when those queries return at least one card.
2. `c=u` can show `c:u` when that query returns at least one card.
3. `ci=2` / `c=1` (numeric count values) do **not** trigger this suggestion class.
4. `-ci=u` and `-c=u` do **not** trigger relaxation suggestions.
5. Tapping a chip applies the full effective query with the corresponding term replaced; spans remain correct under pinned + live composition (Spec 036 / Spec 153 patterns).
6. Suggestions appear only when `totalCards === 0` (empty state), with priority consistent with Spec 151.
7. No duplicate chips for semantically identical `c:` vs `c>=` rewrites.
8. If the relaxed field term in the source is immediately followed by a comma used as a mistaken separator (e.g. `ci=u,`), the suggested full query uses the relaxed operator **without** that trailing comma on the clause (e.g. `ci:u`, not `ci:u,`).

## Implementation notes

- **Shared:** `COLOR_EQUALS_RELAX_FIELDS`, `IDENTITY_EQUALS_RELAX_FIELDS`, and `getOperatorRelaxAlternatives` live in [shared/src/wrong-field-utils.ts](../../shared/src/wrong-field-utils.ts); unit tests in [shared/src/wrong-field-utils.test.ts](../../shared/src/wrong-field-utils.test.ts).
- **Worker:** [app/src/worker-suggestions.ts](../../app/src/worker-suggestions.ts) emits `id: 'relaxed'` suggestions at priority **24** in the same empty-state gate as wrong-field; uses `collectFieldNodes` with operator `=`, positive `FIELD` nodes only, and `evaluateAlternative` / `spliceQuery` on the effective query. Integration tests: [app/src/worker-search.test.ts](../../app/src/worker-search.test.ts) (`operator relaxation suggestions (Spec 156)`).
- **Trailing comma:** The lexer attaches a comma to the field value word (e.g. `c=r,` → value token `r,`). The worker’s value predicate accepts that form when the prefix before the comma is a known non-count color; it strips the comma for building replacement labels. The breakdown span covers the full `field=value` token including the comma, so replacing with `c:r` removes the stray comma from the suggested full query.
- **UI:** [app/src/SuggestionList.tsx](../../app/src/SuggestionList.tsx) includes `relaxed` in `EMPTY_STATE_IDS`.

## Scope of changes (anticipated)

| Area | Change |
|------|--------|
| `docs/specs/156-…` (this file) | Design reference; update **Status** and **Implementation Notes** when implemented |
| `shared/src/` | Helper(s) for “eligible FIELD node + alternatives” and tests |
| `app/src/worker-suggestions.ts` (or sibling module) | Build `relaxed` suggestions when triggers match |
| `app/src/SuggestionList.tsx` | Add `relaxed` to `EMPTY_STATE_IDS` so chips render in the empty state |
| `docs/specs/151-suggestion-system.md` | Kept in sync with this spec (empty-state ids, priority **24**, SuggestionList row, migration table, future-trigger note for small-result vs `relaxed`). Re-verify when marking 156 **Implemented**. |

## Related documentation (Spec 151)

Spec 151 previously listed `(future) relaxed` at priority **35** and a conflicting “small result set” row using the same id. This spec **defines** `relaxed` as priority **24**, empty-state only; Spec 151 has been updated alongside this draft. When marking Spec 156 **Implemented**, confirm Spec 151 still matches (especially if either doc moves again).
