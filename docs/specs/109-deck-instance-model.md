# Spec 109: Deck-Aware Instance Model and Import Procedure

**Status:** Draft

**Depends on:** Spec 075 (Card List Data Model), Spec 108 (List Import Textarea)

## Goal

Extend the Spec 075 Instance data model with `zone`, `tags`, `collection_status`, and `variant` fields so that imported deck lists from Arena, Moxfield, Archidekt, and MTGGoldfish can be represented without information loss. Define the import procedure that maps Spec 108 lexer/validator output into Instances.

## Background

Spec 075 defines an append-only log of `InstanceStateEntry` records. Each Instance has immutable identity (uuid, oracle_id, scryfall_id, finish) and a single mutable field (`list_id`). This works for flat card lists but cannot represent the structural and categorical metadata found in real deck exports:

- **Arena** exports use section headers (`Deck`, `Sideboard`, `Commander`) to organize cards into zones.
- **Moxfield** exports use `SIDEBOARD:` headers and foil/alter/etched markers (`*F*`, `*A*`, `*E*`).
- **Archidekt** exports use bracket categories (`[Ramp]`, `[Commander{top}]`, `[Maybeboard{noDeck}{noPrice},Proliferate]`) and collection status markers (`^Have,#37d67a^`).
- **MTGGoldfish** "Exact Card Versions" exports use `<variant>` angle brackets (e.g. `<prerelease>`, `<extended>`, `<251>`), `[SET]` square brackets, and `(F)` / `(E)` finish markers. The variant string identifies a specific product variant that may or may not correspond to a distinct Scryfall printing.

Spec 108 implemented a lexer and validator that tokenize all of these formats, including variant fallback resolution for known MTGGoldfish variants that lack distinct Scryfall printings (see Spec 108 § "Validation rules" rule 5). This spec defines what happens after parsing: how tokens map to Instance fields and how the data model accommodates them.

## Design

### 1. Updated InstanceState

Add four new fields to `InstanceState`. Like `list_id`, these are mutable — each append-only log entry carries the full state.

```typescript
interface InstanceState {
  uuid: string
  oracle_id: string
  scryfall_id: string | null
  finish: string | null
  list_id: string
  zone: string | null
  tags: string[]
  collection_status: string | null
  variant: string | null
}
```

| Field | Type | Notes |
|-------|------|-------|
| `zone` | string \| null | Mutually exclusive deck zone. One of the known zone names (see below), or null (implicit main deck). Derived from section headers or recognized primary bracket categories. |
| `tags` | string[] | Verbatim bracket content from imports. Each comma-separated segment within `[...]` becomes one entry. Includes modifiers (e.g. `"Commander{top}"`, `"Maybeboard{noDeck}{noPrice}"`). Open-ended, multiple per Instance. |
| `collection_status` | string \| null | Verbatim Archidekt `^...^` inner content including color (e.g. `"Have,#37d67a"`, `"Don't Have,#f47373"`). Null when not present. |
| `variant` | string \| null | Verbatim MTGGoldfish variant string from `<...>` (e.g. `"prerelease"`, `"extended"`, `"251"`, `"Shadowmoor - borderless"`). Null when not present (Moxfield, Arena, Archidekt formats have no variant). Stored for round-trip fidelity: a future export to MTGGoldfish format can reconstruct the `<variant>` bracket from this field. The `scryfall_id` may point to an approximate match when the variant is a known MTGGoldfish variation without a distinct Scryfall printing (see Spec 108 § variant fallback). |

Old log entries without these fields are treated as `zone: null`, `tags: []`, `collection_status: null`, `variant: null` during materialized view replay. No IndexedDB schema migration required (additive change per Spec 075 § "Schema evolution").

### 2. Updated ListMetadata

Add an optional `tag_colors` field for collection status color mappings:

```typescript
interface ListMetadata {
  list_id: string
  name: string
  description?: string
  short_name?: string
  tag_colors?: Record<string, string>
}
```

| Field | Type | Notes |
|-------|------|-------|
| `tag_colors` | Record<string, string> \| undefined | Maps collection status text to hex color (e.g. `{ "Have": "#37d67a", "Don't Have": "#f47373" }`). Extracted during import from `^Status,#hex^` markers. List-level because the mapping is consistent across all Instances with that status. |

### 3. Known Zones

A constant in `shared/` defining recognized zone names:

```typescript
const KNOWN_ZONES = ["Deck", "Sideboard", "Commander", "Companion", "Maybeboard"] as const
```

Used during import to:
1. Set `zone` from section headers (Arena/Moxfield: `Deck`, `Sideboard`, `Commander`, `SIDEBOARD:`).
2. Infer `zone` from the primary bracket category (Archidekt: `[Commander{top}]` → zone = `"Commander"`).

Matching is case-insensitive. The stored value uses the canonical casing from `KNOWN_ZONES`.

### 4. Import Procedure

The import procedure consumes the output of `lexDeckList()` and `validateDeckList()` (Spec 108) and produces `InstanceStateEntry[]` records plus optional `ListMetadata` updates.

#### Input

- Lexer tokens from `lexDeckList(text)` — full-document token stream.
- Validation result from `validateDeckList(text, display, printingDisplay)` — resolved `ParsedEntry[]` with oracle_id, optional scryfall_id, optional finish (`"foil" | "etched" | null`), and optional variant (verbatim `<...>` content from MTGGoldfish format). Lines with `kind: "error"` have no resolved entry. Lines with `kind: "warning"` (approximate variant resolution) have valid resolved entries and should be imported normally.

#### State machine

The importer walks lines top-to-bottom, maintaining a `currentZone: string | null` that tracks the active section.

```
for each line:
  if SECTION_HEADER token:
    if value matches KNOWN_ZONES (case-insensitive):
      currentZone = canonical zone name
    else:
      currentZone = null  (unknown section, treat as main deck)
    skip to next line

  if METADATA token (e.g. "Name Simic Rhythm"):
    extract deck name → update ListMetadata.name
    skip to next line

  if COMMENT token or empty line:
    skip to next line

  if card line (has QUANTITY + CARD_NAME tokens):
    resolve oracle_id, scryfall_id, finish, variant from validation result (ParsedEntry)
    if card not resolved (unknown card / error line): skip line
    note: warning lines (kind: "warning", e.g. approximate variant resolution) ARE imported —
      they have valid ParsedEntry data with a best-effort scryfall_id

    determine zone:
      1. If CATEGORY token's primary segment matches KNOWN_ZONES → use it
      2. Else if currentZone is set → use currentZone
      3. Else → null

    build tags[]:
      from CATEGORY token value, split on commas
      each segment becomes one tag entry, stored verbatim
      (e.g. "[Maybeboard{noDeck}{noPrice},Proliferate]" → ["Maybeboard{noDeck}{noPrice}", "Proliferate"])

    build collection_status:
      from COLLECTION_STATUS_TEXT + COLLECTION_STATUS_COLOR tokens
      concatenate as "StatusText,#hex" (e.g. "Have,#37d67a")
      if only status text with no color → store status text alone
      if neither present → null

    extract tag_colors:
      if collection status has text + color, record mapping in tag_colors accumulator

    determine finish:
      use ParsedEntry.finish which already resolves both Moxfield markers (*F*, *E*)
      and MTGGoldfish markers ((F), (E)):
        "foil" | "etched" | null

    determine variant:
      use ParsedEntry.variant — verbatim content of <...> from MTGGoldfish format
      null for Moxfield/Arena/Archidekt lines (no VARIANT token)

    determine quantity:
      parse QUANTITY value, strip trailing "x"

    for each unit (1..quantity):
      create InstanceStateEntry:
        uuid: crypto.randomUUID()
        oracle_id: resolved oracle_id
        scryfall_id: resolved scryfall_id or null
        finish: determined finish
        list_id: target list
        zone: determined zone
        tags: built tags[]
        collection_status: built collection_status
        variant: determined variant
        timestamp: Date.now()
```

#### Tag storage format

Each comma-separated segment within `[...]` becomes one entry in `tags[]`. Modifiers (`{top}`, `{noDeck}`, `{noPrice}`) stay attached to their category name. Examples:

| Bracket content | `tags[]` |
|----------------|----------|
| `[Ramp]` | `["Ramp"]` |
| `[Land]` | `["Land"]` |
| `[Commander{top}]` | `["Commander{top}"]` |
| `[Blight,Creature]` | `["Blight", "Creature"]` |
| `[Maybeboard{noDeck}{noPrice},Proliferate]` | `["Maybeboard{noDeck}{noPrice}", "Proliferate"]` |

#### Zone inference from brackets

When a bracket category's base name (before any `{...}` modifier) matches a known zone, the Instance's `zone` is set to that zone name. The full bracket string (with modifiers) is still stored in `tags[]`.

For `[Commander{top}]`:
- `zone` = `"Commander"` (base name matches known zone)
- `tags` = `["Commander{top}"]` (verbatim)

For `[Maybeboard{noDeck}{noPrice},Proliferate]`:
- `zone` = `"Maybeboard"` (base name of primary category matches known zone)
- `tags` = `["Maybeboard{noDeck}{noPrice}", "Proliferate"]`

This intentional duplication (zone echoes information also in tags) means:
- `zone` is the normalized, query-friendly field for structural organization.
- `tags` is the verbatim, round-trip-safe field for export fidelity.

When exporting to Archidekt format, `zone` can be omitted (it's redundant with the primary tag). When exporting to Arena format, `zone` drives the section headers.

#### Collection status storage

The full `^...^` inner content is stored as one string in `collection_status`:

| Marker | `collection_status` |
|--------|-------------------|
| `^Have,#37d67a^` | `"Have,#37d67a"` |
| `^Don't Have,#f47373^` | `"Don't Have,#f47373"` |
| `^Getting,#2ccce4^` | `"Getting,#2ccce4"` |
| (none) | `null` |

The color portion is also extracted into `ListMetadata.tag_colors` during import:

```typescript
tag_colors: {
  "Have": "#37d67a",
  "Don't Have": "#f47373",
  "Getting": "#2ccce4"
}
```

### 5. Tag Query Semantics (Forward-Looking)

This spec does not implement tag queries, but the model is designed with the following in mind:

A future `#value` query syntax will match against all three Instance metadata fields:

- `zone` — `#Sideboard` matches `zone: "Sideboard"`
- `tags` entries — `#Ramp` matches any tag containing "Ramp"; `#noPrice` matches `"Maybeboard{noDeck}{noPrice}"`
- `collection_status` — `#Have` matches `"Have,#37d67a"`; `##37d67a` matches the color portion

Matching is substring-based: `#value` succeeds if the search string appears anywhere in the zone, any tag entry, or the collection status string. This unified search means users don't need to know which field a label came from.

### 6. Relationship to Existing Specs

- **Spec 075** remains the authority on append-only log mechanics, IndexedDB storage, BroadcastChannel protocol, and materialized view derivation. This spec extends the `InstanceState` and `ListMetadata` types with additive fields. Spec 075's statement "Only `list_id` mutates" is broadened: `zone`, `tags`, and `collection_status` are also mutable via log appends.
- **Spec 108** remains the authority on deck list parsing (lexer, validator, syntax highlighting), including MTGGoldfish variant resolution and fallback. This spec consumes the lexer/validator output (including `ParsedEntry.variant` and `ParsedEntry.finish`) and defines what happens after parsing. The `variant` field on `InstanceState` preserves the verbatim MTGGoldfish variant string for round-trip fidelity.
- **Spec 076** (Worker Protocol List Cache) will need to be aware of the new fields when building bitmasks for `my:` queries. No changes required until tag query support is implemented.

## Out of Scope

- Export (text generation from Instances).
- `#tag` query engine implementation.
- Tag editing UX (toggle chips, bulk edit).
- Zone modification UX (drag between zones).
- Multi-list import (importing a deck as a new list vs. into an existing list).

## Acceptance Criteria

1. `InstanceState` in `shared/src/card-list.ts` includes `zone`, `tags`, `collection_status`, and `variant` fields.
2. `ListMetadata` in `shared/src/card-list.ts` includes optional `tag_colors` field.
3. `KNOWN_ZONES` constant is defined in shared.
4. Old `InstanceStateEntry` rows without the new fields are handled gracefully during materialized view replay (default to null/empty).
5. Import procedure maps section headers to `zone` on subsequent card lines.
6. Import procedure infers `zone` from primary bracket categories that match known zones.
7. Import procedure stores full bracket content in `tags[]`, split on commas.
8. Import procedure stores full `^Status,#hex^` content in `collection_status`.
9. Import procedure extracts status-to-color mappings into `ListMetadata.tag_colors`.
10. Each quantity unit (e.g. 4x) produces a separate Instance with a unique UUID.
11. Import procedure stores `ParsedEntry.variant` in `InstanceState.variant` for MTGGoldfish lines; null for other formats.
12. Import procedure uses `ParsedEntry.finish` for both Moxfield (`*F*`, `*E*`) and MTGGoldfish (`(F)`, `(E)`) finish markers.
13. Lines with `kind: "warning"` (approximate variant resolution) produce valid Instances with best-effort `scryfall_id` and preserved `variant`.
