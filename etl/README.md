# Frantic Search — ETL

The Extract-Transform-Load pipeline for Frantic Search. Runs in Node.js.

## Commands

### `npm run etl -- download`

Fetches the latest "Oracle Cards" bulk data file from Scryfall.

- **Source:** Scryfall API (`https://api.scryfall.com/bulk-data`)
- **Output:** `data/raw/oracle-cards.json` (~160 MB)
- **Caching:** Skips download if the local file is already up to date (checks `updated_at`). Use `--force` to override.

### `npm run etl -- process`

Transforms the raw Scryfall data into a compact, column-oriented JSON file for the client app.

- **Input:** `data/raw/oracle-cards.json`
- **Output:** `data/dist/columns.json`
- **Features:**
  - Extracts only search-relevant fields (name, mana cost, oracle text, subtypes).
  - Encodes Colors, Color Identity, Types, and Supertypes as compact bitmasks.
  - Encodes Power, Toughness, Loyalty, and Defense using dictionary lookups (indices into a small table).
  - Strips bitmask-encoded words from the type line, leaving only subtypes.

### Common Options

| Flag        | Description                              |
|-------------|------------------------------------------|
| `--verbose` | Print detailed progress                  |
| `--force`   | Force download even if data is up to date |

## Output Format

The output is a single JSON object with parallel arrays (column-oriented):

```json
{
  "names": ["Card A", "Card B", ...],
  "mana_costs": ["{1}{W}", "", ...],
  "oracle_texts": ["Flying", "...", ...],
  "colors": [1, 0, ...],
  "color_identity": [1, 0, ...],
  "types": [4, 32, ...],
  "supertypes": [2, 0, ...],
  "subtypes": ["Goblin Warrior", "", ...],
  "powers": [2, 0, ...],
  "toughnesses": [3, 0, ...],
  "loyalties": [0, 5, ...],
  "defenses": [0, 0, ...],
  "power_lookup": ["", "1", "2", ...],
  "toughness_lookup": ["", "1", "2", ...],
  "loyalty_lookup": ["", "3", "4", ...],
  "defense_lookup": ["", "4"]
}
```

Bitmask definitions are in `shared/src/bits.ts`. Index `0` in every lookup table is the empty string (meaning the field does not apply to that card).
