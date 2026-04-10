# Spec 098: Syntax Help Content

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 061 (Date Query Semantics), Spec 068 (game:), Spec 072 (in: Query Qualifier), Spec 074 (Dollar Price Alias), Spec 077 (my: List), Spec 080 (USD Null), Spec 092 (Tag Data Model), Spec 093 (Evaluator Tag Queries), Spec 095 (Percentile Filters), Spec 096 (Name Comparison Operators), Spec 099 (EDHREC Rank Support), Spec 101 (EDHREC Salt Support), Spec 105 (Keyword Search), Spec 147 (Produces Evaluator), Spec 172 (Strict Numeric Literals), Spec 173 (Power/Toughness/Loyalty/Defense Query Semantics)

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
| `power` | `pow` | Oracle power: ranges only plain numbers; unquoted plain `:`/`=`/`!=` → numeric equality (Spec 034); unquoted non-plain → `:` substring / `=` exact / `!=` not-exact on oracle text; quoted → string semantics; `=null` / equatable-null prefixes; `pow=0` vs `pow=x` (literal X) (Spec 173) | `pow>=4`, `pow:+*`, `pow="1"`, `pow=0` |
| `toughness` | `tou` | Same routing as power (Spec 173) | `tou=1`, `tou=1+*`, `tou:"1"` |
| `loyalty` | `loy` | Same routing as power for planeswalker loyalty (Spec 173) | `loy>=3`, `loy=x` (matches oracle `X`) |
| `defense` | `def` | Same routing as power for battle defense (Spec 173) | `def>3` |
| `mana value` | `mv`, `cmc` | Mana value (numeric) | `mv<=2` |
| `mana` | `m` | Mana cost (symbols) | `m:{b/p}` |
| `produces` | — | Mana the card can produce (lands, rocks, rituals); W,U,B,R,G,C,T; named combos (azorius, multicolor); numeric count; `:` = at least, `=` = exactly | `produces:wu`, `produces=0`, `produces:multicolor` |
| `legal` | `f`, `format` | Format legality; **`:`** = normalized **prefix** union over **`FORMAT_NAMES`**, **`=`** = exact, **`!=`** = negation of **`=`** mask (Spec 182); empty **`:`** / **`=`** / **`!=`** neutral | `f:modern`, `f=commander`, `f!=standard` |
| `banned` | — | Banned in format; same **`:`** / **`=`** / **`!=`** semantics as **`legal:`** on the banned column (Spec 182) | `banned:legacy`, `banned!=legacy` |
| `restricted` | — | Restricted in format; same operator semantics as **`legal:`** (Spec 182) | `restricted:vintage` |
| `is` | `not` | Mechanics, layouts, roles, finish (is:commander, is:dfc, is:foil); frame era (is:old, is:new) vs treatment (is:default, is:atypical); `not:` = `-is:` | `is:commander`, `is:new`, `not:dfc` |
| `kw` | `keyword` | Keyword ability; normalized **prefix** with union over matching names; no match → `unknown keyword` (Spec 176) | `kw:flying`, `kw:first` |
| `otag` | `function`, `oracletag` | Oracle tag (community-curated) | `otag:ramp` |
| `atag` | — | Illustration tag (community-curated) | `atag:bolt` |
| `edhrec` | `edhrecrank` | EDHREC Commander popularity rank; integer numeric, percentile, `=null`; invalid text → error (Spec 172) | `edhrec<100`, `edhrec>90%`, `edhrec=n` while typing `null` |
| `salt` | `edhrecsalt`, `saltiness` | EDHREC saltiness; numeric, percentile, `=null`; invalid text → error (Spec 172) | `salt>2`, `salt>90%`, `salt=n` while typing `null` |
| `my` | — | Cards in a list | `my:list` |

#### Printing-domain fields

| Field | Aliases | Description | Example |
|-------|---------|-------------|---------|
| `set` | `s`, `e`, `edition` | Set code **prefix** on normalized code (Spec 047); empty `set:` matches printings with a set code; differs from Scryfall exact set token ([issue #234](https://github.com/jimbojw/frantic-search/issues/234)) | `set:mh2`, `set:u` |
| `set_type` | `st` | Scryfall set type **prefix** on normalized string (Spec 179); empty matches printings with a non-empty type; differs from Scryfall exact `set_type` token | `set_type:expansion`, `st:mem` |
| `rarity` | `r` | Rarity (exact or comparison) | `r:mythic` |
| `usd` | `$` | Price in USD; `=null` (or `n`/`nu`/`nul` while typing) for no price data; percentile (`>90%`); invalid price text → error (Spec 172) | `usd<5`, `usd=null`, `usd>90%` |
| `collectornumber` | `cn`, `number` | Collector number | `cn:261` |
| `frame` | — | Frame version; **`:`** = normalized **prefix** union, **`=`** = normalized **exact**, **`!=`** = negation of **`=`** (Frantic extension; Spec 047 / 182); empty **`:`** / **`=`** / **`!=`** neutral (all printings, like **`kw:`**) | `frame:2015`, `frame=2015`, `frame!=future` |
| `year` | — | Release year (YYYY or partial) | `year:2021` |
| `date` | `released` | Release date (YYYY, YYYY-MM, YYYY-MM-DD, set code, now); percentile (`>90%`) | `date:2021`, `date>90%` |
| `game` | — | Paper, Arena, MTGO availability | `game:arena` |
| `in` | — | Game, set, or rarity (disambiguated by value) | `in:mh2`, `in:arena` |
| `flavor` | `ft` | Flavor text (substring); regex via `/pattern/` | `flavor:mishra`, `ft:"draw a card"`, `flavor:/orc/` |
| `artist` | `a` | Artist name (substring) | `a:proce`, `artist:"Scott Murphy"` |

### Section 2: Operators

Unchanged from Spec 014. All operators apply to fields that support them; some fields restrict operators (e.g. `game:` only `:`, `=`, `!=`; `frame:` `:`, `=`, `!=` per Spec 047 / 182 — no ordering ops).

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
| Stat oracle text (`pow`/`tou`/`loy`/`def`) | Substring and exact match on oracle stat strings; quoted values; equatable-null on stats; Scryfall does not support these forms | `tou:+*`, `tou=1+*`, `tou:"1"` |
| `-sort:field` | Reverse sort direction (NOT inverts) | `-sort:name` |

### Section 7: Differences from Scryfall

Behavioral divergences where Frantic Search intentionally differs from Scryfall. This section sets expectations for users coming from Scryfall.

| Behavior | Scryfall | Frantic Search |
|----------|----------|----------------|
| Default format filter | Excludes cards not legal in any format | Shows all cards. Use `f:standard` (etc.) to filter. |
| Bare regex | Not supported | `/pattern` searches name, oracle text, and type line |
| Name comparison | Not supported | `name>M`, `name<=X` (alphabetical) |
| Percentile filters | Not supported | `usd>90%`, `date<10%`, `name>50%`, `edhrec>90%`, `salt>90%` |
| `usd=null` | Not supported | Matches printings with no price data |
| `$` alias | Uses `usd` | `$` is alias for `usd` |
| Query speed | Server round-trip | Instant (client-side, every keystroke) |
| Power/toughness/loyalty/defense: query `x`/`y` | Historically some clients treated `pow=x` like numeric zero | Frantic: `pow=x` matches oracle power literally `X`/`x` (exact string); use `pow=0` for numeric zero (`*`, variable P/T as 0 per Spec 034). See [power](?doc=reference/fields/face/power) (Spec 173). |
| Quoted or formula stat values (`tou:"1"`, `tou=1+*`) | Scryfall does not support | Frantic: quoted forces substring (`:`) or exact (`=`/`!=`) on oracle text; unquoted formulas use substring vs exact per operator (Spec 173). |
| `is:alchemy` | Default scryfall.com search omits a few Mystery Booster 2 playtest printings that still carry the alchemy promo tag in Scryfall bulk data | Frantic Search honors bulk `promo_types` and `set_type: alchemy`. Users can list the divergent printings with `is:alchemy set:mb2` (in-app link: `?q=is%3Aalchemy%20set%3Amb2`). Documented in [is](?doc=reference/fields/face/is); see [issue #191](https://github.com/jimbojw/frantic-search/issues/191). |

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
