# Spec 109: Deck-Aware Instance Model and Import/Apply Pipeline

**Status:** Implemented

**Depends on:** Spec 075 (Card List Data Model), Spec 108 (List Import Textarea), Spec 110 (Hybrid Deck Editor)

## Goal

Extend the Spec 075 Instance data model with `zone`, `tags`, `collection_status`, and `variant` fields so that imported deck lists from Arena, Moxfield, Archidekt, and MTGGoldfish can be represented without information loss. Define the full Apply pipeline: import (parsing draft text into candidate Instances), diff (comparing candidates to the current list), confirmation UX, and write operations.

## Background

Spec 075 defines an append-only log of `InstanceStateEntry` records. Each Instance has immutable identity (uuid, oracle_id, scryfall_id, finish) and a single mutable field (`list_id`). This works for flat card lists but cannot represent the structural and categorical metadata found in real deck exports:

- **Arena** exports use section headers (`Deck`, `Sideboard`, `Commander`) to organize cards into zones.
- **Moxfield** exports use `SIDEBOARD:` headers and foil/alter/etched markers (`*F*`, `*A*`, `*E*`).
- **Archidekt** exports use bracket categories (`[Ramp]`, `[Commander{top}]`, `[Maybeboard{noDeck}{noPrice},Proliferate]`) and collection status markers (`^Have,#37d67a^`).
- **MTGGoldfish** "Exact Card Versions" exports use `<variant>` angle brackets (e.g. `<prerelease>`, `<extended>`, `<251>`), `[SET]` square brackets, and `(F)` / `(E)` finish markers. The variant string identifies a specific product variant that may or may not correspond to a distinct Scryfall printing.
- **Melee.gg** exports use `MainDeck` (no space) and `Sideboard` as section headers, with plain `quantity name` card lines. The lexer recognizes `MainDeck` / `Main Deck` as a section header; the importer normalizes it to the `"Deck"` zone.

Spec 108 implemented a lexer and validator that tokenize all of these formats, including variant fallback resolution for known MTGGoldfish variants that lack distinct Scryfall printings (see Spec 108 § "Validation rules" rule 5). Spec 110 implemented a three-mode deck editor with a placeholder Apply button. This spec defines the real Apply pipeline that replaces that placeholder: how draft text becomes candidate Instances, how candidates are diffed against the current list, and how the result is committed.

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
1. Set `zone` from section headers (Arena/Moxfield: `Deck`, `Sideboard`, `Commander`, `SIDEBOARD:`; Melee.gg: `MainDeck` → `Deck`).
2. Infer `zone` from the primary bracket category (Archidekt: `[Commander{top}]` → zone = `"Commander"`).

Matching is case-insensitive. Header synonyms are normalized before matching: `MainDeck` / `Main Deck` → `Deck`. The stored value uses the canonical casing from `KNOWN_ZONES`.

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
    normalize header synonyms: "MainDeck" / "Main Deck" → "Deck" (Melee.gg format)
    if normalized value matches KNOWN_ZONES (case-insensitive):
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

When exporting to Archidekt format, `zone` can be omitted (it's redundant with the primary tag). The Archidekt serializer emits `[tags]` and `^collection_status^` when present for round-trip fidelity; all cards in one alphabetical list, no section headers. Arena, MTGO, and MTGGoldfish serializers emit Commander first, then deck, then two newlines, then Sideboard and other zones — no headings. Moxfield uses `SIDEBOARD:`-style headers for post-main zones. Melee uses `MainDeck` and `Sideboard` headers.

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

### 5. Diff Algorithm (Dumb Diff)

The Apply pipeline compares candidate Instances (produced by the import procedure) against the current Instances in the active list. The initial implementation uses a "dumb diff" — exact matching on identity fields, no fuzzy or partial matching.

#### Identity fields for comparison

Two Instances are considered identical when all of the following match:

| Field | Comparison |
|-------|------------|
| `oracle_id` | exact string match |
| `scryfall_id` | exact string match (null == null) |
| `finish` | exact string match (null == null) |
| `zone` | exact string match (null == null) |
| `tags` | same entries in same order |
| `collection_status` | exact string match (null == null) |
| `variant` | exact string match (null == null) |

UUID is excluded — it is assigned on creation and is not part of the card's identity. `list_id` is excluded — all Instances in the comparison belong to the same list.

#### Procedure

1. **Import:** Run the import procedure (§ 4) on the draft text to produce a list of candidate Instances (without UUIDs).
2. **Expand quantities:** Each candidate with `quantity > 1` becomes N separate candidate records (one per unit), matching the import procedure's per-unit expansion.
3. **Match and prune:** For each candidate, search the current Instance set for an entry with identical identity fields. If found, remove both from their respective sets (they cancel out — no change needed). This is a greedy one-to-one match: each current Instance can match at most one candidate.
4. **Compute remainders:**
   - Remaining candidates = additions (+N cards)
   - Remaining current Instances = removals (-M cards)
   - There are no "modified" entries in dumb diff. A generic Instance and a printing-level Instance of the same card are completely separate objects.

#### Edge cases

- **Generic vs. printing-level:** A candidate with `scryfall_id: null` does NOT match a current Instance with `scryfall_id: "abc-123"`, even if they share the same `oracle_id`. These are distinct objects. A future "smart diff" may handle partial matches (e.g., treating a printing change as a modification rather than remove + add).
- **Duplicate cards:** If the list has 4x Lightning Bolt and the draft has 3x Lightning Bolt (same printing), the diff produces 0 additions and 1 removal. The greedy match consumes 3 pairs, leaving 1 current Instance unmatched.
- **Empty draft:** All current Instances appear as removals. On accept, the list is emptied (all moved to trash). The editor transitions to Init mode.
- **Empty list + non-empty draft:** All candidates appear as additions. This is the initial import case.

### 6. Confirmation UX

When the user clicks Apply in the Spec 110 editor, the diff is computed and presented in a confirmation popover or modal before any writes occur.

#### Minimal confirmation (initial implementation)

The confirmation shows a summary:

- "+N cards" (additions) — if N > 0
- "-M cards" (removals) — if M > 0
- "No changes" — if both N and M are 0

Two buttons: **Accept** and **Cancel**.

- **Accept:** Executes the write operations (§ 7), clears the draft, transitions the editor to Display or Init mode.
- **Cancel:** Returns to Edit mode with the draft intact. No writes occur.

If both N and M are 0 (draft is equivalent to current state), Accept still clears the draft and returns to Display mode. This is a no-op write but a valid user intent ("I'm done editing").

#### Future enhancements (out of scope)

A richer confirmation view could show a green/red diff of individual card lines, sorted by zone. This opens questions about sort order and zone grouping that are deferred.

### 7. Write Operations

On Accept, the diff remainders are committed using existing `CardListStore` methods:

1. **Removals:** For each remaining current Instance, call `CardListStore.removeToTrash(uuid)`. This appends a log entry with `list_id = trash` per Spec 075.
2. **Additions:** For each remaining candidate, call `CardListStore.addInstance(...)` with the candidate's `oracle_id`, `scryfall_id`, `finish`, and the target `list_id`. This assigns a UUID via `crypto.randomUUID()` and appends a log entry. The new Spec 109 fields (`zone`, `tags`, `collection_status`, `variant`) are included in the log entry.
3. **Metadata updates:** If the import procedure extracted a deck name (from METADATA tokens) or tag_colors (from collection status markers), update `ListMetadata` via `CardListStore.updateListMetadata(...)`.

Write order: removals first, then additions. This is not strictly necessary for correctness (the append-only log is order-independent for materialization), but it keeps the log readable.

#### Integration with Spec 110

The Spec 110 `DeckEditor` component calls `onApply(draftText)`. The parent (`ListsPage`) implements this callback by:

1. Running the import procedure on the draft text.
2. Computing the dumb diff against current Instances for the active list.
3. If the diff has changes (N > 0 or M > 0), showing the confirmation UX.
4. On Accept, executing the write operations and returning `true`.
5. On Cancel, returning `false` (the editor stays in Edit mode).

The `onApply` callback returns `Promise<boolean>` — `true` means the draft should be cleared, `false` means keep editing.

### 8. Tag Query Semantics (Forward-Looking)

This spec does not implement tag queries, but the model is designed with the following in mind:

A future `#value` query syntax will match against all three Instance metadata fields:

- `zone` — `#Sideboard` matches `zone: "Sideboard"`
- `tags` entries — `#Ramp` matches any tag containing "Ramp"; `#noPrice` matches `"Maybeboard{noDeck}{noPrice}"`
- `collection_status` — `#Have` matches `"Have,#37d67a"`; `##37d67a` matches the color portion

Matching is substring-based: `#value` succeeds if the search string appears anywhere in the zone, any tag entry, or the collection status string. This unified search means users don't need to know which field a label came from.

### 9. Relationship to Existing Specs

- **Spec 075** remains the authority on append-only log mechanics, IndexedDB storage, BroadcastChannel protocol, and materialized view derivation. This spec extends the `InstanceState` and `ListMetadata` types with additive fields. Spec 075's statement "Only `list_id` mutates" is broadened: `zone`, `tags`, and `collection_status` are also mutable via log appends. Write operations (§ 7) use the existing `CardListStore` methods defined by Spec 075.
- **Spec 108** remains the authority on deck list parsing (lexer, validator, syntax highlighting), including MTGGoldfish variant resolution and fallback. This spec consumes the lexer/validator output (including `ParsedEntry.variant` and `ParsedEntry.finish`) and defines what happens after parsing. The `variant` field on `InstanceState` preserves the verbatim MTGGoldfish variant string for round-trip fidelity.
- **Spec 110** defines the three-mode deck editor (Init / Display / Edit), toolbar, format chips, and draft persistence. This spec implements the `onApply` callback that Spec 110 defers. When the user clicks Apply, Spec 110 invokes the pipeline defined here (import → diff → confirm → write). Spec 110's "Out of Scope" items for diff calculation, apply/commit procedure, and confirmation modal are covered by §§ 5–7 of this spec.
- **Spec 076** (Worker Protocol List Cache) will need to be aware of the new fields when building bitmasks for `my:` queries. No changes required until tag query support is implemented.

## Out of Scope

- Export (text generation from Instances) — covered by Spec 110 serializers.
- `#tag` query engine implementation.
- Tag editing UX (toggle chips, bulk edit).
- Zone modification UX (drag between zones).
- Multi-list import (importing a deck as a new list vs. into an existing list).
- Smart diff (partial matching, e.g. treating a printing change as a modification).
- Rich diff view (green/red per-line diff in the confirmation UI).

## Acceptance Criteria

### Data model

1. `InstanceState` in `shared/src/card-list.ts` includes `zone`, `tags`, `collection_status`, and `variant` fields.
2. `ListMetadata` in `shared/src/card-list.ts` includes optional `tag_colors` field.
3. `KNOWN_ZONES` constant is defined in shared.
4. Old `InstanceStateEntry` rows without the new fields are handled gracefully during materialized view replay (default to null/empty).

### Import procedure

5. Import procedure maps section headers to `zone` on subsequent card lines.
6. Import procedure infers `zone` from primary bracket categories that match known zones.
7. Import procedure stores full bracket content in `tags[]`, split on commas.
8. Import procedure stores full `^Status,#hex^` content in `collection_status`.
9. Import procedure extracts status-to-color mappings into `ListMetadata.tag_colors`.
10. Each quantity unit (e.g. 4x) produces a separate Instance with a unique UUID.
11. Import procedure stores `ParsedEntry.variant` in `InstanceState.variant` for MTGGoldfish lines; null for other formats.
12. Import procedure uses `ParsedEntry.finish` for both Moxfield (`*F*`, `*E*`) and MTGGoldfish (`(F)`, `(E)`) finish markers.
13. Lines with `kind: "warning"` (approximate variant resolution) produce valid Instances with best-effort `scryfall_id` and preserved `variant`.

### Diff

14. Dumb diff matches candidates to current Instances on all identity fields (oracle_id, scryfall_id, finish, zone, tags, collection_status, variant), excluding UUID and list_id.
15. Matched pairs are pruned from both sets. Remaining candidates are additions; remaining current Instances are removals.
16. A generic Instance (`scryfall_id: null`) does not match a printing-level Instance of the same card.
17. Duplicate quantities are handled correctly: 4x current minus 3x candidate = 1 removal.

### Confirmation and write

18. Clicking Apply in the Spec 110 editor shows a confirmation with "+N cards" / "-M cards" summary.
19. Accept executes removals (to trash) then additions, clears the draft, and transitions the editor to Display or Init.
20. Cancel returns to Edit mode with the draft intact.
21. When diff produces zero changes, Accept still clears the draft (no-op write, valid user intent).
22. `CardListStore.addInstance` accepts the new Spec 109 fields (zone, tags, collection_status, variant) in the log entry.
