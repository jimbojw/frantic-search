# Spec 183: Card detail sections, query chips, and outlinks

**Status:** Implemented

**Issue:** https://github.com/jimbojw/frantic-search/issues/242

**Depends on:** [Spec 015](015-card-page.md), [Spec 050](050-printing-aware-card-detail.md), [Spec 106](106-card-detail-tags.md), [Spec 160](160-card-detail-analytics.md), [Spec 166](166-card-detail-body-cleanup.md)

**Related:** [Spec 002](002-query-engine.md) (query semantics), [Spec 024](024-index-based-result-protocol.md) (normative `DisplayColumns` / `PrintingDisplayColumns` and card-detail worker messages for this epic), [Spec 048](048-printing-aware-display.md) (printing-aware **search results**; complements Spec 050 card detail), [Spec 108](108-list-import-textarea.md) (deck list lexer / `buildListSpans` highlighting contract), [Spec 150](150-chip-button-component.md) (chip visuals), [Spec 047](047-printing-query-fields.md) (printing query fields), [Spec 095](095-percentile-filters.md) (percentile semantics and card-detail chip display contract), [Spec 099](099-edhrec-rank-support.md), [Spec 101](101-edhrec-salt-support.md), [Spec 102](102-edhrec-salt-percentile-chips.md), [Spec 136](136-nullable-face-fields.md) (nullable face fields including `m`), [Spec 179](179-set-type-query-field.md), [Spec 148](148-artist-etl-and-worker.md) (`artist:` queries and strided index), [ADR-008](../adr/008-documentation-strategy.md) (spec lifecycle)

## Goal

Reorganize the card detail body into clear **information sections**: **oracle presentation** first (rules text and art), then **list actions**, then searchable **card-level** metadata (query chips), **printing-level** metadata (query chips), and **external outlinks**—while preserving the existing **Format legality**, **Function tags (otags)**, and **Illustration tags (atags)** blocks **unchanged in relative order** and **after** all of the new section content.

## Background

Today (`app/src/CardDetail.tsx`), printing metadata, oracle text, EDHREC fields, list controls, and navigation affordances share a single dense panel. [Issue #242](https://github.com/jimbojw/frantic-search/issues/242) asks for a presentation that matches how users reason about **oracle** vs **printing**, surfaces **Frantic Search query syntax** as first-class chips, and adds **affiliate and reference outlinks** with analytics.

This spec is the **umbrella** for that epic. It defines information architecture, section ordering, and acceptance criteria. **Query semantics** remain governed by [Spec 002](002-query-engine.md) and the field specs cited above; **analytics schema extensions** are specified in [Spec 160](160-card-detail-analytics.md) (this spec states *what* must be instrumented).

## Vertical order (required)

From top to bottom within the card detail **body** (below the portaled header / Spec 165):

1. **In-body title and all-prints chip** — unchanged from [Spec 166](166-card-detail-body-cleanup.md) (`fullName()` heading; all-prints query chip when applicable).
2. **Oracle details** — large image, DFC toggle when applicable, then per-face oracle block(s) (this spec).
3. **List actions** — three-column Moxfield preview layout ([§1](#1-list-actions)).
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

One **rounded Card details panel** (`<dl>` with border / background per implementation) containing every applicable row from the **Row catalog** below. The first row is **Card name** (UI label uppercase: **CARD NAME**) with the oracle’s name and `!"…"` chip, then oracle-scoped rows (color identity, EDHREC, salt, keywords), then the same face’s **mana cost**, **Type**, **color**, and optional stats—**one** visual container.

### Multi-faced oracles

Treat **card details** as **stacked rounded panels** with vertical spacing between them (`gap` / margin—implementation choice):

1. **Oracle / combined panel** — First container: **Card name** row (full combined name, `!"A // B"` query), **color identity**, then **EDHREC** rank and salt, **keywords**, then **Color** (`c:`) when every canonical face’s `DisplayColumns.colors[face]` bitmask is **identical** (including all colorless)—**Color** is **last** in this panel (after **Keywords**) so **`ci:`** and **`c:`** are visually separated. **Rationale:** Same-side multi-face layouts (adventure, split, aftermath, etc.) often carry the same oracle-level colors on every face row after ETL/broadcast; one **Color** row matches Scryfall-level “card colors” and avoids repetition. **`ci:` vs `c:`:** Both may appear even when the mana symbols match—the fields differ (`ci:` subset / “fits within”; `c:` superset / “has at least” per the query engine).
2. **Each canonical face** — **Separate** rounded panel per face in **canonical face order** (same order as oracle text / `FaceDetail`). The **first row** of each panel is **Face name** (UI label uppercase: **FACE NAME**) with that face’s printed name and `!"…"` chip—**no** separate “Face:” banner or divider line. Then **mana cost**, **Type** (chip sequence), **color** (`c:`) **only when** face color bitmasks **differ** across any pair of canonical faces, and when present **power**, **toughness**, **loyalty**, **defense**.

A two-face Aftermath card therefore has **three** visual panels (one combined + two per-face); a three-face meld object has **four**, and so on.

**Illustrative example (Aftermath — Claim // Fame):** Oracle-level colors are typically **BR** for the whole card; after the pipeline aligns face rows, every face’s color bitmask often **matches**. **Color** (`c:`) then appears **once** in the oracle / combined panel as the **last** row of that panel (after **Keywords**); per-face panels show **mana cost**, **Type**, and stats—**no** repeated **Color** row on each face.

**Illustrative example (true DFC — different face colors):** A double-faced card such as **Cecil, Dark Knight // Cecil, Redeemed Paladin** has different `colors` on the front vs back in Scryfall. **Color identity** stays in the combined panel. **Color** (`c:`) appears **in each face’s own panel** (e.g. `c:b` on the front face panel, `c:w` on the back)—not in the combined panel—because the face color bitmasks **differ**.

### Row catalog (happy path; omit row when data is absent except where **always shown**)

| Row | Scope | Human-facing | Query chips (examples; values must reflect this card) |
|-----|--------|----------------|--------------------------------------------------------|
| Card name | Oracle — **multi-face only** (combined panel) | `Claim // Fame` | `!"Claim // Fame"` |
| Face name | Per face (each face in its **own** panel when multi-face) | Face’s printed name | `!"Claim"` |
| Card name | **Single-face only** (single panel) | Full name | `!"Heartless Hidetsugu"` |
| Mana cost | Per face | **Non-empty** `mana_costs[face]`: rendered mana symbols. **Empty** (no mana cost for that face, e.g. DFC back, suspend-only): italic **none** (gray italic styling intent, parallel to empty **Keywords**). | **Non-empty:** **Navigation:** compact **`m=`** only (not `m:`). **Chip label:** literal **`m=`** prefix (monospace; **`m`** and **`=`** use the **same CSS / highlight roles** as [`QueryChip`](../../app/src/CardDetail.tsx) via [`buildSpans`](../../app/src/QueryHighlight.tsx) and [`ROLE_CLASSES`](../../app/src/QueryHighlight.tsx)) **plus** symbolic mana as mana-font glyphs (e.g. `m=` + `{3}{R}{R}`). **Empty:** **one** chip **`m=null`** with full-string syntax highlighting via **`QueryChip`** / `buildSpans` (same path as **`edhrec=null`** / **`salt=null`**); **do not** omit the chips column. `onNavigateToQuery` receives the compact `m=` string only. See **Mana cost navigation** below. |
| Type | Per face | Full type line | **Sequence** of `t:` chips from **Type line tokens** |
| Power | Per face | Display power | `pow=4` |
| Toughness | Per face | Display toughness | `tou=3` |
| Loyalty | Per face | If present | `loy=…` per engine |
| Defense | Per face | If present | `def=…` per engine |
| Color identity | Oracle (combined block for multi-face; single-face table) | Mana-font symbols for identity (WUBRG subset in canonical order, or `{C}` when colorless) via the same `ms ms-* ms-cost` pattern as face mana costs | **Navigation:** `ci:…` compact letter form per engine ([Spec 002](002-query-engine.md)), e.g. `ci:ub`, `ci:c`. **Chip label:** `ci:` (monospace / query styling) **plus** the same braced mana sequence rendered as symbols (e.g. visual `ci:` + `{U}{B}`), not raw `UB` text. |
| Color | **Single-face:** same panel as other rows. **Multi-face:** oracle combined panel **after Keywords** when every canonical face’s `colors` bitmask is **equal**; otherwise **per face** (each face panel gets its own **Color** row). | Mana-font symbols for face colors (same braced pattern as color identity) | **Navigation:** `c:` + compact letters. **Chip label:** `c:` + mana symbols (parallel to **Color identity**). |
| EDHREC rank | Oracle (combined block for multi-face; single-face table) | `#2953` or “Not ranked” | When ranked: **two separate chips**—`edhrec=<n>` (absolute rank, [Spec 099](099-edhrec-rank-support.md)) and `edhrec=<p>%` (equality percentile; `p` chosen so this card lies in the band, [Spec 095](095-percentile-filters.md)). When not ranked: **one** chip `edhrec=null`; **no** percentile chip. |
| EDHREC salt | Oracle (same) | Raw or “Not rated” | When rated: **two separate chips**—raw `salt=…` and `salt=<p>%` ([Spec 101](101-edhrec-salt-support.md), [Spec 095](095-percentile-filters.md)). When not rated: **one** chip `salt=null`; **no** percentile chip. |
| Keywords | Oracle (combined block for multi-face; single-face table) | **Always show.** Comma-separated list or italic **none** when empty | One `kw:` chip per Oracle keyword; **chips column empty** when there are no keywords. **Navigation:** each chip’s query string is `kw:` + keyword text; single-token keywords stay unquoted (e.g. `kw:infect`). If the keyword text contains **whitespace**, the value **must** be double-quoted (e.g. `kw:"first strike"`) so the clause parses as a single field term ([Spec 002](002-query-engine.md) § Whitespace and field clauses). Implement via shared `keywordAbilityToKwChipQuery` ([`shared/src/card-detail-chips.ts`](../../shared/src/card-detail-chips.ts)). |

**Mana cost navigation:** Mana query chips **must** use the **`m=`** operator for navigation (exact / structured value form accepted by the parser per [Spec 002](002-query-engine.md) and [Spec 136](136-nullable-face-fields.md) for empty costs). An **empty** cost string maps to the compact fragment **`m=null`** via the shared helper; card detail **must** still surface a **`m=null`** chip (syntax-highlighted), not hide the chips column. Implement **one** shared helper (app or `shared/`) that maps each face’s mana cost string to the compact `m=` query fragment; unit-test it alongside the type-line tokenizer. Do not use `m:` for chip navigation.

**Type line tokens:** Extract chips from `type_lines[faceIndex]` without classifying supertypes vs types vs subtypes. Split on **ASCII/Unicode whitespace** and on the **long dash** (`—`, U+2014) between type box and subtypes; trim each segment; **omit** empty tokens; do **not** emit a chip for the dash. Normalize each token for `t:` (typically lowercase; [Spec 002](002-query-engine.md) / evaluator substring semantics). Implement as a **small tested helper** in `shared/` or `app/`; must not throw on empty or unusual type lines. **Multi-face:** apply within each **per-face** block only (not in the oracle/combined block).

**Parsing (other):** No full type-line grammar parser beyond tokenization. Quoted `t:"…"` for multi-word tokens is **out of scope for v1** unless real data requires it (add tests if introduced).

**EDHREC on multi-face:** Rank and salt refer to the **oracle** as today (`faces()[0]` / canonical primary in data); surface them only in the **oracle / combined** block, not repeated in every per-face block.

**EDHREC, salt, and USD percentile chips:** For **rank** and **salt**, the UI presents **both** the **raw-value** chip and the **percentile** chip as **separate controls** whenever both are meaningful (ranked / rated). When rank or salt is **absent**, show **only** a **null equality** chip (`edhrec=null` or `salt=null` per [Spec 136](136-nullable-face-fields.md))—**no** percentile chip. The percentile chip’s `p` is computed from the card’s value and the loaded distribution so that `edhrec=p%` / `salt=p%` uses the same **equality percentile band** as the evaluator ([Spec 095](095-percentile-filters.md)); display rounding must still yield a chip that **includes this card** when clicked (regression-test or property-test where feasible). **USD** rows in §4: when `price_usd` is missing (same **0** sentinel as today—no price data), show **one** chip **`$=null`** (same semantics as **`usd=null`**; `$` aliases `usd` per [Spec 080](080-usd-null-and-negated-price-semantics.md)). When price exists, use the same discipline for `$=…` and `$=…%` ([Spec 095](095-percentile-filters.md) / [Spec 080](080-usd-null-and-negated-price-semantics.md)).

**Data:** Normative wire shapes: [Spec 024](024-index-based-result-protocol.md) (`DisplayColumns.colors`, `keywords_for_face`; percentile display helper § Card detail in [Spec 095](095-percentile-filters.md)).

**§3–§4 query chip sizing:** Chips in **Card details** and **Printing details** that navigate via `QueryChip` / `ManaQueryChip` (not **TagChip**) use the same **minimum control height** as standard app chips in [Spec 150](150-chip-button-component.md): `min-h-11`, `px-2 py-2`, centered content—so they align visually with the all-prints control, `ChipButton`, and MenuDrawer chips. Implementation may use custom `<button>` markup; it need not extend the `ChipButton` component if classes match.

**QueryChip label wrapping (default vs name rows):** By default, `QueryChip` label text stays **single-line** with ellipsis (`truncate`) so compact rows (mana, type tokens, EDHREC, etc.) remain predictable. **Exception:** The chips beside **Card name** (oracle combined name, including multi-face full names with `//`) and **Face name** (per-face rows in multi-face layout) **may** use **multi-line wrapping** instead of truncation so long names stay inside the card-details panel. Minimum height remains **at least** `min-h-11` per Spec 150; height **may grow** when the label wraps. The two-column `DetailRow` grid is unchanged; the chips column uses `min-w-0` so the grid item can shrink and wrapping has a bounded width. Stacking the printed name and the chip on separate flex lines (e.g. responsive column layout) is **out of scope** unless a future change shows wrap-only is insufficient.

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
| Nonfoil price | USD when present; em dash (or equivalent) when **no** `price_usd` | When price present: raw `$=<dollars>` chip + percentile chip, e.g. `$=2.37` and `$=73%`. When **no** price (`0` sentinel): **one** chip **`$=null`** (equivalent to `usd=null`); **no** percentile chip. |
| Foil price | When this printing row has a foil price (or separate row per finish if two USD columns exist) | Same pattern as Nonfoil price (including **`$=null`** when that finish has no price). |
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
| EDHREC (commander) | Reference | Commander-context page on EDHREC **only if** at least one **face row** of the displayed oracle matches **`is:commander`** per [Spec 032](032-is-operator.md) (same semantics as the query engine). Omit the control entirely when no face matches. |
| EDHREC (card) | Reference | Card page on EDHREC. Shown whenever the oracle has a display name (unchanged). |
| Mana Pool | Affiliate | Prefer `https://manapool.com/card/{set}/{collector}/{slug}` for the anchor printing (set lowercased, slug from oracle name); append `ref` from `VITE_MANA_POOL_REF` when set. Fall back to `/search?q=…` with the same `ref` when path cannot be built. Deck editor Mass Entry link uses `add-deck` with the same `ref`. |
| TCGPlayer | Affiliate | Prefer `https://www.tcgplayer.com/product/{id}?page=1` using `PrintingDisplayColumns.tcgplayer_product_ids` (Scryfall `tcgplayer_id` / etched id from ETL). When `VITE_TCGPLAYER_IMPACT_ID`, `VITE_TCGPLAYER_AD_ID`, and `VITE_TCGPLAYER_PARTNER_SEGMENT` are set at build time, wrap that URL as Impact partner `https://partner.tcgplayer.com/c/{impact}/{ad}/{segment}?subId1=card-detail-page&u={encodeURIComponent(productUrl)}`. If product id is missing or partner config incomplete, fall back to TCGPlayer **search** (`/search/magic/product?q=…`). Deck editor Mass Entry uses `subId1=deck-editor-mass-entry` and optional `VITE_TCGPLAYER_MASS_ENTRY_URL` as `u` (default `https://www.tcgplayer.com/`). |

**Presentation:** Every External Links control label ends with the same **↗** suffix as “Try on Scryfall” on the results column (`app/src/ResultsActionsColumn.tsx`).

**Build / secrets:** Production values are passed via GitHub Actions into the Vite build (see `app/.env.example` and `.github/workflows/deploy.yml`): repository secrets `TCGPLAYER_IMPACT_ID`, `TCGPLAYER_AD_ID`, `TCGPLAYER_PARTNER_SEGMENT`, `MANA_POOL_ID` map to `VITE_*` client env vars.

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
4. **Card details** and **Printing details** use two-column tables; each query chip navigates to search with the correct string; **mana** chips for faces **with** a mana cost show **`m=`** plus symbolic mana on the label (with **`m`** and **`=`** query-syntax-highlighted like other chips) and **always** navigate with compact **`m=`** (never `m:`). Faces **with no** mana cost show italic **none** in the value column and **one** **`m=null`** chip (syntax-highlighted) in the chips column. **Color identity** human column and chip label use mana-font symbols (not raw WUBRG letter text); navigation remains `ci:` + compact letters. **§3–§4** navigate chips use **Spec 150**-aligned minimum height (`min-h-11`). **Single-faced** oracles use **one** rounded Card details panel per **Row catalog**. **Multi-faced** oracles use **separate** rounded panels with spacing: a **combined** panel (**Card name** `!"A // B"`, color identity, EDHREC, keywords, then **Color** (`c:`) when all canonical face color bitmasks are equal—**last** in that panel) plus **one panel per face** whose first row is **Face name** (no “Face:” subheading). Per-face panels include mana, **Type** chip sequence from **Type line tokens**, **Color** only when face color bitmasks **differ** across faces, and stats. No separate supertype / type / subtype rows. **Keywords** row is **always** present; when there are no keywords, the human-facing column shows italic **none** and the chips column has no `kw:` chips. **EDHREC rank** and **EDHREC salt** (when ranked/rated) each show **two** chips: raw value and percentile, as in the row catalog; when **not** ranked / **not** rated, each shows **one** chip (`edhrec=null` / `salt=null`) and **no** percentile chip. **Printing** price rows with **no** USD show **`$=null`** and **no** percentile chip.
5. **Outlinks** include Scryfall, EDHREC (commander when applicable per §5 table), EDHREC (card), Mana Pool, and TCGPlayer; affiliate URLs and ↗ labels per §5; fallbacks when env or product id is absent. Cards with no **`is:commander`** face row do **not** show **EDHREC (commander)**.
6. **Percentile** chips for `edhrec`, `salt`, and `$` are consistent with evaluator bands ([Spec 095](095-percentile-filters.md)).
7. **Spec 160** is updated with the final payload schema for chips and outlinks; tests or manual checklist verifies one event per gesture.

### Preparatory payload checklist (Spec 024)

Before building §3–§4 UI, the worker→main contract must include:

- `DisplayColumns.colors` and `keywords_for_face` (face-aligned; Spec 105 reverse derivation).
- `PrintingDisplayColumns.set_types` and `released_at` (anchor printing row); `tcgplayer_product_ids` for TCGPlayer affiliate product links.
- `get-artist-for-printing` / `artist-for-printing-result` for the illustrated-by row (Spec 148).
- Equality-percentile labels for `edhrec`, `salt`, and `$` chips per [Spec 095](095-percentile-filters.md) § Card detail.

---

## Technical details (implementation map)

| Area | Likely location |
|------|------------------|
| List actions (Moxfield preview) | `app/src/CardDetail.tsx` (or subcomponents); shared helper for **one** Moxfield line matching `serializeMoxfield` in `shared/src/list-serialize.ts` (avoid O(count) synthetic instances); `buildListSpans` + same span role classes as `app/src/ListHighlight.tsx`; responsive wrap (`min-w-0`, `whitespace-pre-wrap` on the primary line) |
| Section layout and chips | `app/src/CardDetail.tsx`, possible subcomponents |
| Chip styling / highlight | [Spec 150](150-chip-button-component.md) (`min-h-11` for §3–§4 query chips), `QueryHighlight` where applicable; `colorIdentityMaskToManaCostString` and `faceColorMasksUniform` in `shared/src/card-detail-chips.ts` for CI display strings and multi-face **Color** hoisting |
| Display columns / worker extract | `shared/src/worker-protocol.ts`, `shared/src/display-columns.ts`, worker init |
| Type line tokenization | New helper + `.test.ts` (split on whitespace / `—`; `t:` chips) |
| Keyword `kw:` chip navigation | `keywordAbilityToKwChipQuery` in [`shared/src/card-detail-chips.ts`](../../shared/src/card-detail-chips.ts) + `.test.ts` (quote when keyword contains whitespace; Spec 183 / Spec 002) |
| Mana cost → `m=` navigation | Shared helper + `.test.ts` (compact `m=` only; tested against parser acceptance) |
| Percentile display values | [Spec 095](095-percentile-filters.md) § Card detail; `shared/src/percentile-chip-display.ts` |
| Analytics | `app/src/analytics.ts` + Spec 160 |
| Affiliate outlinks | `app/src/affiliate-config.ts`, `app/src/affiliate-urls.ts`; `PrintingDisplayColumns.tcgplayer_product_ids` + ETL `printings.json` column |

---

## Implementation notes

- 2026-04-06: Prep payload checklist and normative pointers to [Spec 024](024-index-based-result-protocol.md), [Spec 048](048-printing-aware-display.md), [Spec 002](002-query-engine.md), [Spec 095](095-percentile-filters.md).
- 2026-04-06: Locked mana chip navigation to **`m=`** (not `m:`); **Keywords** row always visible with human italic **none** when empty; **EDHREC rank** and **salt** use **two** chips each (raw + `%`) when ranked/rated; Scryfall analytics schema choice called out in §5 and **Analytics (summary)**; added [Spec 136](136-nullable-face-fields.md) to **Related**.
- 2026-04-06: **Implemented.** Shared helpers in `shared/src/card-detail-chips.ts` (`tokenizeTypeLine`, `manaCostToCompactQuery`, `colorBitmaskToQueryLetters`). Worker percentile RPC via `get-card-detail-percentiles` / `card-detail-percentiles-result`. Artist wired via `artist-for-printing-result`. Unified `outlink` + `destination` analytics schema (Spec 160 updated); `scryfall_external` retained for backward compat but new Outlinks section uses `outlink`. EDHREC URLs use slug-based paths (`edhrec.com/cards/{slug}`, `edhrec.com/commanders/{slug}`).
- 2026-04-09: **§1 List actions** — Normative layout: three columns (decrement | Moxfield preview + italic caption | increment), `buildListSpans` / `ListHighlight` parity, wrapping, no `#Tag` on preview lines, printing caption includes USD or `(price data not available)`. **Implemented** in `app/src/CardDetail.tsx` (`CardDetailListRow`, `ListLineHighlight`) and `shared/src/list-serialize.ts` (`moxfieldPreviewLine`).
- 2026-04-09: **Cosmetics** — **Vertical order:** Oracle details above List actions (list actions immediately before Card details). **Chips:** §3–§4 query chips use Spec 150 `min-h-11` sizing. **Color identity:** value column and chip label use mana-font symbols via braced mana string helper; navigation unchanged (`ci:` + letters). **Mana cost chip:** label shows visible `m=` prefix before symbolic cost.
- 2026-04-09: **Per-face Color** — Same mana-symbol display and `c:` + symbols chip label as color identity (`colorIdentityMaskToManaCostString` on `colors[face]`).
- 2026-04-10: **Mana cost chip** — Spec clarification: the **`m`** and **`=`** prefix on the label must use the same field/operator syntax-highlight classes as [`QueryChip`](../../app/src/CardDetail.tsx) (`ROLE_CLASSES` from [`QueryHighlight.tsx`](../../app/src/QueryHighlight.tsx)); mana symbols after `=` unchanged. Implemented in `ManaQueryChip`.
- 2026-04-11: **Null-valued metrics** — When EDHREC rank, EDHREC salt, or printing USD is absent, card detail shows **`edhrec=null`**, **`salt=null`**, or **`$=null`** respectively (no percentile chip). Implemented in `CardDetail.tsx` query chip columns.
- 2026-04-11: **Card details layout (multi-face)** — Combined oracle rows and each face sit in **separate** rounded bordered panels with vertical gap; **Card name** / **Face name** row labels (uppercase in UI); removed inline **Face:** divider. Implemented in `CardDetail.tsx`.
- 2026-04-09: **Outlinks** — Trailing ↗ on all External Links buttons; Mana Pool card/search URLs with `ref` from env; TCGPlayer product + Impact partner wrap with `tcgplayer_product_ids` column in printings / `PrintingDisplayColumns`; shared helpers reused from Deck Editor format chips.
- 2026-04-09: **EDHREC (commander)** — Shown only when at least one face row matches **`is:commander`** (Spec 032). Main thread uses face-aligned `DisplayColumns.is_commander` precomputed at worker init via shared `faceRowMatchesIsCommander` (same predicate as `eval-is`); see Spec 024.
- 2026-04-10: **Multi-face Color (`c:`) hoisting** — When every canonical face’s `DisplayColumns.colors` bitmask is equal, **Color** appears once in the oracle / combined panel **after Keywords** (last row of that panel, for visual separation from **Color identity**); per-face panels omit **Color**. When any face differs (e.g. true DFCs), **Color** stays per face only. Examples in §3 updated (Aftermath vs Cecil-style DFC). Implemented via `faceColorMasksUniform` in `shared/src/card-detail-chips.ts` and `app/src/CardDetail.tsx`.
- 2026-04-10: **Mana cost (empty)** — Per-face **Mana cost** row: empty `mana_costs[face]` shows italic **none** in the value column and a single **`m=null`** query chip (syntax-highlighted via `QueryChip`, same as `edhrec=null` / `salt=null`). Non-empty faces unchanged (`ManaQueryChip`). Semantics: [Spec 136](136-nullable-face-fields.md); implemented in `app/src/CardDetail.tsx` (`CardDetailFaceFields`).
- 2026-04-10: **Card name / Face name query chips** — Normative: default `QueryChip` labels stay single-line truncated; **Card name** and **Face name** rows opt into multi-line wrapping (`wrapLabel`), `min-h-11` floor with taller chips when wrapped; chips `dd` uses `min-w-0`. Implemented in `app/src/CardDetail.tsx`.
- 2026-04-11: **Keyword `kw:` chips** — Multi-word Oracle keywords navigate with quoted values (e.g. `kw:"first strike"`); single-token keywords unchanged (`kw:infect`). Implemented via `keywordAbilityToKwChipQuery` in `shared/src/card-detail-chips.ts`, used from `app/src/CardDetail.tsx`. Row catalog §3 and Technical details table updated.
