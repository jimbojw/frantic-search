# Spec 018: Combined Name Search

**Status:** Implemented

## Goal

Enable searching across multi-face card names so that queries like `imfa` find "Claim // Fame" and `" // "` finds split cards. Distinguish quoted from unquoted bare-word search semantics to match Scryfall's observed behavior.

## Background

Scryfall stores each card's name as a single combined string: `"Beck // Call"`, `"Claim // Fame"`. Their search engine matches queries against this combined name. Observed behavior:

| Query | Scryfall result | Why |
|---|---|---|
| `imfa` (unquoted) | Claim // Fame | Normalized combined name `"claimfame"` contains `"imfa"` |
| `"imfa"` (quoted) | No English match | Literal combined name `"Claim // Fame"` does not contain `"imfa"` |
| `" // "` (quoted) | Split/DFC cards | Literal combined name contains `" // "` |

Unquoted bare words appear to strip whitespace and punctuation before matching, while quoted strings preserve them.

### Current state in Frantic Search

The ETL stores each face's name individually. "Beck // Call" produces two face rows with names `"Beck"` and `"Call"`. The combined form is never stored.

Name matching (both bare words and `name:` field queries) uses `namesLower[i].includes(valLower)` against individual face names. This means:

1. `" // "` matches nothing — no individual face name contains `" // "`.
2. `imfa` doesn't find Claim // Fame — the substring only exists across the face boundary in the combined name.

Additionally, the parser produces identical `BARE` AST nodes for both quoted (`"bolt"`) and unquoted (`bolt`) strings, making it impossible to distinguish semantics.

## Design

### 1. ETL: Add `combined_names` column

Push the card-level `card.name` (Scryfall's combined multi-face name) as a new column in `ColumnarData`. For multi-face cards, this value is duplicated across all face rows, consistent with how `color_identity` and legalities are already duplicated. For single-face cards, this equals the face name.

| Face row | `names` | `combined_names` |
|---|---|---|
| Beck (face 0) | `"Beck"` | `"Beck // Call"` |
| Call (face 1) | `"Call"` | `"Beck // Call"` |
| Lightning Bolt | `"Lightning Bolt"` | `"Lightning Bolt"` |

### 2. CardIndex: Derive search-ready columns

At construction time, `CardIndex` computes two additional arrays from `combined_names`:

- **`combinedNamesLower`** — lowercased combined name, for literal substring search.
  - `"beck // call"`, `"claim // fame"`, `"lightning bolt"`
- **`combinedNamesNormalized`** — lowercased with all non-`[a-z0-9]` characters removed, for bare-word search.
  - `"beckcall"`, `"claimfame"`, `"lightningbolt"`

### 3. AST: Distinguish quoted bare words

Add a `quoted` boolean to `BareWordNode`:

```typescript
interface BareWordNode {
  type: "BARE";
  value: string;
  quoted: boolean;
}
```

- Unquoted WORD token in bare position → `{ type: "BARE", value, quoted: false }`
- QUOTED token in bare position → `{ type: "BARE", value, quoted: true }`

### 4. Parser: Set `quoted` flag

Two lines change in `parseAtom()`:

```
// Unquoted bare word (no operator following)
return { type: "BARE", value: word.value, quoted: false };

// Quoted bare string
return { type: "BARE", value: this.advance().value, quoted: true };
```

### 5. Evaluator changes

**Bare word (`evalLeafBareWord`):**

| Variant | Search target | Query normalization |
|---|---|---|
| Unquoted (`quoted: false`) | `combinedNamesNormalized[i]` | Strip non-`[a-z0-9]`, lowercase |
| Quoted (`quoted: true`) | `combinedNamesLower[i]` | Lowercase only |

**`name:` field (`getStringColumn`):** Return `combinedNamesLower` instead of `namesLower`. This makes `name:value` search the combined name, so `name:" // "` finds split cards.

**Exact name (`evalLeafExact`):** Match against both `combinedNamesLower[i]` and `namesLower[i]`. `!"Beck // Call"` matches the combined name exactly; `!"Call"` matches the individual face name. This matches Scryfall's behavior where `!` finds cards by either their combined name or any individual face name.

**Regex name (`evalLeafRegex`):** Inherits the change from `getStringColumn` — regex on `name` also searches the combined name.

### 6. Node key: Include quoted flag

`nodeKey` must differentiate quoted from unquoted BARE nodes for correct caching:

```
case "BARE":
  return `BARE${SEP}${ast.quoted ? "Q" : "U"}${SEP}${ast.value}`;
```

## Behavioral changes

### Multi-face name visibility (new capability)

| Query | Before | After |
|---|---|---|
| `imfa` | No match | Matches Claim // Fame |
| `" // "` | No match | Matches all split/DFC cards |
| `name:" // "` | No match | Matches all split/DFC cards |
| `!"Beck // Call"` | No match | Matches Beck // Call |
| `beckcall` | No match | Matches Beck // Call |

### Quoted vs unquoted distinction (new)

| Query | Before | After |
|---|---|---|
| `imfa` | Substring on per-face name | Substring on **normalized** combined name |
| `"imfa"` | Identical to `imfa` | Substring on **literal** combined name (stricter) |
| `"claim // fame"` | No match | Matches Claim // Fame |
| `bolt` | Matches "Lightning Bolt" | Still matches ("lightningbolt" contains "bolt") |

### Per-face → per-card name semantics

Name matching shifts from individual face names to the combined (card-level) name. Since all faces of a card share the same combined name, a `name:` condition now tests the combined name on every face row.

For most queries this is invisible. The edge case is a `name:` condition AND'ed with a face-specific field (like `power`):

| Query | Before | After |
|---|---|---|
| `name:back power>=4` on a DFC where "Front" has power 3, "Back" has power 5 | No match (back face name matches but power check passes; front face name doesn't match) | Match (combined name contains "back" on every face; front face fails power check but back face passes both) |

Wait — let me re-examine the "Before" case. Before: `name:back` → only face 1 matches (name "Back"). `power>=4` → only face 1 matches (power 5). AND → face 1 matches → card matches. So before, this DOES match.

A case where behavior actually differs: `name:front power>=4` on the same DFC.

| Query | Before | After |
|---|---|---|
| `name:front power>=4` | No match (face 0 matches name but has power 3; face 1 matches power but name is "Back") | Match (face 1 has combined name containing "front" AND power 5) |

This aligns with Scryfall's behavior: a card's name is a card-level property, not a face-level one. The combined name "Front // Back" is the card's name, and name conditions should reflect that.

## Out of scope

- **Unicode normalization.** Characters like Æ in "Ætherize" are stripped by the alphanumeric-only filter rather than transliterated to "ae". This is not a regression (current code doesn't normalize either) and can be addressed separately.
- **Alternative language names.** Scryfall falls back to non-English names for some queries; we do not index those.

## Test strategy

### Parser tests

1. `parse("bolt")` → `{ type: "BARE", value: "bolt", quoted: false }`.
2. `parse('"bolt"')` → `{ type: "BARE", value: "bolt", quoted: true }`.
3. Quoted string as a field value is unaffected: `parse('name:"lightning bolt"')` → `FIELD` node with value `"lightning bolt"` (no `quoted` flag).

### CardIndex tests

1. Single-face card: `combinedNamesLower[i]` equals `namesLower[i]`.
2. Multi-face card: `combinedNamesLower[i]` is the card-level combined name for every face.
3. `combinedNamesNormalized[i]` strips all non-`[a-z0-9]` characters.

### Evaluator tests

1. Unquoted `imfa` matches a Claim // Fame test card.
2. Quoted `"imfa"` does NOT match Claim // Fame.
3. Quoted `" // "` matches multi-face cards, not single-face cards.
4. `name:" // "` has the same result as #3.
5. `!"Beck // Call"` matches Beck // Call exactly.
6. `name:/claim.*fame/` matches Claim // Fame via regex on combined name.
7. Single-face card: `bolt` still matches "Lightning Bolt" (normalized form `"lightningbolt"` contains `"bolt"`).
8. Cross-field AND: `name:beck power>=4` on Beck // Call (both faces are instants, no power) → no match. Confirms combined name doesn't circumvent face-level evaluation for non-name fields.

### Node caching tests

1. `nodeKey` produces different keys for `{ type: "BARE", value: "x", quoted: false }` and `{ type: "BARE", value: "x", quoted: true }`.

## Acceptance criteria

1. `parse("imfa")` produces `{ type: "BARE", value: "imfa", quoted: false }`.
2. `parse('"imfa"')` produces `{ type: "BARE", value: "imfa", quoted: true }`.
3. Given a synthetic dataset containing Beck // Call and Claim // Fame, evaluating `imfa` matches Claim // Fame.
4. Given the same dataset, evaluating `"imfa"` does NOT match Claim // Fame.
5. Evaluating `" // "` matches multi-face cards but not single-face cards.
6. `name:" // "` behaves the same as criterion 5.
7. `!"Beck // Call"` matches exactly one card.
8. `ColumnarData` includes a `combined_names: string[]` column populated by the ETL from Scryfall's card-level `name` field.
9. All existing tests continue to pass, with updates for the new `quoted` field on `BARE` nodes.

## Implementation Notes

- 2026-02-21: `evalLeafExact` checks both `combinedNamesLower` and `namesLower`,
  not just the combined name. Scryfall's `!` exact match finds cards by either
  their combined name or any individual face name (e.g., `!"Ayara, Furnace Queen"`
  finds the card even though the combined name is
  "Ayara, Widow of the Realm // Ayara, Furnace Queen"). The design section above
  has been updated to reflect this.
