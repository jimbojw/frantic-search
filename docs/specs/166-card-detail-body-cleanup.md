# Spec 166: Card detail body cleanup

**Status:** Implemented

**Depends on:** [Spec 015](015-card-page.md), [Spec 050](050-printing-aware-card-detail.md), [Spec 106](106-card-detail-tags.md), [Spec 160](160-card-detail-analytics.md), [Spec 165](165-card-detail-app-bar-and-copy-menu.md)

**Related:** [Spec 150](150-chip-button-component.md) — uniform chip height precedent; card detail tag chips remain custom per 150 but align visually.

## Goal

Remove chrome duplicated by the portaled card header (Spec 165), replace the plain “All prints” affordance with a query chip consistent with tag chips, drop the redundant inline Slack copy row (Superseded by header Copy…), and surface the page Scryfall id in the printing metadata panel with an explicit outlink.

## Background

[Spec 165](165-card-detail-app-bar-and-copy-menu.md) adds Back (header, all viewports), Copy… (including Slack / Reddit), and global navigation on the card view. The card body still carried a second back control, an unlabeled Scryfall icon, a text “All prints →” link, and a Slack bracket line with copy—redundant or less discoverable than the new header and metadata patterns.

## Design

### 1. In-page header strip (body)

- **Remove** the body back button and the unlabeled Scryfall icon from the row that previously balanced the title.
- **Keep** the oracle-level **card name** as the in-body title (`fullName()`), full width, **horizontally centered** (no empty columns for removed controls). Long names (including multi-face `//` names) **wrap** to multiple lines; do not single-line truncate the `<h1>`.

### 2. All-prints query chip

- **Replace** the centered “All prints →” text control with a **chip** matching the **card detail tag chip** visual pattern (`TagChip` in `app/src/CardDetail.tsx`): rounded mono background, primary row for the query, optional subtitle row for counts. **No per-chip copy control** — users copy from the header **Copy…** menu after navigating to search (same as tag chips; Spec 106).
- **Query string:** `!"{fullName}" unique:prints include:extras` (same semantics as [Spec 050](050-printing-aware-card-detail.md) all-prints navigation; `include:extras` per that spec).
- **Syntax highlight:** Reuse `buildSpans` / `ROLE_CLASSES` from `app/src/QueryHighlight.tsx` on the query string, same as tag chips.
- **Click target:** The **entire chip** (query row and subtitle row when present) is a single control that runs `onNavigateToQuery` with that full string.
- **Horizontal sizing:** The chip is **`inline-flex` / shrink-to-fit** up to the **max width of the card detail content column** (`max-w-full` / `min-w-0`), **centered** under the title (parent uses flex `justify-center`). It does **not** stretch to the full column width unless the query text is that wide.
- **Long names:** The highlighted query row **wraps** (`break-words`) within that bound so long `!"…" unique:prints include:extras` strings do not single-line truncate; chip **minimum** height rules still apply and the chip **grows** when the query spans multiple lines.
- **Alignment:** The primary row matches the **TagChip** pattern: **`items-center`** on the query row (no top-heavy flex alignment). Query text is **centered** in the chip; the subtitle row (when present) stays centered as today.

#### Subtitle row (counts)

Second line: small, muted, tabular numbers—same role as the tag chip count line.

- If **both** oracle/card count and print count are **known:** `{N} card(s) ({M} print(s))` with natural singular/plural (e.g. `1 card (12 prints)`). Numeric formatting matches tag chips: `toLocaleString()` for values under 1000; compact `k` suffix for ≥1000 (same rule as `formatTagCount` in `app/src/CardDetail.tsx`).
- If **only** card count is known: `{N} card(s)` (same number formatting).
- If **only** print count is known: `{M} print(s)`.
- If **neither** is known: **omit** the subtitle row entirely.

**Known counts (v1):** **Print count** is the number of **printing rows** in `PrintingDisplayColumns` whose `canonical_face_ref` equals the page’s canonical face index (all set/collector/finish rows for that oracle — matches what the all-prints search enumerates). Do **not** use only the length of `printingIndices` for the current `scryfall_id` (that groups foil/nonfoil for one printing). When printing columns are unavailable, fall back to `printingIndices.length` if that group is non-empty, else omit the print component. **Oracle/card count** for this chip is known when the page has a resolved canonical index and display columns (`canonicalIndex != null` and `display != null`), in which case treat the distinct-card count as **1** for this name-level query. If implementation cannot derive a value, omit that component.

#### Layout when the subtitle is omitted

- The chip’s **outer minimum height** matches a **two-line** tag chip (fixed `min-height` / flex column) so toggling between one and two lines does not change overall chip height.
- The **primary row** (highlighted query only) uses **balanced** vertical padding when the subtitle row is absent or present—**short** single-line queries appear comfortably padded (not stuck to the top of the min-height box). **Long** queries **wrap** and increase chip height (no truncation).

### 3. Inline Slack / Reddit row

- **Remove** the metadata-panel footer (bracket line + copy button). The header **Copy…** menu (Spec 165) is the only surface for that clipboard payload on card detail.

### 4. Scryfall ID in printing metadata

- In the printing metadata `<dl>`, **after** **Rarity**, add **Scryfall ID**.
- Value: the **URL `card` id** for the current page (`scryfall_id` from the route—the same identifier used for `?card=`), in **monospace**, as an `Outlink` (`app/src/Outlink.tsx`) to `https://scryfall.com/card/{id}` (`target="_blank"`, `rel` as elsewhere).
- Fires `card_detail_interacted` with `control: 'scryfall_external'` on link click (Spec 160).

## Analytics

See [Spec 160](160-card-detail-analytics.md): `scryfall_external` (metadata outlink), `all_prints`, `otag_nav` / `atag_nav`; `slack_copy` and per-chip copy controls removed from the card detail surface.

## Acceptance criteria

1. Card body shows only the card name heading in the former header row, **horizontally centered** (no body back, no header-style Scryfall icon); long names **wrap** rather than truncating.
2. When the all-prints query is available and `onNavigateToQuery` is set, a query chip appears with highlight + full-chip navigate; subtitle follows the count rules above; stable minimum chip height; long queries **wrap** in the primary row (no truncation).
3. No Slack / Reddit bracket row in the printing metadata panel.
4. When printing metadata is shown, **Scryfall ID** appears after **Rarity** and opens Scryfall in a new tab.
5. PostHog payloads match Spec 160.

## Technical details

| Piece | Location |
|-------|----------|
| Card detail body | `app/src/CardDetail.tsx` |
| `card_detail_interacted` union | `app/src/analytics.ts` |

## Implementation notes

- **2026-03-28:** Initial spec; supersedes the “out of scope” cleanup deferred from Spec 165.
- **2026-04-10:** In-body title `<h1>` uses wrapping (`break-words`, `min-w-0`) instead of `truncate` for long oracle names.
- **2026-04-10:** All-prints query chip primary row wraps long highlighted queries (`break-words`); chip uses `max-w-full` / `min-w-0` and is centered under the title (no `w-full` stretch). **2026-04-10 (revision):** Shrink-to-fit width, centered query text, and primary-row `items-center` aligned with `TagChip`.
