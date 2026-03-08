# Spec 098: Syntax Help Content

**Status:** Draft

**Depends on:** Spec 002 (Query Engine), Spec 047 (Printing Query Fields), Spec 061 (Date Query Semantics), Spec 068 (game:), Spec 072 (in: Query Qualifier), Spec 074 (Dollar Price Alias), Spec 077 (my: List), Spec 080 (USD Null), Spec 092 (Tag Data Model), Spec 093 (Evaluator Tag Queries), Spec 095 (Percentile Filters), Spec 096 (Name Comparison Operators)

**Referenced by:** Spec 014 (Syntax Help Overlay)

## Goal

Define the canonical content for the Syntax Help page so it accurately documents Frantic Search's query language. The help page must cover all supported fields, operators, Frantic Search–exclusive features, and divergences from Scryfall. When new query features are implemented, this spec is updated so the SyntaxHelp component stays current.

## Background

Spec 014 defines the Syntax Help overlay structure and mechanics. The content (field tables, examples, divergences) lives in `app/src/SyntaxHelp.tsx` as structured data constants. Over time, Frantic Search has added features that Scryfall does not support (name range queries, percentile filters, `usd=null`, bare regex, `**`) and expanded field coverage (set, date, tags, etc.). The help content has drifted out of date.

This spec is the single source of truth for what the Syntax Help must display. Implementers update `SyntaxHelp.tsx` to match this spec when adding or changing query features.

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
| `legal` | `f`, `format` | Format legality | `f:modern` |
| `banned` | — | Banned in format | `banned:legacy` |
| `restricted` | — | Restricted in format | `restricted:vintage` |
| `is` | — | Mechanics, layouts, roles, finish (is:commander, is:dfc, is:foil, etc.) | `is:commander` |
| `otag` | — | Oracle tag (community-curated) | `otag:ramp` |
| `atag` | — | Illustration tag (community-curated) | `atag:bolt` |
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
| Percentile filters | Not supported | `usd>90%`, `date<10%`, `name>50%` |
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
4. Update `SyntaxHelp.tsx` to match this spec.

## File Organization

| File | Responsibility |
|------|----------------|
| `docs/specs/098-syntax-help-content.md` | This spec — canonical content definition |
| `app/src/SyntaxHelp.tsx` | Renders the content; `FIELDS`, `EXCLUSIVES`, `DIVERGENCES`, etc. must match this spec |

The SyntaxHelp component will need an `EXCLUSIVES` constant (and optionally `ExclusiveEntry` interface) for the Frantic Search Exclusives section. Structure mirrors `ModifierEntry`: feature name, description, example.

## Acceptance Criteria

1. The Syntax Help page documents all fields listed in this spec with accurate descriptions and examples.
2. The Frantic Search Exclusives section lists all features Scryfall does not support.
3. The Differences from Scryfall section lists all behavioral divergences.
4. The intro copy states that Frantic Search extends Scryfall syntax.
5. When a new query feature is added, this spec is updated before or with the implementation.
