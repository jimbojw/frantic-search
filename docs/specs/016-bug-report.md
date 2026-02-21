# Spec 016: Bug Report Page

**Status:** Draft

**Depends on:** Spec 013 (URL State & History), Spec 009 (Query Breakdown)

## Goal

Make it easy for users to report query bugs — cases where Frantic Search returns unexpected results (especially zero results when cards should match). The report page auto-captures all diagnostic context and guides the user to provide the one thing we can't capture automatically: what they expected.

## Background

The query engine is complex: a hand-rolled lexer, parser, and evaluator operating on bitmask-encoded card data. Bugs are inevitable — a field alias might be missing, a comparison might be inverted, a regex might not desugar correctly. The hardest part of fixing these bugs is *reproducing them*, because the report often arrives as "search didn't work" with no query, no expected result, and no version info.

The breakdown tree (Spec 009) already provides per-node match counts, which is exactly the diagnostic data a maintainer needs. By auto-capturing the query, breakdown, and environment, we eliminate the back-and-forth and let the user focus on describing their expectation.

## Entry Points

### Primary: zero-results state

When a query returns no results, a "Report a problem" link appears alongside the existing "Try on Scryfall ↗" link. This is the moment when users are most likely to suspect a bug.

### Secondary: query breakdown panel

A "Report a problem" link at the bottom of the breakdown panel. Users who are already inspecting per-node match counts and spot something wrong can report directly from that context.

Both entry points navigate to the report page via `pushState` (Spec 013).

## URL Format

```
?report&q=<encoded_query>
```

The `q` parameter preserves the query that triggered the report. The report page reads it to display the query and auto-populate the issue body.

## Navigation Flow

```
search (?q=bad-query) → tap "Report a problem" → report (?report&q=bad-query) → back → search (?q=bad-query)
```

## Layout

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

"0 results" or "N results" — confirms the outcome.

### User Input

#### "What did you expect?"

A single textarea with the placeholder: "Which cards should this query find? (e.g., 'Lightning Bolt should match')"

This is phrased as a concrete question, not an open-ended "describe the bug." It guides the user toward the most useful information: the expected cards or behavior.

#### Scryfall comparison (optional)

A checkbox: "Scryfall returns different results for this query"

When checked, the report body includes a Scryfall comparison link (`https://scryfall.com/search?q=<query>`). This is the strongest possible bug signal — if Scryfall finds cards and we don't, there's almost certainly a bug in our engine. The link is auto-generated from the query.

### Review & Submit

A "Review on GitHub" button that:

1. Constructs a GitHub Issues URL with pre-filled title and body.
2. Opens it in a new tab.
3. The user reviews the pre-filled issue and submits (requires a GitHub account).

No API token, no server, no authentication. The entire flow is client-side URL construction.

## GitHub Issue Format

### URL

```
https://github.com/<owner>/<repo>/issues/new?title=<encoded_title>&body=<encoded_body>&labels=bug
```

The `labels=bug` parameter auto-applies a label if the repo has one configured. GitHub silently ignores the parameter if the label doesn't exist.

### Title

Auto-generated: `Query bug: <query>`

The query is truncated to ~80 characters if long. The user can edit the title on GitHub before submitting.

### Body Template

```markdown
## Query

`<query>`

## Expected

<user's description from the textarea>

## Actual

<N> results

## Breakdown

```
<label>    <count>
<label>    <count>
...
```

## Scryfall Comparison

<"Scryfall returns different results: [link]" or "Not checked">

## Environment

- App version: <version or git hash>
- User agent: <navigator.userAgent>
- Date: <ISO date>
```

The breakdown is rendered as plain text (not the tree widget) for readability in the GitHub issue. Indentation reflects nesting.

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

1. A "Report a problem" link appears in the zero-results state and in the query breakdown panel.
2. Tapping the link navigates to the report page (`?report&q=...`). Browser back returns to the search view.
3. The report page displays the query, breakdown tree, and result count as read-only context.
4. A textarea allows the user to describe their expectation.
5. An optional checkbox captures whether Scryfall returns different results.
6. The "Review on GitHub" button opens a pre-filled GitHub issue in a new tab.
7. The issue body contains the query, expected behavior, breakdown, Scryfall comparison status, and environment info.
8. The form is fully functional offline (except the final GitHub submission).
