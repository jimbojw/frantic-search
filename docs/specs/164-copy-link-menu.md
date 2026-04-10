# Spec 164: Copy link menu (Markdown and URL)

**Status:** Implemented

**Depends on:** [Spec 129](129-back-and-copy-url-buttons.md) (Copy control placement), [Spec 013](013-url-state.md) (URL state), [Spec 086](086-dual-wield.md) (dual-pane URLs), [Spec 085](085-posthog-analytics.md) (`ui_interacted` events)

**Related:** [GitHub #196](https://github.com/jimbojw/frantic-search/issues/196); [Spec 165](165-card-detail-app-bar-and-copy-menu.md) (card detail Copy… menu — parallel UX, `card_detail_interacted` analytics).

## Goal

Upgrade the single-action “Copy URL” control to a **Copy…** trigger that opens a small menu. Users can copy the raw page URL or a Markdown inline link whose anchor text is either the visible search text or (when applicable) a single exact card name from the query.

## Background

Sharing a search often means pasting into Markdown (issues, docs, chat). A bare URL is enough for some cases; a Markdown link with readable anchor text is better. The app already reflects the query in `location.href` (Spec 013); this spec adds formatted clipboard payloads without changing URL or routing behavior.

## Design

### Trigger

- **Label (header variant):** `Copy…` (ellipsis).
- **Rail variant (Dual Wield):** Icon-only; `aria-label` / tooltip align with “Copy…”.
- **Visibility:** Unchanged from Spec 129 — show when a query is present (single: non-empty `q`; dual: non-empty `q1` or `q2` in the sense of “any pane has text”, same as today).

### Menu items (order)

1. **URL** — Copies `location.href` (plain text). Same behavior as the pre–Spec 164 button.
2. **Markdown (search)** — Copies `[escaped](url)` where the bracket text is the **effective search string** (pinned + live, same composition as the worker evaluates; see below). The URL is the current `location.href`.
3. **Markdown — _name_** (conditional) — Shown only when the **exact-name detection query** parses to an AST containing **exactly one** non-empty `EXACT` node. Copies `[escapedName](url)` using that node’s `value` (quoted exact names preserve user casing per the lexer).

No free-form “custom link text” field (issue #196).

### Effective search string for Markdown (search)

- **Single pane:** Same as `effectiveQuery()` in the main app: `pinnedQuery` and live `query` combined with `sealQuery` and a single space when both are non-empty.
- **Dual Wield:** Join non-empty **left** and **right** effective strings (same pin/live rule per pane) with **` · `** (space, middle dot U+00B7, space). If only one pane has text, use that string alone.  
  **Do not** parse this joined string for `EXACT` detection.

### Exact-name detection query

- **Single pane:** Same string as the effective search string above.
- **Dual Wield:** **Left pane only** — same effective string as the left pane alone. Rationale: the synthetic dual label is not a valid query string for the parser; the left pane is the primary column.

### Markdown escaping

Link text inside `[...]` must escape at least `\`, `[`, and `]` so the output is safe for CommonMark-style parsers. Implementation lives in `shared` (see Technical details).

### Popover UX

- Click trigger toggles open/closed.
- Click outside (capture phase) and **Escape** close the menu.
- Choosing a menu item copies to the clipboard, closes the menu, and shows brief **Copied!** feedback on the trigger (checkmark / label), consistent with Spec 129.
- Use `aria-expanded`, `aria-haspopup`, and appropriate roles for the trigger and menu items.

### Analytics

Programmatic events only (Spec 085). Use `ui_interacted` with `element_name: 'copy_link_menu'`:

| When | `action` | `state` |
|------|-----------|---------|
| Menu opened | `clicked` | `opened` |
| Copied plain URL | `clicked` | `copied_url` |
| Copied Markdown (search) | `clicked` | `copied_markdown_search` |
| Copied Markdown (card name) | `clicked` | `copied_markdown_card_name` |

## Technical details

| Piece | Location |
|-------|----------|
| `escapeMarkdownLinkText`, `formatMarkdownInlineLink` | `shared/src/markdown-link.ts` |
| `singleExactNameFromAst` | `shared/src/search/exact-name-from-ast.ts` |
| Menu UI + clipboard | `app/src/CopyLinkMenu.tsx` (replaces `CopyUrlButton.tsx`); card detail: `app/src/CardCopyMenu.tsx` (Spec 165) |
| Wiring | `app/src/App.tsx`, `app/src/DualWieldLayout.tsx` |

## Acceptance criteria

1. Single pane: with a non-empty query, **Copy…** opens a menu; **URL** copies `location.href`.
2. **Markdown (search)** copies a single line of Markdown whose link text matches the effective query (with escaping where needed).
3. When the parsed AST contains **exactly one** non-empty `EXACT` node (e.g. `!"Lightning Bolt"` alone, or `!"Bolt" t:instant`), a third row appears and copies Markdown with that name as anchor text (user’s quoted spelling preserved).
4. Two or more non-empty `EXACT` nodes: no card-name row.
5. Dual Wield: Markdown (search) uses the ` · ` join rule; card-name row uses the **left** pane effective query only.
6. Spec 129 visibility rules remain satisfied: Back still calls `history.back()` and appears only when a query is present in single pane; visibility includes wide viewports per Spec 129.
7. Analytics events fire as specified in the table above.

## Scope of documentation updates

- [Spec 129](129-back-and-copy-url-buttons.md): note modification by Spec 164.
- [Spec 085](085-posthog-analytics.md): document `copy_link_menu` `ui_interacted` states.
