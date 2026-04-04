# Spec 182: Prefix union for format, frame, `in:`, and collector number

**Status:** Draft

**Depends on:** Spec 002 (Query Engine), Spec 032 (`is:` / `not:` prefix union precedent), Spec 039 (Non-Destructive Error Handling), Spec 047 (Printing Query Fields), Spec 056 / Spec 178 (oracle-level format legality), Spec 072 (`in:` qualifier), Spec 103 (Categorical Field Value Auto-Resolution), Spec 104 (bonus rarity tier), Spec 176 (`kw:` / `keyword:` prefix query semantics — pattern reference), Spec 068 (`game:`)

**References:** [GitHub #247](https://github.com/jimbojw/frantic-search/issues/247)

## Goal

Extend **eval-time prefix union** (normalized prefix over a vocabulary or per-printing string; **OR** all matches) to:

- **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** (face domain, oracle-level legality columns)
- **`frame:`** (printing domain)
- **`in:`** (printing domain, promotes to face per Spec 072)
- **`cn:`** / **`collectornumber:`** / **`number:`** (printing domain)

so incomplete tokens behave like **`kw:`** / **`set:`** for discovery: e.g. a prefix shared by several format names matches cards satisfying **any** of those formats’ legality bits.

## Out of scope

- **`artist:`** / **`a:`** — keep **substring** semantics ([Spec 149](149-artist-evaluator.md)); no prefix-union change.
- **`game:`** / **`rarity:`** / **`r:`** — vocabularies are too small for meaningful prefix collision; no change ([GitHub #247](https://github.com/jimbojw/frantic-search/issues/247)).
- **Spec 181** (breakdown prefix-branch hints) — optional follow-up once evaluation matches this spec; not required for acceptance here.

## Background

[Spec 103](103-categorical-field-value-auto-resolution.md) applies **unique-prefix** resolution (`resolveForField` → `resolveCategoricalValue`) for many categoricals: **exactly one** normalized prefix match resolves; otherwise the typed value is passed through and lookup often fails with **`unknown format`**, **`unknown frame`**, or **`unknown in value`**.

[Spec 176](176-kw-keyword-prefix-query-semantics.md) and **`set:`** ([Spec 047](047-printing-query-fields.md)) instead use **eval-time** normalized prefix matching over a vocabulary (or per-row set codes) and **union** results. This spec brings the listed fields in line with that family.

## Shared rules

### Normalization

Use **Spec 103** **`normalizeForResolution`** (same as `normalizeAlphanumeric`) on:

- the user value (after **trim**), and  
- each **candidate string** (format name key, frame name key, game key, set code, rarity key, or per-printing collector string — see per-field sections).

A candidate **matches** the user prefix when:

`normalizeForResolution(candidate).startsWith(normalizeForResolution(userValue))`

For **non-empty** trimmed user values only; see **Empty value** below.

### Operators

- **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** — only **`:`** and **`=`** (unchanged from current eval).
- **`frame:`** — only **`:`** and **`=`** (unchanged).
- **`in:`** — **`:`**, **`=`**, and **`!=`** (unchanged from [Spec 072](072-in-query-qualifier.md)).
- **`cn:`** / **`collectornumber:`** / **`number:`** — only **`:`** and **`=`** unless a future spec adds comparison ops (out of scope).

### Error model (Spec 039 passthrough)

For **non-empty** trimmed values:

- If **no** candidate matches the prefix (and no printing matches for **`cn:`** per below), the leaf returns an **error string** and participates in **passthrough** ([Spec 039](039-non-destructive-error-handling.md)) — same family as **`kw:`** / **`set:`** / **`set_type:`**, **not** silent zero-hit like **`otag:`** / **`atag:`** ([Spec 174](174-otag-atag-prefix-query-semantics.md)).

Concrete messages (preserve existing shapes where they already exist):

- Format triple: **`unknown format "<trimmed value>"`** (use the **user-facing** field token as today, e.g. `node.value` / original spelling).
- **`frame:`** — **`unknown frame "<trimmed value>"`**
- **`in:`** — **`unknown in value "<trimmed value>"`**; **unsupported language** remains **`unsupported in value "<trimmed value>"`** (see **`in:`** below).
- **`cn:`** — **`unknown collector number "<trimmed value>"`** (new string; align wording with implementation and docs).

### Empty value

| Field(s) | Behavior |
|----------|----------|
| **`legal:`** / **`f:`** / **`format:`** / **`banned:`** / **`restricted:`** | **No** `kw:`-style “match all.” Empty trimmed value keeps **invalid / unknown** behavior consistent with having no resolvable format name (implementation: same class of outcome as today — typically **`unknown format`** once evaluated). |
| **`frame:`** | Empty trimmed → **`unknown frame`** (no union over all frames as a neutral filter). |
| **`in:`** | Empty trimmed → **`unknown in value`** (unchanged from Spec 072 style). |
| **`cn:`** | Empty trimmed → **exact** match against empty stored collector string only (no “match all printings”); if product prefers **`unknown collector number`** for empty, document in **Implementation Notes**. |

### Spec 103 split (evaluation vs canonicalize)

- **Query evaluation** does **not** use **`resolveForField`** for semantic matching for these fields once this spec is implemented. The AST value is interpreted as a **prefix** per this spec.
- **`resolveForField`** for **`legal`**, **`f`**, **`format`**, **`banned`**, **`restricted`**, **`frame`**, **`in`**, and collector aliases remains for **`toScryfallQuery`** / **canonicalize** and any other non-eval consumer that needs **unique-prefix** collapse when exactly one vocabulary candidate matches ([Spec 103](103-categorical-field-value-auto-resolution.md)).

---

## Per-field semantics

### 1. `legal:` / `f:` / `format:` / `banned:` / `restricted:`

**Domain:** Face (oracle-level legality columns; [Spec 056](056-printing-level-format-legality.md) / Spec 178).

**Vocabulary:** Keys of **`FORMAT_NAMES`** in [`shared/src/bits.ts`](../../shared/src/bits.ts) (same source as today).

**Matching:** Collect every key whose **`normalizeForResolution(key)`** starts with the normalized user prefix. Let **`combinedBit`** be the bitwise **OR** of **`FORMAT_NAMES[key]`** for all matching keys.

**Evaluation:** For each face `i`, set **`buf[canonicalFace[i]] = 1`** when **`(col[i] & combinedBit) !== 0`**, where **`col`** is the appropriate legality column for the leaf (**legal** / **banned** / **restricted**).

**Aliases:** **`f:`** → **`legal`**, **`format:`** → **`legal`** (existing alias map in `FIELD_ALIASES`).

### 2. `frame:`

**Domain:** Printing.

**Vocabulary:** Keys of **`FRAME_NAMES`**.

**Matching:** OR all **`FRAME_NAMES[key]`** bits for keys whose normalized form starts with the user prefix.

**Evaluation:** For each printing row `i`, set **`buf[i] = 1`** when **`(pIdx.frame[i] & combinedBit) !== 0`**.

### 3. `in:`

**Domain:** Printing; promotion to face unchanged ([Spec 072](072-in-query-qualifier.md)).

**Vocabulary for prefix union** (normalized prefix on keys / codes as strings):

1. **Games:** keys of **`GAME_NAMES`** whose normalized name starts with the user prefix.
2. **Sets:** every code in **`knownSetCodes`** whose **`normalizeForResolution(code)`** starts with the user prefix.
3. **Rarities:** keys of **`RARITY_NAMES`** (Spec 104 **`bonus`** tier included) whose normalized name starts with the user prefix.

**Language branch (unchanged intent):** If the trimmed value is **exactly** (after trim + case fold for comparison) a **known unsupported language** token ([Spec 072](072-in-query-qualifier.md)), return **`unsupported in value "<trimmed value>"`** and do **not** apply prefix union for that leaf. **Do not** use prefix matching against language codes for union (avoids **`in:r`** being absorbed into **`ru`**-style unsupported paths).

**Positive match (`:` / `=`):** Compute three masks (printing indices) — games OR, sets OR, rarities OR — then **OR** those masks into **`buf`**. A printing matches if it matches **any** resolved game, set, or rarity condition from the **union** of matching vocabulary entries.

**Negation (`!=`):** A printing matches when it does **not** satisfy the **positive** union above (same high-level meaning as today: no printing of the card may match the positive `in:` condition for promotion to face; implementation must match existing tests for `!=` composition).

**No matches:** If the union yields no matching vocabulary entries (and the value is not an exact unsupported language), **`unknown in value "<trimmed value>"`**.

**Note:** This **replaces** Spec 103 §4’s rule that **`in:`** auto-resolution requires **exactly one** match **across** the union for **evaluation**. After this spec, **eval** uses **union**; **canonicalize** may still use **unique-prefix** when a single candidate exists.

### 4. `cn:` / `collectornumber:` / `number:`

**Domain:** Printing.

**Data:** Per-printing collector string already lowercased for eval (**`collectorNumbersLower`** or equivalent).

**Matching:** Let **`p = normalizeForResolution(trimmedUserValue)`**. For each printing **`i`**, let **`c = normalizeForResolution(collectorNumbersLower[i])`** (or the same normalization applied consistently to stored data). The printing matches when **`c.startsWith(p)`**.

**No matches:** Non-empty **`p`** and **no** printing with **`c.startsWith(p)`** → **`unknown collector number "<trimmed value>"`** (passthrough).

**Normalization note:** Collector numbers can include letters and digits ([research](../research/scryfall-collector-number-shapes.md)); **`normalizeForResolution`** must be applied consistently so user input and stored values stay comparable. If implementation discovers edge cases (e.g. leading zeros), record them under **Implementation Notes**.

---

## Scryfall

Scryfall’s syntax for these fields is largely **exact** or **unique** token oriented. Frantic’s **prefix union** is an intentional extension for discovery; document deltas in `app/src/docs/reference/scryfall/differences.mdx` when implemented.

---

## Acceptance criteria

1. **Format:** A prefix matching **multiple** format name keys ORs legality bits; **`unknown format`** when non-empty prefix matches **no** key.
2. **Frame:** Same pattern over **`FRAME_NAMES`**; **`unknown frame`** when non-empty prefix matches **no** key.
3. **`in:`** Prefix matches **all** games, sets, and rarities that share the prefix; **`OR`** printing results; **`!=`** consistent with positive union; **`in:ru`** still **`unsupported in value`**; non-matching non-language → **`unknown in value`**.
4. **`cn:`** Prefix matches all printings whose **normalized** collector string starts with the normalized user prefix; non-empty non-match → **`unknown collector number`** (passthrough).
5. **Canonicalize** still uses **`resolveForField`** for unique-prefix collapse where vocabulary is available.
6. **Normalization** matches **Spec 103** rules for cross-field consistency.
7. **Spec 103** and **Spec 072** are updated (when implementation lands) to reference this spec and to avoid contradicting eval vs canonicalize split.

## Implementation Notes

*(None yet — append when implementation deviates or edge cases are found.)*
