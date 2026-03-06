# Spec 016: Bug Report Page

**Status:** Implemented

**Depends on:** Spec 013 (URL State & History), Spec 009 (Query Breakdown)

## Goal

Make it easy for users to report query bugs — cases where Frantic Search returns unexpected results (especially zero results when cards should match). The report page auto-captures all diagnostic context and guides the user to provide the one thing we can't capture automatically: what they expected.

## Background

The query engine is complex: a hand-rolled lexer, parser, and evaluator operating on bitmask-encoded card data. Bugs are inevitable — a field alias might be missing, a comparison might be inverted, a regex might not desugar correctly. The hardest part of fixing these bugs is *reproducing them*, because the report often arrives as "search didn't work" with no query, no expected result, and no version info.

The breakdown tree (Spec 009) already provides per-node match counts, which is exactly the diagnostic data a maintainer needs. By auto-capturing the query, breakdown, and environment, we eliminate the back-and-forth and let the user focus on describing their expectation.

## Entry Points

### Primary: zero-results state

When a query returns no results, a "Report a problem" link appears alongside the existing "Try on Scryfall ↗" link. This is the moment when users are most likely to suspect a bug. (Spec 083: these appear in a compact inline row below "No cards found" when the results toolbar is removed.)

### Secondary: menu drawer

A "Report Bug" link in the sticky footer of the MenuDrawer (Spec 083). Available whenever the menu is open, regardless of result count.

### Tertiary: init page

When there is no query (the "Type a query to search" state), a "Report a problem" link appears next to "Source on GitHub". This lets users report general bugs — e.g., data won't load, UI glitches, accessibility issues — without needing to run a search first.

All entry points navigate to the report page via `pushState` (Spec 013).

## URL Format

```
?report&q=<encoded_query>   # when reporting a query bug
?report                     # when reporting a general bug (no query)
```

The `q` parameter preserves the query that triggered the report. When absent, the report page treats it as a general bug report (see below).

## Navigation Flow

```
search (?q=bad-query) → tap "Report a problem" → report (?report&q=bad-query) → back → search (?q=bad-query)
search (no query)     → tap "Report a problem" → report (?report)              → back → search
```

## Report Page When There Is No Query

When the user navigates to the report page without a query (e.g., from the init page), the form adapts for general bug reports:

- **Header:** Same — "Report a Problem" with back arrow.
- **Query section:** Hidden. No query to display.
- **Breakdown section:** Hidden. No breakdown exists.
- **Result count section:** Hidden. "0 results" is not meaningful.
- **User input:** Label "Describe the problem" with placeholder "What went wrong? (e.g., 'Data failed to load', 'Button doesn't respond')".
- **Scryfall comparison:** Hidden. Not applicable without a query.

**GitHub issue title:** `Bug report` (instead of `Query bug: <query>`).

**GitHub issue body:** Only the user's description and environment:

```markdown
## Description

<user's description from the textarea>

## Environment

- App version: <version or git hash>
- User agent: <navigator.userAgent>
- Date: <ISO date>
```

## Layout (Query Bug)

A single-column form within the same `max-w-2xl` container.

### Header

- Back arrow (←) on the left, calls `history.back()`.
- Title: "Report a Problem"

### Auto-captured Context (read-only)

Displayed at the top of the form so the user can see what will be included in the report:

#### Query

The query string, displayed in a monospace code block. Read-only — the user cannot edit it here (they should fix the query in the search bar if it was a typo, not a bug).

#### Breakdown

The breakdown tree, rendered in the same format as the `QueryBreakdown` component (Spec 009): per-node labels with match counts. This shows the user (and the maintainer) exactly how the engine interpreted the query.

#### Result Count

"0 results" or "N results" — confirms the outcome. When the query contains printing-level terms (e.g., `set:`, `r:`, `is:foil`) or `unique:prints`, the report additionally shows printing count: "N cards (M printings)".

### User Input

#### "What did you expect?"

A single textarea with the placeholder: "Which cards should this query find? (e.g., 'Lightning Bolt should match')"

This is phrased as a concrete question, not an open-ended "describe the bug." It guides the user toward the most useful information: the expected cards or behavior.

#### Scryfall comparison (optional)

A "Check Scryfall" button that fetches the Scryfall API to compare results.

**API:** `GET https://api.scryfall.com/cards/search?q=<query>` — returns `{ total_cards: number, ... }` on success, or a 404 JSON body for zero results. Scryfall supports CORS.

**Request requirements:** Scryfall asks for a descriptive `User-Agent` header and 50–100ms between requests. Since this is a single user-initiated request per report, rate limiting is not a concern.

**States:**

- **Idle:** Button reads "Check Scryfall". No comparison data in the report.
- **Loading:** Button shows a spinner or "Checking…". Disabled to prevent double-fetch.
- **Success:** Displays "Scryfall found N cards" (or "Scryfall found 0 cards"). The count and a Scryfall search link are included in the report body.
- **Error:** Displays "Couldn't reach Scryfall" (network error) or "Query not supported by Scryfall" (4xx response). The report can still be submitted without comparison data.

This is the strongest possible bug signal — if Scryfall finds cards and we don't, there's almost certainly a bug in our engine.

### Review & Submit

Two buttons, side-by-side. "Review on GitHub" is the primary action; "Copy Report" is secondary.

#### "Review on GitHub" (primary)

1. Constructs a GitHub Issues URL with pre-filled title and body.
2. Opens it in a new tab.
3. The user reviews the pre-filled issue and submits (requires a GitHub account).

No API token, no server, no authentication. The entire flow is client-side URL construction.

#### "Copy Report" (secondary)

1. Copies the full Markdown report body (identical to the GitHub issue body) to the clipboard via `navigator.clipboard.writeText()`.
2. After copying, the button text changes to "Copied!" for ~2 seconds, then reverts.

This is the escape hatch for users who aren't logged into GitHub or prefer to send the report through another channel (Discord, Slack, email, etc.).

## GitHub Issue Format

### URL

```
https://github.com/<owner>/<repo>/issues/new?title=<encoded_title>&body=<encoded_body>&labels=bug
```

The `labels=bug` parameter auto-applies a label if the repo has one configured. GitHub silently ignores the parameter if the label doesn't exist.

### Title

- **Query bug:** `Query bug: <query>` — the query is truncated to ~80 characters if long.
- **General bug:** `Bug report`

The user can edit the title on GitHub before submitting.

### Body Template (Query Bug)

```markdown
## Query

`<query>`

## Expected

<user's description from the textarea>

## Actual

<N> results — or, when the query has printing-level semantics, "N cards (M printings)".

## Breakdown

```
<label>    <count>
<label>    <count>
...
```

## Scryfall Comparison

<"Scryfall found N cards: [link]" or "Not checked">

## Environment

- App version: <version or git hash>
- User agent: <navigator.userAgent>
- Date: <ISO date>
```

The breakdown is rendered as plain text (not the tree widget) for readability in the GitHub issue. Indentation reflects nesting.

For the general bug body template (Description + Environment only), see "Report Page When There Is No Query" above.

### App Version

The app version can be injected at build time via a Vite `define` constant (similar to `__COLUMNS_FILENAME__`). A git commit hash or a semver string — either works. This ties the report to a specific build, which is essential for debugging.

## Serializing the Breakdown

The breakdown tree (`BreakdownNode`) must be serialized to plain text for the issue body. A simple recursive function:

```typescript
function serializeBreakdown(node: BreakdownNode, indent = 0): string {
  const prefix = '  '.repeat(indent)
  const line = `${prefix}${node.label}  ${node.matchCount.toLocaleString()}`
  if (!node.children) return line
  return [line, ...node.children.map(c => serializeBreakdown(c, indent + 1))].join('\n')
}
```

This produces output like:

```
AND  0
  t:creature  14,230
  c:green  8,450
  pow>5  2,100
  legal:pauper  6,800
```

## Offline Behavior

The form can be filled out entirely offline. All auto-captured data (query, breakdown, result count) comes from in-memory app state.

The "Review on GitHub" button opens an external URL, which requires network. If the user is offline:

- The button remains enabled (we don't need to detect connectivity).
- The browser will show its standard offline error page when the GitHub URL fails to load.
- The user's form input is not lost — they can hit back and try again later.

This is acceptable because the entire report flow up to the final submission is offline-capable, and the submission step is an explicit user action to an external service.

## Acceptance Criteria

1. A "Report a problem" link appears in the zero-results state, in the query breakdown panel, and on the init page (next to Source on GitHub).
2. Tapping the link navigates to the report page (`?report&q=...` when there is a query, `?report` when there is not). Browser back returns to the search view.
3. When there is a query, the report page displays the query, breakdown tree, and result count as read-only context.
4. When there is no query, the report page shows only the description textarea and environment info (no query, breakdown, result count, or Scryfall comparison).
5. A textarea allows the user to describe their expectation (query bugs) or the problem (general bugs).
6. When there is a query, a "Check Scryfall" button fetches the Scryfall API and displays the result count. The comparison is included in the report body when checked.
7. The "Review on GitHub" button opens a pre-filled GitHub issue in a new tab.
8. The issue body contains the appropriate sections: query/expected/actual/breakdown/Scryfall for query bugs; description/environment for general bugs.
9. The form is fully functional offline (except the final GitHub submission).
10. A "Copy Report" button copies the full Markdown report to the clipboard.
11. After copying, the button shows brief visual confirmation ("Copied!" for ~2 seconds).
