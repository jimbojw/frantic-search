# Spec 020: Tilde Self-Reference in Oracle Text

**Status:** Draft

**Depends on:** Spec 002 (Query Engine), Spec 003 (ETL Process)

## Goal

Support the `~` placeholder in oracle text queries (`o:` / `oracle:`) as a stand-in for a card's self-reference, matching Scryfall's behavior. Queries like `o:~`, `o:"when ~ enters"`, and `o:/~ deals \d+/` should find cards regardless of whether the oracle text uses the card's literal name, a shortened legendary name, or a templated phrase like "this creature."

## Background

Magic cards refer to themselves in oracle text in three ways:

1. **Literal full name.** "Lightning Bolt deals 3 damage to any target."
2. **Shortened legendary name.** Legendary permanents named "Name, Title" use just "Name" after the first reference. E.g., "Ayara, Widow of the Realm" → oracle text says "Ayara deals X damage."
3. **Templated self-reference.** Modern Oracle text updates replaced many name references with "this creature", "this enchantment", "this spell", "this card", etc. E.g., Oblivion Ring now reads "When this enchantment enters…" instead of "When Oblivion Ring enters…"

Scryfall's search engine treats `~` as a unified placeholder that matches all three forms. Verified against the Scryfall API:

| Query | Match | Oracle text says |
|---|---|---|
| `o:"~ deals" !"Ayara, Widow of the Realm"` | Ayara | "Ayara deals X damage" (short name) |
| `o:"~ can't be countered" t:instant` | Abrupt Decay et al. | "This spell can't be countered" |
| `o:"~ enters tapped" t:land` | 580 lands | "This land enters tapped" |
| `o:"cast ~ from" !"Alien Symbiosis"` | Alien Symbiosis | "You may cast this card from your graveyard" |
| `o:~ !"Oblivion Ring"` | Oblivion Ring | "When this enchantment enters…" |
| `o:"~ ability" t:creature` | 0 results | "this ability" is NOT a self-reference |

Scryfall's documentation says only: *"You can use `~` in your text as a placeholder for the card's name."* The actual behavior is broader than the docs suggest.

### Scope of "this X" patterns

Analysis of ~33,000 oracle texts shows the following "this X" patterns in the data. Only patterns that Scryfall treats as `~` are included.

**Card types:** creature (14,985), spell (2,754), artifact (1,410), land (1,219), enchantment (1,168), planeswalker (9), sorcery (3), battle (1)

**Subtypes:** aura (512), equipment (295), saga (286), vehicle (278), scheme (111), contraption (47), spacecraft (47), conspiracy (43), siege (37), door (30), class (28), mount (24), emblem (21), phenomenon (20), case (16), attraction (13), plane (9), room (5), planet (5), dungeon (1), boon (1), boss (1)

**General self-references:** permanent (208), card (2,804)

Patterns that are NOT self-references: "this ability" (408), "this token" (846), "this turn" (2,987), "this way" (1,157), and other non-card-object phrases.

### Short-name prevalence

1,402 card faces use only the pre-comma short name as a self-reference (never the full name). This is standard for legendary permanents in modern templating.

## Design

### Strategy: ETL-time normalization with a dedicated column

A new column `oracle_texts_tilde` stores oracle text with all self-references replaced by the literal character `~`. The evaluator uses this column when the query value contains `~`, and the original `oracle_texts` column otherwise. This keeps the common-case fast path (queries without `~`) completely unchanged.

### ETL: normalization algorithm

During `pushFaceRow`, produce the tilde-normalized text by applying replacements in order:

```
input  = face.oracle_text
output = input

1. Replace full face name         →  ~   (case-insensitive, word-boundary)
2. If name contains ",":
     Replace pre-comma short name →  ~   (case-insensitive, word-boundary)
3. Replace "this <TYPE>"          →  ~   (case-insensitive, word-boundary)

if output === input:
  store "" as oracle_texts_tilde[i]    # no self-reference found
else:
  store output as oracle_texts_tilde[i]
```

**Order matters.** Full name first avoids partial replacements. For "Lightning Bolt deals 3 damage", step 1 produces "~ deals 3 damage" and step 3 is a no-op. For "Ayara, Widow of the Realm" whose text says "Ayara deals X damage", step 1 is a no-op (full name not present), step 2 replaces "Ayara" → "~".

**Empty string for non-self-referencing cards.** If none of the three replacement steps changed the text, the card has no self-reference and `""` is stored. This avoids duplicating oracle text on the wire and gives the evaluator a free fast-skip: any `~`-containing query is trivially a non-match when the tilde column is empty.

All replacements use word boundaries (`\b`) to avoid mangling words that happen to contain the name as a substring.

### "this X" replacement list

A static array of terms, maintained in the ETL:

```typescript
const TILDE_TYPES = [
  // Card types
  "creature", "artifact", "enchantment", "land", "planeswalker",
  "instant", "sorcery", "battle",
  // Subtypes (those appearing with "this" in oracle text)
  "aura", "equipment", "saga", "vehicle", "scheme", "contraption",
  "spacecraft", "conspiracy", "siege", "door", "class", "mount",
  "emblem", "phenomenon", "case", "attraction", "plane", "room",
  "planet", "dungeon", "boon", "boss",
  // General self-references
  "permanent", "spell", "card",
];
```

The regex built from this list:

```typescript
const TILDE_PATTERN = new RegExp(
  `\\bthis\\s+(${TILDE_TYPES.join("|")})\\b`,
  "gi",
);
```

When new card types or subtypes appear in future sets, add them to this list.

### Wire format: `ColumnarData` extension

Add to `shared/src/data.ts`:

```typescript
export interface ColumnarData {
  // ... existing fields ...
  oracle_texts_tilde: string[];
}
```

Aligned with `oracle_texts`: `oracle_texts_tilde[i]` is the normalized form of `oracle_texts[i]`, or `""` if the face has no self-reference. Cards whose oracle text does not contain their own name, a short legendary name, or any "this \<type\>" pattern get an empty string — there is no reason to duplicate the original text on the wire for cards that cannot match a `~` query.

### Payload impact

Most cards have no self-reference in their oracle text, so the majority of entries are `""`. Only faces with an actual self-reference store the normalized text. This keeps the column small: rough estimate ~500 KB raw, compressing to well under 100 KB with gzip (long runs of `,"","",…` compress to nearly nothing).

### CardIndex extension

Add a pre-lowercased field:

```typescript
class CardIndex {
  // ... existing fields ...
  readonly oracleTextsTildeLower: string[];

  constructor(data: ColumnarData) {
    // ...
    this.oracleTextsTildeLower = data.oracle_texts_tilde.map(
      (t) => t.toLowerCase(),
    );
  }
}
```

### Evaluator changes

**No parser changes.** `o:"when ~ enters"` parses as `{type: "FIELD", field: "o", operator: ":", value: "when ~ enters"}`. The `~` is just a character in the value string.

**String field matching.** In `evalLeafField`, when the canonical field is `oracle` and the lowered value contains `~`, use `oracleTextsTildeLower` instead of `oracleTextsLower`:

```typescript
case "oracle": {
  const hasTilde = valLower.includes("~");
  const col = hasTilde ? index.oracleTextsTildeLower : index.oracleTextsLower;
  for (let i = 0; i < n; i++) {
    buf[i] = col[i].includes(valLower) ? 1 : 0;
  }
  break;
}
```

The `~` in the query value literally matches `~` characters in the normalized column. No per-card string manipulation at query time. Cards with `""` in the tilde column are naturally non-matches — `"".includes(anyNonEmptyString)` is always `false`.

**Regex field matching.** In `evalLeafRegex`, same column-selection logic:

```typescript
const hasTilde = node.pattern.includes("~");
const col = hasTilde
  ? index.oracleTextsTildeLower
  : getStringColumn(canonical, index)!;
```

The `~` in the regex pattern literally matches `~` in the normalized column. No per-card regex compilation needed.

## Worked examples

### `o:~` (bare tilde)

Query value: `"~"`. Contains `~`, so the evaluator searches `oracleTextsTildeLower` for the substring `"~"`.

- **Lightning Bolt:** normalized text is `"~ deals 3 damage to any target."` → contains `~` → match.
- **Oblivion Ring:** normalized text is `"when ~ enters, exile another target…"` → match.
- **Ayara front face:** normalized text is `"{t}, sacrifice another creature or artifact: ~ deals x damage…"` → match.
- **Birds of Paradise:** tilde column is `""` (no self-reference found during ETL) → no `~` → no match.

### `o:"when ~ enters"`

Searches normalized column for `"when ~ enters"`.

- **Oblivion Ring:** `"when ~ enters, exile…"` → match.
- **Lightning Bolt:** `"~ deals 3 damage…"` → no match.

### `o:flying` (no tilde)

No `~` in value, so the evaluator searches the original `oracleTextsLower` column for `"flying"`. Existing behavior, zero overhead.

## Test strategy

### ETL normalization tests

Test the normalization function in isolation with synthetic inputs:

| Input name | Input oracle text | Expected normalized |
|---|---|---|
| `"Lightning Bolt"` | `"Lightning Bolt deals 3 damage to any target."` | `"~ deals 3 damage to any target."` |
| `"Oblivion Ring"` | `"When this enchantment enters, exile another target nonland permanent."` | `"When ~ enters, exile another target nonland permanent."` |
| `"Ayara, Widow of the Realm"` | `"Ayara deals X damage to target opponent."` | `"~ deals X damage to target opponent."` |
| `"Sol Ring"` | `"{T}: Add {C}{C}."` | `""` (no self-reference) |
| `"Abrupt Decay"` | `"This spell can't be countered.\nAbrupt Decay destroys target nonland permanent with mana value 3 or less."` | `"~ can't be countered.\n~ destroys target nonland permanent with mana value 3 or less."` |

### Evaluator tests

Add test cases to the existing evaluator test suite using a synthetic `ColumnarData` that includes `oracle_texts_tilde`:

- `o:~` matches cards with any self-reference in oracle text.
- `o:"when ~ enters"` matches only cards with that specific pattern.
- `o:flying` is unchanged (no tilde in query, uses original column).
- `o:~` does NOT match cards with no self-reference (tilde column is `""`).
- `o:/~ deals \d+/` regex works against the normalized column.

## Acceptance criteria

1. `oracle_texts_tilde` column is present in `columns.json` after `npm run etl -- process`.
2. Literal card names in oracle text are replaced with `~` in the tilde column.
3. Pre-comma short names of legendary cards are replaced with `~`.
4. "this creature", "this enchantment", "this spell", "this card", "this land", "this artifact", "this permanent", and all listed subtypes are replaced with `~`.
5. "this ability", "this token", "this turn", and other non-self-referential patterns are NOT replaced.
6. Word-boundary matching prevents partial-word replacements (e.g., the name "Al" does not corrupt "also").
7. `o:~` returns cards whose oracle text contains any form of self-reference.
8. `o:"when ~ enters"` returns cards matching that pattern regardless of self-reference style.
9. `o:flying` (no tilde) is unaffected — uses original oracle text column, same results as before.
10. `o:/~ deals \d+/` regex works correctly against the normalized column.
11. The original `oracle_texts` column is unchanged.
