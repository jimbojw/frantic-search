# Spec 178: Default Search Inclusion Filter & `include:extras`

**Status:** Implemented

**Supersedes:** [Spec 057](057-include-extras-default-playable-filter.md) (default "playable somewhere" filter). Spec 057 remains the historical reference for the original legality-based design and implementation notes.

**Related research:** [Scryfall default result filtering](../research/scryfall-default-result-filtering.md) ([GitHub #227](https://github.com/jimbojw/frantic-search/issues/227))

**Depends on:** Spec 002 (Query Engine), Spec 032 (`is:` Operator), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), Spec 179 (`set_type:` / `st:`), Spec 170 (`is:content_warning`), ADR-009 (Bitmask-per-Node AST), ADR-019 (Scryfall parity by default)

**Supersedes additionally:** [Spec 056](056-printing-level-format-legality.md) (Printing-Level Format Legality / `NON_TOURNAMENT_MASK`). Spec 056's printing-domain format gating and `NON_TOURNAMENT_MASK` are replaced by this spec's default omission passes. Spec 056's `PrintingFlag.GoldBorder`, `PrintingFlag.Oversized`, and `is:oversized` survive independently.

**Unified by:** Spec 151 (Suggestion System)

**UI (accordion counts):** Spec 175 — optional `indicesBeforeDefaultFilter` / `printingIndicesBeforeDefaultFilter` on the worker `result` are the canonical source for **MATCHES** vs **SHOWING** (pre–default-filter vs post–default-filter counts). These fields replace the Spec 057 names `indicesIncludingExtras` / `printingIndicesIncludingExtras`; semantics are "before vs after this spec's default inclusion filter."

## Goal

Replace the Spec 057 **"playable somewhere"** rule — `(legal \| restricted)` in ≥1 format plus `NON_TOURNAMENT_MASK` — with a **default inclusion model** aligned to empirically observed Scryfall behavior: omit specific **layouts**, **`playtest` printings**, printings whose set has Scryfall **`set_type: memorabilia`**, a **short explicit omit-set code list** for non-memorabilia wholesale omissions, and **content-warning** oracles under default search, while preserving **`include:extras`** and tightening **explicit wideners** documented below.

Scryfall's full default pipeline is not fully documented and may depend on query shape (regex, quotes, cardinality). This spec intentionally targets the **card- and printing-centric passes** validated in the research doc; query-shape-specific fallthrough is **out of scope** unless listed in acceptance criteria or implementation notes.

## Background

Spec 057 assumed default Scryfall behavior could be approximated as "legal or restricted in some format." Research and API checks falsified that model: e.g. **Hurloon Wrangler** and **Amulet of Quoz** appear in default Scryfall search despite never being legal/restricted in bulk legalities, while **Goblin Polka Band** (`set:past`), **Gifts Given** (`set:hho`), **Goblin Savant** / **Lazier Goblin** (`promo_types: playtest`), and some **content-warning** cards are omitted under generic queries but recover with `include:extras`, `set:`, or targeted `is:` terms.

## Design

### What stays the same (from Spec 057)

1. **`include:extras`** — Parser and evaluator treat `include:extras` as a query modifier, not a filter; `EvalOutput.includeExtras` is set when a **positive** `include:extras` node exists in the AST (even-`NOT`-ancestors rule, same as all other wideners — see **Negation semantics** below). This **fixes** the Spec 057–era behavior where `_hasIncludeExtras` walked through `NOT` unconditionally, causing `-include:extras` to paradoxically bypass the default filter.
2. **`**` alias** — Continues to desugar to `include:extras` with `sourceText` preserved for the breakdown (Frantic-only).
3. **Bypass semantics** — When `includeExtras` is true for the combined pinned+live evaluation, **skip the entire default inclusion filter** and show all semantic matches (full widening).
4. **Worker protocol** — Pre-filter counts (`indicesBeforeDefaultFilter`, `printingIndicesBeforeDefaultFilter`) and empty-state / rider UX for "try `include:extras`" behave as in Spec 057 / 151 / 175, except prose should say **default result filter** or **default inclusion filter** where "playable filter" appeared. These fields replace the Spec 057 names `indicesIncludingExtras` / `printingIndicesIncludingExtras`.
5. **Format/legality is oracle-level** — `f:` / `legal:` / `banned:` / `restricted:` evaluate in the face (oracle) domain only. Scryfall's `legalities` object is a card-level property; printing-level hiding of gold-bordered and oversized printings belongs in this spec's default omission passes, not in format evaluation. This supersedes Spec 056's printing-domain format gating and deletes `NON_TOURNAMENT_MASK`. Evidence: `!"Static Orb" unique:prints` (5 results, no gold-bordered) vs `!"Static Orb" unique:prints include:extras` (6, WC01 recovers) and `!"Static Orb" unique:prints set:wc01` (1, set widening recovers). Analogous for oversized: `!"All Hallow's Eve" unique:prints` excludes OLEP; `set:olep` or `include:extras` recovers it.

### Default omission passes (when `includeExtras` is false)

Apply to each **candidate printing** when printing data is available (preferred path), and to **canonical face** rows when deriving face-only results. A candidate survives only if it passes **all** applicable passes (order is implementation-defined as long as the result is equivalent).

The **extras-layout set** is: `token`, `double_faced_token`, `art_series`, `vanguard`.

**Per-printing omission gate (passes 1–5):** For each candidate printing, default omissions **1** through **5** below are skipped when **either** (a) **printing-wide** widening is true for that printing (`set:` / `st:` / `set_type:` prefix rules — the **`wide`** flag in implementation), **or** (b) **extras-layout full widening** is true: `EvalOutput.widenExtrasLayout` is set (a **positive** `is:` / `not:` node whose **Spec 032 expanded keyword set** includes any extras-layout keyword — see widening table) **and** the printing’s canonical face layout is in the extras-layout set. Layout is resolved from the canonical face: for a printing at index `p`, look up `index.layouts[printingIndex.canonicalFaceRef[p]]` (same source as `is:token` / layout `is:` evaluation). When the gate is open for a row, **all** of passes **1–5** are skipped for that printing—same effect as printing-wide widening for that row only, without widening unrelated printings.

1. **Extras layouts** — Omit printings whose object layout is in the extras-layout set, **unless** the per-printing omission gate is open for that printing (printing-wide **or** extras-layout full widening).
2. **Playtest printings** — Omit printings that carry the Scryfall **`playtest`** promo type (encoded in printing promo-type bit columns per Specs 046 / 047), **unless** the per-printing omission gate is open **or** query-level **playtest widening** applies (`is:playtest` — below).
3. **Wholesale omissions (set type + explicit codes)** — Two parts; **unless** the per-printing omission gate is open:
   - **3a — Memorabilia `set_type`:** Omit printings whose set's Scryfall **`set_type`** is the token **`memorabilia`** (from `set_lookup` / `PrintingIndex.setTypesLower`, lowercase at ETL). Match using the same **`normalizeForResolution`** equality as used for `set_type:` query matching against the literal token (empty or missing `set_type` on legacy wire data is **not** memorabilia).
   - **3b — Explicit omit codes:** Omit printings whose set code is in **`DEFAULT_OMIT_SET_CODES`** — codes that Scryfall still hides by default but whose **`set_type` is not `memorabilia`** (see [research table](../research/scryfall-default-result-filtering.md#wholesale-omit-codes-vs-scryfall-set_type-frantic-spec-178)). As of the structural pass, this list is **`past`** (Astral; Scryfall `set_type` `box`) and **`hho`** (Happy Holidays; `funny`). New codes are added when research confirms them. Gold-bordered and similar product lines that are **`memorabilia`** in Scryfall are covered by **3a** only.
4. **Content-warning oracles** — Omit printings whose canonical face has `CardFlag.ContentWarning` (Spec 170), **unless** the per-printing omission gate is open **or** query-level **content-warning widening** applies (`is:content_warning` — below).
5. **Oversized printings** — Omit printings with `printingFlags[p] & PrintingFlag.Oversized`, **unless** the per-printing omission gate is open **or** query-level **oversized widening** applies (`is:oversized` — below). This replaces the former `NON_TOURNAMENT_MASK` `Oversized` bit; oversized printings span many sets (commander precons, planechase, archenemy, promos) so a per-printing flag check is required rather than set-based omission.

**Removed:** The Spec 057 requirement that a card face be **legal or restricted** in ≥1 format. Legality is no longer part of the default inclusion gate (users still filter formats with `f:` / `legal:` / etc.).

### Widening: restore categories without `include:extras`

When `includeExtras` is false, the following **disable** the corresponding default omissions (full query widens for that pass, or per-printing where noted):

| Widen | Effect |
|--------|--------|
| **`include:extras`** (or `**`) | Disables **all** default omission passes (unchanged). |
| **Positive `set:` / `s:` / `e:`** | Contributes **set-code prefix** widening. For a candidate printing, **do not** apply wholesale omissions (**3a** and **3b**), default playtest omission, default content-warning omission, extras-layout omission, or oversized omission **for that printing** when the printing's set code is **positively constrained** by the query. **Rule:** a `set` FIELD (including aliases `s`, `e`, `edition`) with operator `:` positively constrains when (a) the normalized value is a **non-empty prefix** of the printing's normalized set code (matching `evalPrintingField` / `normalizeForResolution` — so `set:wc0` widens `wc01`, and `set:w` widens all codes starting with `w`), **and** (b) the node has an **even number** of `NOT` ancestors (so `set:arn` widens, `-set:arn` does not, and `-(-set:arn)` widens again). Empty `set:` value does not add a widener (same as no positive prefix). |
| **Positive `set_type:` / `st:`** | Contributes **set-type prefix** widening, **combined** with set-code widening into one per-printing **wide** flag. **Rule:** a `set_type` FIELD (alias `st`) with operator `:` or `=` positively constrains when (a) the normalized value is **non-empty** and `normalizeForResolution(printing.set_type).startsWith(normalizeForResolution(node.value))` (identical to `evalPrintingField` **`set_type`** matching — e.g. `st:m` matches `masters` and `memorabilia`), **and** (b) the node has an **even number** of `NOT` ancestors. When **wide** is true for a printing, **all** the same passes are skipped for that printing as for positive `set:` (wholesale **3a/3b**, playtest, content-warning, extras-layout, oversized). Empty `set_type:` (match-all-typed printings in search) does **not** add a widener. |
| **`is:<extras-layout>`** | A positive `is:` or `not:` node whose **Spec 032 prefix-expanded** keyword set includes **any** member of the extras-layout set (`token`, `dfctoken` / `double_faced_token`, `art_series`, `vanguard`) sets `widenExtrasLayout`. For **each printing whose canonical face layout is in the extras-layout set**, the **per-printing omission gate** opens: passes **1–5** are skipped for that printing (same as printing-wide `set:` / `st:` widening for that row)—including memorabilia (**3a**), wholesale codes (**3b**), playtest, content-warning, and oversized. Does **not** widen normal-layout printings. Structural detection mirrors `includeExtras`: walk the AST; a node with an even number of `NOT` ancestors (0, 2, …) counts as positive. |
| **`is:content_warning`** | Disables the **content-warning** default omission pass for the query when a positive `is:` / `not:` node’s **expanded set** (Spec 032) includes **`content_warning`**. Structural detection: even number of `NOT` ancestors (same rule as above). |
| **`is:playtest`** | Disables the **playtest** default omission pass for the query when a positive `is:` / `not:` node’s **expanded set** includes **`playtest`**. Structural detection: even number of `NOT` ancestors (same rule as above). |
| **`is:oversized`** | Disables the **oversized** default omission pass for the query when a positive `is:` / `not:` node’s **expanded set** includes **`oversized`**. Structural detection: even number of `NOT` ancestors (same rule as above). |

### Negation semantics

**All** widener structural detection — including `include:extras` — uses the **even-`NOT`-ancestors** rule: a FIELD node is "positive" when it has zero or an even number of `NOT` ancestor nodes in the AST path to the root. This handles simple negation (`-set:arn` → 1 NOT → not positive), double negation (`-(-set:arn)` → 2 NOTs → positive), and passthrough under `AND` / `OR` (which do not contribute to the count).

This **replaces** the Spec 057–era `_hasIncludeExtras` helper, which walked through `NOT` unconditionally. Under that rule, `-include:extras` paradoxically set `includeExtras = true`, bypassing the entire default filter. The existing test ("include:extras inside NOT still sets the flag") should be updated to expect `false`.

### Evaluation plumbing

- Extend `EvalOutput` (or equivalent) with booleans **`widenExtrasLayout`**, **`widenContentWarning`**, **`widenPlaytest`**, and **`widenOversized`**, computed alongside `includeExtras`.
- **`positiveSetPrefixes`:** normalized non-empty prefixes from positive **`set:`** / **`s:`** / **`e:`** / **`edition:`** `:` nodes (even `NOT` depth), via `_collectPositiveSetPrefixes` / `normalizeForResolution`.
- **`positiveSetTypePrefixes`:** normalized non-empty prefixes from positive **`set_type:`** / **`st:`** `:` or `=` nodes (even `NOT` depth), same normalization as **`set_type`** query matching.
- **Per-printing wide flag** (worker / CLI parity): `wide = setWide || typeWide` where `setWide` ⇔ some `positiveSetPrefixes[i]` is a prefix of `setCodesLower[p]` (per current `startsWith` on stored lowercase code), and `typeWide` ⇔ some prefix satisfies `normalizeForResolution(setTypesLower[p]).startsWith(prefix)` (Spec 179). Pinned + live queries: merge both prefix arrays from pinned and live `EvalOutput` the same way as for `positiveSetPrefixes`.
- **Per-printing effective widening for passes 1–5:** `printingPassesDefaultInclusionFilter` (and equivalents) should treat a row as passing all five passes when `wide || (widenExtrasLayout && layout ∈ EXTRAS_LAYOUT_SET)` (layout from canonical face for that printing). Query-level flags `widenPlaytest`, `widenContentWarning`, `widenOversized` still apply when the gate is closed for that row.

### `runSearch` integration

Mirror Spec 057 **structure**:

1. If `includeExtras` from pinned or live evaluation: skip default inclusion filter; do not populate pre-filter count fields unless another modifier later reintroduces a split (none in this spec).
2. Otherwise: compute pre-filter counts, apply default inclusion passes to `rawPrintingIndices` when present (derive face list from surviving printings when printing conditions exist), else apply face-level passes to `deduped` consistent with printing availability.
3. Histograms and sorting use **post–default-filter** indices.

### Documentation and compliance

- Update user-facing copy that said "playable" default to **default result filter** / **Scryfall-style default exclusions** where accurate.
- Extend compliance / diff workflows to assert anchors from the research doc (e.g. `hurloon`, `amulet`, `goblin` vs `include:extras`, `set:past`, `is:playtest`, `is:content_warning`, `is:token`, `set:arn` slices).
- Known **non-targets** for v1: query-shape-only Scryfall differences (e.g. bare `gifts` vs `name:/^gifts/`), empty-result fallthrough, and the full wholesale omit-set universe until enumerated.

## Changes by Layer (implementation checklist)

| Area | Action |
|------|--------|
| `shared` `EvalOutput` | Add `widenExtrasLayout`, `widenContentWarning`, `widenPlaytest`, `widenOversized`; keep `includeExtras`. Add **`positiveSetTypePrefixes`**. |
| `shared` `evaluator.ts` | AST helpers for wideners; **`_collectPositiveSetPrefixes`** and **`_collectPositiveSetTypePrefixes`**. |
| `shared` `default-filter.ts` / **`default-inclusion-filter.ts`** | Memorabilia constant + helpers; shared **printing survives default filter** predicate for worker / CLI / alternative eval. |
| `shared` `eval-printing.ts` | Delete `NON_TOURNAMENT_MASK`, `FACE_FALLBACK_PRINTING_FIELDS`, and printing-domain `legal`/`banned`/`restricted` cases. Format/legality returns to face-domain-only (`eval-leaves.ts`). |
| `app` `worker-search.ts` | Replace `NON_TOURNAMENT_MASK` pass with oversized pass (`PrintingFlag.Oversized`) gated by `!widenOversized && !setWide`. |
| `shared` `worker-protocol.ts` | Rename `indicesIncludingExtras` → `indicesBeforeDefaultFilter`, `printingIndicesIncludingExtras` → `printingIndicesBeforeDefaultFilter`. |
| App / docs | Wording: default inclusion vs playable-somewhere; reference Spec 178. |

## Acceptance Criteria

1. Default search (no `include:extras`) **includes** oracles that are never legal/restricted in bulk when they match the query, if they pass omission passes — e.g. **Hurloon Wrangler**, **Amulet of Quoz** — matching Scryfall for those probes.
2. Default search **excludes** **Goblin Polka Band** (`past`) for generic `goblin`-style queries without extras; **`set:past`** or **`include:extras`** restores it. (`is:playtest` does **not** restore Goblin Polka Band — it is wholesale-set omitted, not playtest omitted.)
3. Default search **excludes** playtest promo printings (e.g. **Goblin Savant**, **Lazier Goblin**) for generic `goblin` without extras; **`is:playtest`** or **`include:extras`** or positive **`set:`** for the printing's set restores per widening rules.
4. Default search **excludes** **Gifts Given** for bare **`gifts`** without extras; **`set:hho`** or **`include:extras`** (and regex-name parity if deferred, document divergence) restores visibility consistent with research.
5. **`is:content_warning`** in the query disables default content-warning suppression so targeted searches list those oracles without requiring `include:extras`.
6. **`include:extras`** and **`**` still bypass the entire default inclusion filter; unknown `include:` values still error.
7. **Gold-bordered product-line printings** (WCD, CE, CEI, 30A, PTC, PSSC) and **`xana`** (Arena NPE Extras) have Scryfall **`set_type: memorabilia`**; they are excluded by default pass **3a** for set-agnostic queries when `includeExtras` is false. **Positive `set:`** (e.g. **`set:wc01`**) or **positive `st:`** / **`set_type:`** whose prefix matches that printing's type (e.g. **`st:mem`**, **`st:m`**) shows them **without** `include:extras**, consistent with Scryfall listing the full named set / type slice. **Oversized printings** are excluded via the oversized omission pass; **`is:oversized`**, **printing-wide widening**, or **`include:extras`** restores them.
7a. **`f:commander set:wc01 unique:prints`** returns gold-bordered printings of Commander-legal cards. Format evaluation is oracle-level (Spec 056 superseded); **printing-wide** widening disables wholesale omissions for `wc01`. This matches Scryfall behavior and fixes a prior bug where printing-domain format gating prevented set widening from recovering gold-bordered printings.
8. Extras layouts (`token`, `double_faced_token`, `art_series`, `vanguard`) are excluded by default; **`is:token`** (or other `is:<extras-layout>` keywords) or **`include:extras`** restores them. Example: **`is:token goblin`** returns goblin tokens.
8a. **Extras-layout `is:` full re-inclusion:** **`is:art_series`** (and other positive extras-layout `is:` keywords) restores matching printings **even when** they would otherwise be omitted for memorabilia (**3a**), wholesale set codes (**3b**), playtest promo type, content-warning face flag, or oversized printing flag—because the per-printing omission gate opens for those rows. Example: art-series layout printings in memorabilia sets appear under **`is:art_series`** without **`include:extras`** or **`st:mem`**. Similarly, **`is:token`** restores tokens in **`memorabilia`**, **`hho`**, or **`past`** sets when the token’s canonical face layout is in the extras-layout set.
9. Set-code widening uses **prefix matching** consistent with `evalPrintingField`: `set:w` widens all sets whose code starts with `w`, so partially typed set codes do not suppress results that would appear once the full code is entered.
9a. **Set-type widening** uses the same **normalized-prefix** rules as **`set_type:`** evaluation: e.g. **`st:m`** widens printings whose type starts with **`m`** (including **`memorabilia`**), so partial typing toward `memorabilia` widens memorabilia printings in step with live query behavior.
10. Pre/post counts (`indicesBeforeDefaultFilter` / `printingIndicesBeforeDefaultFilter`) and Spec 175 **MATCHES** / **SHOWING** split still reflect pre–default-filter vs visible results when the filter removes at least one card or printing.
11. Pinned + live query: **`positiveSetTypePrefixes`** from both evaluations are merged like **`positiveSetPrefixes`** (union of prefix lists when both queries contribute).
12. Spec 057 is marked **Superseded**; ADR-019 and the research doc reference this spec for default filtering behavior going forward.

## Implementation Notes

- 2026-04-02: **`is:` / `not:`** widener detection uses **Spec 032 prefix expansion** over the `is:` vocabulary (any expanded keyword in the widener set triggers the flag), not Spec 103 unique-prefix resolution only.
- Playtest promo type is checked via `promoTypesFlags1[p] & 1` (column 1, bit 0 per `PROMO_TYPE_FLAGS`).
- `worker-alternative-eval.ts` (suggestion count estimation) updated to use the same default-inclusion logic with wideners from the alternative query's own `EvalOutput`.
- `_hasIncludeExtras` replaced by generic `_isPositiveInAst` helper in `evaluator.ts`; the same helper computes all widener booleans including `widenOversized`.
- Positive set prefixes are collected via `_collectPositiveSetPrefixes` using `normalizeForResolution` (matching `evalPrintingField` set: prefix semantics). Positive set-type prefixes via **`_collectPositiveSetTypePrefixes`** (canonical **`set_type`**, operators `:` and `=`). Collection is **AST-only**; a positive **`set:`** / **`st:`** node may now be a **query leaf error** when the prefix matches no rows (Spec 047 / 179), but widening keys are still derived from the AST shape (bogus prefixes still match no rows for widening).
- Constants (`EXTRAS_LAYOUT_SET`, `DEFAULT_OMIT_SET_CODES`, `DEFAULT_OMIT_SET_TYPE_MEMORABILIA`, `EXTRAS_LAYOUT_IS_KEYWORDS`) and helpers **`isMemorabiliaDefaultOmit`**, **`isSetTypeWidenedByPrefixes`** live in `shared/src/search/default-filter.ts`. Shared **`printingPassesDefaultInclusionFilter`** (or equivalent) in `shared/src/search/default-inclusion-filter.ts` keeps worker, alternative eval, and CLI `normalizeLocalParity` aligned. Implementation: **`effectiveWide = wide || (widenExtrasLayout && EXTRAS_LAYOUT_SET.has(layout))`**; when **`effectiveWide`**, the row passes all five default omission checks; otherwise apply passes **1–5** with query-level **`widenPlaytest`**, **`widenContentWarning`**, **`widenOversized`** as today.
- `NON_TOURNAMENT_MASK` retired: gold-bordered **memorabilia** sets use default pass **3a**; non-memorabilia wholesale codes remain in `DEFAULT_OMIT_SET_CODES`. Oversized pass uses `PrintingFlag.Oversized` directly. `FACE_FALLBACK_PRINTING_FIELDS` deleted; `legal`/`banned`/`restricted` removed from `PRINTING_FIELDS` in `eval-printing.ts` — format evaluation is face-domain only via `eval-leaves.ts`. `list-mask-builder.ts` canonical printing heuristic inlines `PrintingFlag.GoldBorder | PrintingFlag.Oversized` directly.
