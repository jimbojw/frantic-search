# Spec 124: List Add/Remove from Search Results

**Status:** Implemented

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

Manual show/hide with state; `position: absolute` relative to a tightly fitted wrapper around the trigger. Light-dismiss via click-outside and Escape. The popover scrolls with the page (not fixed to viewport).

- **Trigger:** A compact button labeled `+ | -` (IconPlus, IconVerticalBar, IconMinus). Height matches menu drawer chips (`min-h-11 min-w-11`). Use unique IDs: `list-popover-${paneId}-card-${ci}` for card-level, `list-popover-${paneId}-print-${pi}` for printing-level.
- **Popover content:** Fixed width 300px. Card image at top (CardImage with color identity, ThumbHash, rounded corners; click navigates to All Prints query). Below that, a 2×2 grid: each row has a label and `[-] N [+]` ListControls. Labels: "Any printing" for oracle-level add/remove; "SET · CN · finish" (e.g. "LTR · 478 · nonfoil") for printing-specific add/remove when printing-expanded.
- **Positioning:** Popover is `position: absolute` inside a `position: relative` wrapper that tightly fits the trigger. Popover must have `absolute` in its class from render so the wrapper stays tight (late application would inflate the wrapper). Vertical: if button center Y > 50% viewport height, show above (`bottom: BH + gap`); else show below (`top: BH + gap`). Horizontal: prefer `left: 0` (align left edges) if popover fits in viewport; else `right: 0` (align right edges) if it fits; else center in viewport (`left = VW/2 - PW/2 - BX`). Parent containers need `overflow: visible` (e.g. Images grid container).

**Accessibility:** Trigger has `aria-label="Add or remove from list"`, `aria-expanded`, `aria-haspopup="dialog"`. Popover has `role="dialog"`. ListControls buttons retain their `aria-label` values. Dismiss on Escape or click outside.

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

When printing-expanded, the popover shows two rows: "Any printing" (oracle-level) and "SET · CN · finish" (printing-specific with scryfallId and finish).

## File Organization

| File | Changes |
|------|---------|
| `app/src/SearchContext.tsx` | Extend `SearchContextValue` with `cardListStore?`, `listVersion?`, `listCountForCard?`, `listCountForPrinting?` |
| `app/src/App.tsx` | Pass `cardListStore` and `listVersion` to DualWieldLayout (App owns them) |
| `app/src/DualWieldLayout.tsx` | Receive `cardListStore`, `listVersion` from App; pass into `buildPaneContext`; create `listCountForCard` and `listCountForPrinting` per-pane using that pane's display/printingDisplay |
| `app/src/SearchResults.tsx` | Add ListControlsPopover trigger and popover in each view mode branch; integrate with CardFaceRow or adjacent layout |
| `app/src/ListControlsPopover.tsx` | Reusable component: trigger button + popover. Props: `popoverId`, `entries` (array of `{ label, count, onAdd, onRemove, addLabel, removeLabel }`), optional `cardImage` (`{ scryfallId, colorIdentity, thumbHash, onClick }`). Wrapper uses `inline-flex` to stay tight; popover uses `absolute` in class. |
| `app/src/ListControls.tsx` (new) | Extract `ListControls` from CardDetail.tsx for reuse in CardDetail and ListControlsPopover |
| `app/src/CardDetail.tsx` | Import `ListControls` from `ListControls.tsx`; remove local definition |

## Edge Cases

- **Lists not available:** `cardListStore` is undefined or not passed into context; no trigger rendered.
- **Oracle ID missing:** Skip rendering for cards without `oracle_ids` (e.g. display not fully loaded).
- **Multi-faced cards:** Use canonical face index; `oracle_ids[ci]` is the same for all faces of a card.
- **Popover dismiss:** Click-outside (capture phase) and Escape close the popover. Clicks inside the wrapper (trigger or popover) do not close it.
- **Multiple popovers:** Each result row needs a unique popover ID per document. Use `list-popover-${paneId}-card-${ci}` or `list-popover-${paneId}-print-${pi}` so IDs do not collide in dual-wield or between card-level and printing-level views. No more than one popover is open at a time (light-dismiss closes the previous).
- **Error handling:** `addInstance` and `removeMostRecentMatchingInstance` may reject (e.g. IndexedDB failure). Handle silently (e.g. `.catch(() => {})`) matching CardDetail; no user-facing error toast for MVP.
- **Add when already in list:** When adding a card/printing that already exists in the list, clone the newest matching instance's metadata (tags, zone, collection_status, variant) so the new entry inherits it. This ensures list view deduplication yields a single line with increased count (e.g. `2x Anguished Unmaking (tdc) 279 [Removal]`) rather than two separate lines.

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

## Implementation Notes

- Switched from native Popover API to manual state + `position: absolute` so the popover scrolls with the page.
- Popover card image click navigates to All Prints query (`!"{name}" unique:prints include:extras v:images`) rather than the card detail page. Rationale: clicking the card in search results already goes to the card page; the popover image offers a different destination — browsing all printings — so users can add a different printing to their list.
- Added card image and 2×2 grid layout to popover content; labels "Any printing" and "SET · CN · finish".
- Images grid container changed from `overflow-hidden` to `overflow-visible` so the popover can extend outside.
