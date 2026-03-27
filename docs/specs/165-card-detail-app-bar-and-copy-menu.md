# Spec 165: Card detail persistent app bar and Copy… menu

**Status:** Implemented

**Depends on:** [Spec 015](015-card-page.md) (card URL, `q` context), [Spec 050](050-printing-aware-card-detail.md) (printing columns), [Spec 129](129-back-and-copy-url-buttons.md) (Back / Copy placement), [Spec 137](137-persistent-search-app-bar.md), [Spec 143](143-shell-first-loading.md) (portal + shell), [Spec 164](164-copy-link-menu.md) (Copy… UX), [Spec 160](160-card-detail-analytics.md), [Spec 085](085-posthog-analytics.md)

**Related:** Extends persistent header behavior to card detail view.

## Goal

When the URL represents the card detail view (`card` query parameter per Spec 015), show the **same persistent header chrome** as single-pane search: left group (Home, Split view when viewport is wide, Back when narrow, Copy…), right group (My list, Menu). Layout and control sizing match the search header (`h-11`, same button styling).

## Background

Card detail content renders inside `App` but, unlike search, nothing is portaled into `#app-header-slot`. Users see the shell minimal bar instead of full navigation and sharing affordances. Spec 164 added a Copy… menu on search; card detail should offer a parallel menu with card-specific clipboard payloads.

## Design

### Portal

Only the **persistent bar row** is portaled into `app-header-slot` (Spec 137 / 143). No search hero, no coupling to search `headerCollapsed`.

### Back

- **Visibility:** `!viewportWide()` (1024px, `useViewportWide`), same breakpoint as Spec 129. **No** requirement for non-empty `q` — narrow viewports always show Back when `card` is set.
- **Action:** `history.back()`.
- **Analytics:** `card_detail_interacted` with `control: 'back'` (Spec 160).

### Copy… menu

**Trigger:** Label `Copy…` (header variant), same visual pattern as Spec 164 (clipboard icon, “Copied!” feedback on success).

**Menu items (order):**

1. **URL (as is)** — Plain `location.href` (includes `q` and other params when present — preserves search context from Spec 015).
2. **URL (card only)** — Same origin, path, and hash as the current page; query string is **only** `card=<printing_scryfall_id>`. For sharing a stable card link without embedded search state.
3. **Card name** — Plain text oracle-level full name (faces joined with ` // `), same as `fullName()` on card detail.
4. **Markdown link** — `formatMarkdownInlineLink(fullName, location.href)` from shared (`markdown-link.ts`) — uses the full page URL like row 1.
5. **Slack / Reddit** — `formatSlackCardReference(name, setCode, collectorNumber)` in shared — `[[!{name}|{SET}|{collector}]]` with uppercase set code. **Omit this row** when primary printing index or `set_codes` / `collector_numbers` are unavailable (loading or edge case).

### Popover UX

Match Spec 164: click toggles menu; outside click (capture) and Escape close; successful copy closes menu and shows brief “Copied!” on trigger; `aria-expanded`, `aria-haspopup`, `role="menu"` / `menuitem`.

### Menu and My list

Same behavior as search: My list navigates to the lists view; Menu opens `MenuDrawer` via `termsExpanded` / `toggleTerms`.

`MenuDrawer` uses `useSearchContext()`. **`SearchProvider` must wrap both card detail and single-pane search** so the card header’s Menu has a valid context (query from URL/state, view mode, etc.). Docs and Dual Wield full-screen layouts are unchanged.

**Leaving card via menu chips:** Any filter chip that updates the live query (`onSetQuery`), view mode, or unique mode must return the user to **search** results: remove `card` from the URL, clear dual-wield query params, and apply the same `q` / empty-query URL rules as the single-pane search bar (so behavior matches having edited from search).

### Analytics

Use `card_detail_interacted` only (not `ui_interacted`). New `control` values — see Spec 160 (updated for this spec). Do not attach card names to events; clipboard kind is encoded only as `control`.

## Technical details

| Piece | Location |
|-------|----------|
| `formatSlackCardReference` | `shared/src/slack-card-reference.ts` |
| Card Copy… menu UI | `app/src/CardCopyMenu.tsx` |
| Portal + bar wiring | `app/src/App.tsx` (`SearchProvider` lift, `Portal` when `view === 'card'`) |

## Acceptance criteria

1. With `card` set in the URL and data loaded, the header slot shows Home, Split (wide), Back (narrow), Copy…, My list, Menu — visually consistent with single-pane search.
2. Copy… offers URL (as is), URL (card only), Card name, Markdown link; Slack/Reddit row appears only when printing set + collector exist.
3. Back on narrow calls `history.back()` and fires `card_detail_interacted` `back`.
4. Menu opens the same filter drawer as search (chips, help links) with working context.
5. Analytics fire per Spec 160 additions for copy menu open and each copy kind.

## Out of scope

Removing the in-page back / title / Scryfall row or the inline Slack copy row in `CardDetail.tsx` — separate follow-up.

## Implementation notes

- **2026-03-27:** Split URL copy into **URL (as is)** and **URL (card only)** so sharers can omit `q` and other query noise; Markdown link still uses the full page URL.
- **2026-03-27:** Changing the query via menu chips (including `onSetQuery`, view mode, or unique mode) from the card view **leaves** card detail: `card` is removed from the URL, the user returns to the search view, and `q` is synced with the same rules as single-pane search (including empty-`q` when the box is “engaged”).

## Scope of documentation updates

- [Spec 015](015-card-page.md), [137](137-persistent-search-app-bar.md), [164](164-copy-link-menu.md): related / modified-by note pointing here.
- [Spec 160](160-card-detail-analytics.md), [085](085-posthog-analytics.md): new `card_detail_interacted` controls.
