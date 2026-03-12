# Spec 124: List Add/Remove from Search Results

**Status:** Draft

**Depends on:** Spec 075 (Card List Data Model and Persistence), Spec 077 (Query Engine — my:list), Spec 090 (Lists Page), Spec 041 (Result Display Modes)

## Goal

Allow users to add and remove cards from their list directly from search results, without navigating to the card detail page. Because space is tight in result rows, the add/remove controls are hidden behind a contextual popover triggered by a compact `[+/-]` button.

## Background

The card detail page (CardDetail.tsx) already shows inline `[-] N [+]` list controls (ListControls) when `cardListStore` and `oracleId` are present. Users must open a card to adjust quantities. Adding the same capability to search results reduces friction when building or editing a list.

Search results use four view modes (Spec 041): Slim, Detail, Images, and Full. Each has different layout constraints. A full inline ListControls block would clutter Slim and Detail rows; Images and Full views have more room but still benefit from a compact trigger.

## Scope

- **In scope:** Popover-based list controls in all four view modes; SearchContext extension to provide list store/callbacks; reuse of ListControls component.
- **Out of scope:** List selection (which list to add to) — always use the default list (DEFAULT_LIST_ID), matching CardDetail behavior. Future work could derive list from `my:list` / `my:trash` in the query.

## Technical Details

### Popover Approach

Use the **native HTML Popover API** (`popover` attribute, `popovertarget`) for show/hide and light-dismiss. Tailwind provides styling only; no additional dependencies.

- **Trigger:** A compact icon button (IconPlus/IconMinus combined, matching CardDetail's ListControls). `popovertarget="list-popover-{id}"` links to the popover. Use unique IDs: `list-popover-${paneId}-card-${ci}` for card-level, `list-popover-${paneId}-print-${pi}` for printing-level. In single-pane mode, `paneId` is `'main'`; in dual-wield, use `'left'` / `'right'` so IDs do not collide across panes or between card/printing domains.
- **Popover content:** Reuse the existing `ListControls` component (extracted to `ListControls.tsx`). The popover container has `popover`, `id="list-popover-{id}"`, and appropriate Tailwind classes (`rounded-lg`, `border`, `bg-white dark:bg-gray-900`, `shadow-lg`, `p-2`).
- **Positioning:** Use `popover="auto"` for MVP — the browser places the popover (typically centered). Future: CSS Anchor Positioning or manual positioning for better placement near the trigger.

**Accessibility:** The trigger button has `aria-label="Add or remove from list"`. ListControls buttons retain their existing `aria-label` values. Trigger supports Enter/Space to activate; popover dismisses on Escape. Focus remains within the popover when open (native Popover API behavior).

### Data Flow

- **SearchContext extension:** Add `cardListStore?: CardListStore` and `listVersion?: Accessor<number>` to the context value. `listVersion` is an accessor so consumers (ListControls, ListControlsPopover) re-run when the list changes (e.g. add/remove in another tab). When absent (e.g. not passed into context — a future view where lists are unavailable), list controls are not rendered.
- **Oracle ID:** For card-level results, `display().oracle_ids[ci]` where `ci` is the canonical face index. For printing-level results (printingExpanded), use `pd.canonical_face_ref[pi]` to get `cf`, then `display().oracle_ids[cf]`.
- **List ID:** Use `DEFAULT_LIST_ID` for add/remove, matching CardDetail.
- **Count lookup:** The popover always displays the count for `DEFAULT_LIST_ID` (the list we add/remove from). Extend the context with `listCountForCard?: (ci: number) => number` and `listCountForPrinting?: (pi: number) => number` that call `getMatchingCount(store.getView(), DEFAULT_LIST_ID, oracleId, ...)` — never read from `listEntryCountPerCard`, which reflects the *queried* list (e.g. `my:trash`) and may differ from the default list. When `cardListStore` is absent, these helpers are undefined.

**Dual-wield wiring:** App owns `cardListStore` and `listVersion`; it passes them to DualWieldLayout. DualWieldLayout passes them into `buildPaneContext` (or equivalent) for each pane. The count helpers are **created per-pane** inside `buildPaneContext`, using that pane's `state.display()` and `state.printingDisplay()` — each pane's results use its own display data. Counts always reflect `DEFAULT_LIST_ID` in both panes.

### When to Show Controls

Show the `[+/-]` trigger only when:

1. `cardListStore` is defined (lists feature is available), and
2. `oracleId` is available for the card/printing (display has oracle_ids; canonical face is resolvable).

Do not gate on `my:list` being in the query — users may want to add cards from any search (e.g. `t:creature`) to their list.

### Layout by View Mode

#### Slim and Detail

```
[ +/- ] [ thumbnail ] Card name etc. ... <mana cost>
```

- Place the `[+/-]` trigger as the first element in the row, before the ArtCrop (Slim) or thumbnail (Detail).
- Use `shrink-0` so it doesn't compress. Match the vertical alignment of the row (`items-start` or `items-center` as appropriate).
- The trigger is a small button; the popover opens on click.
- **Printing-expanded:** When `printingExpanded` is true, results are per-printing. The same placement applies: trigger first in the row. Use `pi` for oracle ID resolution and popover ID (`list-popover-${paneId}-print-${pi}`).

#### Images View

```
+--------------+
|              |
|  card image  |
|              |
+--------------+
<stats>  [ +/- ]
```

- **Printing-level results:** The stats row exists (set code, collector number, rarity, foil, etc.) in a `div` below the CardImage. Add the `[+/-]` trigger at the end of the stats row. Use `flex justify-between` or `flex items-center gap-2` so stats stay left and the trigger aligns right (or inline after the last stat).
- **Card-level results:** When not printing-expanded, the Images grid shows only the card image (no stats row). Add a small row or overlay below the image for the trigger — e.g. a `div` with `flex justify-center` or `justify-end` containing the trigger, matching the stats-row placement when present.
- Same popover behavior: click opens ListControls.

#### Full View

- Same as Images: place the `[+/-]` trigger below the card image.
- Center it under the image for consistency across desktop and mobile. The Full view has a single card per row with image on the left and detail on the right; the trigger sits below the image, centered.
- This keeps the same relative position as Images view (below the card) for a consistent mental model.

### Printing-Level Results

When `printingExpanded` is true and results are per-printing, each row has a specific `scryfall_id` and optionally `finish`. CardDetail's printing-level ListControls use `addInstance(oid, listId, { scryfallId, finish })` and `removeMostRecentMatchingInstance(listId, oid, scryfallId, finish)`.

- **Oracle ID:** `display().oracle_ids[pd.canonical_face_ref[pi]]`
- **Count:** Use printing-level count when available (e.g. `getMatchingCount` with scryfallId and finish). The aggregation count logic may need extension to support printing-level list counts for the popover.

For MVP, we can use oracle-level add/remove (no scryfallId/finish) when the display is printing-expanded — this adds a generic "1x Card Name" entry. A follow-up can add printing-specific add/remove for Images/Full when showing individual printings.

## File Organization

| File | Changes |
|------|---------|
| `app/src/SearchContext.tsx` | Extend `SearchContextValue` with `cardListStore?`, `listVersion?`, `listCountForCard?`, `listCountForPrinting?` |
| `app/src/App.tsx` | Pass `cardListStore` and `listVersion` to DualWieldLayout (App owns them) |
| `app/src/DualWieldLayout.tsx` | Receive `cardListStore`, `listVersion` from App; pass into `buildPaneContext`; create `listCountForCard` and `listCountForPrinting` per-pane using that pane's display/printingDisplay |
| `app/src/SearchResults.tsx` | Add ListControlsPopover trigger and popover in each view mode branch; integrate with CardFaceRow or adjacent layout |
| `app/src/ListControlsPopover.tsx` (new) | Reusable component: trigger button + popover containing ListControls. Props: `popoverId` (unique per row, e.g. `list-popover-${paneId}-card-${ci}`), `oracleId`, `scryfallId?`, `finish?`, `count`, `onAdd`, `onRemove`, `addLabel`, `removeLabel` |
| `app/src/ListControls.tsx` (new) | Extract `ListControls` from CardDetail.tsx for reuse in CardDetail and ListControlsPopover |
| `app/src/CardDetail.tsx` | Import `ListControls` from `ListControls.tsx`; remove local definition |

## Edge Cases

- **Lists not available:** `cardListStore` is undefined or not passed into context; no trigger rendered.
- **Oracle ID missing:** Skip rendering for cards without `oracle_ids` (e.g. display not fully loaded).
- **Multi-faced cards:** Use canonical face index; `oracle_ids[ci]` is the same for all faces of a card.
- **Popover dismiss:** `popover="auto"` dismisses on outside click, Escape, or focus move. Ensure ListControls buttons don't cause accidental dismiss (e.g. clicking Add should not close the popover before the action completes — the Popover API typically keeps it open for in-popover interactions). Verify this behavior in Chrome, Firefox, and Safari; if a browser closes the popover on in-popover clicks, use `event.stopPropagation()` or an alternative dismiss strategy.
- **Multiple popovers:** Each result row needs a unique popover ID per document. Use `list-popover-${paneId}-card-${ci}` or `list-popover-${paneId}-print-${pi}` so IDs do not collide in dual-wield or between card-level and printing-level views. No more than one popover is open at a time (light-dismiss closes the previous).
- **Error handling:** `addInstance` and `removeMostRecentMatchingInstance` may reject (e.g. IndexedDB failure). Handle silently (e.g. `.catch(() => {})`) matching CardDetail; no user-facing error toast for MVP.

## Acceptance Criteria

1. When `cardListStore` is available, a `[+/-]` trigger appears in search results for each card/printing.
2. **Slim view:** Trigger is the first element in the row, before the art crop thumbnail.
3. **Detail view:** Trigger is the first element in the row, before the thumbnail.
4. **Images view:** Trigger appears below the card image — at the end of the stats row when printing-expanded; in a small row/area below the image when card-level (no stats row).
5. **Full view:** Trigger appears centered below the card image.
6. Clicking the trigger opens a popover containing the same `[-] N [+]` ListControls as the card detail page.
7. Add increases the count; Remove decreases it (disabled at 0). Changes persist to the list.
8. The popover dismisses on outside click or Escape.
9. The displayed count reflects the card's count in the default list (`DEFAULT_LIST_ID`), regardless of query.
10. When the card is not in the list, the count shows 0.
11. No list controls are shown when `cardListStore` is undefined or not passed into context.
12. Dual-wield: each pane shows list controls. Counts always reflect `DEFAULT_LIST_ID` (the list we add/remove from).
13. The popover count updates reactively when the list changes (e.g. add/remove from another tab, or from the card detail page) — `listVersion` accessor triggers re-computation.
