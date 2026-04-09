# Spec 183: Card detail sections, query chips, and outlinks

**Status:** Implemented

**Issue:** https://github.com/jimbojw/frantic-search/issues/242

**Depends on:** [Spec 015](015-card-page.md), [Spec 050](050-printing-aware-card-detail.md), [Spec 106](106-card-detail-tags.md), [Spec 160](160-card-detail-analytics.md), [Spec 166](166-card-detail-body-cleanup.md)

**Related:** [Spec 002](002-query-engine.md) (query semantics), [Spec 024](024-index-based-result-protocol.md) (normative `DisplayColumns` / `PrintingDisplayColumns` and card-detail worker messages for this epic), [Spec 048](048-printing-aware-display.md) (printing-aware **search results**; complements Spec 050 card detail), [Spec 108](108-list-import-textarea.md) (deck list lexer / `buildListSpans` highlighting contract), [Spec 150](150-chip-button-component.md) (chip visuals), [Spec 047](047-printing-query-fields.md) (printing query fields), [Spec 095](095-percentile-filters.md) (percentile semantics and card-detail chip display contract), [Spec 099](099-edhrec-rank-support.md), [Spec 101](101-edhrec-salt-support.md), [Spec 102](102-edhrec-salt-percentile-chips.md), [Spec 136](136-nullable-face-fields.md) (nullable face fields including `m`), [Spec 179](179-set-type-query-field.md), [Spec 148](148-artist-etl-and-worker.md) (`artist:` queries and strided index), [ADR-008](../adr/008-documentation-strategy.md) (spec lifecycle)

## Goal

Reorganize the card detail body into clear **information sections**: list actions, oracle presentation, searchable **card-level** metadata (query chips), **printing-level** metadata (query chips), and **external outlinks**—while preserving the existing **Format legality**, **Function tags (otags)**, and **Illustration tags (atags)** blocks **unchanged in relative order** and **after** all of the new section content.

## Background

Today (`app/src/CardDetail.tsx`), printing metadata, oracle text, EDHREC fields, list controls, and navigation affordances share a single dense panel. [Issue #242](https://github.com/jimbojw/frantic-search/issues/242) asks for a presentation that matches how users reason about **oracle** vs **printing**, surfaces **Frantic Search query syntax** as first-class chips, and adds **affiliate and reference outlinks** with analytics.

This spec is the **umbrella** for that epic. It defines information architecture, section ordering, and acceptance criteria. **Query semantics** remain governed by [Spec 002](002-query-engine.md) and the field specs cited above; **analytics schema extensions** are specified in [Spec 160](160-card-detail-analytics.md) (this spec states *what* must be instrumented).

## Vertical order (required)

From top to bottom within the card detail **body** (below the portaled header / Spec 165):

1. **In-body title and all-prints chip** — unchanged from [Spec 166](166-card-detail-body-cleanup.md) (`fullName()` heading; all-prints query chip when applicable).
2. **List actions** — three-column Moxfield preview layout ([§1](#1-list-actions)).
3. **Oracle details** — large image, DFC toggle when applicable, then per-face oracle block(s) (this spec).
4. **Card details** — two-column table: human-readable values + query chips (this spec).
5. **Printing details** — two-column table: human-readable values + query chips (this spec).
6. **Outlinks** — external references and affiliates (this spec).
7. **Format legality** — existing section; **no change** to content or behavior beyond any global styling shared with new tables.
8. **Function tags (otags)** — existing behavior per [Spec 106](106-card-detail-tags.md); **no change** to placement relative to legality (still **after** legality).
9. **Illustration tags (atags)** — same as otags; **after** otags when both are present.

If printing columns are unavailable, omit or degrade sections that require them per [Spec 050](050-printing-aware-card-detail.md); **legality and tag sections** still follow the same order when their data exists.

---

## 1. List actions

**Purpose:** Adjust **My List** counts for the oracle (all finishes implied as nonfoil at oracle scope per existing behavior) and for each **printing row** (per finish) when the UI shows multiple finishes.

**Layout (per row):** Three columns in visual order: **decrement** | **preview** | **increment** (e.g. `−` control, center content, `+` control). The center **preview** column must participate in flex/grid shrink (`min-width: 0` in CSS terms) so long lines do not overflow the viewport.

**Preview column** has two lines:

1. **Primary line (Moxfield preview)** — read-only text that **must** match the plain-text shape of **one** [Moxfield](https://www.moxfield.com/) deck line per [`serializeMoxfield`](../../shared/src/list-serialize.ts) for a **hypothetical** entry with the same oracle / printing / finish semantics as the row:
   - Leading **quantity** = current **My List** count for that row’s scope (same matching rules as today’s counts).
   - Then the **card name** (full oracle name, including ` // ` for multifaced cards), resolved the same way as serialization (`DisplayColumns` + `PrintingDisplayColumns` when printing-scoped).
   - **Oracle / by-name row:** quantity and name **only** (no `(SET) collector`, no `*F*` / `*E*`) — equivalent to serialization when the logical line has no printing (`scryfall_id` absent).
   - **Printing row:** append space + `(SET)` in **uppercase** Scryfall set code + space + collector number as in `serializeMoxfield`; append ` *F*` for foil or ` *E*` for etched; **omit** finish markers for nonfoil.
   - **Do not** append Moxfield **custom `#Tag`** segments on these preview lines. Tags stored on My List instances must **not** appear here (the line is a preview of the export **shape**, not a dump of stored rows).

2. **Secondary line (caption)** — short **italic** prose under the primary line:
   - **Oracle / by-name row:** plain-language scope only, e.g. *This card (by name only)* — align wording with accessible names for the increment/decrement controls.
   - **Printing row:** finish label + “printing” wording consistent with today’s list rows, then an em dash or equivalent separator, then **USD price** for that printing row using the **same display rules** as the List Actions printing rows **before** this layout change (same helper / `formatPrice` behavior as `CardDetail.tsx` for `price_usd` on that finish index). If no USD price is available for that printing row, show the exact parenthetical **`(price data not available)`** (canonical fallback string).

**Syntax highlighting (primary line):** Run [`buildListSpans`](../../shared/src/list-lexer.ts) on the preview string and apply the **same span `role` → CSS class mapping** as [`ListHighlight`](../../app/src/ListHighlight.tsx) (deck list **display** mode). This matches the deck editor’s highlighted list text per [Spec 108](108-list-import-textarea.md). Read-only `<span>` (or equivalent) output is enough; the textarea overlay pattern is **not** required.

**Wrapping:** The primary (Moxfield) line **must wrap** on narrow viewports (e.g. `whitespace-pre-wrap` on a monospace-styled block; line breaks inside long card names are acceptable). Monospace column alignment is best-effort when wrapped.

**Controls:** Decrement and increment may be **card-detail-local** buttons or a thin wrapper; they need not use the shared [`ListControls`](../../app/src/ListControls.tsx) component. [Spec 160](160-card-detail-analytics.md) still applies: one `list_add` / `list_remove` per gesture with the same payloads as today.

**Behavior:** Same add/remove semantics as before this §1 revision. Same row branching: one oracle row when `cardListStore` and oracle id exist; one row per printing index when multiple finishes, else a single finish row; only show finish-specific rows when those finishes exist in the dataset (unchanged).

---

## 2. Oracle details

**Purpose:** Read-only **rules text** presentation; this is not the query-chip table.

**Content (per face, in canonical face order):**

- Card image(s): the **anchor** printing’s `scryfall_id` for CDN URLs when printings resolve for the page `card` id (Spec 015/050); otherwise the URL id as today. DFC **Front / Back** toggle when layout requires it (analytics: existing `face_toggle`).
- For each face: **name** (heading), **mana cost** right-aligned on the same row, **type line**, **oracle text** in the bordered box, then **power/toughness**, **loyalty**, or **defense** when present—matching the current `FaceDetail` structure and typography intent.

**Not in this section:** EDHREC, prices, set name, collector number, query chips (those belong in **Card details** or **Printing details**).

---

## 3. Card details

**Purpose:** Fields users may want to **search** again, shown as a **description column** (plain language + displayed values) and a **chips column** (buttons that call `onNavigateToQuery` with the documented query string).

**Layout:** Each logical block uses the same two-column pattern: **Label / description** | **Value summary + query chip(s)**.

### Single-faced oracles

One **Card details** table containing every applicable row from the **Row catalog** below (same face supplies name, mana, type, colors, P/T, etc.).

### Multi-faced oracles

Treat **card details** as **two structural tiers** (not necessarily titled `<h2>` sections—separators, spacing, or optional subheadings are implementation choices):

1. **Oracle / combined card** — One block for the **multiface oracle object** as a whole: combined **Name** query, **color identity**, **EDHREC** rank and salt, **keywords** that attach to the card (e.g. Aftermath), and any other row the dataset exposes only at oracle scope.
2. **Each canonical face** — In **canonical face order** (same order as oracle text / `FaceDetail`), repeat a **per-face** block for **every** face, including the first: single-face **Name**, **mana cost**, **Type** (chip sequence), **color** (`c:`), and when present **power**, **toughness**, **loyalty**, **defense**.

A two-face Aftermath card therefore has **three** content groupings (one combined + two per-face); a three-face meld object has **four**, and so on.

Per-face blocks need **not** use the face name as a section header; the spec only requires that **content** is grouped so users can tell which mana, type, and colors belong to which face.

**Illustrative example (Aftermath — Claim // Fame):**

Oracle / combined block:

- **Name** — `!"Claim // Fame"` (trimmed; no stray trailing space in the query string)
- **Color identity** — `ci:…` for `{B}{R}` per engine syntax
- **EDHREC rank** — `#19350` in prose; **two chips** when ranked: `edhrec=19350` (raw rank) and `edhrec=90%` (percentile; illustrative—`%` derived from rank vs the loaded distribution)
- **EDHREC salt** — same pattern when rated: **two chips**—raw `salt=…` and `salt=…%`
- **Keywords** — always this row: e.g. `kw:Aftermath`, or human **`_none_`** with no `kw:` chips when empty

Face **Claim:**

- **Name** — `!"Claim"`
- **Mana cost** — chip face may show symbolic `{B}`; navigation uses **compact `m=`** (e.g. `m=b`)
- **Type** — `t:Sorcery` (or token sequence from **Type line tokens**)
- **Color** — `c:…` for that face’s colors

Face **Fame:**

- **Name** — `!"Fame"`
- **Mana cost** — e.g. `{1}{R}` → compact `m=1r` (illustrative)
- **Type** — `t:Sorcery`
- **Color** — `c:…` for red

### Row catalog (happy path; omit row when data is absent except where **always shown**)

| Row | Scope | Human-facing | Query chips (examples; values must reflect this card) |
|-----|--------|----------------|--------------------------------------------------------|
| Name (combined) | Oracle — **multi-face only** | `Claim // Fame` | `!"Claim // Fame"` |
| Name (face) | Per face | Face’s printed name | `!"Claim"` |
| Name | **Single-face only** | Full name | `!"Heartless Hidetsugu"` |
| Mana cost | Per face | Rendered mana symbols | **Navigation:** compact **`m=`** only (not `m:`). Chip label may use symbolic `{3}{R}{R}` styling per issue #242; `onNavigateToQuery` receives the `m=` string. See **Mana cost navigation** below. |
| Type | Per face | Full type line | **Sequence** of `t:` chips from **Type line tokens** |
| Power | Per face | Display power | `pow=4` |
| Toughness | Per face | Display toughness | `tou=3` |
| Loyalty | Per face | If present | `loy=…` per engine |
| Defense | Per face | If present | `def=…` per engine |
| Color identity | Oracle (combined block for multi-face; single-face table) | Identity symbols or text | `ci:…` (syntax per engine / [Spec 002](002-query-engine.md)) |
| Color | Per face | Face’s colors | `c:…` |
| EDHREC rank | Oracle (combined block for multi-face; single-face table) | `#2953` or “Not ranked” | When ranked: **two separate chips**—`edhrec=<n>` (absolute rank, [Spec 099](099-edhrec-rank-support.md)) and `edhrec=<p>%` (equality percentile; `p` chosen so this card lies in the band, [Spec 095](095-percentile-filters.md)). When not ranked: no chips. |
| EDHREC salt | Oracle (same) | Raw or “Not rated” | When rated: **two separate chips**—raw `salt=…` and `salt=<p>%` ([Spec 101](101-edhrec-salt-support.md), [Spec 095](095-percentile-filters.md)). When not rated: no chips. |
| Keywords | Oracle (combined block for multi-face; single-face table) | **Always show.** Comma-separated list or placeholder **`_none_`** when empty | One `kw:` chip per keyword; **chips column empty** when there are no keywords |

**Mana cost navigation:** Mana query chips **must** use the **`m=`** operator for navigation (exact / structured value form accepted by the parser per [Spec 002](002-query-engine.md) and [Spec 136](136-nullable-face-fields.md) for empty costs). Implement **one** shared helper (app or `shared/`) that maps each face’s mana cost string to the compact `m=` query fragment; unit-test it alongside the type-line tokenizer. Do not use `m:` for chip navigation.

**Type line tokens:** Extract chips from `type_lines[faceIndex]` without classifying supertypes vs types vs subtypes. Split on **ASCII/Unicode whitespace** and on the **long dash** (`—`, U+2014) between type box and subtypes; trim each segment; **omit** empty tokens; do **not** emit a chip for the dash. Normalize each token for `t:` (typically lowercase; [Spec 002](002-query-engine.md) / evaluator substring semantics). Implement as a **small tested helper** in `shared/` or `app/`; must not throw on empty or unusual type lines. **Multi-face:** apply within each **per-face** block only (not in the oracle/combined block).

**Parsing (other):** No full type-line grammar parser beyond tokenization. Quoted `t:"…"` for multi-word tokens is **out of scope for v1** unless real data requires it (add tests if introduced).

**EDHREC on multi-face:** Rank and salt refer to the **oracle** as today (`faces()[0]` / canonical primary in data); surface them only in the **oracle / combined** block, not repeated in every per-face block.

**EDHREC, salt, and USD percentile chips:** For **rank** and **salt**, the UI presents **both** the **raw-value** chip and the **percentile** chip as **separate controls** whenever both are meaningful (ranked / rated). The percentile chip’s `p` is computed from the card’s value and the loaded distribution so that `edhrec=p%` / `salt=p%` uses the same **equality percentile band** as the evaluator ([Spec 095](095-percentile-filters.md)); display rounding must still yield a chip that **includes this card** when clicked (regression-test or property-test where feasible). **USD** rows in §4 use the same discipline for `$=…` and `$=…%` ([Spec 095](095-percentile-filters.md) / [Spec 080](080-usd-null-and-negated-price-semantics.md)).

**Data:** Normative wire shapes: [Spec 024](024-index-based-result-protocol.md) (`DisplayColumns.colors`, `keywords_for_face`; percentile display helper § Card detail in [Spec 095](095-percentile-filters.md)).

---

## 4. Printing details

**Purpose:** Printing-scoped searchable fields for the **anchor printing row** for **this** card view: the printing context implied by `?card=<scryfallId>` after oracle-vs-printing resolution ([Spec 050](050-printing-aware-card-detail.md) § URL Scheme). This is **not** “the product’s default printing for the oracle” in the abstract—it is whichever printing row the page is keyed to (oracle URL → metadata may be absent until a row exists; printing URL → that printing’s `scryfall_id`). When several dataset rows share the same page `scryfall_id` (e.g. finish variants), **shared** printing-scoped chips (set, `st:`, release, `cn:`, rarity, artist, etc.) use the same **first index** as today: `printingIndices[0]` (Spec 050 § CardDetail Changes — “Shared fields use the first printing index”). Per-finish price rows still follow the existing multi-finish layout.

**Layout:** Same two-column pattern as Card details.

**Rows:**

| Row | Human-facing | Query chips |
|-----|----------------|------------|
| Set | Set name + code in prose | `set:BOK` (code uppercase mono in chip label; navigation uses engine-normalized form) |
| Set type | Readable set type | `st:expansion` (value from dataset; Spec 179) |
| Released | Calendar date + optional year | `year=…`, `date=…` per [Spec 061](061-date-query-semantics.md) |
| Collector # | As printed | `cn:107` |
| Rarity | Readable rarity | `r:rare` |
| Nonfoil price | USD when present | Raw price chip + percentile chip, e.g. `$=2.37` and `$=73%` |
| Foil price | When this printing row has a foil price (or separate row per finish if two USD columns exist) | Same pattern |
| Illustrated by | Artist credit line | `a:"Carl Critchlow"` |

**Note:** When only one finish exists, collapse price rows to match current data (single USD column). Percentile chips for `$` follow [Spec 095](095-percentile-filters.md) / [Spec 080](080-usd-null-and-negated-price-semantics.md).

**Data:** Normative wire shapes: [Spec 024](024-index-based-result-protocol.md) (`PrintingDisplayColumns.set_types`, `released_at`; **artist** via `get-artist-for-printing` / `artist-for-printing-result` and [Spec 148](148-artist-etl-and-worker.md)).

---

## 5. Outlinks

**Purpose:** Open external sites; distinguish **reference** vs **affiliate** links.

**Minimum set (each opens in a new tab with same `rel` / `Outlink` behavior as elsewhere):**

| Label | Kind | Notes |
|-------|------|--------|
| Scryfall | Reference | Card page for page `scryfall_id`. If Spec 166’s metadata line or the portaled header (Spec 165) already exposes the same Scryfall URL, **remove the duplicate** so users see **one** in-body Scryfall affordance (prefer keeping it in this **Outlinks** section unless a header icon is explicitly retained—document the choice in **Implementation notes**). |
| EDHREC (commander) | Reference | Commander-context page when applicable. |
| EDHREC (card) | Reference | Card page on EDHREC. |
| Mana Pool | Affiliate | Use project affiliate rules (env or config); same class of link as My List export if defined. |
| TCGPlayer | Affiliate | Same as above. |

**Analytics:** Every outlink and every query chip in §3–§4 fires **`card_detail_interacted`** (or a dedicated event if Spec 160 is extended) with a **stable identifier** for the control (e.g. `control: 'query_chip'`, `field`, `query`; `control: 'outlink'`, `destination: 'edhrec_commander'`). Exact payload shape is added in [Spec 160](160-card-detail-analytics.md) during implementation; this spec requires **100% coverage** of chips and outlinks. **Early in the epic:** decide whether Scryfall uses the existing `scryfall_external` payload or a unified `outlink` + `destination` (see **Analytics (summary)**) and implement consistently before wiring the rest.

**Privacy:** Do not attach full card names to analytics if avoidable; prefer field keys, set codes, and stable ids (align with Spec 160 rules).

---

## Analytics (summary)

- **Extend** [Spec 160](160-card-detail-analytics.md) for: query chip clicks (field + query or normalized token), each outlink destination, and any new list-layout-only controls if needed.
- **Scryfall:** Pick **one** schema before bulk implementation—either keep `scryfall_external` for the in-body Scryfall control or fold it into `outlink` with `destination: 'scryfall_card'` (or equivalent). Document the choice in Spec 160; avoid emitting duplicate events for the same click.
- Preserve existing events elsewhere: `all_prints`, `set_unique_prints`, `face_toggle`, list add/remove, `otag_nav`, `atag_nav`, header copy menu.

---

## Acceptance criteria

1. Body vertical order matches **Vertical order (required)**; **Format legality** appears only **after** outlinks; **otags** then **atags** follow legality with no reordering relative to each other.
2. **List actions** use the three-column layout in §1: decrement | Moxfield preview (syntax-highlighted, wrapping) + italic caption (printing rows include USD price or `(price data not available)`) | increment; same list add/remove behavior and [Spec 160](160-card-detail-analytics.md) payloads as before §1 revision.
3. **Oracle details** match the current oracle UX intent (image, DFC toggle, per-face name/cost/type/oracle/P-T/loyalty/defense) and exclude printing-only fields.
4. **Card details** and **Printing details** use two-column tables; each query chip navigates to search with the correct string; mana chips may show symbolic rendering on the label but **always** navigate with **`m=`** (never `m:`). **Single-faced** oracles use one table per **Row catalog**. **Multi-faced** oracles use an **oracle / combined** block (name `!"A // B"`, color identity, EDHREC, keywords, …) plus **per-face** blocks (name, mana, **Type** chip sequence from **Type line tokens**, color, stats)—face-name section headers are optional. No separate supertype / type / subtype rows. **Keywords** row is **always** present; when there are no keywords, the human-facing column shows **`_none_`** and the chips column has no `kw:` chips. **EDHREC rank** and **EDHREC salt** (when ranked/rated) each show **two** chips: raw value and percentile, as in the row catalog.
5. **Outlinks** include Scryfall, EDHREC (commander + card), Mana Pool, and TCGPlayer with affiliate handling for the latter two.
6. **Percentile** chips for `edhrec`, `salt`, and `$` are consistent with evaluator bands ([Spec 095](095-percentile-filters.md)).
7. **Spec 160** is updated with the final payload schema for chips and outlinks; tests or manual checklist verifies one event per gesture.

### Preparatory payload checklist (Spec 024)

Before building §3–§4 UI, the worker→main contract must include:

- `DisplayColumns.colors` and `keywords_for_face` (face-aligned; Spec 105 reverse derivation).
- `PrintingDisplayColumns.set_types` and `released_at` (anchor printing row).
- `get-artist-for-printing` / `artist-for-printing-result` for the illustrated-by row (Spec 148).
- Equality-percentile labels for `edhrec`, `salt`, and `$` chips per [Spec 095](095-percentile-filters.md) § Card detail.

---

## Technical details (implementation map)

| Area | Likely location |
|------|------------------|
| List actions (Moxfield preview) | `app/src/CardDetail.tsx` (or subcomponents); shared helper for **one** Moxfield line matching `serializeMoxfield` in `shared/src/list-serialize.ts` (avoid O(count) synthetic instances); `buildListSpans` + same span role classes as `app/src/ListHighlight.tsx`; responsive wrap (`min-w-0`, `whitespace-pre-wrap` on the primary line) |
| Section layout and chips | `app/src/CardDetail.tsx`, possible subcomponents |
| Chip styling / highlight | [Spec 150](150-chip-button-component.md), `QueryHighlight` where applicable |
| Display columns / worker extract | `shared/src/worker-protocol.ts`, `shared/src/display-columns.ts`, worker init |
| Type line tokenization | New helper + `.test.ts` (split on whitespace / `—`; `t:` chips) |
| Mana cost → `m=` navigation | Shared helper + `.test.ts` (compact `m=` only; tested against parser acceptance) |
| Percentile display values | [Spec 095](095-percentile-filters.md) § Card detail; `shared/src/percentile-chip-display.ts` |
| Analytics | `app/src/analytics.ts` + Spec 160 |

---

## Implementation notes

- 2026-04-06: Prep payload checklist and normative pointers to [Spec 024](024-index-based-result-protocol.md), [Spec 048](048-printing-aware-display.md), [Spec 002](002-query-engine.md), [Spec 095](095-percentile-filters.md).
- 2026-04-06: Locked mana chip navigation to **`m=`** (not `m:`); **Keywords** row always visible with human **`_none_`** when empty; **EDHREC rank** and **salt** use **two** chips each (raw + `%`) when ranked/rated; Scryfall analytics schema choice called out in §5 and **Analytics (summary)**; added [Spec 136](136-nullable-face-fields.md) to **Related**.
- 2026-04-06: **Implemented.** Shared helpers in `shared/src/card-detail-chips.ts` (`tokenizeTypeLine`, `manaCostToCompactQuery`, `colorBitmaskToQueryLetters`). Worker percentile RPC via `get-card-detail-percentiles` / `card-detail-percentiles-result`. Artist wired via `artist-for-printing-result`. Unified `outlink` + `destination` analytics schema (Spec 160 updated); `scryfall_external` retained for backward compat but new Outlinks section uses `outlink`. EDHREC URLs use slug-based paths (`edhrec.com/cards/{slug}`, `edhrec.com/commanders/{slug}`).
- 2026-04-09: **§1 List actions** — Normative layout: three columns (decrement | Moxfield preview + italic caption | increment), `buildListSpans` / `ListHighlight` parity, wrapping, no `#Tag` on preview lines, printing caption includes USD or `(price data not available)`. **Implemented** in `app/src/CardDetail.tsx` (`CardDetailListRow`, `ListLineHighlight`) and `shared/src/list-serialize.ts` (`moxfieldPreviewLine`).
