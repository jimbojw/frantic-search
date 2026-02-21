# Spec 014: Syntax Help Overlay

**Status:** Draft

**Depends on:** Spec 013 (URL State & History)

## Goal

Provide an integrated, offline-available syntax guide that explains Frantic Search's query language. The guide is accessible from the search view at all times, highlights custom features and divergences from Scryfall, and includes clickable examples that populate the search bar.

## Background

The app currently links to Scryfall's external syntax guide (`scryfall.com/docs/syntax`). This is problematic for three reasons:

1. **Offline.** The app is a PWA (ADR-016). External links are dead ends without connectivity.
2. **Divergence.** Frantic Search's syntax is diverging from Scryfall's: bare regex (Spec 012), no default format filtering, and future extensions. Linking to Scryfall's docs is increasingly misleading.
3. **Mobile UX.** Opening an external tab on mobile is disorienting and slow to return from.

## Entry Points

### Primary: `?` icon on the search input

A question-mark icon on the right side of the search input, always visible. Tapping it navigates to the help view (`pushState` per Spec 013).

The search input already has a magnifying glass icon on the left (lines 316-325 of `App.tsx`). The `?` icon on the right provides visual balance and follows the established UX pattern of help icons adjacent to form fields.

### Secondary: link in the Query Breakdown box

Replace the current "Syntax guide ↗" external link in the `QueryBreakdown` component header with an internal "Syntax help" link that navigates to the help view. This provides contextual access for users who are already debugging a query.

## Help View

The help view is a full-page scrollable view that replaces the search view (not an overlay on top of it). It occupies the same `<main>` area. The URL is `?help` (with optional `&q=...` to preserve the user's current query per Spec 013).

### Header

A simple header with:
- Title: "Syntax Guide"
- A close button (×) in the top-right that calls `history.back()` to return to the search view

### Content Structure

The help content is organized into scannable sections. On mobile, users will not read a wall of text — the design prioritizes quick reference over exhaustive documentation.

#### Section 1: Quick Reference Table

A table of all supported fields with their shorthand aliases, what they search, and a clickable example.

| Field | Aliases | Searches | Example |
|---|---|---|---|
| `name` | `n` | Card name (substring) | `n:bolt` |
| `oracle` | `o` | Rules text (substring) | `o:trample` |
| `type` | `t` | Type line (substring) | `t:creature` |
| `color` | `c` | Card colors | `c:rg` |
| `identity` | `id`, `ci`, `cmd` | Color identity | `id:wubrg` |
| `power` | `pow` | Power (numeric) | `pow>=4` |
| `toughness` | `tou` | Toughness (numeric) | `tou>5` |
| `loyalty` | `loy` | Loyalty (numeric) | `loy>=3` |
| `defense` | `def` | Defense (numeric) | `def>3` |
| `mana value` | `mv`, `cmc` | Mana value (numeric) | `mv<=2` |
| `mana` | `m` | Mana cost (symbols) | `m:rrg` |
| `legal` | `f`, `format` | Format legality | `f:modern` |
| `banned` | — | Banned in format | `banned:legacy` |
| `restricted` | — | Restricted in format | `restricted:vintage` |

Each example in the rightmost column is a tappable link that calls `navigateToQuery()` (Spec 013), populating the search bar and showing results.

#### Section 2: Operators

A compact table of operators with examples:

| Operator | Meaning | Example |
|---|---|---|
| `:` | Contains / has at least | `o:destroy` |
| `=` | Exactly equals | `c=rg` |
| `!=` | Not equal | `c!=r` |
| `>` | Greater than | `pow>3` |
| `<` | Less than | `mv<3` |
| `>=` | Greater or equal | `tou>=5` |
| `<=` | Less or equal | `cmc<=2` |

#### Section 3: Combining Queries

Brief explanation of AND, OR, NOT, parentheses, and exact name:

- **Implicit AND.** `t:creature c:green` — cards that are both creatures and green.
- **OR.** `c:red OR c:blue` — cards that are red or blue.
- **NOT.** `-c:black` — exclude black cards.
- **Parentheses.** `(c:red OR c:blue) t:instant` — red or blue instants.
- **Exact name.** `!"Lightning Bolt"` — exact name match.

Each example is tappable.

#### Section 4: Regex

Explanation of regex syntax with examples:

- **Field regex.** `o:/enters the battlefield/` — regex on a specific field.
- **Bare regex.** `/bolt` — searches name, oracle text, and type line simultaneously (Spec 012).
- Regex is case-insensitive. The trailing `/` is optional.

#### Section 5: Differences from Scryfall

A short callout section with a distinct visual treatment (e.g., a bordered box or different background) that lists known behavioral divergences:

| Behavior | Scryfall | Frantic Search |
|---|---|---|
| Default format filter | Excludes cards not legal in any format | Shows all cards. Use `f:standard` (etc.) to filter by format. |
| Bare regex | Not supported | `/pattern` searches name, oracle text, and type line |
| Bare words | Searches name (with fuzzy matching) | Searches name (substring, no fuzzy matching) |
| Query speed | Server round-trip | Instant (client-side, every keystroke) |

This section sets honest expectations and helps Scryfall users adapt.

### Content as Structured Data

The help content is defined as typed constants, not hand-written JSX. This keeps the content maintainable and makes it easy to cross-reference with the parser/evaluator source.

```typescript
interface FieldEntry {
  field: string
  aliases: string[]
  description: string
  example: string
}

interface OperatorEntry {
  operator: string
  meaning: string
  example: string
}

interface DivergenceEntry {
  behavior: string
  scryfall: string
  franticSearch: string
}
```

The component maps over these arrays to render the tables. Adding a new field or divergence is a data change, not a template change.

## Clickable Examples

Every example in the help content is rendered as a tappable element (styled as a link or chip). Tapping an example:

1. Calls `navigateToQuery(example)` (Spec 013), which calls `pushState` with `?q=<example>`.
2. Sets the `query` signal to the example text.
3. Switches the view to `search`.

The history stack after tapping an example:

```
search (?q=user-query) → help (?help&q=user-query) → search (?q=example)
```

Back returns to help, then back again returns to the original query.

## Changes to Existing UI

### QueryBreakdown component

1. **Remove** the "Syntax guide ↗" external link (`<a href="https://scryfall.com/docs/syntax" ...>`).
2. **Add** a "Syntax help" internal link at the bottom of the breakdown box. Tapping it calls `navigateToHelp()` (Spec 013). Styled as subtle secondary text, consistent with the breakdown's visual weight.

### Search input

Add a `?` icon button to the right side of the search input (inside the `<div class="relative">` wrapper). Positioned as an absolutely-placed element at `right-3.5`, mirroring the magnifying glass on the left.

The icon is interactive (not `pointer-events-none` like the magnifying glass). It calls `navigateToHelp()` on click.

## Styling

- The help view uses the same `max-w-2xl` container as the search view for visual continuity.
- Tables use compact monospace styling for field names and examples.
- Clickable examples are styled as inline code spans (`font-mono`, blue text) with a subtle hover underline.
- The "Differences from Scryfall" section uses a distinct background (e.g., `bg-amber-50 dark:bg-amber-950` border) to draw attention.
- Dark mode support throughout, consistent with the existing app palette.

## Accessibility

- The `?` icon button has `aria-label="Syntax help"`.
- The help view close button has `aria-label="Close syntax help"`.
- Clickable examples are `<button>` elements (not `<a>` without href), with appropriate focus styles.
- The help content is semantic HTML: `<table>`, `<th>`, `<td>`, `<section>`, `<h2>`.

## PWA / Offline

The help content is part of the app bundle (static data constants in the JS). It requires no network requests and works fully offline. This aligns with ADR-016.

## Acceptance Criteria

1. A `?` icon is visible on the right side of the search input. Tapping it shows the help view.
2. The help view is a full-page scrollable view with field reference, operators, combinators, regex, and Scryfall divergences.
3. Every example in the help content is tappable. Tapping an example populates the search bar and shows results.
4. Browser back from a tapped example returns to the help view. Browser back from help returns to the search view with the previous query.
5. The "Syntax guide ↗" external link is removed from the QueryBreakdown header.
6. A "Syntax help" link is present at the bottom of the QueryBreakdown box, navigating to the help view.
7. The help view works fully offline (no network requests).
8. All content supports dark mode.
9. Help content is defined as structured data constants, not inline JSX.
