# Spec 050: Printing-Aware Card Detail

**Status:** Implemented

**Depends on:** Spec 015 (Card Detail Page), Spec 046 (Printing Data Model), Spec 048 (Printing-Aware Display)

**Related:** [Spec 166](166-card-detail-body-cleanup.md) — all-prints query chip, Scryfall ID row, body header cleanup.

## Goal

Make the card detail page printing-aware. When a user navigates to a card detail from a printing-specific search result, the detail page should show that printing's image and metadata (set, rarity, finish, collector number, price) alongside the oracle card data (face details, format legality).

## Background

Spec 015 introduced the card detail page at `?card=<scryfall_id>`. The `scryfall_id` is the oracle card's Scryfall UUID, and the page shows oracle-level data: card image, face details (name, mana cost, type line, oracle text, stats), and format legality.

Spec 048 introduced printing-aware search results. When printing conditions are present (e.g., `set:mh2`), the result list shows printing-specific art crops and set badges. However, clicking a result still navigates to the canonical oracle card detail — the printing context is lost.

Issue: https://github.com/jimbojw/frantic-search/issues/38

## URL Scheme

The existing `?card=<scryfallId>` format is preserved. The `scryfallId` can now be either an oracle card ID or a printing-level Scryfall ID. Resolution order:

1. Try `scryfallIndex` (oracle-level). If found, resolve the canonical face index directly.
2. Try `printingScryfallIndex` (printing-level). If found, derive the canonical face index from `canonical_face_ref[printingIndex]`.
3. Neither matches — show "Card not found."

In both cases, printing metadata is shown when the `scryfallId` exists in the printing data (via `printingScryfallGroupIndex`). This means foil and nonfoil variants of a printing — which share a `scryfall_id` — are shown together on the same detail page rather than requiring disambiguation.

This is backward-compatible: old URLs with oracle-level scryfall_ids continue to work unchanged.

## Navigation Changes

When navigating from search results to the card detail page, the scryfall_id passed to `navigateToCard()` depends on context:

| View mode | Printing context | scryfall_id used |
|---|---|---|
| Slim / Detail | No printing conditions | Oracle card's `scryfall_id` |
| Slim / Detail | Printing conditions present | First matching printing's `scryfall_id` |
| Full | Printing conditions, `unique:cards` (default) | First matching printing's `scryfall_id` (one per card) |
| Full | Printing conditions, `unique:prints` | Specific printing's `scryfall_id` for each row |
| Full | Printing conditions, `unique:art` | One `scryfall_id` per unique artwork |
| Images | No printing conditions | Oracle card's `scryfall_id` |
| Images | Printing conditions, `unique:cards` (default) | First matching printing's `scryfall_id` (one per card) |
| Images | Printing conditions, `unique:prints` | Specific printing's `scryfall_id` for each row |
| Images | Printing conditions, `unique:art` | One `scryfall_id` per unique artwork |

## CardDetail Changes

### Printing image

When a printing is identified, `CardDetail` uses the printing's `scryfall_id` for the card image instead of the oracle card's. The progressive loading strategy (art crop → normal image) is unchanged. The **Scryfall ID** row in metadata (Spec 166) uses the page `card` query id.

### Printing metadata panel

A new section appears between the card image and the face details when printing data is available. `CardDetail` receives all printing indices for the `scryfall_id` (via `buildPrintingScryfallGroupIndex`), not just the first.

Shared fields use the first printing index (anchor row for the page `scryfall_id`; [Spec 183](183-card-detail-sections-query-chips-outlinks.md) §4 uses the same index for printing-scoped query chips):

| Field | Source |
|---|---|
| Set | `set_names[pi]` (`set_codes[pi]`) |
| Set type / release | `set_types[pi]`, `released_at[pi]` when present on `PrintingDisplayColumns` ([Spec 024](024-index-based-result-protocol.md)) |
| Collector # | `collector_numbers[pi]` |
| Rarity | Decoded from `rarity[pi]` bitmask |
| Scryfall ID | URL `card` parameter (monospace + outlink to `scryfall.com/card/{id}`) — Spec 166 |

Finish and price depend on how many finish variants exist for that `scryfall_id`:

- **Single finish** (e.g., etched-only): show one Finish row and one Price row.
- **Multiple finishes** (e.g., nonfoil + foil): show one labeled price row per variant (e.g., "Nonfoil Price: $0.25", "Foil Price: $1.50"). No standalone Finish row — the finish is embedded in the price label.

### All prints chip

The **all prints** control is a query chip (Spec 166) that navigates to `!"{name}" unique:prints include:extras`. The `include:extras` modifier bypasses the default playable filter so non-tournament printings (gold-bordered, oversized, etc.) are shown. Images view is the default (Spec 058), so results display as a grid for browsing printings.

### Fallback

When no printing data is available (oracle-level URL, or printings not yet loaded), the page renders identically to the existing behavior.

## Scope of Changes

| File | Change |
|---|---|
| `app/src/app-utils.ts` | Add `buildPrintingScryfallIndex()` and `buildPrintingScryfallGroupIndex()` utilities. |
| `app/src/app-utils.test.ts` | Tests for new utilities. |
| `app/src/App.tsx` | Add `printingScryfallIndex` and `printingScryfallGroupIndex` memos. Update card detail resolution to try both indexes. Pass `printingIndices` (array) to `CardDetail`. Update `navigateToCard()` call sites in printing branches. |
| `app/src/CardDetail.tsx` | Accept `printingIndices?: number[]`. Show printing image and metadata panel with aggregated finish/price lines when multiple variants share a `scryfall_id`. |

## Acceptance Criteria

1. Clicking a search result in a printing context (e.g., `set:mh2`) navigates to `?card=<printingScryfallId>`.
2. The card detail page shows the printing's card image when a printing scryfall_id is in the URL.
3. The printing metadata panel (set, collector #, rarity, price) is visible when the scryfall_id exists in printing data — including for foil and nonfoil non-etched printings.
4. When multiple finish variants share a scryfall_id (e.g., nonfoil + foil), separate price lines are shown for each variant.
5. When a single finish variant exists (e.g., etched), a single Finish and Price row is shown.
6. The Scryfall ID outlink in metadata uses the page `card` id and opens the correct Scryfall card page (Spec 166).
7. Old URLs with oracle-level scryfall_ids continue to work unchanged.
8. When printings data has not loaded, the page falls back to oracle-level display.
9. Browser back from a printing card detail returns to the search results.
