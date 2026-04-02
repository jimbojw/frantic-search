# Spec 178: Default Search Inclusion Filter & `include:extras`

**Status:** Draft

**Supersedes:** [Spec 057](057-include-extras-default-playable-filter.md) (default "playable somewhere" filter). Spec 057 remains the historical reference for the original legality-based design and implementation notes.

**Related research:** [Scryfall default result filtering](../research/scryfall-default-result-filtering.md) ([GitHub #227](https://github.com/jimbojw/frantic-search/issues/227))

**Depends on:** Spec 002 (Query Engine), Spec 032 (`is:` Operator), Spec 046 (Printing Data Model), Spec 047 (Printing Query Fields), Spec 056 (Printing-Level Format Legality / `NON_TOURNAMENT_MASK`), Spec 170 (`is:content_warning`), ADR-009 (Bitmask-per-Node AST), ADR-019 (Scryfall parity by default)

**Unified by:** Spec 151 (Suggestion System)

**UI (accordion counts):** Spec 175 — optional `indicesBeforeDefaultFilter` / `printingIndicesBeforeDefaultFilter` on the worker `result` are the canonical source for **MATCHES** vs **SHOWING** (pre–default-filter vs post–default-filter counts). These fields replace the Spec 057 names `indicesIncludingExtras` / `printingIndicesIncludingExtras`; semantics are "before vs after this spec's default inclusion filter."

## Goal

Replace the Spec 057 **"playable somewhere"** rule — `(legal \| restricted)` in ≥1 format plus `NON_TOURNAMENT_MASK` — with a **default inclusion model** aligned to empirically observed Scryfall behavior: omit specific **layouts**, **`playtest` printings**, a **configurable wholesale omit-set list**, and **content-warning** oracles under default search, while preserving **`include:extras`** and tightening **explicit wideners** documented below.

Scryfall's full default pipeline is not fully documented and may depend on query shape (regex, quotes, cardinality). This spec intentionally targets the **card- and printing-centric passes** validated in the research doc; query-shape-specific fallthrough is **out of scope** unless listed in acceptance criteria or implementation notes.

## Background

Spec 057 assumed default Scryfall behavior could be approximated as "legal or restricted in some format." Research and API checks falsified that model: e.g. **Hurloon Wrangler** and **Amulet of Quoz** appear in default Scryfall search despite never being legal/restricted in bulk legalities, while **Goblin Polka Band** (`set:past`), **Gifts Given** (`set:hho`), **Goblin Savant** / **Lazier Goblin** (`promo_types: playtest`), and some **content-warning** cards are omitted under generic queries but recover with `include:extras`, `set:`, or targeted `is:` terms.

## Design

### What stays the same (from Spec 057)

1. **`include:extras`** — Parser and evaluator treat `include:extras` as a query modifier, not a filter; `EvalOutput.includeExtras` is set when a **positive** `include:extras` node exists in the AST (even-`NOT`-ancestors rule, same as all other wideners — see **Negation semantics** below). This **fixes** the Spec 057–era behavior where `_hasIncludeExtras` walked through `NOT` unconditionally, causing `-include:extras` to paradoxically bypass the default filter.
2. **`**` alias** — Continues to desugar to `include:extras` with `sourceText` preserved for the breakdown (Frantic-only).
3. **Bypass semantics** — When `includeExtras` is true for the combined pinned+live evaluation, **skip the entire default inclusion filter** and show all semantic matches (full widening).
4. **Worker protocol** — Pre-filter counts (`indicesBeforeDefaultFilter`, `printingIndicesBeforeDefaultFilter`) and empty-state / rider UX for "try `include:extras`" behave as in Spec 057 / 151 / 175, except prose should say **default result filter** or **default inclusion filter** where "playable filter" appeared. These fields replace the Spec 057 names `indicesIncludingExtras` / `printingIndicesIncludingExtras`.
5. **Non-tournament printings** — Spec 056 `NON_TOURNAMENT_MASK` (`GoldBorder` \| `Oversized`) remains a default omission pass: exclude matching printings unless **`include:extras`** is active **or** **positive `set:` / `s:`** widens that printing (same rule as other set-scoped passes). Example: **`set:wc01`** (World Championship Decks) should list gold-bordered printings **without** `include:extras`, matching Scryfall's "full set slice" behavior when a set is explicitly named.

### Default omission passes (when `includeExtras` is false)

Apply to each **candidate printing** when printing data is available (preferred path), and to **canonical face** rows when deriving face-only results. A candidate survives only if it passes **all** applicable passes (order is implementation-defined as long as the result is equivalent).

The **extras-layout set** is: `token`, `double_faced_token`, `art_series`, `vanguard`.

1. **Extras layouts** — Omit printings whose object layout is in the extras-layout set, **unless** extras-layout widening applies (below). Layout is resolved from the canonical face: for a printing at index `p`, look up `index.layouts[printingIndex.canonicalFaceRef[p]]` (printing-level layout is not stored; the canonical face layout is the same source used by `is:token` / layout `is:` evaluation).
2. **Playtest printings** — Omit printings that carry the Scryfall **`playtest`** promo type (encoded in printing promo-type bit columns per Specs 046 / 047), **unless** playtest widening applies (below).
3. **Wholesale omit sets** — Omit printings whose set code is in the configured **default omit-set list**. Initial codes: `past` (Astral), `hho` (Happy Holidays). The list lives in a single shared constant so new codes can be added when research confirms them. **Unless** set widening applies for that printing's set (below).
4. **Content-warning oracles** — Omit printings whose canonical face has `CardFlag.ContentWarning` (Spec 170), **unless** content-warning widening applies (below).
5. **Non-tournament mask** — Omit printings with `printingFlags & NON_TOURNAMENT_MASK !== 0` (Spec 056), **unless** set widening applies for that printing's set (below).

**Removed:** The Spec 057 requirement that a card face be **legal or restricted** in ≥1 format. Legality is no longer part of the default inclusion gate (users still filter formats with `f:` / `legal:` / etc.).

### Widening: restore categories without `include:extras`

When `includeExtras` is false, the following **disable** the corresponding default omissions (full query widens for that pass, or per-printing where noted):

| Widen | Effect |
|--------|--------|
| **`include:extras`** (or `**`) | Disables **all** default omission passes (unchanged). |
| **Positive `set:` / `s:`** | For a candidate printing, **do not** apply wholesale-set omission, default playtest omission, default content-warning omission, extras-layout omission, or `NON_TOURNAMENT_MASK` omission **for that printing** when the printing's set code is **positively constrained** by the query. **V1 rule:** a `set:` or `s:` FIELD node with operator `:` positively constrains a set code when (a) the node's value is a **case-insensitive prefix** of the printing's set code (matching `evalPrintingField` prefix semantics — so `set:wc0` widens `wc01`, and `set:w` widens all sets starting with `w`), **and** (b) the node has an **even number** (0, 2, 4, …) of `NOT` ancestors in the AST (so `set:arn` widens, `-set:arn` does not, and `-(-set:arn)` widens again). |
| **`is:<extras-layout>`** | A positive `is:` node whose keyword is in the extras-layout set (`token`, `dfctoken`, `art_series`, `vanguard`) disables the **extras-layout** default omission pass for the query. Structural detection mirrors `includeExtras`: walk the AST; a node with an even number of `NOT` ancestors (0, 2, …) counts as positive. |
| **`is:content_warning`** | Disables the **content-warning** default omission pass for the query (content-warning oracles are eligible like any other match). Structural detection: even number of `NOT` ancestors (same rule as above). |
| **`is:playtest`** | Disables the **playtest** default omission pass for the query. Structural detection: even number of `NOT` ancestors (same rule as above). |

### Negation semantics

**All** widener structural detection — including `include:extras` — uses the **even-`NOT`-ancestors** rule: a FIELD node is "positive" when it has zero or an even number of `NOT` ancestor nodes in the AST path to the root. This handles simple negation (`-set:arn` → 1 NOT → not positive), double negation (`-(-set:arn)` → 2 NOTs → positive), and passthrough under `AND` / `OR` (which do not contribute to the count).

This **replaces** the Spec 057–era `_hasIncludeExtras` helper, which walked through `NOT` unconditionally. Under that rule, `-include:extras` paradoxically set `includeExtras = true`, bypassing the entire default filter. The existing test ("include:extras inside NOT still sets the flag") should be updated to expect `false`.

### Evaluation plumbing

- Extend `EvalOutput` (or equivalent) with booleans **`widenExtrasLayout`**, **`widenContentWarning`**, and **`widenPlaytest`**, computed alongside `includeExtras`.
- **Set widening** is computed in the worker per printing: extract the set of **positively constrained set-code prefixes** from the AST (all `set:` / `s:` FIELD nodes with an even number of `NOT` ancestors), then for each candidate printing check whether any prefix matches its `setCodesLower` value. Implementation may precompute the prefix set once per search.

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
| `shared` `EvalOutput` | Add `widenExtrasLayout`, `widenContentWarning`, `widenPlaytest`; keep `includeExtras`. |
| `shared` `evaluator.ts` | AST helpers for new wideners using even-`NOT`-ancestors rule (parallel to `_hasIncludeExtras`). Extract positive set-code prefixes from the AST. |
| `app` `worker-search.ts` | Replace legality bitmask filter with omission passes + wideners; apply `NON_TOURNAMENT_MASK` when `!includeExtras` except where positive `set:` widens that printing's set. |
| `shared` `worker-protocol.ts` | Rename `indicesIncludingExtras` → `indicesBeforeDefaultFilter`, `printingIndicesIncludingExtras` → `printingIndicesBeforeDefaultFilter`. |
| App / docs | Wording: default inclusion vs playable-somewhere; reference Spec 178. |

## Acceptance Criteria

1. Default search (no `include:extras`) **includes** oracles that are never legal/restricted in bulk when they match the query, if they pass omission passes — e.g. **Hurloon Wrangler**, **Amulet of Quoz** — matching Scryfall for those probes.
2. Default search **excludes** **Goblin Polka Band** (`past`) for generic `goblin`-style queries without extras; **`set:past`** or **`include:extras`** restores it. (`is:playtest` does **not** restore Goblin Polka Band — it is wholesale-set omitted, not playtest omitted.)
3. Default search **excludes** playtest promo printings (e.g. **Goblin Savant**, **Lazier Goblin**) for generic `goblin` without extras; **`is:playtest`** or **`include:extras`** or positive **`set:`** for the printing's set restores per widening rules.
4. Default search **excludes** **Gifts Given** for bare **`gifts`** without extras; **`set:hho`** or **`include:extras`** (and regex-name parity if deferred, document divergence) restores visibility consistent with research.
5. **`is:content_warning`** in the query disables default content-warning suppression so targeted searches list those oracles without requiring `include:extras`.
6. **`include:extras`** and **`**` still bypass the entire default inclusion filter; unknown `include:` values still error.
7. **`NON_TOURNAMENT_MASK` printings** (gold-bordered, oversized, 30A-style back per Spec 056) **remain excluded** for set-agnostic default queries when `includeExtras` is false; **positive `set:`** for that printing's set code (e.g. **`set:wc01`**) shows them **without** `include:extras`, consistent with Scryfall listing the full named set.
8. Extras layouts (`token`, `double_faced_token`, `art_series`, `vanguard`) are excluded by default; **`is:token`** (or other `is:<extras-layout>` keywords) or **`include:extras`** restores them. Example: **`is:token goblin`** returns goblin tokens.
9. Set widening uses **prefix matching** consistent with `evalPrintingField`: `set:w` widens all sets whose code starts with `w`, so partially typed set codes do not suppress results that would appear once the full code is entered.
10. Pre/post counts (`indicesBeforeDefaultFilter` / `printingIndicesBeforeDefaultFilter`) and Spec 175 **MATCHES** / **SHOWING** split still reflect pre–default-filter vs visible results when the filter removes at least one card or printing.
11. Spec 057 is marked **Superseded**; ADR-019 and the research doc reference this spec for default filtering behavior going forward.

## Implementation Notes

- (none yet — append when implementation deviates from the above.)
