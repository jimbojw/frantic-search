# Spec 115: Deck Editor Line-Centric Validation

**Status:** Implemented

**Depends on:** Spec 113 (Deck Editor Toolbar and Status Redesign), Spec 114 (Worker-Based Deck List Validation)

## Goal

Redesign deck list validation around a trimmed-line-centric data model. Each line has one of three states; the main thread memoizes per line; the worker receives only changed lines and returns only errors/warnings. This minimizes wire traffic, avoids re-validating unchanged lines, and keeps the Status box responsive when editing large lists.

## Background

Spec 114 moves validation to the worker. Currently the main thread sends the full draft text on every change and receives the full `ValidationResult` (all lines, including `kind: 'ok'`). The worker already memoizes per line internally. This spec adds main-thread memoization and changes the protocol so the worker validates only requested lines and returns only error/warning lines.

## Design

### 1. Trimmed-Line-Centric Data Model

The deck list is modeled as a **set of lines**. Line identity is **trimmed content only** — no other normalization. Each trimmed line is either valid or invalid; the same line appearing twice (e.g. "4 Lightning Bolt" on lines 5 and 12) shares one validation result.

### 2. Line States

| State | Meaning |
|-------|---------|
| **Unvalidated** | Not in cache; must be sent to worker |
| **Validated** | In cache as `'valid'`; worker confirmed or seeded from baseline |
| **Invalid** | In cache as `LineValidation`; worker reported errors |

**Write-once:** Once a trimmed-line transitions from unvalidated to valid or invalid, that cache entry is never overwritten.

### 3. Display → Edit and Refresh: No Worker Call

When transitioning from Display to Edit, the draft text is the serialized output of the current list. Every line is known valid by construction. **Never send these lines to the worker.** Pre-populate the cache with `'valid'` for each baseline line.

**Persist baseline in localStorage** when entering Edit mode. On refresh (or restore from another tab), restore both draft and baseline. When `draft === baseline`, we know every line is valid — the baseline was the serialized output. No worker call. This avoids re-validating the entire list after a hard refresh.

### 4. Main-Thread Line Cache

```typescript
// trimmed line → validation result
Map<string, 'valid' | LineValidation>
```

- **`Map.has()` miss** — Unvalidated. Line must be sent to the worker.
- **`'valid'`** — Validated. Line passed; not sent over the wire.
- **`LineValidation`** — Erroneous. Stored for highlights and quick fixes.

**Cache key:** `line.trim()`. Empty lines and comments are treated as valid (or cached as `'valid'`).

**Pre-populate from baseline:** On Display → Edit or refresh, iterate baseline lines and set `cache[line.trim()] = 'valid'` for each. This seeds the cache with known-valid lines. Only lines not in the baseline (or with changed content) will miss the cache and require validation. Example: user has edited 5 of 100 lines; after refresh, pre-populate from baseline → only those 5 lines are sent to the worker.

**Revert:** Draft = stored baseline. No cache action needed — the cache already has all baseline lines from the path that led here (Display → Edit or refresh seeded it; user edits did not remove baseline entries).

### 5. Differing Lines

When the draft changes (debounced):

1. Split draft into lines: `text.split(/\r?\n/)`.
2. For each line, compute cache key: `line.trim()`.
3. Lines **not in cache** → need validation.
4. Collect unique trimmed lines that need validation (deduplicate: `"4 Lightning Bolt"` and `"  4 Lightning Bolt  "` both key to the same trimmed line; send only one).
5. Send only those **trimmed** lines to the worker. The worker validates the canonical form; `spanRel` is always relative to the trimmed line.

When the user edits one line, only that line becomes unvalidated. **The cache is write-once per key:** once a trimmed-line transitions from unvalidated to valid or invalid, that entry is never overwritten. Example: the list has "1 Lightning Bolt" and "1 Lightning Bol". When the user types `t` on the second line, the trimmed content becomes "1 Lightning Bolt" — already known valid (from baseline or the first line). Cache hit; no worker call.

### 6. Worker Protocol

**ToWorker (replaces Spec 114 § 2 for validation):**

```typescript
| { type: 'validate-list'; requestId: number; lines: string[] }
```

- `lines` — Only the lines to validate. No full text.

**FromWorker:**

```typescript
| { type: 'validate-result'; requestId: number; result: LineValidationResult[]; resolved?: (ParsedEntry | null)[] }
```

- `result` — **Only** error/warning entries. Known-good lines are omitted.
- `resolved` — Parallel to the request `lines` array. `resolved[i]` is the `ParsedEntry` for valid lines; `null` or omitted for error/warning lines.

**LineValidationResult** (wire format):

```typescript
interface LineValidationResult {
  lineIndex: number;  // index in the request's lines array
  kind: 'error' | 'warning';
  message?: string;
  quickFixes?: QuickFix[];
  spanRel?: { start: number; end: number };  // relative to trimmed line (request lines are trimmed)
}
```

`lineIndex` identifies which requested line the result applies to. **`spanRel` is relative to the trimmed line** — since we send trimmed lines to the worker, spans are always in that canonical coordinate space. The main thread converts to absolute offsets when building the full `ValidationResult` (see § 8).

### 7. Worker Implementation

Add `validateLines(lines: string[]): { result: LineValidationResult[]; resolved: (ParsedEntry | null)[] }` that:

1. Validates each line in isolation (reuse existing per-line logic from `validateDeckListWithEngine`).
2. Returns only error/warning entries in `result`; collects `ParsedEntry` for valid lines in `resolved` (parallel array).
3. Uses `spanRel` for error spans (relative to the trimmed line — request lines are already trimmed). The worker already computes `spanRel` internally for its cache.

### 8. Main-Thread Merge

When the worker responds:

1. For each line in the request: if the response has a result with matching `lineIndex` → add to cache (key = trimmed line) as `LineValidation`; if not → line passed → cache as `'valid'` and store `resolved[i]` in the resolved cache.
2. Build full `ValidationResult` for the UI (Status box, error table, quick fixes), including `resolved` from the cache (see § 11):
   - Iterate draft lines, compute `lineStart`/`lineEnd` from offsets.
   - For each line: look up cache by trimmed content. If `'valid'`, synthesize `{ lineIndex, lineStart, lineEnd, kind: 'ok' }`. If `LineValidation`, add `lineStart`/`lineEnd` and convert `spanRel` to absolute `span`:
     - **Whitespace adjustment:** When the actual draft line has leading/trailing whitespace, `spanRel` (relative to trimmed content) must be shifted. Compute `trimmedStartInLine = line.match(/^\s*/)?.[0].length ?? 0`; then `span = { start: lineStart + trimmedStartInLine + spanRel.start, end: lineStart + trimmedStartInLine + spanRel.end }`.
   - Assemble `lines` array in line order.
   - Build `resolved`: iterate draft lines; for each valid card line (not comment/section/metadata), look up `ParsedEntry` from resolved cache (key = trimmed line). Append in order to produce `ValidationResult.resolved`.

### 9. Highlight Layer

Refactor `buildListSpans` to support line-level validation:

- Add `buildListSpansForLine(lineContent: string, validation?: LineValidation | null): ListHighlightSpan[]` — builds spans for a single line. When `validation` has `spanRel`, apply error styling to the overlapping token(s) within the line.
- **Whitespace adjustment:** `spanRel` is relative to the trimmed line. When `lineContent` has leading whitespace, compute `trimmedStart = lineContent.match(/^\s*/)?.[0].length ?? 0` and use `effectiveSpan = { start: trimmedStart + spanRel.start, end: trimmedStart + spanRel.end }` when checking token overlap.
- `buildListSpans(text, validation)` can delegate: split text into lines, for each line call `buildListSpansForLine`, accumulate offset for output. Or accept `(lines, lineValidations: Map<trimmedLine, 'valid' | LineValidation>)` and build per-line.

The highlight layer works with `spanRel`; no absolute offsets required for the line-level path.

### 10. Cache Invalidation

- **Revert:** Draft = baseline. No cache action; no worker call. Cache already has baseline lines.
- **Cancel / Apply:** Clear cache (edit session ended).
- **Enter Edit (Display → Edit):** Start with an empty cache. Immediately pre-populate from baseline lines (`cache[line.trim()] = 'valid'` for each). No worker call.

### 11. importDeckList and editDiffSummary

`editDiffSummary` needs `importDeckList` to parse the draft and compute additions/removals. Currently `importDeckList` calls `validateDeckList` internally for `resolved` and to skip error lines — that would re-run validation on the main thread and block.

**Solution:** Add an overload `importDeckList(text, display, printingDisplay, validationResult?)`. When `validationResult` is provided (from the cache-derived `ValidationResult`), use its `lines` and `resolved` instead of calling `validateDeckList`. The main thread passes the current `validationResult` signal into `importDeckList` when computing `editDiffSummary`.

**Cache for resolved:** When caching a valid line from the worker response, also store its `ParsedEntry` (e.g. extend cache to `Map<string, 'valid' | LineValidation | { valid: true; resolved: ParsedEntry }>` or use a separate `resolvedCache`). For baseline lines at Display→Edit: we have `props.instances` in memory; derive `ParsedEntry` from each instance (oracle_id, scryfall_id, quantity, finish) and populate the resolved cache when pre-seeding. No worker call needed.

## Acceptance Criteria

1. Main thread maintains a line cache keyed by trimmed line content.
2. On draft change, only lines not in cache are sent to the worker (trimmed, deduplicated).
3. Worker receives `lines: string[]` (trimmed) and returns error/warning lines with `spanRel`, plus `resolved` for valid lines.
4. Main thread merges response with cache and builds full `ValidationResult` (lines + resolved) for UI.
5. Display → Edit: no worker call. All lines known valid. Baseline persisted to localStorage. Resolved cache seeded from instances.
6. Refresh in Edit mode with draft === baseline: restore from localStorage; no worker call.
7. User edits: only changed line(s) sent. Validation status persists per line.
8. Cache is cleared on Cancel and Apply.
9. Highlight layer supports line-level span building with `spanRel` (including whitespace adjustment).
10. `importDeckList(text, display, printingDisplay, validationResult?)` accepts optional validation; `editDiffSummary` passes it to avoid main-thread validation.

## Implementation Notes

- The worker's `validateDeckListWithEngine` iterates lines. Extract per-line validation into a function that accepts a single line string and returns `LineValidationResult | null` (null = valid). `validateLines(lines)` maps over the array and filters out nulls; also collects `ParsedEntry` for valid lines to return as `resolved`.
- **Worker cache key:** Use `line.trim()` as the cache key in the worker's `lineResultCache` to align with main-thread semantics and avoid redundant validation when the same trimmed line is sent.
- Main thread: the validation effect computes differing lines (trimmed, deduplicated), posts `lines`, merges on response. The cache lives in a closure or module; `validationResult` signal is derived from the cache + current draft.
- **Request ordering:** Responses may arrive out of order. Merge into cache regardless — the cache is content-addressable by trimmed line. Ignore stale responses by matching `requestId` to the current in-flight request.
- **Baseline persistence:** Use `frantic-search-draft-baseline:{listId}` (same pattern as `draftKey` in DeckEditor). Write when entering Edit and on Revert. Clear on Cancel and Apply. Read on mount when restoring draft.
- **importDeckList:** Add optional fourth parameter `validationResult?: ValidationResult`. When provided, use `validationResult.lines` and `validationResult.resolved` instead of calling `validateDeckList`. DeckEditor passes the current `validationResult` from the cache-derived signal.
