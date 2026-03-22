# Spec 147: Produces Mana — Evaluator

**Status:** Implemented

**Depends on:** Spec 146 (Produces ETL and Storage), Spec 002 (Query Engine)

## Goal

Implement the evaluator integration for `produces` queries so that queries like `produces:wu`, `produces=wug`, and `produces<g` correctly match cards based on the mana they can produce. This spec covers the evaluator only; Spec 146 established the ETL, storage, and CardIndex materialization.

## Background

Scryfall supports `produces:` and `produces=` to find cards that produce specific types of mana. Empirical testing (undocumented) shows they also support comparison operators:

- **`:` (colon)** — Alias for `>=`. "Produces at least these symbols" (superset). E.g. `produces:wug` includes cards that say "Add one mana of any color" (WUBRG ⊇ WUG).
- **`=`** — Exact match. Card produces exactly these symbols, no more, no less.
- **`<`** — "Produces some subset of." Card produces only symbols that appear in the query (subset semantics).
- **`>`, `<=`, `>=`, `!=`** — Standard comparisons on the symbol set, mirroring `mana:` (Spec 008) and `color:` (Spec 002).

Scryfall does not support the `T` symbol (Sole Performer) in `produces` queries — it returns "Unknown color t." This appears to be an accident rather than an intentional omission. We take the **principled stance** that we support whatever symbols appear in the data. Spec 146's dynamic key discovery and ETL already handle `T` organically; the evaluator simply looks up each query character in `producesMasks` without special-casing.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Evaluator: `produces` field handling in eval-leaves | Parser: `produces` field alias (parser accepts any `WORD:value`) |
| Field alias: add `produces` to FIELD_ALIASES | Reference docs, syntax help, compliance tests |
| All operators: `:`, `=`, `!=`, `<`, `>`, `<=`, `>=` | |

## Value Parsing

Resolution order:

1. **Numeric value.** If `val` parses as a non-negative integer (e.g. `"0"`, `"1"`, `"2"`, `"6"`), treat as a **count-based predicate** on distinct symbol types. All symbol types are counted: W, U, B, R, G, C, T, and any others in the data. Scryfall counts C; our principled stance is to count T as well. **All comparators apply:** `=`, `!=`, `<`, `<=`, `>`, `>=`, and `:` (alias for `>=`). E.g. `produces=2` matches [[Stomping Ground]] (R+G = 2 types); `produces>2` matches [[Abzan Banner]] (W+B+G = 3 types); `produces<2` matches cards with 0 or 1 symbol types; `produces=0` means cards that produce no mana.
2. **Named lookup.** Check `COLOR_NAMES[value.toLowerCase()]`. If found:
   - **Color bitmask** (e.g. `azorius` → WU, `bant` → GWU): Convert to produces mask by iterating W,U,B,R,G; for each bit set in the color mask, OR in `producesMasks[letter]` (if that symbol exists in the data).
   - **`colorless` / `c`:** Use `producesMasks["C"]` (if present). If C is not in data, query mask is 0.
   - **`multicolor` / `m`:** Match cards that **produce 2 or more different colors/types, including colorless**. E.g. [[Adarkar Unicorn]] produces either `{U}` or `{U}{C}`; when it produces `{U}{C}` that is 2 distinct types (blue + colorless), so it satisfies `produces:multicolor`. Implementation: `popcount(producesData[i]) >= 2`. This is a count-based predicate, not a symbol-set query — the standard operators (`:`, `=`, `<`, etc.) do not apply; treat `produces:multicolor` and `produces=multicolor` equivalently as "count >= 2".
3. **Letter-sequence fallback.** Each character in `val.toUpperCase()` is looked up in `producesMasks`. If **any** character has no entry, return error: `unknown symbol "X"` (uppercase the offending character in the message). A card *can* produce both colorless and colored mana (e.g. many nonbasic lands); `produces:cw` is valid and matches such cards — no special error.
4. **Build query mask:** `queryMask = OR of producesMasks[ch]` for each resolved symbol.

Examples:
- `produces:wu` → `queryMask = producesMasks["W"] | producesMasks["U"]`
- `produces=azorius` → same as `produces=wu` (named combo)
- `produces:c` → `producesMasks["C"]`
- `produces:t` → `producesMasks["T"]` (Sole Performer; only if T is in data)
- `produces:x` → Error: `unknown symbol "X"`
- `produces:multicolor` → Count-based: match cards where `popcount(producesData[i]) >= 2` (e.g. Adarkar Unicorn with U+C)
- `produces=2` → Count-based: match cards where `popcount(producesData[i]) === 2`
- `produces>2` → Count-based: match cards with more than 2 types (e.g. Abzan Banner)
- `produces<2` → Count-based: match cards with 0 or 1 types
- `produces=0` → Cards that produce no mana (replaces former `null`)
- `produces:6` → Count-based: match cards with 6+ symbol types (e.g. lands with C + any color)

**Empty value:** `produces:` (no value after the colon) is a special case. Normally `:` aliases to `>=` (superset), but `>=` over an empty query set would match every card, which is unhelpful. Our approach: **yield the same result as `produces>0`** — cards that produce at least one mana symbol.

## Operator Semantics

The operator semantics mirror `mana:` (Spec 008) and `color:` — bitmask subset/superset comparisons. Let `card = producesData[i]` and `query = queryMask`.

| Operator | Semantics | Logic |
|----------|-----------|-------|
| `:` | Alias for `>=` | Card produces at least all query symbols |
| `>=` | Superset | `(card & query) === query` |
| `=` | Exact | `(card & query) === query && (card & ~query) === 0` |
| `>` | Strict superset | Superset and not exact |
| `<=` | Subset | Card produces only symbols in query: `(card & ~query) === 0` |
| `<` | Strict subset | Subset and not exact |
| `!=` | Not equal | `!(exact)` |

**Count-based predicates** (`produces:multicolor`, `produces:n`): These bypass symbol-set comparison. Both use `popcount(producesData[i])` — all symbol types (WUBRG + C + T + any others) count. `multicolor` uses "count >= 2" (equivalent to `produces>=2`). For numeric, **all comparators apply** in the usual way: `=`, `!=`, `<`, `<=`, `>`, `>=`; `:` aliases to `>=`.

### Examples (Scryfall-aligned)

| Query | Meaning |
|-------|---------|
| `produces:wu` | Cards that produce at least W and U (e.g. dual lands, Birds of Paradise) |
| `produces=azorius` | Same as `produces=wu` (named combo via COLOR_NAMES) |
| `produces=wu` | Cards that produce exactly W and U (no other colors) |
| `produces<g` | Cards that produce a subset of {G} — i.e. only G, or nothing |
| `produces:wug` | Cards that produce at least W, U, G (includes "any color" sources) |
| `produces:c` | Cards that produce colorless mana |
| `produces:t` | Cards that produce T (Sole Performer; Scryfall returns error, we match) |
| `produces:` | Same result as `produces>0` (cards that produce any mana) |
| `produces=0` | Cards that produce no mana |
| `produces>0` | Cards that produce any mana |
| `produces:multicolor` | Cards that produce 2+ distinct symbol types (equiv. `produces>=2`) — e.g. Adarkar Unicorn |
| `produces=2` | Cards that produce exactly 2 distinct symbol types — e.g. Stomping Ground (R+G) |
| `produces>2` | Cards that produce more than 2 types — e.g. Abzan Banner (W+B+G) |
| `produces<2` | Cards that produce 0 or 1 symbol types |
| `produces:6` | Cards that produce 6+ symbol types — e.g. lands with C + any color |

## Implementation

### Field alias

Add to `FIELD_ALIASES` in `eval-leaves.ts`:

```ts
produces: "produces",
```

No short alias (Scryfall uses `produces` only).

### evalLeafField case

Add a new `case "produces":` in the `switch (canonical)` block. **Empty-value guard:** The existing `if (val === "")` at the top of `evalLeafField` calls `fillCanonical` and returns. For `produces`, we need different behavior. Add an exception: when `canonical === "produces"` and `val === ""`, skip the early return so control reaches the produces case, which handles empty as "produces something". Steps:

1. **Empty value:** Same result as `produces>0` — match cards with `popcount(producesData[i]) > 0`. For each face `i`, if `index.producesData[i] !== 0`, set `buf[cf[i]] = 1`. Return `null`.
2. **Resolve value** (use a helper e.g. `parseProducesValue(val, producesMasks)`):
   - **Numeric:** If `val` parses as non-negative integer `n`, use count-based semantics: for each face, let `c = popcount(producesData[i])`; apply operator: `=` → `c === n`, `!=` → `c !== n`, `<` → `c < n`, `<=` → `c <= n`, `>` → `c > n`, `>=` / `:` → `c >= n`.
   - **multicolor:** If named lookup yields `COLOR_MULTICOLOR`, use count-based semantics: match iff `popcount(producesData[i]) >= 2`. Operators `:` and `=` both behave the same (count >= 2).
   - **Named lookup** via `COLOR_NAMES` for other values. Convert color bitmask → produces mask by iterating `COLOR_FROM_LETTER` keys; for each bit set, OR in `producesMasks[letter]`. Handle colorless.
   - **Letter-sequence fallback:** for each `ch` in `val.toUpperCase()`, look up `producesMasks[ch]`. If any is `undefined`, return error `unknown symbol "X"` (X = first bad character).
   - If resolution yields `queryMask === 0` (e.g. colorless but C not in data), return error `unknown symbol "c"` or equivalent.
3. **Iterate over faces:** For symbol-set queries, let `card = index.producesData[i]` and apply operator logic. For count-based (numeric, multicolor), use the special logic above. Write to `buf[cf[i]]` (canonical-face indexing per Spec 033).

Import `COLOR_NAMES`, `COLOR_FROM_LETTER`, `COLOR_COLORLESS`, `COLOR_MULTICOLOR` from `../bits` as needed.

### Edge cases

| Case | Behavior |
|------|----------|
| `produces:x` (X not in data) | Error: `unknown symbol "X"` |
| `produces:wux` (X unknown) | Error: `unknown symbol "X"` |
| `produces:azorius` | Resolved via COLOR_NAMES → WU |
| `produces:multicolor` | Match cards with `popcount(producesData[i]) >= 2` (2+ symbol types) |
| `produces=2` | Match cards where `popcount(producesData[i]) === 2`; `produces>2` matches Abzan Banner (3 types) |
| `produces:cw` | Valid: matches cards that produce at least C and W (e.g. lands with "{T}: Add {C} or {W}") |
| `produces:` (empty value) | Same result as `produces>0` |
| `produces=0` | Match cards that produce no mana |
| `produces>0` | Match cards that produce any mana |

## Test Strategy

### Fixture updates

The synthetic pool (`evaluator.test-fixtures.ts`) has `produces: {}`. Add produces data for cards that logically produce mana based on oracle text. In the current 9-card pool, only Birds of Paradise and Sol Ring produce mana:

| Card (face) | Oracle hint | produces |
|-------------|-------------|----------|
| Birds of Paradise (#0) | "Add one mana of any color" | W, U, B, R, G |
| Sol Ring (#3) | "{T}: Add {C}{C}" | C |
| Others | No mana production | (none) |

Minimal fixture for evaluator tests:

```ts
produces: {
  C: [3],           // Sol Ring (canonical face 3)
  W: [0], U: [0], B: [0], R: [0], G: [0],  // Birds (any color)
},
```

For richer tests (`produces=wu`, `produces<g` with a G-only producer), consider adding a synthetic dual land (WU) and a Llanowar-style dork (G only). For `produces:t`, add a synthetic "Sole Performer" card with `produces: { T: [canonicalFace] }` to exercise the principled stance. For `produces:2`, a dual land (e.g. WU) exercises the exact-count semantics. For `produces:6`, add a land that produces both C and any color (WUBRG+C). For `produces:multicolor` with 2 types including colorless, add an Adarkar Unicorn–style card that produces both U and C.

### Test cases (minimal fixture)

| Query | Expected | Notes |
|-------|----------|-------|
| `produces:c` | 1 | Sol Ring |
| `produces:g` | 1 | Birds |
| `produces:wu` | 1 | Birds |
| `produces:wug` | 1 | Birds |
| `produces=wubrg` | 1 | Birds (exactly all five) |
| `produces=wu` | 0 | No card produces exactly WU in minimal fixture |
| `produces<g` | 7 | Cards producing nothing (subset of {G}) |
| `produces:x` | Error | Unknown symbol "X" |
| `produces:azorius` | 1 | Named combo: Birds produces at least WU |
| `produces=azorius` | 0 | Exact: no card produces exactly WU in minimal fixture |
| `produces:` | 2 | Empty value = cards that produce any mana (Birds, Sol Ring) |
| `produces=0` | 7 | Cards that produce no mana |
| `produces>0` | 2 | Cards that produce any mana (Birds, Sol Ring) |
| `-produces=0` | 2 | NOT produces nothing = produces something |
| `produces:multicolor` | 1 | Birds (produces WUBRG = 5 types) — add dual-land for 2, Adarkar-style for U+C |
| `produces=2` | 0 | Minimal fixture: Birds=5, Sol Ring=1; add dual WU land |
| `produces>2` | 1 | Birds (5 types) |
| `produces<2` | 8 | Cards with 0 or 1 types (7 non-producers + Sol Ring) |

### Error behavior

- Unknown field: unchanged — `produces` is a known field after this spec.
- Unknown symbols produce error: `produces:x` returns error `unknown symbol "X"`.
- `produces:multicolor` is a valid query (match cards with 2+ symbol types); no longer an error.
- `produces:cw` is valid: cards can produce both colorless and colored mana (e.g. many nonbasic lands).
- `produces=0` and `produces>0` are valid queries (not errors); test in evaluator.test.ts.

## File Changes Summary

| File | Changes |
|------|---------|
| `shared/src/search/eval-leaves.ts` | Skip empty-value early-return for produces; add `produces` to FIELD_ALIASES; add `case "produces":` with resolution (COLOR_NAMES, letter sequence, numeric with full comparators), operator dispatch, and empty-value = produces something |
| `shared/src/search/evaluator.test-fixtures.ts` | Add `produces` object to TEST_DATA for cards that produce mana |
| `shared/src/search/evaluator.test.ts` | Add produces query tests (including named combos, empty value, numeric comparators) |
| `shared/src/search/evaluator-errors.test.ts` | Add error tests: `produces:x`, `produces:cw` |
| `docs/specs/002-query-engine.md` | Add `produces` to Supported Fields table |

## Acceptance Criteria

1. `produces:wu` matches cards that produce at least W and U (superset).
2. `produces=wu` matches cards that produce exactly W and U.
3. `produces<g` matches cards that produce a subset of {G} (subset semantics).
4. All operators `:`, `=`, `!=`, `<`, `>`, `<=`, `>=` work correctly.
5. `:` is an alias for `>=` (produces at least).
6. `produces:t` matches Sole Performer when T is in the data (principled divergence).
7. `produces:x` (unknown symbol) produces error `unknown symbol "X"`.
8. Empty value `produces:` yields the same result as `produces>0`.
9. `produces=0` matches cards that produce no mana; `produces>0` matches cards that produce any mana.
10. Named color combos (e.g. `produces:azorius`, `produces=bant`) resolve correctly via `COLOR_NAMES`.
11. `produces:multicolor` matches cards that produce 2+ distinct symbol types (including colorless) — e.g. Adarkar Unicorn.
12. `produces:n` (numeric) supports all comparators on symbol-type count: `produces=2`, `produces>2`, `produces<2`, etc. All types (WUBRG + C + T) count. E.g. `produces>2` matches Abzan Banner (W+B+G).
13. `npm run typecheck` passes.
14. `produces` added to Spec 002 Supported Fields table.

## Spec Updates

| Spec | Update |
|------|--------|
| 002 | Add `produces` to Supported Fields with operator semantics |
| 146 | Add implementation note: evaluator implemented in Spec 147 |
