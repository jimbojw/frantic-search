# Comparing Results with Scryfall

When our search results differ from Scryfall's, it's important to distinguish bugs from intentional divergences. This guide covers how to use Scryfall's REST API to investigate discrepancies. See ADR-013 for the project's position on search parity.

## When to Compare

- You've added or changed evaluation logic and want to verify correctness.
- A query returns a suspicious number of results.
- You're deciding whether a discrepancy is a bug to fix or a known divergence to accept.

## Scryfall Search API

**Endpoint:** `https://api.scryfall.com/cards/search?q=<url-encoded query>`

Key behaviors:
- A **404 response** means zero results, not an error.
- Results **paginate at 175 cards**. Check `has_more` and follow `next_page`.
- Scryfall asks for **50–100ms between requests**. Add a delay when paginating.
- Scryfall's field names differ slightly from ours in some cases (e.g., Scryfall accepts both `pow` and `power`).

## Comparison Workflow

Run the query locally and against Scryfall, sort both, and diff:

```bash
# Local results
npm run -s cli -- search 'YOUR QUERY' --output names | sort > /tmp/local.txt

# Scryfall results (handles pagination)
node -e "
async function fetchAll(q) {
  const cards = [];
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q);
  while (url) {
    const res = await fetch(url);
    if (!res.ok) { console.error(await res.text()); process.exit(1); }
    const data = await res.json();
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
    if (url) await new Promise(r => setTimeout(r, 100));
  }
  return cards;
}
fetchAll('YOUR SCRYFALL QUERY').then(cards => {
  cards.map(c => c.name).sort().forEach(n => console.log(n));
});
" | sort > /tmp/scryfall.txt

# Compare
diff /tmp/local.txt /tmp/scryfall.txt

# Or for clearer output:
comm -23 /tmp/local.txt /tmp/scryfall.txt   # only in local
comm -13 /tmp/local.txt /tmp/scryfall.txt   # only in Scryfall
```

## Known Divergences

These are expected differences documented in ADR-013, not bugs:

- **DFC name format**: We display the front face name (e.g., `Ayara, Widow of the Realm`). Scryfall displays the joined name (`Ayara, Widow of the Realm // Ayara, Furnace Queen`).
- **Specialize variants**: Alchemy's Specialize mechanic creates 5 color-specific forms per base card. Scryfall's bulk data includes them as separate oracle entries, but Scryfall's search hides them. We show them. They are identifiable by `games: ["arena"]`, `digital: true`, and all legalities being `not_legal`.
- **Playtest/event cards**: Cards from `set_type: "funny"` (Mystery Booster playtest cards, Unknown Event cards, etc.) appear in the bulk data but Scryfall's search excludes them.

## Inspecting Raw Card Data

To examine a specific card's raw Scryfall data:

```bash
node -e "
const cards = require('./data/raw/oracle-cards.json');
const c = cards.find(c => c.name === 'CARD NAME');
console.log(JSON.stringify(c, null, 2));
"
```

Useful fields for debugging: `layout`, `card_faces`, `legalities`, `games`, `digital`, `set_type`, `keywords`, `all_parts`.
