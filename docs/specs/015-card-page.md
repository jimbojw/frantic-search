# Spec 015: Card Detail Page

**Status:** Implemented

**Depends on:** Spec 013 (URL State & History)

## Goal

Give users a dedicated view for a single card, showing the largest, most legible version of the card data available. In the happy path (online), this means full-size card art from Scryfall. In the offline path, it means a well-formatted text layout using the data already in `columns.json`, with the art crop image from the PWA cache if available.

## Background

Today, tapping a card name in the result list opens Scryfall in a new tab. This works but is disorienting on mobile (tab switch, load time, unfamiliar UI) and fails offline. The columnar dataset already contains all the textual card data — name, mana cost, type line, oracle text, power/toughness, colors. The only thing missing is high-resolution card imagery, which Scryfall's CDN provides via predictable URLs derived from the `scryfall_id`.

### Data already available (offline-safe)

From `columns.json` via `CardResult`:

| Field | Source |
|---|---|
| Card name (per face) | `names[i]` |
| Mana cost (per face) | `mana_costs[i]` |
| Type line (per face) | `type_lines[i]` |
| Oracle text (per face) | `oracle_texts[i]` |
| Color identity | `color_identity[i]` |
| Power / Toughness | `power_lookup[powers[i]]` / `toughness_lookup[toughnesses[i]]` |
| Loyalty | `loyalty_lookup[loyalties[i]]` |
| Defense | `defense_lookup[defenses[i]]` |
| Scryfall ID | `scryfall_ids[i]` |

### Data requiring network

| Asset | URL pattern | Size |
|---|---|---|
| Art crop (small, 626×457) | `cards.scryfall.io/art_crop/front/{id[0]}/{id[1]}/{id}.jpg` | ~30–60 KB |
| Normal card image (488×680) | `cards.scryfall.io/normal/front/{id[0]}/{id[1]}/{id}.jpg` | ~60–100 KB |
| Large card image (672×936) | `cards.scryfall.io/large/front/{id[0]}/{id[1]}/{id}.jpg` | ~100–200 KB |

The art crop is likely cached by the PWA's stale-while-revalidate strategy (ADR-016) if the user has seen the card in search results. The normal/large images are not cached until first viewed.

## URL Format

```
?card=<scryfall_id>&q=<encoded_query>
```

The `q` parameter preserves the search context so that back returns to the filtered result list. The `scryfall_id` identifies the card.

Example: `?card=f3bb6b12-1e55-4bff-a153-671ebc6d2800&q=t%3Aangel`

## Navigation Flow

```
search (?q=t:angel) → tap card → card (?card=f3bb…&q=t%3Aangel) → back → search (?q=t:angel)
```

Tapping a card in the result list calls `pushState` (Spec 013). The back button or gesture returns to the search results with the same query.

## Layout

The card detail page is a single-column scrollable view within the same `max-w-2xl` container.

### Header

- Back arrow (←) on the left, calls `history.back()`.
- Card name as the title.
- Scryfall external link (↗) on the right, for users who want the full Scryfall page. Uses `https://scryfall.com/card/{id}` format.

### Card Image Section

This section implements progressive loading with graceful degradation:

1. **Immediate:** Show the art crop at a larger size than the result list thumbnail. If the art crop is in the PWA cache, it appears instantly. If not, the color identity gradient placeholder is shown while it loads.
2. **Then:** Attempt to load the `normal` (488×680) card image. On success, crossfade from the art crop to the full card image.
3. **On failure:** Stay on the art crop (or placeholder). Show a subtle "Full card image unavailable" message. No error dialogs.

For multi-face cards (transform, modal DFC, adventure, split), show a face toggle or tab bar so the user can switch between front and back images. The URL scheme `cards.scryfall.io/normal/back/{id[0]}/{id[1]}/{id}.jpg` provides the back face image.

### Card Data Section

Below the image, show a well-formatted text layout of the card data:

- **Name and mana cost** — large text, mana symbols rendered inline (reusing the existing `ManaCost` component).
- **Type line** — below the name.
- **Oracle text** — full rules text with mana symbols (reusing `OracleText`).
- **Power / Toughness** (if applicable) — displayed as `P/T` in the bottom-right of the oracle text box, matching the physical card layout.
- **Loyalty / Defense** (if applicable) — same treatment.

For multi-face cards, show all faces in sequence (stacked vertically), each with its own name, cost, type, and oracle text. The face toggle in the image section and the text sections scroll together.

### Format Legality

A compact grid showing format legality status. The data is available as bitmasks in `columns.json` (`legalities_legal`, `legalities_banned`, `legalities_restricted`). Format names from `bits.ts`.

Each format is shown as a label with a status indicator: legal (green), banned (red), restricted (yellow), not legal (gray). Only show formats where the card has a non-default status, or show all in a collapsible section.

## Worker Protocol Changes

The card detail page needs power/toughness/loyalty/defense as resolved strings, not just the dict-encoded indices currently in `CardResult`. Two options:

### Option A: Extend `CardResult`

Add optional fields to `CardFace`:

```typescript
export type CardFace = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
}
```

These are already computed by the worker when building results — the lookup tables are right there. The additional data per card is small (a few extra string fields on ~200 results).

### Option B: Separate "card detail" message

A new `ToWorker` / `FromWorker` message pair that fetches full detail for a single card by scryfall ID. More efficient if we add more card-level data later (printings, prices, etc.), but overkill for now.

**Recommendation:** Option A. The extra fields are tiny, always available, and avoid a second round-trip to the worker.

### Legality data

Legality bitmasks are per-face in `columns.json` but card-level in practice (duplicated across faces). Add a `legalities` field to `CardResult`:

```typescript
export type CardResult = {
  scryfallId: string
  colorIdentity: number
  faces: CardFace[]
  legalities?: { legal: number; banned: number; restricted: number }
}
```

The worker populates this from the canonical face's bitmask columns. The card detail page decodes the bitmasks using the `FORMAT_NAMES` constant from `bits.ts` (already exported from `shared`).

## Image Caching

The PWA already caches `cards.scryfall.io` images with stale-while-revalidate and a 500-entry LRU (ADR-016). Art crops seen in search results are cached. The card detail page's `normal` image is a different URL and will be fetched fresh, but it will also be cached after the first view.

No additional service worker configuration is needed. The existing runtime caching rule matches all `cards.scryfall.io` URLs.

## Offline Behavior

| Component | Online | Offline (cached art crop) | Offline (no cache) |
|---|---|---|---|
| Card image | Full `normal` size loads | Art crop from cache | Color identity placeholder |
| Card data (name, type, oracle, P/T) | Shown | Shown | Shown |
| Format legality | Shown | Shown | Shown |
| Scryfall link | Works | Shows but won't load | Shows but won't load |

All textual card data is available offline from `columns.json`. The image is the only component that degrades. The page is fully functional without any network access — it just looks less pretty.

## Acceptance Criteria

1. Tapping a card in the result list navigates to the card detail view (`?card=<id>&q=...`).
2. Browser back returns to the search results with the previous query.
3. The card detail page shows name, mana cost, type line, oracle text, and P/T (or loyalty/defense) for all faces.
4. The card image loads progressively: art crop first, then full card image. Failure to load the full image is handled gracefully.
5. Multi-face cards show all faces with a way to toggle between face images.
6. Format legality is displayed using bitmask data from `columns.json`.
7. A Scryfall external link is available for users who want the full Scryfall page.
8. The page is fully functional offline using data from `columns.json` and cached images.
