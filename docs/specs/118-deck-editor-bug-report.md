# Spec 118: Deck Editor Bug Report

**Status:** Implemented

**Depends on:** Spec 013 (URL State & History), Spec 016 (Bug Report Page), Spec 110 (Hybrid Deck Editor), Spec 113 (Deck Editor Toolbar)

**See also:** Spec 090 (Lists Page), Spec 115 (Deck Editor Line-Centric Validation)

## Goal

Make it easy for users to report deck editor bugs — cases where paste/import, export, validation, or format handling behaves unexpectedly. Examples: "Didn't paste right into Moxfield", "Didn't preserve tags", "Wrong card resolved for set code". A dedicated `DeckBugReport` component auto-captures deck-specific context and guides the user to describe what they expected.

## Background

The deck editor (Spec 110) supports multiple formats (Arena, Moxfield, TappedOut, Archidekt, MTGGoldfish, Melee), each with distinct syntax for zones, tags, foil markers, and set/collector info. Bugs are format-specific: a Moxfield paste might lose tags, an Arena export might misformat sideboard headers, validation might mis-resolve a printing. The query bug report (Spec 016) is tailored to search results; deck bugs need different context — the list content, format, validation state, and what the user tried to do (paste from X, export to Y).

By using a **separate** `DeckBugReport` component, we keep the report body focused on deck-editor concerns and avoid overloading the query bug report with conditional logic. The two report flows share the same URL base (`?report`) and navigation pattern but render different components.

## Entry Point

### Primary: Deck Editor toolbar

A persistent `[ Bug ]` button in the Deck Editor toolbar, positioned **immediately left of Copy** (Spec 113). Copy stays at the corner (easiest to find); Bug maintains a constant position; when Review or Save appears, it goes to the left of Bug. Visible in Display, Edit, and Review modes; disabled in Init mode (no list content to report). Same styling as Copy — transparent background, gray text, `border-l` separator. `aria-label="Report deck problem"`.

| Mode | Right group |
|------|-------------|
| Display | `[ Bug ]` `[ Copy ]` |
| Edit, no changes | `[ Bug ]` `[ Copy ]` |
| Edit, with changes | `[ Review * ]` `[ Bug ]` `[ Copy ]` |
| Review | `[ Save * ]` `[ Bug ]` `[ Copy ]` |

Tapping the Bug button navigates to the deck report page via `pushState` (Spec 013).

## URL Format

```
?report&deck=1
```

The `deck=1` parameter distinguishes deck reports from query reports (`?report&q=...`) and general reports (`?report`). The App renders `DeckBugReport` when `view === 'report'` and `params.get('deck') === '1'`.

## Navigation Flow

```
lists (?list) → tap [ Bug ] → report (?report&deck=1) → back → lists (?list)
lists (?list=trash) → tap [ Bug ] → report (?report&deck=1) → back → lists (?list=trash)
```

Browser back returns to the Lists page with the same tab (default or trash).

## Report Context (Auto-captured)

Captured at the moment the user taps the Bug button. Passed from DeckEditor → ListsPage → App, then stored in App state for the report view.

| Field | Type | Notes |
|-------|------|-------|
| `listContent` | string | The deck list text. In Display mode: serialized output. In Edit mode: current draft text. In Review mode: would-be-committed list (canonical form). |
| `format` | string | Detected or selected format label (e.g. `"Arena"`, `"Moxfield"`, `"TappedOut"`). |
| `listName` | string | List metadata name (e.g. `"My List"`). |
| `listId` | string | List ID (e.g. `"default"`, `"trash"`). Extensible when additional tabs are added. |
| `mode` | `'display' \| 'edit' \| 'review'` | Editor mode when Bug was tapped. Init mode does not show Bug button. |
| `validationErrors` | `LineValidation[]` | Any validation errors (Edit mode). Empty when valid. Derived from `validation()?.lines.filter(l => l.kind !== 'ok') ?? []`. |
| `instanceCount` | number \| undefined | Total card count (sum of quantities across instances). Display mode only. Omitted in Edit mode. |

```typescript
interface DeckReportContext {
  listContent: string
  format: string
  listName: string
  listId: string
  mode: 'display' | 'edit' | 'review'
  validationErrors: LineValidation[]
  instanceCount?: number
}
```

## Layout

A single-column form within the same `max-w-2xl` container used by the query bug report (Spec 016).

### Header

- Back arrow (←) on the left, calls `history.back()`.
- Title: "Report a Deck Problem"

### Auto-captured Context (read-only)

Displayed at the top so the user sees what will be included:

#### List Content

The deck list text in a monospace code block, read-only. Truncated if very long (first 200 lines) with a note: "… (truncated, full content included in report body)".

An **"Omit deck list from bug report"** checkbox allows the user to exclude the list from the report. When checked: the List Content preview is hidden (or replaced with "Deck list omitted per user request"); the "## Deck List" section is omitted from the GitHub issue body and copied report. Use case: the user wants to report a bug (e.g. "Moxfield export lost tags") but does not want to share their deck list. Default: unchecked (list included).

#### Format & Mode

- **Format:** e.g. "Moxfield"
- **Mode:** "Display", "Editing", or "Review"
- **List:** e.g. "My List" (default) or "Trash"

#### Validation Errors (when present)

If `validationErrors` is non-empty, show a summary: "N error(s)" and a compact list (1-based line number + message). Full detail is in the report body.

#### Instance Count (Display mode only)

When in Display mode: "N card(s)" — confirms the list size.

### User Input

#### "What went wrong?"

A single textarea with placeholder: "Describe the problem (e.g. 'Pasted from Moxfield but tags were lost', 'Export to Arena had wrong sideboard format', 'Card X resolved to wrong printing')"

This guides the user toward format-specific, export/import, or validation issues.

### Review & Submit

Two buttons, side-by-side. "Review on GitHub" (primary); "Copy Report" (secondary). Same behavior as Spec 016 § "Review & Submit".

## GitHub Issue Format

### URL

```
https://github.com/<owner>/<repo>/issues/new?title=<encoded_title>&body=<encoded_body>&labels=bug
```

Uses the same `__BUGS_URL__` base as the query bug report.

### Title

```
Deck bug: <short description or format>
```

Truncate to ~80 characters. Use the first line of the user's description (truncated to fit); if empty, use the format label. Example: `Deck bug: Moxfield paste lost tags`

### Body Template

When "Omit deck list" is unchecked (default):

```markdown
## Description

<user's description from the textarea>

## Context

- Format: <format>
- Mode: <display | edit | review>
- List: <listName> (<listId>)
- Instance count: <N> (Display mode only; omit in Edit)

## Validation Errors

<When empty: "None">
<When present: for each error, "L<n>: <message>" on its own line. Use 1-based line numbers (lineIndex + 1). Use message when present; if absent, use "(no message)".>

## Environment

- App version: <version or git hash>
- User agent: <navigator.userAgent>
- Date: <ISO date>

## Deck List

```
<list content — full text, not truncated>
```
```

When "Omit deck list" is checked, omit the "## Deck List" section entirely. The report body contains Description, Context, Validation Errors, and Environment only.

## Data Flow

1. **DeckEditor** receives `onDeckReportClick?: (context: DeckReportContext) => void` via props.
2. **DeckEditorToolbar** renders the Bug button. On click, calls `onDeckReportClick` with context (listContent, format, listName, listId, mode, validationErrors, instanceCount).
3. **ListsPage** receives `onDeckReportClick` from App and passes it to DeckEditor.
4. **App** implements `navigateToDeckReport(context)`:
   - Stores context in a signal (e.g. `deckReportContext`)
   - Pushes `?report&deck=1` via `history.pushState`
   - Sets `view('report')`
   - Scrolls to top
5. When `view() === 'report'` and URL has `deck=1`, App renders `DeckBugReport` with `context={deckReportContext()}`. App must track which report type to show (e.g. a `reportMode` signal or reading params when view is report) since `location.search` is not reactive.
6. **DeckBugReport** builds the report body from context, provides textarea for user description, and implements Review on GitHub / Copy Report.

## Component Architecture

- **DeckBugReport** — New component in `app/src/DeckBugReport.tsx`. Props: `context: DeckReportContext | null`. When context is null (e.g. direct URL navigation without coming from Lists), show a minimal fallback: "No deck context. Go to My List and use the Bug button to report a deck problem." with back button.
- **BugReport** — Unchanged. Rendered when `view === 'report'` and no `deck` param.
- **DeckEditorToolbar** — Add Bug button; add `onDeckReportClick` to context.
- **DeckEditorContext** — Add `onDeckReportClick` and `handleDeckReport` (or equivalent) to the context value.

## Offline Behavior

Same as Spec 016: the form is filled out offline. "Review on GitHub" requires network; Copy Report works offline.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/DeckBugReport.tsx` | New component. Report form for deck context. |
| `app/src/deck-editor/DeckEditorToolbar.tsx` | Add Bug button immediately left of Copy. |
| `app/src/deck-editor/DeckEditorContext.tsx` | Add `onDeckReportClick` to context. |
| `app/src/deck-editor/DeckEditor.tsx` | Accept `onDeckReportClick` prop; pass to context. |
| `app/src/ListsPage.tsx` | Pass `onDeckReportClick` to DeckEditor. |
| `app/src/App.tsx` | Add `navigateToDeckReport`, `deckReportContext` signal; render DeckBugReport when `?report&deck=1`. |
| `app/src/app-utils.ts` | No change — `parseView` already returns `'report'` for `?report`. |

## Acceptance Criteria

1. A `[ Bug ]` button appears in the Deck Editor toolbar, immediately left of Copy, in Display and Edit modes.
2. The Bug button is disabled in Init mode.
3. Tapping the Bug button navigates to `?report&deck=1`. Browser back returns to the Lists page.
4. The deck report page displays "Report a Deck Problem" with back arrow.
5. Auto-captured context (list content, format, mode, list name, validation errors, instance count) is shown read-only.
6. A textarea allows the user to describe the problem.
7. "Review on GitHub" opens a pre-filled GitHub issue with the deck bug body template.
8. "Copy Report" copies the full Markdown report to the clipboard.
9. After copying, the button shows "Copied!" for ~2 seconds.
10. When navigating directly to `?report&deck=1` without deck context (e.g. bookmark, refresh), the page shows a fallback message and back button.
11. The Bug button uses the same visual style as Copy (transparent, gray, border-l).
12. An "Omit deck list from bug report" checkbox excludes the deck list from the report when checked. Default: unchecked.
13. The Bug button has `aria-label="Report deck problem"`.

## Implementation Notes

- 2026-03-11: Implemented per spec. Bug button uses `IconBug` from `app/src/Icons.tsx`. `instanceCount` uses `instances.length` (each InstanceState is one card; the model has no quantity field).
- 2026-03-11: Reordered layout: List Content section moved after Review/Copy buttons so the CTA (description + buttons) appears above the fold.
- 2026-03-11: Reordered report body: Deck List section moved to end (after Environment) so the GitHub issue/copied Markdown leads with description, context, validation, environment; raw deck list is last for investigation.
