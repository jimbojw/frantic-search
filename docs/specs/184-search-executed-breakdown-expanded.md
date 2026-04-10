# Spec 184: search_executed breakdown_expanded Property

**Status:** Implemented

**Implements:** [GitHub #256](https://github.com/jimbojw/frantic-search/issues/256)

**Depends on:** Spec 085 (PostHog Analytics), Spec 079 (Consolidated Query Accordion), Spec 144 (search_executed scope — left/single pane only)

## Goal

Add a `breakdown_expanded` property to the `search_executed` analytics event so we can tell whether the unified query breakdown accordion was visible when each search was captured—not merely when the user last toggled it.

## Background

The unified query breakdown accordion shows chips derived from the user’s query (Spec 079). `ui_interacted` with `element_name: 'breakdown'` fires on expand/collapse toggles, but that stream does not answer: “For this specific debounced search event, was the breakdown open?” Correlating visibility with `search_executed` supports analysis of whether diagnostic UI influenced the search journey.

## Design

### 1. Schema Extension

Add `breakdown_expanded: boolean` to the `search_executed` event properties (Spec 085 §4). Other properties on the same event remain as defined in Spec 085 §7 and §7a.

### 2. Value Semantics

| Value   | Meaning |
|---------|---------|
| `true`  | The left/single pane’s unified breakdown accordion is **expanded** at the instant the app handles the worker `result` and calls `scheduleSearchCapture`. |
| `false` | That accordion is **collapsed** at that instant. |

The value is **snapshotted** into the pending debounced payload (same pattern as `url_snapshot`). The emitted `search_executed` reflects UI state at **result-handling time**, not at PostHog capture time after the debounce window.

### 3. Derivation Logic

Read the existing `breakdownExpanded` signal in `app/src/App.tsx` at the `scheduleSearchCapture` call site in the left-pane `result` handler—same scope as Spec 144’s `triggered_by`. Do **not** use `breakdownExpanded2` (right pane).

### 4. Scope

Only the left/single pane emits `search_executed` (Spec 144). If the right pane later emits its own `search_executed`, it would snapshot `breakdownExpanded2`; that is out of scope until implemented.

## Scope of Changes

| File | Change |
|------|--------|
| `docs/specs/184-search-executed-breakdown-expanded.md` | New spec (this document). |
| `docs/specs/085-posthog-analytics.md` | Update `search_executed` row, §7 data available, §7 event line, revision history. |
| `app/src/analytics.ts` | Add `breakdown_expanded` to `captureSearchExecuted` params. |
| `app/src/useSearchCapture.ts` | Add `breakdown_expanded` to `scheduleSearchCapture` args and pending payload; pass through to capture. |
| `app/src/App.tsx` | Pass `breakdownExpanded()` at `scheduleSearchCapture` call site. |
| `app/src/useSearchCapture.test.ts` | Expect `breakdown_expanded` on captured payloads. |

## Acceptance Criteria

1. Every emitted `search_executed` includes `breakdown_expanded: boolean` (snake_case PostHog property).
2. The value matches left-pane accordion expansion at the moment `scheduleSearchCapture` runs for that result.
3. Analytics can segment or correlate `search_executed` by `breakdown_expanded` without joining to `ui_interacted` toggle sequences.

## Edge Cases

- **Empty query:** `search_executed` is not fired (unchanged; Spec 085).
- **User toggles breakdown during debounce:** The emitted event uses the **snapshot** from when the result was scheduled; toggling before the timer fires does not retroactively change the pending payload’s `breakdown_expanded`.
- **Coherence discard:** If Spec 085’s coherence check drops a pending event, `breakdown_expanded` for that payload is irrelevant; the next qualifying schedule carries a fresh snapshot.
- **Dual wield, right-only query:** Left pane may not schedule capture; unchanged (Spec 144).
