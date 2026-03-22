# Spec 098: Syntax Help Content

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 061 (Date Query Semantics), Spec 068 (game:), Spec 072 (in: Query Qualifier), Spec 074 (Dollar Price Alias), Spec 077 (my: List), Spec 080 (USD Null), Spec 092 (Tag Data Model), Spec 093 (Evaluator Tag Queries), Spec 095 (Percentile Filters), Spec 096 (Name Comparison Operators), Spec 099 (EDHREC Rank Support), Spec 101 (EDHREC Salt Support), Spec 105 (Keyword Search), Spec 147 (Produces Evaluator)

**Referenced by:** Spec 014 (Syntax Help Overlay), Spec 135 (Reference Docs Restructure)

## Goal

Define the canonical content for the Syntax Help page so it accurately documents Frantic Search's query language. The help page must cover all supported fields, operators, Frantic Search–exclusive features, and divergences from Scryfall. When new query features are implemented, this spec is updated so the SyntaxHelp component stays current.

## Background

Spec 014 defines the Syntax Help overlay structure and mechanics. Spec 135 restructures the reference docs: content is implemented across `app/src/docs/reference/` as granular MDX articles. The cheat sheet at `reference/syntax.mdx` provides the compact quick-reference; per-field, modifier, composition, and special-term docs live in dedicated articles.

This spec is the single source of truth for what the Syntax Help must display. Implementers update the relevant articles in `app/src/docs/reference/` to match this spec when adding or changing query features.

## Content Requirements

### Section 1: Fields

The Fields table must include every queryable field with canonical name, aliases, description, and a clickable example. Descriptions must reflect actual semantics (substring vs exact, range support, percentile support, etc.).

#### Face-domain fields

| Field | Aliases | Description | Example |
|-------|---------|-------------|---------|
| `name` | `n` | Card name: substring (`:`, `=`), alphabetical range (`>`, `<`, `>=`, `<=`), percentile (`>50%`) | `n:bolt`, `name>M`, `name>50%` |
| `oracle` | `o` | Rules text (substring) | `o:trample` |
| `type` | `t` | Type line (substring) | `t:creature` |
| `color` | `c` | Card colors | `c:rg` |
| `identity` | `id`, `ci`, `cmd` | Color identity | `id:wubrg` |
| `power` | `pow` | Power (numeric) | `pow>=4` |
| `toughness` | `tou` | Toughness (numeric) | `tou>5` |
| `loyalty` | `loy` | Loyalty (numeric) | `loy>=3` |
| `defense` | `def` | Defense (numeric) | `def>3` |
| `mana value` | `mv`, `cmc` | Mana value (numeric) | `mv<=2` |
| `mana` | `m` | Mana cost (symbols) | `m:{b/p}` |
| `produces` | — | Mana the card can produce (lands, rocks, rituals); W,U,B,R,G,C,T; named combos (azorius, multicolor); numeric count; `:` = at least, `=` = exactly | `produces:wu`, `produces=0`, `produces:multicolor` |
| `legal` | `f`, `format` | Format legality | `f:modern` |
| `banned` | — | Banned in format | `banned:legacy` |
| `restricted` | — | Restricted in format | `restricted:vintage` |
| `is` | `not` | Mechanics, layouts, roles, finish (is:commander, is:dfc, is:foil); `not:` = `-is:` | `is:commander`, `not:dfc` |
| `kw` | `keyword` | Keyword ability (Scryfall catalog) | `kw:flying` |
| `otag` | `function`, `oracletag` | Oracle tag (community-curated) | `otag:ramp` |
| `atag` | — | Illustration tag (community-curated) | `atag:bolt` |
| `edhrec` | `edhrecrank` | EDHREC Commander popularity rank; numeric and percentile (`>90%` = top 10% most popular) | `edhrec<100`, `edhrec>90%` |
| `salt` | `edhrecsalt`, `saltiness` | EDHREC saltiness; numeric and percentile (`>90%` = top 10% saltiest) | `salt>2`, `salt>90%` |
| `my` | — | Cards in a list | `my:list` |

#### Printing-domain fields

| Field | Aliases | Description | Example |
|-------|---------|-------------|---------|
| `set` | `s`, `e`, `edition` | Set code | `set:mh2` |
| `rarity` | `r` | Rarity (exact or comparison) | `r:mythic` |
| `usd` | `$` | Price in USD; `=null` for no price data; percentile (`>90%`) | `usd<5`, `usd=null`, `usd>90%` |
| `collectornumber` | `cn`, `number` | Collector number | `cn:261` |
| `frame` | — | Frame version (1993, 1997, 2003, 2015, future) | `frame:2015` |
| `year` | — | Release year (YYYY or partial) | `year:2021` |
| `date` | `released` | Release date (YYYY, YYYY-MM, YYYY-MM-DD, set code, now); percentile (`>90%`) | `date:2021`, `date>90%` |
| `game` | — | Paper, Arena, MTGO availability | `game:arena` |
| `in` | — | Game, set, or rarity (disambiguated by value) | `in:mh2`, `in:arena` |
| `flavor` | `ft` | Flavor text (substring); regex via `/pattern/` | `flavor:mishra`, `ft:"draw a card"`, `flavor:/orc/` |
| `artist` | `a` | Artist name (substring) | `a:proce`, `artist:"Scott Murphy"` |

### Section 2: Operators

Unchanged from Spec 014. All operators apply to fields that support them; some fields restrict operators (e.g. `game:` only `:`, `=`, `!=`).

| Operator | Meaning | Example |
|----------|---------|---------|
| `:` | Contains / has at least | `o:destroy` |
| `=` | Exactly equals | `c=rg` |
| `!=` | Not equal | `c!=r` |
| `>` | Greater than | `pow>3` |
| `<` | Less than | `mv<3` |
| `>=` | Greater or equal | `tou>=5` |
| `<=` | Less or equal | `cmc<=2` |

### Section 3: Combining Queries

Unchanged from Spec 014.

### Section 4: Display Modifiers

Unchanged from Spec 014. Add footnote: `++` and `@@` are Scryfall aliases; `**` is Frantic Search–exclusive. Use `-sort:field` to reverse sort direction.

### Section 5: Regex

Unchanged from Spec 014. Bare regex is Frantic Search–exclusive (Scryfall does not support it).

### Section 6: Frantic Search Exclusives

A new section that lists features Scryfall does not support. Each entry has a brief description and example. This helps users discover capabilities beyond the Scryfall baseline.

| Feature | Description | Example |
|---------|-------------|---------|
| Bare regex | `/pattern` searches name, oracle text, and type line | `/bolt/` |
| `**` (include:extras) | Include non-playable cards (acorn, silver-border, etc.) | `t:bolt **` |
| Name range | Alphabetical comparison on card name | `name>M`, `name<=Lightning` |
| Name percentile | Filter by position in alphabetical distribution | `name>50%` |
| Price percentile | Filter by position in price distribution | `usd>90%`, `usd<10%` |
| Date percentile | Filter by position in release-date distribution | `date>90%`, `date<10%` |
| EDHREC percentile | Filter by Commander popularity (rank inversion: higher % = more popular) | `edhrec>90%`, `edhrec<10%` |
| Salt percentile | Filter by EDHREC saltiness (higher % = saltier) | `salt>90%`, `salt<10%` |
| Percentile chips in Menu | Popularity and Salt sections offer one-tap chips (>90%, >95%, >99%) | Open Menu → Popularity or Salt |
| `usd=null` | Find printings with no price data | `usd=null` |
| `-sort:field` | Reverse sort direction (NOT inverts) | `-sort:name` |

### Section 7: Differences from Scryfall

Behavioral divergences where Frantic Search intentionally differs from Scryfall. This section sets expectations for users coming from Scryfall.

| Behavior | Scryfall | Frantic Search |
|----------|----------|----------------|
| Default format filter | Excludes cards not legal in any format | Shows all cards. Use `f:standard` (etc.) to filter. |
| Bare regex | Not supported | `/pattern` searches name, oracle text, and type line |
| Bare words | Searches name (fuzzy matching) | Searches name (substring, no fuzzy) |
| Name comparison | Not supported | `name>M`, `name<=X` (alphabetical) |
| Percentile filters | Not supported | `usd>90%`, `date<10%`, `name>50%`, `edhrec>90%`, `salt>90%` |
| `usd=null` | Not supported | Matches printings with no price data |
| `$` alias | Uses `usd` | `$` is alias for `usd` |
| Query speed | Server round-trip | Instant (client-side, every keystroke) |

## Intro Copy

The help view intro should state that Frantic Search is based on Scryfall syntax **with extensions and some differences**. Link to Scryfall's syntax guide for reference.

## Maintenance

When implementing a new query feature:

1. If it adds a field: add a row to the Fields table (Section 1).
2. If it extends a field's semantics: update the field's description and add an example.
3. If it is Frantic Search–exclusive: add to Section 6 (Exclusives) and Section 7 (Differences) as appropriate.
4. Update the relevant articles in `app/src/docs/reference/` to match this spec (cheat sheet, per-field docs, etc.). See Spec 135 for structure.

## File Organization

| File | Responsibility |
|------|----------------|
| `docs/specs/098-syntax-help-content.md` | This spec — canonical content definition |
| `app/src/docs/reference/` | In-app implementation per Spec 135; cheat sheet at `syntax.mdx`; per-field, modifier, composition, and special-term docs in dedicated articles |

Content is implemented across `docs/reference/` per Spec 135. Each field, modifier, composition rule, and special term has a dedicated article. The cheat sheet (`reference/syntax.mdx`) provides the compact quick-reference with fields, operators, modifiers, exclusives, and divergences.

## Acceptance Criteria

1. The Syntax Help page documents all fields listed in this spec with accurate descriptions and examples.
2. The Frantic Search Exclusives section lists all features Scryfall does not support.
3. The Differences from Scryfall section lists all behavioral divergences.
4. The intro copy states that Frantic Search extends Scryfall syntax.
5. When a new query feature is added, this spec is updated before or with the implementation.
