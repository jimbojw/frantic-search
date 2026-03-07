# Spec 090: Lists Page

**Status:** Draft

**Depends on:** Spec 013 (URL State & History), Spec 075 (Card List Data Model and Persistence), Spec 077 (Query Engine — my:list)

**See also:** Spec 015 (Card Detail Page), Spec 016 (Bug Report Page), Spec 083 (MenuDrawer)

## Goal

Add a dedicated Lists page that displays the contents of the user's card lists and provides a place to manage list metadata. The page serves both as a debugging aid (investigating count mismatches, orphaned entries) and as the foundation for future list-management features (metadata editing, trash restore, bulk operations).

## Background

The list feature (Spec 075, 076, 077) allows users to add cards (oracle-level or printing-level) to a default list, queryable via `my:list`. The card detail page (Spec 015, 050) shows increment/decrement controls, but there is no dedicated view of what is actually in the list. Users experiencing bugs (e.g., cards showing "0" when they believe they added them) have no way to inspect list contents. List metadata (name, description, short_name) can be updated via `CardListStore.updateListMetadata` but there is no UI for it.

A Lists page addresses these gaps and establishes a natural home for list-related features.

## URL Format

```
?list                    # default list (primary view)
?list=trash              # trash contents (optional)
```

The `list` parameter with no value (or `list=default`) shows the default list. `list=trash` shows the trash. Future: `list=<uuid>` for additional user lists.

Example: `?list` or `?list=trash`

## Entry Points

### Primary: MenuDrawer TOOLS section

Add "My List" (or "Lists") as a link in the TOOLS section, alongside "Try on Scryfall ↗". Tapping navigates to `?list` via `pushState` (Spec 013).

### Secondary: query context

When the effective query contains `my:list`, a "View list" or "My List" chip/link in the results area could navigate to the Lists page. Deferred to a follow-up; MVP uses only the menu entry.

## Navigation Flow

```
search → open MenuDrawer → tap "My List" → lists (?list) → back → search
lists (?list) → tap "Trash" tab/section → lists (?list=trash) → back → lists (?list)
```

## Layout

A single-column scrollable view within the same `max-w-2xl` container used by Card Detail and Bug Report.

### Header

- Back arrow (←) on the left, calls `history.back()`.
- Title: "My List" when viewing the default list; "Trash" when viewing trash.
- Optional: Scryfall outlink or other tools. MVP: back + title only.

### List Selector (MVP: two tabs)

- **My List** — default list contents (list_id = `default`).
- **Trash** — recoverable items (list_id = `trash`).

Rendered as tabs or a segmented control. Active tab reflects `?list` vs `?list=trash`. Tapping a tab updates the URL via `pushState`.

### Default List Contents

For each unique `oracle_id` in the list, show a row (or card) with:

| Column | Source | Notes |
|--------|--------|-------|
| Card name | `DisplayColumns.names` via `oracle_id` → canonical face → faces | Resolve using `display`, `facesOf`, `buildOracleToCanonicalFaceMap`. "Unknown card" when oracle_id not in display (orphaned entry). |
| Oracle-level count | Count instances with `scryfall_id == null && finish == null` | Number of generic (oracle-only) entries. |
| Printing-level breakdown | Group by `(scryfall_id, finish)` | e.g., "2× Nonfoil, 1× Foil" or per-printing rows. |

**Grouping:** Aggregate instances by `oracle_id`. For each oracle_id, show:
- One row with card name (or "Unknown card" if not in display).
- Oracle-level count (generic entries).
- Printing-level entries: either inline summary ("2 nonfoil, 1 foil") or expandable per-printing rows. MVP: inline summary is sufficient.

**Sorting:** By card name (case-insensitive). Orphaned entries (oracle_id not in display) sort to the end or a separate "Unresolved" section.

**Empty state:** "No cards in list. Add cards from search results or the card detail page."

### Trash Contents

Same structure as default list: card name, counts, printing breakdown. Additional action per entry or per card: "Restore" button that calls `CardListStore.restoreFromTrash(uuid)` for the most recent instance, or a restore-all control. MVP: show contents; restore can be per-card (restore one instance) or deferred.

### List Metadata Section (default list only)

When viewing the default list, show an editable section for list metadata:

| Field | Editable | Notes |
|-------|----------|-------|
| Name | Yes | Display name, e.g. "My List". Default: "My List". |
| Short name | Yes | For `my:` queries. Default: "list". Must remain "list" or "default" for MVP default list. |
| Description | Yes (optional) | Free-form text. |

Changes call `CardListStore.updateListMetadata(listId, { name, short_name, description })`. Inline edit or small form. MVP: name and short_name; description optional.

### Per-Entry Actions (future / MVP minimal)

- **Remove:** Move one instance to trash. Reuses `removeMostRecentMatchingInstance` + transfer to trash. Show minus control per card row when count > 0.
- **Restore (trash):** `restoreFromTrash(uuid)` for one instance. Show restore button per card row in trash view.

MVP: At least "Remove" for default list entries (minus button per card row). Trash restore can be phase 2.

## Data Requirements

### Resolving oracle_id to card name

The Lists page needs `DisplayColumns` and `facesOf` (or equivalent) to map `oracle_id` → card name. These are available from the worker's `display` message and `buildFacesOf(display.canonical_face)`. The app already holds `display` in state when the worker is ready.

**Orphaned entries:** Instances whose `oracle_id` does not appear in the current `display.oracle_ids` (or canonical face mapping) cannot be resolved. Show "Unknown card" and optionally the raw `oracle_id` for debugging. This can happen if the ETL data changed, the card was removed from Scryfall, or the display has not loaded yet.

### Display availability

If the user navigates to the Lists page before the worker has sent `display` (e.g., cold load, slow network), the page can:
- Show a loading state until display is ready.
- Or show list contents with "Unknown card" for all entries until display loads, then re-resolve.

Recommendation: Show loading state if display is null. Once display exists, render. If display is replaced (e.g., data refresh), re-render with updated names.

## Debug / Developer Aid

Optionally, a collapsible "Debug" section shows:
- Raw instance count per list.
- Sample `oracle_id` / `scryfall_id` / `finish` for spot-checking.
- List metadata as stored.

This helps diagnose count mismatches (e.g., oracle-level vs printing-level, finish string mismatches). Can be hidden behind a "Show debug info" toggle or omitted in MVP.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/app-utils.ts` | Add `'lists'` to `View` type; extend `parseView` to return `'lists'` when `params.has('list')`. |
| `app/src/App.tsx` | Add `view === 'lists'` branch; render `ListsPage` component. Pass `cardListStore`, `display`, `facesOf`, `navigateBack`. Handle `?list` and `?list=trash` params. |
| `app/src/ListsPage.tsx` | New component. Header, list selector (My List / Trash), contents table, metadata section, per-entry actions. |
| `app/src/MenuDrawer.tsx` | Add "My List" link in TOOLS section. Requires `onListsClick` or similar from App. |
| `docs/specs/083-menu-drawer.md` | Add Lists as TOOLS entry point. |

## Out of Scope (MVP)

- Multiple user lists (beyond default + trash).
- Bulk operations (select multiple, remove all, move between lists).
- List creation or deletion.
- Export/import.
- Server sync or sharing.

## Offline Behavior

All data comes from IndexedDB (via CardListStore) and in-memory display. The Lists page is fully functional offline. Orphaned entries (display not loaded) show "Unknown card" until display is available.

## Acceptance Criteria

1. A "My List" link in the MenuDrawer TOOLS section navigates to the Lists page (`?list`).
2. The Lists page shows a header with back arrow and title ("My List" or "Trash").
3. A list selector (tabs or segmented control) switches between default list and trash. URL reflects `?list` vs `?list=trash`.
4. The default list view displays each card in the list with resolved name (or "Unknown card"), oracle-level count, and printing-level summary.
5. The trash view displays recoverable items with the same structure.
6. List metadata (name, short_name) is editable when viewing the default list.
7. Per-card remove (minus) control allows moving one instance to trash. Minus disabled when count is 0.
8. Browser back returns to the previous view (search or prior list tab).
9. The page is fully functional offline using IndexedDB and in-memory display.
10. Orphaned entries (oracle_id not in display) are shown as "Unknown card" and do not break the page.
