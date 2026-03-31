# Spec 173: Power, Toughness, Loyalty, and Defense — Query Semantics (Equality vs Range)

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 034 (Numeric Stat Value Parsing), Spec 039 (Non-Destructive Error Handling), Spec 052 (Scryfall Outlink Canonicalization), Spec 136 (Nullable Face Fields), Spec 172 (Equatable-Null Prefixes — `usd`/`edhrec`/`salt`; this spec **extends** the equatable-null pattern to stat fields), ADR-009 (Bitmask-per-Node AST)

## Goal

Define **unambiguous** query semantics for the face-domain stat fields **power**, **toughness**, **loyalty**, and **defense** (and their aliases), including:

1. **Principled divergence from Scryfall** for equality on non-numeric oracle strings (e.g. `1+*`, `*`, `7-*`). Scryfall does **not** support searching by these spellings as field values; attempting quoted forms results in errors such as treating `pow` as an unknown keyword. Frantic Search intentionally supports richer equality behavior documented here.
2. A clear split between **range operators** (`>`, `>=`, `<`, `<=`), which accept only **plain numeric** values (§3.2), and **equality operators** (`:`, `=`, `!=`), which additionally support **null**, **equatable-null prefixes**, and **oracle-shaped stat strings**.
3. **Operator + value-shape routing** so `:` and `=` differ only when the token is **not** a plain number: **plain numeric** tokens use **numeric equality** (Spec 034) for **both** `:` and `=` (Scryfall-style resolution). **Non–plain-numeric bare** tokens use **`:` → substring**, **`=`/`!=` → exact** string match on the raw oracle stat. **Quoted** tokens use **`:` → substring** and **`=`/`!=` → exact** on the quoted payload. See §3.3 (table) and §3.4–§3.7.

## Scope

| Canonical | Aliases | Oracle string source (today) |
|-----------|---------|------------------------------|
| `power` | `pow` | `power_lookup[powers[i]]` |
| `toughness` | `tou` | `toughness_lookup[toughnesses[i]]` |
| `loyalty` | `loy` | `loyalty_lookup[loyalties[i]]` |
| `defense` | `def` | `defense_lookup[defenses[i]]` |

**In scope:** Evaluation semantics, error handling for invalid values, negation interaction (high level), Scryfall canonicalization strips, PostHog `used_extension` alignment.

**Out of scope:** Mana cost (`m` / `mana`), mana value (`mv` / `cmc`), printing-domain fields, changing ETL dictionary encoding except where noted as a dependency.

## Background

### Scryfall

Scryfall's documented syntax does not provide a supported way to query `pow="1+*"` or similar; users see invalid-expression behavior. Frantic Search already diverges by supporting `null` / `!=null` (Spec 136) and numeric comparisons aligned with Spec 034. This spec **extends** that divergence in a deliberate way for **equality** on oracle stat text.

### Current implementation (baseline)

`shared/src/search/eval-leaves.ts` today uses **`parseStatValue`** on the query for **all** equality operators and compares only to **numeric** columns. It does **not** implement **`:`** substring / **`=`** exact string routing, **quoted** disambiguation, or **plain-numeric** detection. The stat null check uses `valLower === "null"` (not `isEquatableNullLiteral`). When `parseStatValue` returns `NaN` for an unrecognised value, the code silently `break`s — producing zero results with no error.

This spec replaces that uniform behavior with the §3.3 table (e.g. `tou=1+*` becomes **exact** oracle match, not numeric `1`) and adds leaf errors for invalid values.

## Design

### 1. Operator classes

**Range operators:** `>`, `>=`, `<`, `<=`.

**Equality operators:** `:`, `=`, `!=`.

Behavior differs by class. `!=` always follows **`=`** semantics (exact for non-plain values, numeric for plain), then inverts the predicate. It never follows `:` (substring) semantics.

### 2. Range operators — numeric only, strict rejection

**Intent:** Range filters answer "how big is this stat **as a number**?"

**Algorithm (range operators):**

1. **Null check:** If the trimmed lowercase value is exactly `null`, return **`null cannot be used with comparison operators`** (leaf error). If it is an equatable-null prefix (`n`, `nu`, `nul`) but not `null`, fall through to step 2 (it will fail the plain-numeric check).
2. **Plain-numeric gate:** Test the value against the plain-numeric predicate (§3.2). If it is **not** plain numeric → **leaf error** (e.g. `invalid power value for comparison "1+*"`). This rejects `*`, `1+*`, `7-*`, `x`, `y`, `n`, and all other non-plain tokens before they reach `parseStatValue`.
3. **Numeric conversion:** `parseStatValue(value)` → a finite number. Decimals are accepted (e.g. `3.5` for Un-set half-stats, matching Scryfall). If the result is `NaN` or non-finite, produce a **leaf error** (safety net — should not occur when the plain-numeric predicate is correct).
4. **Comparison:** Compare `numericLookup[idxCol[i]]` against the query number per the operator. Faces with `NaN` numeric lookup (missing stat) are skipped.

**Card side:** Unchanged from today — use pre-computed `numericXxxLookup`; faces with missing stat (`NaN`) are skipped.

### 3. Equality operators — routing by operator, quoting, and plain-numeric shape

#### 3.1 Null family — extending equatable-null to stat fields

Spec 172 defines the **equatable-null** pattern (`isEquatableNullLiteral`) for `usd`, `edhrec`, and `salt`. This spec **extends** that pattern to `power`, `toughness`, `loyalty`, and `defense`. The current implementation checks only `valLower === "null"` for these fields; it must change to `isEquatableNullLiteral(val)`.

**Evaluation order:** The null check runs **before** quoting or value-shape routing, but **only for unquoted values.** A quoted value like `tou="null"` bypasses the null check entirely and enters string matching (§3.3) — the user explicitly quoted the value, signalling they want string semantics, not null semantics. (No card has oracle stat text `null`, so this correctly returns zero results.)

For **unquoted** `:`, `=`, `!=`:

- **`null`** and **equatable-null prefixes** (`n`, `nu`, `nul`) match empty-stat vs non-empty-stat per Spec 136.
- **`!=null`** (and equatable-null prefixes with `!=`) match faces **with** a stat value.

**Negation / operator inversion:** Align with Spec 136: equatable-null gates operator inversion the same way as full `null` for these fields.

#### 3.2 Definitions — raw string, plain numeric token, quoted value

- **Raw stat string:** The dictionary oracle string for the face, accessed via `strLookup[idxCol[i]]` (e.g. `index.powerLookup[index.powers[i]]`). Already available in the evaluator for null detection.
- **Quoted value:** Detected via **`node.sourceText !== undefined`** on the `FieldNode`. The parser sets `sourceText` (the raw input slice including quote characters) only when the value token was `QUOTED`; `node.value` contains the **inner** payload (e.g. `tou:"1"` → `node.value === "1"`, `node.sourceText === '"1"'`). Quoting **disables** the plain-numeric fast path and the equatable-null check, even when the inner text looks like a number or `null`.
- **Plain numeric token (unquoted only):** The trimmed value matches the predicate `/^[+-]?\d*\.?\d+$/` — optional leading `+` or `-`, digits, and at most one `.`, with **no** stat-syntax characters (`*`, `?`, `x`, `y`, `d`, `∞`, `²`) or whitespace. Examples: `1`, `1.5`, `3.5`, `+0`, `-1`, `001`. Counterexamples: `1+*`, `*`, `+*`, `7-*`, `1d4+1`, `x`, `n` → **not** plain numeric.

#### 3.3 Summary table (non-null, non-equatable-null)

| Operator | Value shape | Semantics |
|----------|-------------|-----------|
| `:` | Unquoted **plain numeric** | **Numeric equality** (Spec 034): compare `parseStatValue(query)` to `numericXxxLookup[i]`. Example: `tou:1` matches oracle `1` and `1+*`, **not** `10` / `11`. |
| `:` | Unquoted **not** plain numeric | **Substring:** `rawStatString.includes(query)` (case rule §3.6). Example: `tou:+*` matches `1+*`; does **not** match a lone `*`. |
| `:` | **Quoted** inner `Q` | **Substring:** `rawStatString.includes(Q)`. Example: `tou:"1"` matches `1`, `1+*`, `10`, `11`. Example: `tou:"*"` ≡ `tou:*` (substring `*`). |
| `=` | Unquoted **plain numeric** | **Numeric equality** (same as `:`). Example: `tou=1` ≡ `tou:1`. |
| `=` | Unquoted **not** plain numeric | **Exact string:** `rawStatString === query` (case rule §3.6). Example: `tou=1+*` matches only oracle `1+*`. |
| `=` | **Quoted** inner `Q` | **Exact string:** `rawStatString === Q`. Example: `tou="1"` matches only oracle `1`, **not** `1+*` / `10` / `11`. |
| `!=` | Unquoted **plain numeric** | **Numeric inequality:** `numericLookup !== parseStatValue(query)`. Example: `tou!=1` means "numeric toughness ≠ 1". |
| `!=` | Unquoted **not** plain numeric | **NOT exact:** `rawStatString !== query`. Example: `tou!=1+*` matches all faces whose oracle toughness is not literally `1+*`. |
| `!=` | **Quoted** inner `Q` | **NOT exact:** `rawStatString !== Q`. Example: `tou!="1"` matches all faces whose oracle toughness is not literally `1`. |

**`!=` always follows `=` (exact) semantics, not `:` (substring).** There is no "not-substring" operator. To exclude a substring, negate a colon term: `-tou:+*`.

**`x` / `y` behavior change:** Under the current implementation, `pow=x` is equivalent to `pow=0` (Scryfall-compatible — `parseStatValue("x")` returns `0`). Under this spec, `x` is **not** plain numeric, so `pow=x` routes to **exact** string match — matching only faces whose oracle power is literally `X` (after case-fold). This is an intentional divergence: `pow=0` remains available for "numeric power equals zero." The `x`/`y` aliases for zero now apply only on the **card** side (via `parseStatValue` in the numeric lookup) and on the **query** side only for **plain-numeric** equality (where `x` does not qualify). Users who want Scryfall's `pow=x → pow=0` behavior should write `pow=0`.

**Scryfall note:** Scryfall rejects forms like `pow:"1"` entirely; Frantic treats quotes as forcing **string-shaped** semantics (`:` substring / `=` exact) so users can opt out of numeric resolution.

#### 3.4 `:` (colon) — expanded

- **Plain numeric (unquoted):** As in the table; **leaf error** if `parseStatValue(query)` is `NaN` or non-finite (safety net — should not occur when the plain-numeric predicate is correct).
- **Substring branches:** Used for unquoted non-plain tokens and for **all** quoted values. Frantic-only divergence (Scryfall does not support these searches).

#### 3.5 `=` (equals) — expanded

- **Plain numeric (unquoted):** Identical to **`:`** numeric equality — preserves Scryfall-style behavior for `tou=N` / `pow=N` when `N` is plain numeric.
- **Exact branches:** Used for unquoted non-plain tokens (e.g. `1+*`, `*`) and for **all** quoted values. Enables **literal oracle** queries without substring false positives (e.g. `tou="1"` vs `tou:"1"`).

#### 3.6 String comparisons — casing and normalization

- **Substring** (`:` non-plain and `:` quoted): `includes` on trimmed strings.
- **Exact** (`=`/`!=` non-plain and `=`/`!=` quoted): `===` / `!==` on trimmed strings.

**Case rule: ASCII case-fold.** Both the query value and the stored oracle string are compared after ASCII lowercasing. Rationale: oracle stats include `X` (e.g. Nissa's loyalty) which users will naturally query as lowercase `loy=x` or `loy="x"`. Case-sensitive matching would create a confusing gap between the numeric path (where `x` → `0` via `parseStatValue`, case-insensitive) and the string path. ASCII fold avoids this without affecting numeric characters or symbols like `*`, `∞`, `²`.

**Unicode:** `∞`, `²`, etc. must match stored oracle encoding verbatim (after ASCII fold, which does not affect these characters). No NFKC normalization — oracle stat strings are short, ASCII-dominated, and stored as-is from Scryfall.

#### 3.7 `!=` — expanded

`!=` always uses **`=` semantics** (exact / numeric equality), then inverts:

- **Plain numeric:** Numeric inequality — `numericLookup !== parseStatValue(query)`. Faces with `NaN` (missing stat) are excluded (same as positive numeric comparisons).
- **Unquoted non-plain / quoted:** NOT exact — `rawStatString !== query` (after trim + ASCII fold). Faces with empty stat (null) are excluded to stay consistent with Spec 136 null-exclusion for negated numeric comparisons.

**Example:** `tou!=1` (plain numeric `1`) → "numeric toughness ≠ 1" (Scryfall-style). This is **not** "exclude substring `1`" — for that, use `-tou:"1"`.

### 4. Bare `pow:*` — lexer behavior (resolved)

The lexer (`shared/src/search/lexer.ts`) treats `*` as a regular WORD character — it is not in `isSpecial` or `SINGLE_CHAR_TOKENS`. Input `pow:*` reliably produces `WORD("pow")`, `COLON(":")`, `WORD("*")`, giving a FIELD node with `value === "*"`. No special handling is needed.

`pow:*` is **unquoted** and `*` is **not plain numeric**, so it routes to **substring** under `:` — matching any face whose raw stat string contains `*`. `pow="*"` routes to **exact** — matching only faces whose stat is literally `*`. Both are Frantic-only extensions.

Unicode fullwidth `＊` (U+FF0A) is not normalized to ASCII `*`. Users must use the ASCII form. This matches the oracle data, which uses ASCII `*`.

### 5. Incomplete typing — strict mode

**Decision: strict.** Invalid or incomplete values produce **leaf errors** (Spec 039). Rationale:

- The empty-value case (`pow:` → matches everything) already handles the most common mid-typing state.
- For partial stat strings like `pow:1+` (user typing toward `1+*`), showing an error is clearer than silently matching all cards. The error disappears as soon as the user completes the expression or types something valid.
- Defining and maintaining a "transparent prefix set" for stat expressions is ongoing complexity with unclear payoff.
- Spec 039's error infrastructure already provides the right UX: the term is ignored in AND/OR, shown with `!` in the breakdown, and the error reason is visible on hover.

**Concrete implication:** When the evaluator reaches a non-null, non-equatable-null value that is:
- **Not** plain numeric and is on a **range** operator → leaf error.
- **Not** plain numeric and is on an **equality** operator → **string matching** (substring or exact per §3.3), not an error. The value is treated as an oracle-string query.

So `pow:1+` on `:` is a **substring** search for `1+` in the oracle stat. This will match any stat containing the substring `1+` (e.g. `1+*`). It is not an error — it is a valid, if partial, oracle string search. Errors arise only for **range** operators with non-plain-numeric values or for `parseStatValue` failures on the numeric path.

### 6. Error messages

Use **field-specific** leaf errors, consistent with Spec 172's pattern:

| Situation | Error message |
|-----------|---------------|
| Range op + non-plain-numeric value | `invalid power value for comparison "…"` (field-specific) |
| Range op + `null` | `null cannot be used with comparison operators` (existing) |
| Range op + `parseStatValue` → `NaN` | `invalid power value "…"` (safety net, should not occur) |

The silent `break` in today's code (line 421 of `eval-leaves.ts`: `if (isNaN(queryNum)) break;`) becomes a **leaf error** on the range path. On the equality path, the `NaN` case is unreachable — non-plain-numeric values route to string matching, and plain-numeric values always produce a finite number from `parseStatValue`.

### 7. Canonicalization (Scryfall outlinks)

- **`null` / equatable-null / `!=null`:** Continue to strip (Spec 136). Extend to equatable-null prefixes for stat fields.
- **Quoted values** (any operator): Strip the node — Scryfall does not support quoted stat queries.
- **Unquoted non-plain-numeric values** (e.g. `tou=1+*`, `tou:+*`): Strip — Scryfall does not support these.
- **Unquoted plain-numeric** `:`/`=`/`!=`: Emit normally (Scryfall supports `pow=2`, `pow!=2`, etc.).
- **Range operators** with valid plain-numeric values: Emit normally.

### 8. PostHog `used_extension` (Spec 085)

Count as **Frantic extension** when Scryfall cannot express the same intent:

- **Quoted** stat value (any operator): extension.
- **Unquoted non-plain-numeric** stat value with `:` or `=` or `!=`: extension.
- **Equatable-null prefixes** (`n`, `nu`, `nul`) on `:` / `=` / `!=`: extension (same as Spec 172 pattern for `usd`/`edhrec`).

**Plain numeric** unquoted `:`/`=`/`!=` or valid range queries should **not** by themselves imply extension. Check `node.sourceText !== undefined` (quoted) and the plain-numeric predicate to distinguish.

## Relationship to other specs

| Spec | Relationship |
|------|----------------|
| **034** | Source of truth for **`parseStatValue`** and numeric projection of oracle strings. Used on both card and query side for numeric comparisons. |
| **136** | Null / negation baseline for these four fields. This spec extends to equatable-null. |
| **172** | Defines the **equatable-null** predicate (`isEquatableNullLiteral`). Originally scoped to `usd`/`edhrec`/`salt`; this spec extends it to stat fields. |
| **039** | Non-destructive error handling. Invalid stat values on range operators and `parseStatValue` failures become leaf errors per Spec 039. |

## Acceptance criteria (checklist for implementation)

1. **Range:** `pow>2` works as today (numeric). `pow>1+*`, `pow>*`, `pow>n`, `pow>x` produce **leaf errors**, not zero-card silent results.
2. **Null:** `pow=null`, `pow=n`, `pow!=null` behave per Spec 136 + extended equatable-null on `:`, `=`, `!=`.
3. **Quoted null bypass:** `pow="null"` is an **exact string match** for literal oracle text `null` (zero results), **not** equatable-null.
4. **Plain numeric:** `tou:1` and `tou=1` are equivalent: numeric equality per Spec 034 (e.g. match `1` and `1+*`, not `10` / `11`).
5. **Colon + bare oracle fragment:** `tou:+*` substring-matches `1+*` but **not** a lone `*`; `tou:*` substring-matches `*`.
6. **Colon + quoted:** `tou:"1"` substring-matches `1`, `1+*`, `10`, `11`. `tou:"*"` agrees with `tou:*` (substring `*`).
7. **Equals + bare formula:** `tou=1+*` exact-matches only oracle `1+*`.
8. **Equals + quoted:** `tou="1"` exact-matches only oracle `1`, not `1+*` / `10` / `11`.
9. **`!=` follows `=` semantics:** `tou!=1` is numeric inequality. `tou!=1+*` is NOT exact (not `:` substring). `tou!="1"` is NOT exact on inner `1`.
10. **String case-fold:** `loy=x` matches oracle `X` (ASCII case-fold). `loy="x"` exact-matches oracle `X`.
11. **`x`/`y` divergence:** `pow=x` is an exact string match (not numeric 0). `pow=0` matches `*` cards (numeric 0, Scryfall-compatible).
12. **Strict errors:** Non-plain-numeric values on range operators produce leaf errors. No silent zero results from `parseStatValue` failures.
13. **Canonicalize:** Quoted, non-plain-numeric, and equatable-null stat terms are stripped from Scryfall outlinks. Plain-numeric equality and valid ranges are emitted.
14. **`used_extension`:** Quoted and non-plain-numeric stat queries flagged per §8. Plain numeric equality is not flagged.
15. **Tests:** Vitest coverage in `shared/` for each row above; compliance / docs updated if needed.

## Implementation Notes

- **`isPlainNumericStatQueryToken`:** Exported from [`shared/src/search/stats.ts`](../../shared/src/search/stats.ts); used by `eval-leaves.ts`, `canonicalize.ts`, and `query-extension-syntax.ts`.
- **Equatable-null vs range:** The equatable-null branch runs only for equality operators (`:`, `=`, `!=`). On range ops, values like `n` still satisfy `isEquatableNullLiteral` but §2 requires them to fail the plain-numeric gate (`invalid … value for comparison`), not null semantics.
- **Quoted detection:** `node.sourceText !== undefined` on `FieldNode` (parser sets it only for `QUOTED` tokens).
- **String compare:** Trim + `toLowerCase()` on query and oracle stat for substring / exact / `!=` string paths (§3.6 ASCII-oriented fold).
- **NOT / operator inversion:** [`shared/src/search/evaluator.ts`](../../shared/src/search/evaluator.ts) — for power/toughness/loyalty/defense, `nullStopsFaceOpInversion` uses `isEquatableNullLiteral(value) && sourceText === undefined` (quoted `"null"` uses inversion, not XOR-at-null).
- **Tests:** [`shared/src/search/stat-field-query.test.ts`](../../shared/src/search/stat-field-query.test.ts); compliance [`cli/suites/numeric.yaml`](../../cli/suites/numeric.yaml) (pow=x case updated for Spec 173).
