# Spec 182: Prefix union for format, frame, `in:`, and collector number

**Status:** In Progress

**Depends on:** Spec 002 (Query Engine), Spec 032 (`is:` / `not:` prefix union precedent), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 056 / Spec 178 (oracle-level format legality), Spec 072 (`in:` qualifier), Spec 103 (Categorical Field Value Auto-Resolution), Spec 104 (bonus rarity tier), Spec 176 (`kw:` / `keyword:` prefix query semantics — pattern reference), Spec 068 (`game:`), ADR-022 (Categorical field operators — normative field slice for this pattern)

**References:** [GitHub #247](https://github.com/jimbojw/frantic-search/issues/247)

## Goal

Extend **eval-time** matching for:

- **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** (face domain, oracle-level legality columns)
- **`frame:`** (printing domain)
- **`in:`** (printing domain, promotes to face per Spec 072)
- **`cn:`** / **`collectornumber:`** / **`number:`** (printing domain)

with a **clear split between operators**:

- **`:`** — **prefix union** after `normalizeForResolution`: every candidate whose normalized form **starts with** the normalized user value contributes to the match (**OR** bits, **OR** printing masks, etc.).
- **`=`** — **exact match** after `normalizeForResolution`: only candidates whose normalized form **equals** the normalized user value contribute (still **OR** if two distinct vocabulary keys normalize identically — rare — so behavior stays deterministic).

Incomplete **`:`** tokens support discovery (e.g. a shared prefix over several format names ORs those formats’ legality bits). **`=`** is an **escape hatch** for users who want no stemming (e.g. match a tag or frame key that is itself a prefix of a longer key — analogous motivation to `otag:peek` vs a longer `peek-*` tag). This spec’s fields follow **`:`** / **`=`** here. **`kw:`** / **`keyword:`** follow the same split per amended **[Spec 176](176-kw-keyword-prefix-query-semantics.md)**; **`otag:`** / **`atag:`** and related fields are not yet migrated — see **Relation to other specs** below.

**Empty values ([ADR-022](../adr/022-categorical-field-operators.md)):** For every field in **Goal**, a **trimmed-empty** value on **`:`** or **`=`** must **not** narrow the result set while the user is still typing — including **`in:`** (no **`unknown in value`** for bare **`in:`** / **`in=`**). Mechanism remains implementation-defined per **Empty value** below.

**Negation:** **`!=`** (where the field supports it — **legalities** (**`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`**), **`in:`**, and **`frame:`** in this spec) means the **negation of the `=` (exact) positive mask**, not the negation of a **`:`** prefix union. To exclude a prefix-union predicate, use **AST NOT** (`-term`), not `!=`.

## Out of scope

- **`artist:`** / **`a:`** — keep **substring** semantics ([Spec 149](149-artist-evaluator.md)); no prefix-union change.
- **`game:`** / **`rarity:`** / **`r:`** — vocabularies are too small for meaningful prefix collision; no change ([GitHub #247](https://github.com/jimbojw/frantic-search/issues/247)).
- **Spec 181** (breakdown prefix-branch hints) — optional follow-up once evaluation matches this spec; not required for acceptance here.

## Background

[Spec 103](103-categorical-field-value-auto-resolution.md) applies **unique-prefix** resolution (`resolveForField` → `resolveCategoricalValue`) for many categoricals: **exactly one** normalized prefix match resolves; otherwise the typed value is passed through and lookup often fails with **`unknown format`**, **`unknown frame`**, or **`unknown in value`**.

**[Spec 176](176-kw-keyword-prefix-query-semantics.md)** (**`kw:`** / **`keyword:`**) uses the same **`:`** = prefix union / **`=`** = exact convention as this spec (reference implementation). **`set:`** / **`set_type:`** ([Specs 047](047-printing-query-fields.md) / [179](179-set-type-query-field.md)) use the same split with **precomputed** per-printing normalization (aligned with § Implementation performance below). This spec applies **`:`** vs **`=`** **only** to the fields listed in **Goal**; aligning **`otag:`** / **`atag:`**, **`is:`** / **`not:`**, etc. is **out of scope** here but should follow the same convention when those specs are amended (see **Relation to other specs**).

## Shared rules

### Normalization

Use **Spec 103** **`normalizeForResolution`** (same as `normalizeAlphanumeric`) on:

- the user value (after **trim**), and  
- each **candidate string** (format name key, frame name key, game key, set code, rarity key, or per-printing collector string — see per-field sections).

Let **`trimmed`** be the user value after **trim**. **Empty** means **`trimmed === ""`**.

- If the operator is **`=`** and the value is **empty**, apply **Empty value** (**`=`** row) only — **do not** run vocabulary **`=== u`** matching with empty **`u`**.
- If the operator is **`:`** and the value is **empty**, apply **Empty value** (**`:`** column) only.
- Otherwise let **`u = normalizeForResolution(trimmed)`**.

- **Prefix (`:`):** A candidate **matches** when **`normalizeForResolution(candidate).startsWith(u)`**.
- **Exact (`=`):** A candidate **matches** when **`normalizeForResolution(candidate) === u`**. If several vocabulary keys share the same normalized form, **OR** their contributions (same as matching that normalized string as a set of aliases).

The subsection below does **not** change these semantics. It requires **observationally equivalent** behavior while avoiding redundant work in the query hot path.

### Implementation performance (precompute and cache)

**Observational equivalence:** Any optimization **must** match the results of applying **`normalizeForResolution`** to the **wire** or **source** strings (user input and index keys / per-printing fields) as defined above. Caching or changing storage layout is allowed only if it preserves that equivalence.

**Why:** Re-running **`normalizeForResolution`** on **every candidate on every evaluation** scales with the number of printings or faces and runs on **every keystroke** in the SPA. **`set:`** / **`set_type:`** historically did this per row; migration to **precomputed** columns (Specs 047 / 179 / 178) removes that hotspot. Spec 182 fields and the same **`in:`** / **`cn:`** row-wise work should **not** repeat the per-row normalize pattern.

**Per-query hot path (target shape):**

1. Normalize the user value **once** per leaf evaluation → **`u`**.
2. Compare **`u`** to **precomputed** normalized strings using only **`startsWith`** / **`===`** (and bitwise OR of pre-mapped bits for small vocabs).

**Closed / build-time vocabularies** (keys of **`FORMAT_NAMES`**, **`FRAME_NAMES`**, **`GAME_NAMES`**, **`RARITY_NAMES`**, etc.): Precompute **`normalizeForResolution(key)`** once per key (module initialization, lazy static cache, or generated tables). Per query, iterate keys or use pre-built prefix structures **without** re-normalizing key strings.

**Runtime vocabularies** (e.g. **`knownSetCodes`**, oracle / illustration tag labels, keyword index keys): When the worker loads or builds the index, compute and store normalized forms alongside (or instead of) display strings wherever eval reads them. **`resolveForField`** / canonicalize may still use the same cached strings.

**Per-printing columns** (set code, set type, collector number, and any similar row string): Add **parallel columns** (e.g. additional **`string[]`** on **`PrintingIndex`**, filled in the constructor from wire data) holding **`normalizeForResolution(...)`** of each row’s source string. Eval loops then use **`rowNorm[i].startsWith(u)`** or **`rowNorm[i] === u`** with **no** per-row call into **`normalizeAlphanumeric`** / **`normalizeForResolution`**. This extends the idea of existing lowercased columns (**`setCodesLower`**, **`collectorNumbersLower`**) to full resolution normalization where the spec requires more than ASCII lowercasing.

**Keyword / tag inverted indices:** Pre-normalize keys when building **`KeywordData`** / tag maps so eval union walks compare **`u`** to cached normalized keys only.

**Testing:** During migration, parity tests (naive normalize-in-loop vs precomputed columns) are recommended; after cutover, existing query tests plus spot checks on diacritics / spacing prove equivalence.

**Related fields not in Spec 182 scope:** **`otag:`** / **`atag:`** should use the same precompute discipline when touched for performance or when amended for **`:`** vs **`=`** (see **Relation to other specs**). **`kw:`** / **`keyword:`**, **`set:`**, and **`set_type:`** use precomputed normalized keys/columns per Specs 176 and 047 / 179.

### Operators and negation

- **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** — **`:`**, **`=`**, and **`!=`**. **`!=`** is **negation of `=`** (exact positive mask per §1), **not** negation of **`:`** (prefix union). Scryfall does not document format **`!=`**; Frantic treats it as a principled extension, same **`!=`** rule family as **`frame:`** / **`in:`**.
- **`frame:`** — **`:`**, **`=`**, and **`!=`**. **`!=`** is **negation of `frame=`** (exact positive mask per §2), **not** negation of **`frame:`** (prefix union). Scryfall does not document **`frame!=`**; Frantic treats it as a principled extension, same **`!=`** rule family as **`in:`** / legalities.
- **`in:`** — **`:`**, **`=`**, and **`!=`**. **`!=`** is defined as **negation of `in=`** (exact positive match per §3), **not** negation of **`in:`** (prefix union).
- **`cn:`** / **`collectornumber:`** / **`number:`** — **`:`** and **`=`** only unless a future spec adds comparison ops; negate with **`-`** / **`NOT`**.

### Error model (Spec 039 passthrough)

For **non-empty** trimmed values (see **Empty value** for **`=`** with empty — **not** covered here):

- If **no** candidate matches under the active operator (**`:`** prefix vs **`=`** exact, and for **`!=`** the exact positive mask used for **`=`**) — and for **`cn:`** no printing matches — the leaf returns an **error string** and participates in **passthrough** ([Spec 039](039-non-destructive-error-handling.md)) — same family as **`kw:`** / **`set:`** / **`set_type:`**, **not** silent zero-hit like **`otag:`** / **`atag:`** ([Spec 174](174-otag-atag-prefix-query-semantics.md)).

Concrete messages (preserve existing shapes where they already exist):

- Format triple: **`unknown format "<trimmed value>"`** (use the **user-facing** field token as today, e.g. `node.value` / original spelling).
- **`frame:`** — **`unknown frame "<trimmed value>"`**
- **`in:`** — **`unknown in value "<trimmed value>"`**; **unsupported language** remains **`unsupported in value "<trimmed value>"`** (see **`in:`** below).
- **`cn:`** — **`unknown collector number "<trimmed value>"`** (new string; align wording with implementation and docs).

### Empty value

**`=` (exact), empty trimmed** — all fields in **Goal**: **Neutral** — the term must **not** narrow the result set (observable effect: **filters nothing**, e.g. **`f=`** while the user has not yet typed a value). The leaf must **not** act as a **zero-hit** filter on its own. **How** this is achieved is **implementation-defined** and **out of scope** to unify here: e.g. an all-match buffer, or an **`unknown format`** / **`unknown frame`** / **`unknown collector number`** node that **passthrough** elides in combination ([Spec 039](039-non-destructive-error-handling.md)), or equivalent — the **`unknown …`** wording in code or older specs may remain even when the **combined query** behaves like no constraint. For **`in=`**, prefer **match-all** like **`frame=`**; do **not** surface **`unknown in value`** for trimmed empty (**ADR-022**). Breakdown chips, hints, and other UX for this transient state are **out of scope**.

**`:` (prefix), empty trimmed:**

| Field(s) | Behavior |
|----------|----------|
| **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** | **Neutral** — same as empty **`=`** / **`!=`**: the leaf must **not** narrow results while the user has only typed the operator (parity with **`frame:`** empty **`:`** and **`kw:`**). |
| **`frame:`** | Empty **`:`** — **neutral** (all printings match in the leaf), same as **`kw:`** / **`keyword:`** (Spec 176) — trimmed empty must not narrow results while the user is still typing. |
| **`in:`** | Empty **`:`** — **neutral** (all printings match in the leaf), same as **`frame:`** / **`kw:`** and [ADR-022](../adr/022-categorical-field-operators.md) — do **not** return **`unknown in value`** for trimmed empty. |
| **`cn:`** | Empty **`:`** → **exact** match against empty stored collector string only, or **`unknown collector number`**; document in **Implementation Notes** if product chooses. |

### Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** use **`resolveForField`** for semantic matching for these fields once this spec is implemented. The AST **operator** (**`:`** vs **`=`**) and value select **prefix** vs **exact** rules per this spec.
- **`resolveForField`** for **`legal`**, **`f`**, **`format`**, **`banned`**, **`restricted`**, **`frame`**, **`in`**, and collector aliases remains for **`toScryfallQuery`** / **canonicalize** and any other non-eval consumer that needs **unique-prefix** collapse when exactly one vocabulary candidate matches ([Spec 103](103-categorical-field-value-auto-resolution.md)).

### Relation to other specs (migration, not in scope of Spec 182 ACs)

**[Spec 176](176-kw-keyword-prefix-query-semantics.md)** (**`kw:`** / **`keyword:`**) **migrated:** **`:`** = prefix union, **`=`** = exact. **[Specs 047](047-printing-query-fields.md) / [179](179-set-type-query-field.md)** (**`set:`** / **`set_type:`**) **migrated** the same way. **[Spec 174](174-otag-atag-prefix-query-semantics.md)** and **[Spec 032](032-is-operator.md)** (**`is:`** / **`not:`**) still treat **`:`** and **`=`** identically for prefix union. **Future amendments** to those specs should adopt the same **`:`** / **`=`** split as this spec for parity. That migration work is **not** part of Spec 182’s acceptance criteria.

---

## Per-field semantics

### 1. `legal:` / `f:` / `format:` / `banned:` / `restricted:`

**Domain:** Face (oracle-level legality columns; [Spec 056](056-printing-level-format-legality.md) / Spec 178).

**Vocabulary:** Keys of **`FORMAT_NAMES`** in [`shared/src/bits.ts`](../../shared/src/bits.ts) (same source as today).

**`:` (prefix):** Collect every key whose **`normalizeForResolution(key).startsWith(u)`**. Let **`combinedBit`** be the bitwise **OR** of **`FORMAT_NAMES[key]`** for all such keys.

**`=` (exact):** Collect every key whose **`normalizeForResolution(key) === u`**. Let **`combinedBit`** be the bitwise **OR** of **`FORMAT_NAMES[key]`** for all such keys.

**Evaluation:** For each face `i`, set **`buf[canonicalFace[i]] = 1`** when **`(col[i] & combinedBit) !== 0`**, where **`col`** is the appropriate legality column for the leaf (**legal** / **banned** / **restricted**).

**`!=`:** **Negation of `=`** only. Build **`combinedBit`** exactly as for **`=`** (normalized key equality). If **`combinedBit === 0`**, **`unknown format`**. Otherwise set **`buf[canonicalFace[i]] = 1`** when **`(col[i] & combinedBit) === 0`**.

**Empty `=`:** Neutral per **Empty value** — do not evaluate **`combinedBit`** from an empty exact token.

**Empty `!=`:** Neutral — all faces match in the leaf (same as empty **`=`**).

**Empty `:`:** Neutral — all canonical faces match in the leaf (same as empty **`=`** / **`!=`**); do not return **`unknown format`** for trimmed empty.

**Aliases:** **`f:`** → **`legal`**, **`format:`** → **`legal`** (existing alias map in `FIELD_ALIASES`).

### 2. `frame:`

**Domain:** Printing.

**Vocabulary:** Keys of **`FRAME_NAMES`**.

**`:` (prefix):** **`combinedBit`** = OR of **`FRAME_NAMES[key]`** for all keys with **`normalizeForResolution(key).startsWith(u)`**.

**`=` (exact):** **`combinedBit`** = OR of **`FRAME_NAMES[key]`** for all keys with **`normalizeForResolution(key) === u`**.

**Evaluation:** For each printing row `i`, set **`buf[i] = 1`** when **`(pIdx.frame[i] & combinedBit) !== 0`**.

**`!=`:** **Negation of `frame=`** only. Build **`combinedBit`** exactly as for **`=`** (normalized key equality). If **`combinedBit === 0`** (no key matches), **`unknown frame`**. Otherwise set **`buf[i] = 1`** when **`(pIdx.frame[i] & combinedBit) === 0`**.

**Empty `=`:** Neutral per **Empty value**.

**Empty `:`:** Neutral — all printings match (parity with **`kw:`** / **`keyword:`**); do not return **`unknown frame`** for trimmed empty.

**Empty `!=`:** Neutral — all printings match (same as empty **`=`** / **`:`**).

### 3. `in:`

**Domain:** Printing; promotion to face unchanged ([Spec 072](072-in-query-qualifier.md)).

**Language branch:** If the trimmed value is **non-empty** and is **exactly** a **known unsupported language** token ([Spec 072](072-in-query-qualifier.md)) (same detection as today — typically case-insensitive exact code, not prefix), return **`unsupported in value "<trimmed value>"`** for **`:`**, **`=`**, and **`!=`**. **Do not** apply game/set/rarity matching for that leaf. (**Empty `=`** is neutral per **Empty value**, not language handling.)

**`:` (prefix union across namespaces):** Build three sets of matching tokens using **`startsWith(u)`** on normalized strings:

1. **Games:** keys of **`GAME_NAMES`** that match.
2. **Sets:** codes in **`knownSetCodes`** that match.
3. **Rarities:** keys of **`RARITY_NAMES`** (Spec 104 **`bonus`** tier included) that match.

Compute the printing mask that is the **OR** of: every game condition, every set condition, every rarity condition induced by those tokens (same per-token semantics as Spec 072 for **positive** `:` / `=` today, but **union** all tokens in each namespace that match the prefix, then **OR** namespaces). A printing matches if it satisfies **any** of those conditions.

**`=` (exact):** Resolve **exactly one** semantic using **disambiguation order** [Spec 072](072-in-query-qualifier.md) — **game** → **set** → **rarity** — but require **normalized equality** (**`=== u`**) to the respective key or set code:

- If **`u`** equals a **game** name key → match printings for that game only.
- Else if **`u`** equals a **set code** in **`knownSetCodes`** (normalized) → match printings in that set only.
- Else if **`u`** equals a **rarity** key → match printings at that rarity only.
- Else (and not unsupported language) → **`unknown in value`**.

Unlike **`:`**, **`=`** does **not** OR multiple namespaces for one token: **first** matching branch in game → set → rarity wins (same spirit as current **`in:`** single-value interpretation).

**`!=`:** **Negation of `in=`** only. Build the **exact** positive printing mask as for **`in=`** above; a printing matches **`in!=v`** when it does **not** match that **exact** positive mask. Promotion to face: card matches if **no** printing matches the exact positive predicate (consistent with Spec 072 **`!=`** card-level meaning, but the positive predicate is **exact-`=`**, not prefix-union **`:`**).

**No matches (`:`):** For **non-empty** trimmed value, if no game, set, or rarity vocabulary entry matches the prefix (and not unsupported language), **`unknown in value "<trimmed value>"`**.

**No matches (`=`):** For **non-empty** trimmed value, if disambiguation finds no exact game / set / rarity match, **`unknown in value "<trimmed value>"`**.

**Empty `=`:** Neutral per **Empty value**.

**Empty `:`:** Neutral — all printings match (parity with **`frame:`** / **`kw:`**); do **not** return **`unknown in value`** for trimmed empty.

**Empty `!=`:** Neutral — all printings match (same as empty **`=`** / **`:`**).

**Note:** This **replaces** Spec 103 §4’s rule that **`in:`** auto-resolution requires **exactly one** match **across** the union for **evaluation** when using **`:`**. **`=`** eval follows **single-branch exact** disambiguation. **Canonicalize** may still use **unique-prefix** when a single candidate exists. It also supersedes any prior behavior where bare **`in:`** (empty value) surfaced as **`unknown in value`** — [Spec 072](072-in-query-qualifier.md) is amended to match when implementation lands (see **Acceptance criteria** §7).

### 4. `cn:` / `collectornumber:` / `number:`

**Domain:** Printing.

**Data:** Per-printing collector string already lowercased for eval (**`collectorNumbersLower`** or equivalent).

Let **`c = normalizeForResolution(collectorNumbersLower[i])`** per printing (consistent normalization everywhere).

**`:` (prefix):** Printing **`i`** matches when **`c.startsWith(u)`**.

**`=` (exact):** Printing **`i`** matches when **`c === u`**.

**Empty `=`:** Neutral per **Empty value**.

**No matches:** Non-empty **`trimmed`** / **`u`** and no printing matches under the active operator → **`unknown collector number "<trimmed value>"`** (passthrough).

**Normalization note:** Collector numbers can include letters and digits ([research](../research/scryfall-collector-number-shapes.md)); **`normalizeForResolution`** must be applied consistently so user input and stored values stay comparable. If implementation discovers edge cases (e.g. leading zeros), record them under **Implementation Notes**.

---

## Scryfall

Scryfall’s syntax for these fields is largely **exact** or **unique** token oriented, and often treats **`:`** and **`=`** as interchangeable. Frantic’s **`:`** = **prefix union** and **`=`** = **exact** are **intentional** extensions for discovery plus an escape hatch; document deltas in `app/src/docs/reference/scryfall/differences.mdx` when implemented. **`frame!=`** and **format `!=`** (**`f!=`**, **`banned!=`**, **`restricted!=`**, etc.) are **Frantic-only** operators (negation of exact **`=`** positive mask); Scryfall does not document them.

---

## Acceptance criteria

1. **Format:** **`:`** — non-empty prefix matching **multiple** format name keys ORs legality bits; **`unknown format`** when no key matches the prefix. **`=`** — only keys with **normalized equality** contribute; **`unknown format`** when none match exactly. **`!=`** — negation of **`=`** exact mask only; **`unknown format`** when the positive exact mask is zero. **Empty `=`** / **empty `!=`** — neutral (observable: filters nothing), mechanism implementation-defined per **Empty value**.
2. **Frame:** Same **`:`** / **`=`** split over **`FRAME_NAMES`**; **`!=`** negates **`frame=`** exact mask only (Frantic extension vs Scryfall). **`unknown frame`** when no exact vocabulary match for **`=`** / **`!=`** positive mask, or no prefix match for **`:`** (non-empty value only). **Empty `=`**, **empty `:`**, and **empty `!=`** — neutral (all printings match), aligned with **`kw:`** (Spec 176).
3. **`in:`** **`:`** — union across all games, sets, and rarities whose normalized names/codes **start with** **`u`**; **`OR`** printing results; **`unknown in value`** when none match (and not unsupported language). **`=`** — **exact** match with **game → set → rarity** disambiguation; **`!=`** — **negation of that exact `=` mask** only. **`in:ru`** / **`in=ru`** still **`unsupported in value`** per Spec 072 language detection. **Empty `=`**, **empty `:`**, and **empty `!=`** — neutral (all printings match), aligned with **`frame:`** / **`kw:`** and ADR-022.
4. **`cn:`** **`:`** — normalized **prefix** on per-printing collector strings; **`=`** — normalized **equality**; non-empty non-match → **`unknown collector number`** (passthrough). **Empty `=`** — neutral per **Empty value**.
5. **Canonicalize** still uses **`resolveForField`** for unique-prefix collapse where vocabulary is available.
6. **Normalization** matches **Spec 103** rules for cross-field consistency.
7. **Spec 103** and **Spec 072** are updated (when implementation lands) to reference this spec and to avoid contradicting eval vs canonicalize split.
8. Negating a **prefix-union** **`:`** predicate uses **`-` / `NOT`** only. Where **`!=`** is defined (**legalities**, **`frame!=`**, **`in!=`**), it is **negation of exact `=`** only, not negation of **`:`**. **`!=`** is **not** specified for **`cn:`** in this spec.
9. **Performance:** Evaluators for these fields **do not** call **`normalizeForResolution`** on every printing (or every vocabulary key) inside the per-keystroke hot path. Normalized forms are **precomputed** at index or vocabulary load (or equivalent cache) per **Implementation performance** above; behavior remains **observationally equivalent** to the semantic normalization rules.

## Implementation Notes

- **Empty `=` observable behavior:** Today, queries such as **`f=`** (no value yet) already **do not** narrow results; Spec 182 **normative** requirement is that **outcome**, whether the leaf is implemented as match-all, **`unknown format`** + passthrough, or otherwise.
- **Empty `in:` / `in=` / `in!=`:** Same **neutral** observable outcome as **`frame:`** while the value is still empty after trim — not an **`unknown in value`** leaf for bare **`in:`** (ADR-022 alignment; **[Spec 072](072-in-query-qualifier.md)** update pending implementation).
- **2026-04-04:** Legalities family (**`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`**) — eval uses precomputed **`normalizeForResolution`** of **`FORMAT_NAMES`** keys in **`shared/src/search/eval-leaves.ts`** (**`combinedFormatMask`**); **`:`** / **`=`** / **`!=`** per §1; **`resolveForField`** remains for canonicalize only (Spec 103).
