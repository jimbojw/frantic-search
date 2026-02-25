# Spec 039: Non-Destructive Error Handling

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 021 (Inline Query Breakdown)

## Goal

Prevent malformed or unrecognizable search terms from zeroing out an otherwise valid query during live typing. Malformed terms become transparent to result filtering (they don't narrow or widen the result set) while the UI communicates the error directly on the offending term.

## Background

### The problem

The evaluator produces a `Uint8Array` bitmask per AST node. Leaf evaluation functions that encounter unrecognizable input — an unknown field name, an invalid regex pattern — silently return, leaving the buffer all-zeroes. When an all-zero leaf participates in an AND with valid siblings, the intersection zeroes out the entire result set.

Three cases today:

| Input | Root cause | `evalLeafField` / `evalLeafRegex` behavior | Result |
|---|---|---|---|
| `ci:` | Empty value (mid-typing) | `val === ""` → `fillCanonical` → universal set | All cards (transparent in AND) |
| `foo:bar` | Unknown field name | `!canonical` → early return → zeroed buffer | 0 cards (destructive in AND) |
| `o:/[/` | Invalid regex pattern | `new RegExp("[")` throws → caught → early return → zeroed buffer | 0 cards (destructive in AND) |

The first case is already handled well — an empty-value field acts as a no-op, and sibling terms continue filtering normally. The second and third cases are destructive: a single malformed term tanks the entire query.

### Motivating scenario

A user has a working query `t:creature f:edh` showing results. They begin typing a regex: `t:creature f:edh o:/[`. The moment `/[` is parsed, `evalLeafRegex` fails to construct the regex, the leaf evaluates to 0 cards, AND propagation zeroes the result set, and all cards disappear. The user sees 0 results until they finish typing a valid regex — even though `t:creature f:edh` alone matches thousands of cards.

### Scryfall's behavior

Scryfall ignores unrecognized terms entirely and displays a message: *'Invalid expression "foo:b" was ignored. Unknown keyword "foo".'* The results reflect only the valid portions of the query.

For format fields specifically, Scryfall also validates values against its known format list. Searching `f:comma t:creature` yields 17,878 results (the `t:creature` count) and the message *'Invalid expression "f:comma" was ignored. Unknown game format "comma".'*

This spec brings Frantic Search broadly in line with that behavior, with one intentional divergence documented in § 2 below.

## Design

### 1. Error state in `ComputedResult`

Add an optional `error` field to `ComputedResult`:

```typescript
export interface ComputedResult {
  buf: Uint8Array;
  matchCount: number;
  productionMs: number;
  error?: string;
}
```

When `error` is set, `matchCount` is `-1` and `buf` is an empty `Uint8Array(0)` — the same representation as NOP. The error string is a short, human-readable reason (e.g., `"unknown field"`, `"invalid regex"`).

### 2. Error detection in leaf evaluators

The three leaf evaluation functions (`evalLeafField`, `evalLeafRegex`, `evalLeafBareWord`) currently return `void`. Change them to return `string | null` — `null` on success, or an error reason string on failure.

#### `evalLeafField`

Three error conditions:

1. **Unknown field** — `FIELD_ALIASES[node.field.toLowerCase()]` returns `undefined`. Today this is checked *after* the `val === ""` early return, which means `foo:` (unknown field, empty value) silently matches everything. Swap the check order so unknown fields are detected regardless of value:

```typescript
function evalLeafField(node: FieldNode, index: CardIndex, buf: Uint8Array): string | null {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  if (!canonical) {
    return `unknown field "${node.field}"`;
  }
  if (node.value === "") {
    fillCanonical(buf, index.canonicalFace, index.faceCount);
    return null;
  }
  // ... existing evaluation logic ...
  return null;
}
```

This means `foo:` is now an error, while `ci:` (known field, empty value) continues to match everything as a transparent incomplete filter.

**Intentional divergence from Scryfall:** Scryfall handles `foo:` by stripping the trailing colon (its unquoted string comparison is punctuation- and whitespace-stripped), effectively treating it as a bare word search for `foo`, which matches ~69 cards by name. This is the same kind of stripping that makes `foo/` a bare token — trailing punctuation is dropped for field comparisons. We could apply the same logic, but treating `foo:` as an error is a more principled choice: the colon is a field operator, not trailing punctuation, and the user clearly intended a field-qualified search. Displaying an error gives them immediate feedback that `foo` is not a recognized field, rather than silently degrading to a name search they didn't ask for.

2. **Unknown closed-set value** — Some fields have a finite, known set of valid values. An unrecognized value for these fields is an error, not a legitimate zero-result query. This matches Scryfall, which explicitly ignores unknown values for these fields (e.g., *'Unknown game format "comma"'*, *'Checking if cards are "xyz" is not supported'*).

The closed-set fields and their validation:

**`legal`/`f`/`format`, `banned`, `restricted`** — Valid values are the keys of `FORMAT_NAMES`. The evaluator already looks up `FORMAT_NAMES[valLower]` and finds `undefined` for unknown formats:

```typescript
case "legal":
case "banned":
case "restricted": {
  const formatBit = FORMAT_NAMES[valLower];
  if (formatBit === undefined) return `unknown format "${node.value}"`;
  // ... existing bitmask lookup ...
  return null;
}
```

**`is`** — The `is:` field has three tiers of keyword recognition:

- **Supported** — keywords we implement in `evalIsKeyword`. These are the switch cases (`permanent`, `spell`, `historic`, `party`, `outlaw`, `split`, `flip`, `adventure`, `leveler`, `saga`, `transform`, `modal`, `mdfc`, `dfc`, `meld`, `vanilla`, `frenchvanilla`, `commander`, `brawler`, `companion`, `partner`, `bear`, `reserved`, `funny`, `universesbeyond`, `hybrid`, `phyrexian`) plus the keys of `LAND_CYCLES` (`dual`, `shockland`, `fetchland`, `checkland`, `fastland`, `painland`, `slowland`, `bounceland`, `bikeland`/`cycleland`/`bicycleland`, `bondland`/`crowdland`/`battlebondland`, `canopyland`/`canland`, `creatureland`/`manland`, `filterland`, `gainland`, `pathway`, `scryland`, `surveilland`, `shadowland`/`snarl`, `storageland`, `tangoland`/`battleland`, `tricycleland`/`trikeland`/`triome`, `triland`, `karoo`). See Spec 040 for the extended keywords. These evaluate normally.

- **Unsupported** — keywords Scryfall recognizes but Frantic Search does not implement, typically because they concern printings, frames, or set membership rather than oracle-card-level properties. Examples: `foil`, `nonfoil`, `promo`, `reprint`, `unique`, `digital`, `hires`, `full`, `borderless`, `extended`, `etched`, `glossy`, `spotlight`, `booster`, `masterpiece`, `alchemy`, `rebalanced`, `colorshifted`, `newinpauper`, `meldpart`, `meldresult`, and other keywords not covered by our oracle-card data model. These produce an error with a distinct message: `unsupported keyword "foil"`.

- **Unknown** — keywords nobody recognizes: `is:xyz`, `is:asdf`. These produce `unknown keyword "xyz"`.

The distinction between "unsupported" and "unknown" matters for the user experience. A user searching `is:foil` should understand that foil is a real concept we don't support, not that they misspelled something. A user searching `is:xyz` should understand this isn't a valid keyword at all.

Implementation: maintain a `Set<string>` of unsupported keywords (`UNSUPPORTED_IS_KEYWORDS`). Change `evalIsKeyword` to return a status: `'ok' | 'unsupported' | 'unknown'`:

```typescript
case "is": {
  if (op !== ":" && op !== "=") break;
  const status = evalIsKeyword(valLower, index, buf, n);
  if (status === 'unsupported') return `unsupported keyword "${node.value}"`;
  if (status === 'unknown') return `unknown keyword "${node.value}"`;
  return null;
}
```

The `default` branch of `evalIsKeyword`'s switch checks `LAND_CYCLES`, then `UNSUPPORTED_IS_KEYWORDS`, and returns the appropriate status. The unsupported set is maintained as a best-effort list — it doesn't need to be exhaustive (new Scryfall keywords can be added incrementally), but it should cover the common ones users are likely to try.

The key distinction is between **closed-set fields** (format, is) and **open-ended string fields** (name, type, oracle). For string fields, `t:xyz` is a valid query that legitimately matches zero cards — the user typed a real field and a value that happens to find nothing. For closed-set fields, the complete set of valid values is known at compile time, and `f:comma` on the way to `f:commander` (or `is:sho` on the way to `is:shockland`) should not tank the result set.

3. **Contradictory color values** — The value combines `c` (colorless) with one or more actual colors (W, U, B, R, G) in the letter-sequence fallback. A card cannot be both colored and colorless. This applies to both the `color`/`c` and `identity`/`id`/`ci` fields. The error message is `"a card cannot be both colored and colorless"`. This matches Scryfall's behavior, which ignores such expressions with the message *"A card cannot be both colored and colorless."*

   Detection: `parseColorValue` returns a new `COLOR_IMPOSSIBLE` sentinel (defined in `bits.ts` alongside the existing `COLOR_COLORLESS` and `COLOR_MULTICOLOR` sentinels) when the letter-sequence fallback encounters `C` alongside any valid color letter. The evaluator checks for this sentinel before entering the bitmask comparison logic and returns the error. The named lookup (`COLOR_NAMES`) handles `"c"` and `"colorless"` as whole values before the letter fallback, so `ci:c` and `ci:colorless` continue to work normally.

   Examples: `ci:cb`, `c:cw`, `ci:cwubrg` → error. `ci:c`, `ci:colorless`, `ci:wu` → not an error.

4. **No errors for other field/value combinations.** String fields (`name`, `oracle`, `type`), other color field values, numeric fields, and `mana` all have open-ended or context-dependent value spaces where zero results is meaningful information. These fields continue to show `0` in amber, not an error indicator.

#### `evalLeafRegex`

One error condition:

1. **Invalid regex pattern** — `new RegExp(node.pattern, "i")` throws. Return the error:

```typescript
function evalLeafRegex(node: RegexFieldNode, index: CardIndex, buf: Uint8Array): string | null {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  if (!canonical) return `unknown field "${node.field}"`;
  const col = /* ... */;
  if (!col) return `unknown field "${node.field}"`;

  let re: RegExp;
  try {
    re = new RegExp(node.pattern, "i");
  } catch {
    return "invalid regex";
  }
  // ... existing loop ...
  return null;
}
```

#### `evalLeafBareWord` and `evalLeafExact`

These cannot fail — bare words and exact-name matches always produce valid (possibly empty) result sets. They continue to return `null` (no error).

### 3. `computeTree` handles errors

When a leaf evaluator returns an error, `computeTree` stores the error in `ComputedResult` instead of the normal buffer:

```typescript
case "FIELD": {
  const buf = new Uint8Array(n);
  const t0 = performance.now();
  const error = evalLeafField(ast, this.index, buf);
  const ms = performance.now() - t0;
  if (error) {
    interned.computed = { buf: new Uint8Array(0), matchCount: -1, productionMs: 0, error };
  } else {
    interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
  }
  timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
  break;
}
```

The same pattern applies to `REGEX_FIELD`. The `BARE` and `EXACT` cases are unchanged (they never error).

### 4. AND/OR skip error children

The existing NOP-skip pattern in `computeTree` extends to also skip error nodes:

```typescript
case "AND": {
  const childInterneds = ast.children.map(c => {
    const ci = this.intern(c);
    this.computeTree(ci, timings);
    return ci;
  });
  const live = childInterneds.filter(ci =>
    ci.ast.type !== "NOP" && !ci.computed?.error
  );
  // ... rest unchanged ...
}
```

The same filter applies in the `OR` case.

This gives exactly the right semantics:

| Expression | Behavior |
|---|---|
| `AND(valid, error)` | = `valid` (error doesn't constrain) |
| `AND(error, error)` | = universal set (vacuous conjunction, same as all-NOP AND) |
| `OR(valid, error)` | = `valid` (error doesn't contribute) |
| `OR(error, error)` | = empty set (vacuous disjunction, same as all-NOP OR) |

### 5. NOT propagates child errors

If a NOT node's child has an error, the NOT node inherits it. Negating a broken term shouldn't produce a valid result:

```typescript
case "NOT": {
  const childInterned = this.intern(ast.child);
  this.computeTree(childInterned, timings);
  if (childInterned.computed!.error) {
    interned.computed = {
      buf: new Uint8Array(0), matchCount: -1, productionMs: 0,
      error: childInterned.computed!.error,
    };
    timings.set(interned.key, { cached: false, evalMs: 0 });
    break;
  }
  // ... existing NOT logic ...
}
```

### 6. Error propagation through `QueryNodeResult`

Add `error?: string` to `QueryNodeResult`:

```typescript
export interface QueryNodeResult {
  node: ASTNode;
  matchCount: number;
  cached: boolean;
  productionMs: number;
  evalMs: number;
  error?: string;
  children?: QueryNodeResult[];
}
```

The `buildResult` method copies the error from `ComputedResult`:

```typescript
private buildResult(interned: InternedNode, timings: Map<string, EvalTiming>): QueryNodeResult {
  const computed = interned.computed!;
  const timing = timings.get(interned.key)!;
  const result: QueryNodeResult = {
    node: ast,
    matchCount: computed.matchCount,
    cached: timing.cached,
    productionMs: computed.productionMs,
    evalMs: timing.evalMs,
  };
  if (computed.error) result.error = computed.error;
  // ... existing children logic ...
  return result;
}
```

### 7. Error in `BreakdownNode`

Add `error?: string` to the worker protocol type:

```typescript
export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'NOP' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  error?: string
  children?: BreakdownNode[]
  span?: { start: number; end: number }
  valueSpan?: { start: number; end: number }
}
```

The `toBreakdown` function in `worker.ts` copies it:

```typescript
function toBreakdown(qnr: QueryNodeResult): BreakdownNode {
  // ... existing logic ...
  const node: BreakdownNode = { type: qnr.node.type, label: leafLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.error) node.error = qnr.error
  // ... rest unchanged ...
}
```

### 8. UI: error indicator in `InlineBreakdown`

`BreakdownRow` currently has three visual states: normal (white text + count), NOP (gray italic + `--`), and zero-match (amber text + `0`). Add a fourth: **error** (red/orange text + warning icon).

The priority order for display:

1. **Error** (`node.error` is set): Label styled in `text-red-500` / `dark:text-red-400`. Count slot shows `!` instead of a number. The `title` attribute on the count element shows the error reason on hover (e.g., `title="unknown field"`).
2. **NOP** (`matchCount < 0`, no error): Existing gray italic + `--`.
3. **Zero match** (`matchCount === 0`): Existing amber + `0`.
4. **Normal**: Default styling + numeric count.

The detection logic in `BreakdownRow`:

```typescript
function BreakdownRow(props: { label: string; count: number; error?: string; indent?: number; /* ... */ }) {
  const isError = () => !!props.error
  const isNop = () => !props.error && props.count < 0
  // ...
  <span class={/* error: red, nop: gray, zero: amber, else: default */}>
    {isError() ? '!' : isNop() ? '--' : props.count.toLocaleString()}
  </span>
}
```

Error nodes are still clickable (to isolate the term) and removable (via the × button), consistent with NOP behavior.

### 9. Flat breakdown filtering

`InlineBreakdown` currently filters out NOP children in the flat-AND/flat-OR display case:

```typescript
props.breakdown.children!.filter(c => c.type !== 'NOP')
```

Error nodes are **not** filtered out — they should remain visible so the user can see which term has the problem and remove it via the × button. This is the key UX difference from NOP: NOP nodes are structural artifacts (empty operand positions) that clutter the display; error nodes represent user-written terms that need feedback.

### 10. Node cache behavior

`nodeKey` is purely structural and does not include error state. This is correct — an error is a deterministic property of a node's content. `FIELD(foo, :, bar)` always produces `"unknown field"` regardless of when or how many times it's evaluated. Caching works naturally.

### 11. What does NOT change

- **The parser.** The parser never throws and continues to produce best-effort ASTs. It does not gain error detection — that stays in the evaluator where semantic context (field aliases, regex compilation) is available.
- **NOP semantics.** NOP remains the parser's representation for empty operand positions. Error is the evaluator's representation for semantically broken terms. They are distinct concepts that happen to share the same skip behavior in AND/OR reduction.
- **Valid zero-result queries.** `t:thisisnotatype`, `pow>99`, `name:zzzzz` — these are structurally sound queries with known fields and open-ended value spaces that legitimately match zero cards. They continue to show `0` in amber, not an error indicator.

## Error Classification Summary

| Input | Field known? | Value | Classification | Evaluator behavior |
|---|---|---|---|---|
| `ci:wu` | Yes | Non-empty | **Valid** | Normal evaluation |
| `ci:cb` | Yes | Colorless+color | **Error** | Skip in AND/OR, show `!` |
| `c:cw` | Yes | Colorless+color | **Error** | Skip in AND/OR, show `!` |
| `ci:c` | Yes | Colorless only | **Valid** | Normal evaluation (matches colorless cards) |
| `ci:` | Yes | Empty | **Valid (incomplete)** | Universal set (transparent in AND) |
| `foo:bar` | No | Non-empty | **Error** | Skip in AND/OR, show `!` |
| `foo:` | No | Empty | **Error** | Skip in AND/OR, show `!` |
| `o:/giant/` | Yes | Valid regex | **Valid** | Normal evaluation |
| `o:/[/` | Yes | Invalid regex | **Error** | Skip in AND/OR, show `!` |
| `f:comma` | Yes (closed-set) | Unknown format | **Error** | Skip in AND/OR, show `!` |
| `f:commander` | Yes (closed-set) | Known format | **Valid** | Normal evaluation |
| `is:xyz` | Yes (closed-set) | Unknown keyword | **Error** | Skip in AND/OR, show `!` |
| `is:foil` | Yes (closed-set) | Unsupported keyword | **Error** | Skip in AND/OR, show `!` |
| `is:shockland` | Yes (closed-set) | Supported keyword | **Valid** | Normal evaluation |
| `t:xyz` | Yes (open-ended) | No matches | **Valid (zero results)** | Normal evaluation, shows `0` |
| `-foo:bar` | No | — | **Error** (propagated) | NOT inherits child error |
| `-f:comma` | Yes (closed-set) | Unknown format | **Error** (propagated) | NOT inherits child error |

## Scope of Changes

| File | Change |
|---|---|
| `shared/src/search/evaluator.ts` | Change `evalLeafField` and `evalLeafRegex` return type to `string \| null`. Swap unknown-field check before empty-value check in `evalLeafField`. Add unknown-value errors for closed-set fields (`legal`/`banned`/`restricted`, `is`). Change `evalIsKeyword` return type to `'ok' \| 'unsupported' \| 'unknown'`. Add `UNSUPPORTED_IS_KEYWORDS` set. Handle error returns in `computeTree` for FIELD and REGEX_FIELD cases. Extend NOP-skip filter in AND/OR to also skip error nodes. Add error propagation in NOT case. Add `error` field to `ComputedResult`. Copy error in `buildResult`. |
| `shared/src/search/ast.ts` | Add optional `error?: string` to `QueryNodeResult`. |
| `shared/src/worker-protocol.ts` | Add optional `error?: string` to `BreakdownNode`. |
| `app/src/worker.ts` | Copy `error` from `QueryNodeResult` to `BreakdownNode` in `toBreakdown`. |
| `app/src/InlineBreakdown.tsx` | Add error visual state to `BreakdownRow` (red text, `!` indicator, hover title). Pass `error` prop through `BreakdownTreeNode`. Keep error nodes visible in flat breakdown (don't filter them like NOP). |
| `cli/suites/errors.yaml` | New compliance suite file with error-handling test cases. Includes Scryfall-matching cases and `foo:` divergence annotation. |

## Test Strategy

### Evaluator unit tests

Tests use a synthetic `CardIndex` (same fixture as existing evaluator tests). Each test verifies the `QueryNodeResult` tree's `matchCount` and `error` fields.

**Error detection:**

| Query | Expected root `error` | Expected root `matchCount` |
|---|---|---|
| `foo:bar` | `"unknown field \"foo\""` | `-1` |
| `foo:` | `"unknown field \"foo\""` | `-1` |
| `o:/[/` | `"invalid regex"` | `-1` |
| `f:comma` | `"unknown format \"comma\""` | `-1` |
| `f:commander` | `undefined` | (positive number) |
| `is:xyz` | `"unknown keyword \"xyz\""` | `-1` |
| `is:foil` | `"unsupported keyword \"foil\""` | `-1` |
| `is:shockland` | `undefined` | (positive number) |
| `ci:cb` | `"a card cannot be both colored and colorless"` | `-1` |
| `c:cw` | `"a card cannot be both colored and colorless"` | `-1` |
| `ci:wu` | `undefined` | (positive number) |
| `ci:c` | `undefined` | (positive number — colorless cards) |
| `ci:` | `undefined` | (all cards) |

**AND with error children:**

| Query | Expected root `matchCount` | Reason |
|---|---|---|
| `t:creature foo:bar` | Same as `t:creature` alone | Error child skipped |
| `t:creature o:/[/` | Same as `t:creature` alone | Error child skipped |
| `t:creature ci:cb` | Same as `t:creature` alone | Error child skipped |
| `foo:bar baz:qux` | (all cards) | Both children error → vacuous AND |

**OR with error children:**

| Query | Expected root `matchCount` | Reason |
|---|---|---|
| `t:creature OR foo:bar` | Same as `t:creature` alone | Error child skipped |
| `foo:bar OR baz:qux` | `0` | Both children error → vacuous OR |

**NOT with error child:**

| Query | Expected root `error` | Expected root `matchCount` |
|---|---|---|
| `-foo:bar` | `"unknown field \"foo\""` | `-1` |

**Format error in AND context:**

| Query | Expected root `matchCount` | Reason |
|---|---|---|
| `f:comma t:creature` | Same as `t:creature` alone | Error child skipped |

**Error does not affect valid zero-result queries (open-ended fields):**

| Query | Expected `error` | Expected `matchCount` |
|---|---|---|
| `t:notavalidtype` | `undefined` | `0` |
| `name:zzzzz` | `undefined` | `0` |

### Live-typing regression tests

Simulate the motivating scenario: evaluate a compound query where one term transitions through error states as the user types.

| Typing sequence | Expected behavior |
|---|---|
| `t:creature f:edh` → `t:creature f:edh o:` | Results unchanged (empty value = universal set) |
| → `t:creature f:edh o:/` | Results unchanged (bare regex `/` — lexer produces empty regex, evaluator matches everything or errors depending on pattern) |
| → `t:creature f:edh o:/[` | Results = `t:creature f:edh` alone (malformed regex is error, skipped) |
| → `t:creature f:edh o:/[a-z]/` | Results = `t:creature f:edh` AND `o:/[a-z]/` (valid regex, normal evaluation) |

### BreakdownNode propagation test

Verify that `toBreakdown` copies the `error` field from `QueryNodeResult` to `BreakdownNode` for a query containing a malformed term.

## Compliance Testing

The compliance suite (Spec 035) is the right place to verify error handling behavior against real card data and Scryfall. Add test cases to a new `cli/suites/errors.yaml` suite file.

### Cases that match Scryfall

These test cases verify we agree with Scryfall's error-ignoring behavior. They use `scryfall_query` overrides where needed, since Scryfall's error message format differs from ours but the *result set* should match.

```yaml
- name: "Unknown field is ignored in AND"
  query: "foo:bar t:creature"
  scryfall_query: "t:creature"
  assertions:
    count_min: 17000

- name: "Unknown format is ignored in AND"
  query: "f:comma t:creature"
  scryfall_query: "t:creature"
  assertions:
    count_min: 17000

- name: "Unknown is-keyword is ignored in AND"
  query: "is:xyz t:creature"
  scryfall_query: "t:creature"
  assertions:
    count_min: 17000

- name: "Invalid regex is ignored in AND"
  query: "t:creature o:/[/"
  scryfall_query: "t:creature"
  assertions:
    count_min: 17000
```

In Scryfall verification mode, these pass because both sides produce the same result set (valid terms only). The `scryfall_query` omits the error term since Scryfall's API doesn't include it in results either.

### Cases that diverge from Scryfall

The `foo:` treatment is an intentional divergence. Add it with a `divergence` annotation:

```yaml
- name: "Unknown field with empty value is an error (diverges from Scryfall)"
  query: "foo: t:creature"
  divergence: "Spec 039: foo: is an error. Scryfall strips the colon and treats 'foo' as a bare name search (~69 results)."
  assertions:
    count_min: 17000
```

In local mode this runs normally — `foo:` errors, gets skipped, and the result is just `t:creature` (17k+ results). The `divergence` annotation is informational. In Scryfall verification mode the test is skipped entirely and listed in the divergences section. No `scryfall_query` is needed since the test never runs against Scryfall — the divergence is fundamental (Scryfall would search `foo` by name and return ~69 results, a completely different result set).

## Edge Cases

### Bare regex expansion

`/[/` (bare regex, not field-qualified) is desugared by the parser into `OR(REGEX_FIELD(name, :, [), REGEX_FIELD(oracle, :, [), REGEX_FIELD(type, :, [))`. All three children error with `"invalid regex"`. The OR reduces to vacuous disjunction (0 matches), and the synthetic OR node itself does not carry an error — it's a structural node, not a leaf. Its children carry the errors individually.

If the bare regex appears in a larger AND context — `t:creature /[/` — the AND has two children: `t:creature` (valid) and the synthetic OR (0 matches, no error, but all its children errored). The synthetic OR evaluates to empty set (vacuous disjunction after skipping error children), which would then zero out the AND.

This is a known limitation. Because the parser desugars bare regex before the evaluator sees it, the error is one level deeper than the AND can see. Fixing this properly requires either: (a) moving bare regex expansion to the evaluator (out of scope, noted in Spec 036 § Out of Scope), or (b) having OR nodes propagate a "vacuous due to all-error children" state upward. Option (b) adds complexity for a narrow edge case — a bare invalid regex. Field-qualified invalid regex (`o:/[/`) handles correctly because there's no OR wrapper.

For now, bare invalid regex is a known gap. The user can work around it by field-qualifying their regex (`o:/[/` instead of `/[/`), which is better practice anyway.

### Error nodes in toggle logic

The `findFieldNode` function in `query-edit.ts` (Spec 037) searches the breakdown tree for nodes to modify. Error nodes have labels in the same `field + operator + value` format as valid nodes (e.g., `foo:bar`). The toggle logic should work unchanged — it can find, modify, and remove error nodes the same way. No special handling needed.

### Cached error nodes

Error detection is deterministic — the same structural node always produces the same error. Cached error nodes correctly skip re-evaluation and reuse the stored `ComputedResult` with its `error` field. The `markCached` method does not need to propagate error state because the `ComputedResult` (including `error`) persists on the `InternedNode`.

### Interaction with NOP

A query like `foo: OR` produces `OR(FIELD(foo, :, ""), NOP)`. The FIELD node errors (unknown field). The NOP is skipped per existing rules. After skipping both, the OR has no live children → vacuous disjunction → 0 matches. The root's `matchCount` is `0`, which is correct — the user has typed nothing valid yet.

## Out of Scope

- **Error recovery for bare invalid regex.** As noted in § Edge Cases, a bare invalid regex like `/[/` desugars into an OR of three REGEX_FIELD children. All children error, but the parent OR evaluates to empty set rather than propagating an error state. Fixing this requires moving regex expansion out of the parser. See Spec 036 § Out of Scope.
- **Warning vs. error distinction.** This spec treats all problematic terms as errors. A future refinement could distinguish warnings (e.g., "unknown field, but the value looks intentional") from hard errors (e.g., "completely unparseable"). Not needed for the current UX goal.
- **Error messages in the results header.** Scryfall shows a banner message for ignored terms. This spec provides per-node indicators in the breakdown tree, which is sufficient for the inline breakdown UX. A banner-style message could be added later if user testing shows the per-node indicator is insufficient.

## Acceptance Criteria

1. `foo:bar` and `foo:` evaluate with `error: "unknown field \"foo\""` and `matchCount: -1`.
2. `o:/[/` evaluates with `error: "invalid regex"` and `matchCount: -1`.
3. `f:comma` evaluates with `error: "unknown format \"comma\""` and `matchCount: -1`.
4. `is:xyz` evaluates with `error: "unknown keyword \"xyz\""` and `matchCount: -1`.
5. `is:foil` evaluates with `error: "unsupported keyword \"foil\""` and `matchCount: -1`.
6. `t:creature foo:bar` returns the same result set as `t:creature` alone — the error child is skipped in AND reduction.
7. `t:creature OR foo:bar` returns the same result set as `t:creature` alone — the error child is skipped in OR reduction.
8. `f:comma t:creature` returns the same result set as `t:creature` alone — the unknown format is skipped.
9. `is:xyz t:creature` returns the same result set as `t:creature` alone — the unknown keyword is skipped.
10. `-foo:bar` propagates the error — NOT of an error is an error.
11. `ci:` (known field, empty value) is NOT an error — continues to match all cards.
12. `t:xyz` (known field, open-ended value space, zero results) is NOT an error — shows `0` matches.
13. `BreakdownNode` carries an `error` field, propagated from the evaluator through the worker.
14. The breakdown UI shows `!` in red/orange for error nodes, with the error reason visible on hover.
15. Error nodes remain visible in the flat breakdown display (not filtered out like NOP).
16. `ci:cb` evaluates with `error: "a card cannot be both colored and colorless"` and `matchCount: -1`. Same for `c:cw`, `ci:cwubrg`, etc.
17. `ci:c` and `ci:colorless` (colorless without colors) are NOT errors — they continue to match colorless cards normally.
18. `t:creature ci:cb` returns the same result set as `t:creature` alone — the contradictory color term is skipped.
19. `-ci:cb` propagates the error — NOT of an error is an error.
20. Existing tests continue to pass (no behavioral change for valid queries).
21. Compliance suite `errors.yaml` passes in local mode and verifies against Scryfall in verification mode (with the `foo:` divergence annotated).
