# Spec 050: Printing-Aware Card Detail

**Status:** In Progress

**Depends on:** Spec 015 (Card Detail Page), Spec 046 (Printing Data Model), Spec 048 (Printing-Aware Display)

## Goal

Make the card detail page printing-aware. When a user navigates to a card detail from a printing-specific search result, the detail page should show that printing's image and metadata (set, rarity, finish, collector number, price) alongside the oracle card data (face details, format legality).

## Background

Spec 015 introduced the card detail page at `?card=<scryfall_id>`. The `scryfall_id` is the oracle card's Scryfall UUID, and the page shows oracle-level data: card image, face details (name, mana cost, type line, oracle text, stats), and format legality.

Spec 048 introduced printing-aware search results. When printing conditions are present (e.g., `set:mh2`), the result list shows printing-specific art crops and set badges. However, clicking a result still navigates to the canonical oracle card detail — the printing context is lost.

Issue: https://github.com/jimbojw/frantic-search/issues/38

## URL Scheme

The existing `?card=<scryfallId>` format is preserved. The `scryfallId` can now be either an oracle card ID or a printing-level Scryfall ID. Resolution order:

1. Try `scryfallIndex` (oracle-level). If found, show the oracle card view (existing behavior).
2. Try `printingScryfallIndex` (printing-level). If found, derive the canonical face index from `canonical_face_ref[printingIndex]` and show the printing-enhanced view.
3. Neither matches — show "Card not found."

This is backward-compatible: old URLs with oracle-level scryfall_ids continue to work unchanged.

## Navigation Changes

When navigating from search results to the card detail page, the scryfall_id passed to `navigateToCard()` depends on context:

| View mode | Printing context | scryfall_id used |
|---|---|---|
| Slim / Detail | No printing conditions | Oracle card's `scryfall_id` |
| Slim / Detail | Printing conditions present | First matching printing's `scryfall_id` |
| Full | Printing-expanded rows | Specific printing's `scryfall_id` |
| Images | No printing conditions | Oracle card's `scryfall_id` |
| Images | Printing-expanded grid | Specific printing's `scryfall_id` |

## CardDetail Changes

### Printing image

When a printing is identified, `CardDetail` uses the printing's `scryfall_id` for the card image and Scryfall external link instead of the oracle card's. The progressive loading strategy (art crop → normal image) is unchanged.

### Printing metadata panel

A new section appears between the card image and the face details when printing data is available:

| Field | Source |
|---|---|
| Set | `set_names[pi]` (`set_codes[pi]`) |
| Collector # | `collector_numbers[pi]` |
| Rarity | Decoded from `rarity[pi]` bitmask |
| Finish | Decoded from `finish[pi]` enum |
| Price | `price_usd[pi]` formatted as `$X.XX` (or "—" if 0) |

### Scryfall link

The external link updates to use the printing's scryfall_id when available, so it navigates to the specific printing's page on Scryfall.

### Fallback

When no printing data is available (oracle-level URL, or printings not yet loaded), the page renders identically to the existing behavior.

## Scope of Changes

| File | Change |
|---|---|
| `app/src/app-utils.ts` | Add `buildPrintingScryfallIndex()` utility. |
| `app/src/app-utils.test.ts` | Tests for new utility. |
| `app/src/App.tsx` | Add `printingScryfallIndex` memo. Update card detail resolution to try both indexes. Pass printing props to `CardDetail`. Update `navigateToCard()` call sites in printing branches. |
| `app/src/CardDetail.tsx` | Accept optional printing props. Show printing image and metadata panel. Update Scryfall link. |

## Acceptance Criteria

1. Clicking a search result in a printing context (e.g., `set:mh2`) navigates to `?card=<printingScryfallId>`.
2. The card detail page shows the printing's card image when a printing scryfall_id is in the URL.
3. The printing metadata panel (set, collector #, rarity, finish, price) is visible when a printing is identified.
4. The Scryfall external link points to the specific printing's page.
5. Old URLs with oracle-level scryfall_ids continue to work unchanged.
6. When printings data has not loaded, the page falls back to oracle-level display.
7. Browser back from a printing card detail returns to the search results.
