# Comparing Results with Scryfall

When our search results differ from Scryfall's, it's important to distinguish bugs from intentional divergences. This guide covers how to use Scryfall's REST API to investigate discrepancies. See ADR-019 for the project's position on search parity.

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

**Recommended:** Use the `diff` subcommand to compare automatically:

```bash
npm run cli -- diff "YOUR QUERY"
```

This fetches Scryfall results, compares by Scryfall ID (handling `unique:prints` and printing-level queries), and reports In Both / Only in Frantic Search / Only in Scryfall with card names, sets, and collector numbers. Use `--quiet` for IDs only.

**Prerequisites for tag, illustration, flavor, and artist queries:** Local evaluation loads `otags.json`, `atags.json`, `flavor-index.json`, and `artist-index.json` from the same directory as `columns.json` (plus `keywords_index` inside columns). Produce them with `npm run etl -- download-tags` (or full setup) and `npm run etl -- process`. If those files are missing, local results for `otag:`, `atag:`, `flavor:`, or `a:` will not match the app or Scryfall. Use `--no-supplemental` only when intentionally testing without them.

**Manual workflow** (for scripting or custom comparison):

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

These are principled divergences documented in ADR-019, not bugs:

- **DFC name format**: We display the front face name (e.g., `Ayara, Widow of the Realm`). Scryfall displays the joined name (`Ayara, Widow of the Realm // Ayara, Furnace Queen`).
- **Partial date ranges**: `date=202` expands to `[2020-01-01, 2030-01-01)` for narrow-as-you-type UX. Scryfall ignores partial dates as erroneous. See Spec 061.
- **`!` as operator synonym**: Scryfall inconsistently treats `!` as `=` for some fields but not others. We do not replicate this. See § Scryfall's Undocumented Behavior below.
- **Tokens matching printing filters**: Under the "only playable cards" doctrine (without `include:extras`), tokens such as "Icingdeath, Frost Tongue" are not playable in any format and should be excluded. However, when a query combines printing-level conditions (e.g. `s:sld`, `is:ub`) with a name search, Scryfall may include tokens that match those filters. Example: `(is:ub OR s:sld) icingdeath` returns both the creature "Icingdeath, Frost Tyrant" and the token "Icingdeath, Frost Tongue" on Scryfall, even though the token is not playable. Frantic Search excludes tokens from the index entirely (they are filtered in the ETL), so we do not replicate this behavior. See [issue #76](https://github.com/jimbojw/frantic-search/issues/76).
- **`is:alchemy` vs Scryfall search**: Frantic sets the alchemy printing flag from Scryfall bulk `promo_types` (`alchemy`) and from `set_type: alchemy` on the printing (see Specs 046 / 047). Scryfall’s default search sometimes **excludes** a handful of Mystery Booster 2 playtest printings that still have the alchemy tag in bulk. Frantic includes them intentionally (honor-the-data stance). To list those printings: `is:alchemy set:mb2`. See [issue #191](https://github.com/jimbojw/frantic-search/issues/191) and the in-app Syntax Reference article for **is** (`app/src/docs/reference/fields/face/is.mdx`).
- **`is:unset` vs oracle `is:funny`**: Frantic implements Scryfall’s printing query `is:unset` from bulk **`set_type: "funny"`** on each default_cards row (`PrintingFlag.Unset` in `printing_flags`; Spec 171). Oracle **`is:funny`** is broader (acorn stamps, silver borders, playtest cards, etc.). Do not conflate the two. Compared to Scryfall’s `is:unset`, expect **order-of-magnitude** parity when using the same `include:` assumptions (`include:extras` for `npm run cli -- diff`); exact counts differ if one engine counts printings vs oracle-unique cards or if bulk `set_type` drifts from Scryfall’s live index.

### Filtered by default (matching Scryfall)

The following categories are excluded by default (Spec 057) and only appear with `include:extras`:

- **Specialize variants**: Alchemy's Specialize mechanic creates 5 color-specific forms per base card. Scryfall's bulk data includes them as separate oracle entries, but both Scryfall and Frantic Search hide them by default.
- **Playtest/event cards**: Cards from `set_type: "funny"` (Mystery Booster playtest cards, Unknown Event cards, etc.) are excluded by default.
- **Non-tournament printings**: Gold-bordered, oversized, and 30th Anniversary Edition printings are excluded from printing-level results by default (Spec 056).

## Scryfall's Undocumented Behavior (Not Supported)

The [Scryfall syntax guide](https://scryfall.com/docs/syntax) does not document the following, but empirical testing shows Scryfall accepts it:

- **`!` as operator synonym for `=`**: When `!` appears between certain field names and values (e.g., `ci!ur`, `mana!bb`, others?), Scryfall treats it as an exact-equality operator, identical to `=`. So `ci!ur` returns the same results as `ci=ur` (color identity exactly RU), and `mana!bb` matches `mana=bb`.
- **`!` as bare word character**: While the fields `ci` and `mana` do interpret `!` as equality, the fields `set` and `name` do not. So the query `set!usg` finds nothing, and `set!s` finds six results.

Due to the apparent lack of a clear principle guiding Scryfall's exclamation point behavior, Frantic Search does **not** attempt to support exclamation point as an equality synonym. In Frantic Search, `ci!ur` parses as a bare word `ci!ur`. Use `ci=ur` or `mana=bb` for exact-equality queries.

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
