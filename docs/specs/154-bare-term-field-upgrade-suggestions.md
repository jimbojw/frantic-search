# Spec 154: Bare-Term Field Upgrade Suggestions

**Status:** Implemented 

**Depends on:** Spec 151 (Suggestion System), Spec 131 (Oracle Did You Mean), Spec 036 (Source Spans), Spec 002 (Query Engine), Spec 105 (Keyword Search)

## Goal

When a search returns zero results and the query contains **bare terms** (no field prefix) that match known values for specific fields, offer suggestions to prefix those terms with the correct field. For example, a user typing `landfall` gets nothing because bare terms search the name field; we suggest `kw:landfall` since "landfall" is a known keyword. Likewise, bare `elf` suggests `t:elf` because "elf" appears as a word in card type lines. This teaches users the right syntax for values they conceptually understand but didn't know needed a field prefix.

## Background

Bare tokens default to name search (Spec 018). When a user intends to search a different field — e.g. keywords (`kw:`), type line (`t:`), set codes (`set:`), format legality (`f:`), oracle tags (`otag:`), illustration tags (`atag:`), game (`game:`), frame (`frame:`), or rarity (`rarity:`) — they must add the field prefix. We already offer oracle upgrades (Spec 131): bare `damage` → `o:damage` when the oracle variant returns results. This spec extends that pattern to **field-specific upgrades** when the bare term matches a known value for a specific field.

**Different from Spec 153 (Wrong Field):** Spec 153 handles values in the *wrong* field (e.g. `is:white` → suggest `ci:w`). It operates on FIELD nodes. This spec handles **bare terms** — BARE nodes with no field at all. The user didn't pick a wrong field; they didn't pick any field.

**Different from Spec 131 (Oracle):** Spec 131 considers only *trailing* bare tokens because oracle upgrades treat them jointly (phrase vs per-word variants). This spec matches against known lookup lists; each bare term is considered on its own, and order does not matter. We therefore allow bare terms from **anywhere** in the query, not just the trailing suffix.

## Trigger Conditions

All of the following must hold:

1. **Zero results** — The effective (combined) search returned zero cards (`totalCards === 0`). Same as Spec 131 and Spec 153.
2. **Root shape** — The root AST node is either (a) an AND node, or (b) a leaf BARE node. Skip when root is OR.
3. **Bare tokens (anywhere)** — All positive BARE nodes (not under NOT) in the query are eligible. Unlike Spec 131, we do not restrict to trailing only; each bare term is evaluated independently against domain lookup lists.
4. **Value matches a known field** — For each bare token, the value (case-insensitive) matches at least one domain's value set (keywords, set codes, formats, etc.).
5. **Results check is best-effort, not required** — When the replacement query returns > 0 results, the suggestion includes the count (displayed on the chip). When the replacement returns 0, the suggestion is still shown — the field prefix is *directionally correct* and teaches the user the right syntax regardless of what other terms are doing. Example: `landfall flying` → both `kw:landfall` and `kw:flying` are shown even though `kw:landfall flying` and `landfall kw:flying` each return 0. The upgrade is strictly better than the bare term for the intended field.
6. **Empty state only** — Same placement rules as oracle and wrong-field.

## Design

### Pattern

1. **Detection:** Use `getBareNodes(ast)` (or equivalent) to collect all positive BARE nodes from the tree. For each bare token, check if `value.toLowerCase()` matches any domain's value set.
2. **Alternatives:** For each matching bare term, build one replacement per matching domain. E.g. bare `landfall` → `kw:landfall`; bare `mh2` → `set:mh2`.
3. **Evaluate:** Evaluate each alternative query. Include the count on the chip when > 0. When 0, still suggest — the field prefix is directionally correct.
4. **Output:** One `Suggestion` per (bare term, suggested field) pair that matches a domain. Tapping replaces the bare term via `spliceQuery`.

### Suggestion model

All suggestions in this category use `id: 'bare-term-upgrade'`. Each suggestion is a single chip: label = the new term (e.g. `kw:landfall`), **`query` = modified live query** after `spliceQuery(msg.query, …)` (Spec 151 / Issue #258 — not the combined pinned+live string), explain = teaching copy.

- **Placement:** Empty state only (below Results Summary Bar, alongside oracle, wrong-field, etc.).
- **Priority:** **16** for kw:, t:, set:, f:, is:, game:, frame:, and rarity: upgrades (Spec 151). **`otag:`** and **`atag:`** upgrades (exact + Spec 159 prefix) use **21** so they sort **after** the oracle “did you mean” hint (**20**) when both appear; other suggestion priorities are unchanged.
- **Variant:** `rewrite`.
- **Negation:** Only positive BARE nodes. Negated bare terms are not converted (same as Spec 131).

### Splice logic

- Replace each BARE node's span with `field:value`. We consider **one bare term at a time** — each bare token is checked independently. When suggesting for a single token, replace only that token's span.
- Use `spliceQuery` from `app/src/query-edit-core.ts`. BARE nodes carry `span` from the parser (Spec 036).
- **Span coordinates:** Bare nodes come from the live AST (`parse(msg.query)`), so spans are in live-query coordinates. When pinned + live: splice the live query (`spliceQuery(msg.query, node.span, newTerm)`) to get the modified live query, then build the full effective query as `sealQuery(pinned) + ' ' + sealQuery(modifiedLive)`. When live-only: effective query = spliced live query.

### Domain order and precedence

When a bare term matches **multiple** domains (e.g. `commander` matches format and is:), suggest each matching domain. Order: keyword → type-line → set → format → is: → otag → atag → game → frame → rarity. Only the first matching domain is required for MVP; others can be added incrementally.

**Interaction with oracle (Spec 131):** When a bare term matches both a **non-tag** field domain (e.g. `kw:landfall`) and the oracle fallback (`o:landfall`), prefer the **field-specific** suggestion for **oracle suppression** purposes: that token’s value is added to the worker’s **`oracleSuppressedBareValues`** set (Spec 151). The oracle hint then omits that token from trailing phrase / per-word construction, so we do not duplicate `o:landfall` when `kw:landfall` was already offered. Non-tag bare-term-upgrade rows use priority **16** and sort before oracle (**20**).

**Tag domains do not suppress oracle:** **`otag:`** and **`atag:`** suggestions (exact match or Spec 159 prefix, single- or multi-word) **do not** add the affected bare token values to **`oracleSuppressedBareValues`**. Tag suggestions remain **last** among bare-token interpretations conceptually (priority **21**, Spec 151) but coexist with the oracle hint when trailing tokens would match oracle text. Example: `opponent skips` → oracle `o:"opponent skips"` plus optional `otag:…` chips.

### Domains

#### Domain: Keywords

**Value recognition:** `value.toLowerCase()` is a key in the keyword index (same source as `kw:` evaluator). The worker has access to `keywordLabels` or the keyword index keys from the loaded data.

**Suggested field:** `kw:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| kw: | `kw:{value}` | "Use kw: for keyword abilities." | reference/fields/face/kw |

**Display:** Use value as typed (keywords are case-insensitive; preserve user casing for display).

#### Domain: Type line (t:)

**Value recognition:** `value.toLowerCase()` appears as a **word** in at least one card's type line. Type lines are strings like `"Legendary Creature — Elf Noble"` or `"Instant"`. At load time, explode each type line into words: split on whitespace and the em dash (`—`), lowercase, and collect unique tokens. Store as a `Set<string>` (or equivalent) derived from `type_lines` in the columnar data. A bare term `elf` matches because "elf" appears as a word in type lines such as "Creature — Elf Druid".

**Suggested field:** `t:` (or `type:`)

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| t: | `t:{value}` | "Use t: for type line." | reference/fields/face/type |

**Display:** Use value as typed. The `t:` field does substring match; suggesting `t:elf` when "elf" appears as a word ensures the query will match (any type line containing "elf" matches).

**Implementation note:** No ETL change required. At CardIndex creation time (index build, not per-query), iterate over `type_lines`, split each by `/\W+/` (or `[\s—]+`), lowercase, and build a `Set<string>` of unique words. Add to CardIndex as `typeLineWords: Set<string>`. Vocabulary size is typically a few hundred words (card types, supertypes, creature types, artifact types, etc.).

#### Domain: Set codes

**Value recognition:** `value.toLowerCase()` is in `knownSetCodes` (from PrintingIndex). Set codes are printing-domain; the worker has this when PrintingIndex is loaded.

**Suggested field:** `set:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| set: | `set:{value}` | "Use set: for set code." | reference/fields/printing/set |

**Display:** Use value as typed; set codes are typically uppercase (e.g. MH2) but matching is case-insensitive.

#### Domain: Formats

**Value recognition:** `value.toLowerCase()` is a key in `FORMAT_NAMES` (bits.ts): `standard`, `modern`, `commander`, `edh`, `vintage`, etc.

**Suggested field:** `f:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| f: | `f:{value}` | "Use f: for format legality." | reference/fields/card/legal |

#### Domain: is: keywords

**Value recognition:** `value.toLowerCase()` is in `IS_KEYWORDS` (eval-is.ts): `foil`, `etched`, `vanilla`, `dfc`, `commander`, `brawler`, etc.

**Suggested field:** `is:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| is: | `is:{value}` | "Use is: for card properties." | reference/fields/face/is |

**Overlap with formats:** `commander` matches both FORMAT_NAMES and IS_KEYWORDS. Suggest both `f:commander` and `is:commander` (each evaluated; only those with count > 0 are suggested).

#### Domain: Oracle tags (otag)

**Value recognition:** `value.toLowerCase()` is a key in the oracle tag index (same source as `otag:` evaluator). The worker has `tagLabels` or otag index keys when tag data is loaded.

**Suggested field:** `otag:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| otag: | `otag:{value}` | "Use otag: for oracle tags." | reference/fields/card/otag |

**Dependency:** Oracle tags must be loaded. If `otagsUnavailable`, skip this domain.

**Prefix completion (Spec 159):** When the bare token is **not** an exact tag label but **prefix-matches** one or more oracle tag keys (e.g. `triggere` → `otag:triggered-ability`), the single-node pass adds up to three `otag:` suggestions per token after exact-domain alternatives; same idea for illustration tags and `atag:`. Multi-word adjacent bare windows use hyphen slugs per Spec 159.

#### Domain: Illustration tags (atag)

**Value recognition:** `value.toLowerCase()` is a key in the illustration tag index (same source as `atag:` evaluator). The worker has illustration tag labels when atag data is loaded.

**Suggested field:** `atag:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| atag: | `atag:{value}` | "Use atag: for illustration tags." | reference/fields/printing/atag |

**Dependency:** Illustration tags must be loaded. If illustration/atag data is unavailable (e.g. no atag index loaded), skip this domain.

#### Domain: Game

**Value recognition:** `value.toLowerCase()` is a key in `GAME_NAMES` (bits.ts): `paper`, `mtgo`, `arena`, `astral`, `sega`.

**Suggested field:** `game:` (or `in:` — both work; `game:` is more specific for game-only intent)

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| game: | `game:{value}` | "Use game: for game availability." | reference/fields/printing/game |
| in: | `in:{value}` | "Use in: for game, set, or rarity." | reference/fields/printing/in |

**Note:** `in:` accepts game values. Suggest `game:` first (narrower); if that fails or we want to offer both, `in:` is an alternative. For MVP, `game:` only is sufficient.

#### Domain: Frame

**Value recognition:** `value.toLowerCase()` is a key in `FRAME_NAMES` (bits.ts): `1993`, `1997`, `2003`, `2015`, `future`.

**Suggested field:** `frame:`

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| frame: | `frame:{value}` | "Use frame: for card frame." | reference/fields/printing/frame |

#### Domain: Rarity

**Value recognition:** `value.toLowerCase()` is a key in `RARITY_NAMES` (bits.ts): `common`, `uncommon`, `rare`, `mythic`, `special`, `bonus`, and single-letter aliases `c`, `u`, `r`, `m`, etc.

**Suggested field:** `rarity:` (or `in:` — both work; `rarity:` is more specific)

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| rarity: | `rarity:{value}` | "Use rarity: for printing rarity." | reference/fields/printing/rarity |
| in: | `in:{value}` | "Use in: for game, set, or rarity." | reference/fields/printing/in |

**Note:** For MVP, `rarity:` only. `in:` can be added if desired for consistency with `in:` accepting rarity.

### Example mappings

| User query | Bare terms | Matches | Suggested |
|------------|------------|---------|-----------|
| landfall | landfall | keyword | kw:landfall |
| mh2 | mh2 | set | set:mh2 |
| elf | elf | type-line | t:elf |
| commander | commander | format, is: | f:commander, is:commander |
| paper | paper | game | game:paper |
| mythic | mythic | rarity | rarity:mythic |
| ramp | ramp | otag | otag:ramp |
| lightning landfall | lightning, landfall | —, keyword | kw:landfall (for landfall only) |
| landfall flying | landfall, flying | keyword, keyword | kw:landfall, kw:flying (both shown; counts may be 0) |
| elf ci:g | elf | type-line | t:elf ci:g (or ci:g t:elf) |
| ci:r landfall | landfall | keyword | ci:r kw:landfall |
| t:creature flying | flying | keyword | t:creature kw:flying |
| landfall f:commander | landfall | keyword | kw:landfall f:commander |
| first strike | (first, strike) multi-word | keyword | kw:"first strike" |
| Dan Frazier | (Dan, Frazier) multi-word | artist | a:"Dan Frazier" |

### Multiple bare terms

When the query has multiple bare tokens (e.g. `landfall flying` or `landfall f:commander`), each is evaluated independently. If "landfall" matches keywords, suggest `kw:landfall` — regardless of whether the replacement returns results. Likewise for "flying" → `kw:flying`. When the replacement *does* return results, the count is shown on the chip. When it doesn't, the chip still appears (without a count) because the field prefix is directionally correct and teaches the right syntax. We do **not** combine multiple bare terms into one field (e.g. no `kw:landfall kw:flying` as a single suggestion). Each suggestion replaces exactly one BARE node.

### Multi-word bare terms

Some domain values are multi-word phrases: keyword abilities like "first strike", "double strike", "split second", "cumulative upkeep", "living weapon", "totem armor"; and artist names like "Dan Frazier", "Rebecca Guay", "Mark Poole".

When two or more **adjacent, unquoted** BARE nodes form a phrase that matches a domain, suggest the field-prefixed **quoted** form. For example, bare `first strike` (two BARE nodes) → `kw:"first strike"`.

**Adjacency:** Two bare nodes are adjacent when they are consecutive children of the same AND (sorted by `span.start`) with only whitespace between them in the source query. A FIELD node between them breaks adjacency (e.g. `first ci:r strike` — not adjacent).

**Window sizes:** Check pairs first, then triples. This covers all two-word keywords and artist names, plus three-word artist names.

**Label form:** The suggestion label uses the quoted form: `kw:"first strike"`, `a:"Dan Frazier"`. The splice span covers from the first node's `span.start` to the last node's `span.end` — replacing all words and inter-word whitespace with the single quoted field term.

**Consumed nodes:** When a multi-word match is found, the individual bare nodes that participated are marked as "consumed" and excluded from single-word matching. This prevents suggesting `t:first` for the `first` in `first strike`. Multi-word matching runs before single-word matching to establish precedence.

**Overlapping windows:** Process windows left-to-right. Skip any window containing a node already consumed by a prior match. Example: `first strike double strike` — `(first, strike)` matches `kw:"first strike"`, consuming indices 0 and 1; `(double, strike)` at indices 2 and 3 matches `kw:"double strike"`.

**Quoted bare terms:** When a user quotes a multi-word phrase (`"first strike"`), it is already a single BARE node with `quoted: true` and the value `first strike`. The existing single-word path handles it — the value matches the keyword index directly. No change needed.

#### Domain: Artist (`a:`)

Artist matching is **multi-word only** — single bare words like `Dan` or `Frazier` are too ambiguous to suggest `a:Dan`. Only phrases of 2+ adjacent bare nodes that match a known (normalized) artist name trigger a suggestion.

| Suggested field | Label form | Explain | docRef |
|-----------------|------------|---------|--------|
| a: | `a:"{phrase}"` | "Use a: for artist name." | reference/fields/printing/artist |

**Context:** `artistLabels?: string[]` on `BareTermUpgradeContext`, sourced from `Object.keys(tagDataRef.artist)` (the normalized artist index keys). Matching is case-insensitive.

#### Multi-word domains checked

For the multi-word pass, the following are checked:

1. **keyword** (`kw:`) — space-joined phrase in keyword index (quoted suggestion)
2. **artist** (`a:`) — space-joined phrase in artist index (multi-word only; quoted suggestion)
3. **otag** / **atag** — **Hyphen-joined slug** from the same adjacent bare window, matched against oracle tag and illustration tag label keys; **unquoted** `otag:` / `atag:` suggestions. See **Spec 159** for normative rules, examples, and acceptance criteria.

**Single-word-only domains** (type-line, set, format, is, game, frame, rarity) are still not checked in the multi-word pass. For **otag** and **atag**, the single-word path (exact label match) remains as before; Spec 159 adds only the **multi-word hyphen** path.

#### Multi-word example mappings

| User query | Adjacent bare window | Matches | Suggested |
|------------|---------------------|---------|-----------|
| first strike | (first, strike) | keyword | kw:"first strike" |
| double strike | (double, strike) | keyword | kw:"double strike" |
| Dan Frazier | (Dan, Frazier) | artist | a:"Dan Frazier" |
| t:creature first strike | (first, strike) | keyword | t:creature kw:"first strike" |
| first ci:r strike | none (not adjacent) | — | (no multi-word match; single-word fallback) |
| first strike double strike | (first, strike), (double, strike) | keyword, keyword | kw:"first strike", kw:"double strike" |
| mana rock | (mana, rock) | otag (hyphen slug `mana-rock`) | otag:mana-rock (Spec 159) |

### Worker integration

- In `buildSuggestions` (app/src/worker-suggestions.ts), run bare-term-upgrade **before** the oracle hint block. Order: empty-list, include-extras, unique-prints, **bare-term-upgrade**, wrong-field, oracle.
- Use the live AST: `ast = parse(msg.query)`; call `getBareNodes(ast)` to collect all positive BARE nodes (anywhere in the tree). If empty, skip. Bare nodes are always in the live portion when pinned+live.
- For each bare node: for each domain (in order), check if the value matches. If match: build replacement by splicing the live query at the node's span (`modifiedLive`); when pinned, combine with sealed pinned query for **`evaluateAlternative`** only; set **`Suggestion.query`** to **`modifiedLive`**, not the combined string (Issue #258). Include count/printingCount when > 0; omit when 0.
- **Multi-word window pass:** For each adjacent bare window from `getAdjacentBareWindows`, call `getMultiWordAlternatives(phrase, context, segments)` where `phrase` is space-joined bare values and `segments` is the same values as an array (Spec 159 hyphen-slug path uses per-node trimming).
- Track which bare terms (by value) received a **non-tag** bare-term-upgrade suggestion. When building the oracle hint (Spec 131), add only those values to **`oracleSuppressedBareValues`** — do not suggest `o:{term}` for the same token when `kw:landfall` (or another non-tag upgrade) was already offered. **`otag:`** / **`atag:`** emissions do not populate that set.

### Suggestion type extension

Add `'bare-term-upgrade'` to the `Suggestion.id` union in `shared/src/suggestion-types.ts`. Add `'bare-term-upgrade'` to `EMPTY_STATE_IDS` in `app/src/SuggestionList.tsx`.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/src/suggestion-types.ts` | Add `'bare-term-upgrade'` to Suggestion.id union |
| `shared/src/search/oracle-hint.ts` | Add `getBareNodes(ast): BareWordNode[]` — collects all positive BARE nodes from the tree (not just trailing; excludes nodes under NOT) |
| `shared/src/bare-term-upgrade-utils.ts` | `getBareTermAlternatives(value, context)` for single-word domains; `getMultiWordAlternatives(phrase, context, segments?)` for multi-word (keyword, artist, and Spec 159 hyphen-slug prefix on `oracleTagLabels` / `illustrationTagLabels`); `getAdjacentBareWindows(bareNodes, query, maxSize)` for sliding-window adjacency. `artistLabels` on context. |
| `shared/src/search/card-index.ts` | Add `typeLineWords: Set<string>` — built at index creation by splitting each `type_lines` entry on `/\W+/`, lowercasing, and collecting unique words. Passed to bare-term-upgrade context. |
| `app/src/worker-suggestions.ts` | In `buildSuggestions`, add multi-word sliding-window pass before single-node loop; track consumed nodes; plumb `artistLabels`; pass bare window values as `segments` to `getMultiWordAlternatives` (Spec 159) |
| `app/src/worker-search.ts` | Pass `artistLabels` from `tagData.artist` to `buildSuggestions` |
| `app/src/SuggestionList.tsx` | Add `'bare-term-upgrade'` to EMPTY_STATE_IDS |
| `docs/specs/151-suggestion-system.md` | Add bare-term-upgrade to placement/priority table; add to empty-state eligible ids |
| `docs/specs/131-oracle-did-you-mean.md` | Oracle suppression applies only to **non-tag** bare-term upgrades; see Spec 131 trigger condition 6. |

## Implementation Notes

- **Phased rollout:** Keyword domain (`kw:`) and type-line (`t:`) are highest-impact ("landfall", "elf" are common zero-result cases). Implement keyword and type-line first, then set, format, is, otag, atag, game, frame, rarity.
- **Context requirements:** Set codes require PrintingIndex. OTags require otags data. ATags require atag/illustration data. Skip domains when their data is unavailable.
- **Quoted bare words:** When a BARE node is quoted (e.g. `"first strike"`), the value is the full phrase. Multi-word keywords (e.g. "first strike") can match the keyword index. Handle phrase values in domain checks.
- **Pinned + live:** Same as Spec 131: alternatives are built from the live query. Spans are in live-query coordinates — splice `msg.query`, then build full effective query as `sealQuery(pinned) + ' ' + sealQuery(modifiedLive)`. The effective query is used for the zero-results check.

## Acceptance Criteria

1. `landfall` with zero results and "landfall" in keyword index shows `kw:landfall` chip.
2. `elf` with zero results and "elf" appearing as a word in some type line shows `t:elf` chip.
3. `mh2` with zero results and MH2 in knownSetCodes shows `set:mh2` chip.
4. `commander` with zero results shows `f:commander` and/or `is:commander` chips.
5. `lightning ci:r landfall` with zero results shows `kw:landfall` chip (replacing only "landfall"); tapping produces `lightning ci:r kw:landfall`.
6. `landfall f:commander` with zero results shows `kw:landfall` chip (non-trailing bare term); tapping produces `kw:landfall f:commander`.
7. `landfall flying` with zero results shows both `kw:landfall` and `kw:flying` chips (counts may be 0).
8. Bare-term-upgrade suggestions appear above the Results Summary Bar. **Non-tag** upgrades (priority 16) sort before the oracle hint (20). **`otag:`** / **`atag:`** upgrades (21) sort after the oracle hint when both apply.
9. When a bare term gets a **non-tag** bare-term-upgrade suggestion, the oracle hint does not also suggest `o:{term}` for that same term. **`otag:`** / **`atag:`** suggestions do not trigger that suppression (Spec 131).
10. Works in single-pane and Dual Wield layouts.
11. Each chip shows explain text and "Learn more" link when docRef is set.
12. Domains with unavailable data (e.g. no PrintingIndex for set) are skipped gracefully.
13. Negated bare terms are not converted (same as Spec 131).
14. When a replacement query returns > 0, the count appears on the chip. When it returns 0, the chip still appears without a count.
15. `first strike` (unquoted, two bare words) with zero results shows `kw:"first strike"` chip; tapping replaces both words with `kw:"first strike"`.
16. `Dan Frazier` (unquoted, two bare words) with zero results and "dan frazier" in normalized artist index shows `a:"Dan Frazier"` chip.
17. `first ci:r strike` — bare nodes not adjacent (FIELD node between them); no multi-word match for "first strike".
18. Individual bare nodes consumed by a multi-word match do not also produce single-word suggestions (e.g. no `t:first` from the `first` in `first strike`).
