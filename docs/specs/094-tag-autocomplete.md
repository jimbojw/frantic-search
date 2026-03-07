# Spec 094: Tag Autocomplete for otag: and atag:

**Status:** Implemented

**Depends on:** Spec 089 (Inline Autocomplete), Spec 092 (Tag Data Model), Spec 093 (Evaluator Tag Queries), Issue #99 (Epic: otag/atag Support)

## Goal

Extend inline autocomplete (Spec 089) so that typing `otag:ram` suggests `ramp` and `atag:cha` suggests `chair`. Tag labels are prefix-matched against the loaded tag datasets and presented as ghost text, using the same Tab/swipe/tap acceptance flow as other field values.

## Background

Spec 089 provides field-value autocomplete for `set:`, `t:`, `r:`, `f:`, `c:`, `is:`, etc. The completion context is inferred from token position; the suggestion comes from a field-specific data source. Spec 093 added evaluator support for `otag:` and `atag:` (alias `art:`), but autocomplete returns `null` for these fields because no tag label data is available on the main thread.

The worker loads tag data asynchronously and posts `otags-ready` and `atags-ready` status messages. Currently these messages carry no payload. The tag label lists (keys from `OracleTagData` and the illustration tag `Map`) exist only in the worker. To support autocomplete, the main thread needs the label lists.

### Data size

| Dataset | Tag count | Approx. label list size |
|---------|-----------|-------------------------|
| Oracle tags | ~5,100 | ~200 KB |
| Illustration tags | ~11,500 | ~300 KB |

One-time transfer when each tag file loads. Comparable to `set_codes` (deduped from printings).

## Design

### Worker protocol changes

Extend the status messages to include tag labels:

| Message | New payload | Source |
|---------|-------------|--------|
| `otags-ready` | `{ tagLabels: string[] }` | `Object.keys(otags)` |
| `atags-ready` | `{ tagLabels: string[] }` | `Array.from(illustrationMap.keys())` |

Update `FromWorker` in `shared/src/worker-protocol.ts`:

```typescript
| { type: 'status'; status: 'otags-ready'; tagLabels: string[] }
| { type: 'status'; status: 'atags-ready'; tagLabels: string[] }
```

### AutocompleteData extension

Add optional fields to `AutocompleteData` in `app/src/query-autocomplete.ts`:

```typescript
export type AutocompleteData = {
  // ... existing fields ...
  oracleTagLabels?: string[]
  illustrationTagLabels?: string[]
}
```

### buildAutocompleteData

Extend the signature to accept optional tag label params, or add a third parameter. The caller (App, DualWieldLayout) builds the base data from `display` and `printingDisplay`, then merges in tag labels from state. Options:

- **Option A:** Add optional third param: `buildAutocompleteData(display, printingDisplay, { oracleTagLabels?, illustrationTagLabels? })`
- **Option B:** Keep `buildAutocompleteData` as-is; caller merges tag labels into the returned object before use.

Spec recommends Option A for clarity: the function is the single place that assembles autocomplete data.

### computeSuggestion

In the `case 'value':` branch, add:

```typescript
if (fn === 'otag') {
  if (!data.oracleTagLabels?.length) return null
  const match = firstMatchByPrefix(data.oracleTagLabels, prefix)
  return match
}
if (fn === 'atag' || fn === 'art') {
  if (!data.illustrationTagLabels?.length) return null
  const match = firstMatchByPrefix(data.illustrationTagLabels, prefix)
  return match
}
```

Match uses `firstMatchByPrefix` (case-insensitive, alphabetical) — same as `set:`, `is:`, etc.

### Context detection

No changes. `getCompletionContext` already returns `type: 'value'` with `fieldName: 'otag'` or `'atag'` when the cursor is in a value token after `otag:` or `atag:` / `art:`. `getCanonicalField` maps `art` → `atag`, so `fn` will be `'atag'` for both `atag:` and `art:`.

### Data availability

- **Before `otags-ready`:** `oracleTagLabels` is empty or undefined. No completion for `otag:`.
- **Before `atags-ready`:** `illustrationTagLabels` is empty or undefined. No completion for `atag:` / `art:`.
- **Tag download failed:** If tag files never load, the worker never posts `otags-ready` / `atags-ready`. Same as above — no completion.

### App state

- Add `oracleTagLabels` and `illustrationTagLabels` signals (or a single `tagLabels: { oracle?: string[], illustration?: string[] }`).
- In `worker.onmessage`, when `msg.status === 'otags-ready'`, set `oracleTagLabels(msg.tagLabels)`.
- When `msg.status === 'atags-ready'`, set `illustrationTagLabels(msg.tagLabels)`.
- Pass both into `buildAutocompleteData` when constructing the autocomplete data memo.

### DualWieldLayout

Same pattern as App: track tag labels from worker messages, pass into `buildAutocompleteData`. Each pane may share the same worker state (depending on how the app is structured); tag labels are global once loaded.

## File organization

| File | Changes |
|------|---------|
| `shared/src/worker-protocol.ts` | Extend `otags-ready` and `atags-ready` status types with `tagLabels` |
| `app/src/worker.ts` | Include `tagLabels` in `post({ type: 'status', status: 'otags-ready', ... })` and `atags-ready` |
| `app/src/query-autocomplete.ts` | Add `oracleTagLabels`, `illustrationTagLabels` to `AutocompleteData`; extend `buildAutocompleteData`; add `otag`/`atag` cases in `computeSuggestion` |
| `app/src/App.tsx` | Add tag label state; pass to `buildAutocompleteData`; handle `tagLabels` in `otags-ready` / `atags-ready` |
| `app/src/DualWieldLayout.tsx` | Same state and `buildAutocompleteData` wiring for dual-pane |

## Acceptance criteria

1. Typing `otag:ram` suggests `ramp` as ghost text (when oracle tags are loaded); Tab accepts.
2. Typing `atag:cha` suggests `chair` (or first match) as ghost text (when illustration tags are loaded); Tab accepts.
3. Typing `art:foo` suggests an illustration tag (same data source as `atag:`); Tab accepts.
4. No completion for `otag:` before `otags-ready`; no completion for `atag:` / `art:` before `atags-ready`.
5. Prefix match is case-insensitive; first alphabetical match wins.
6. No regressions to existing autocomplete (set, type, is, etc.).

## Implementation Notes

- 2026-03-07: Implemented per spec. Worker protocol extended with `tagLabels`; `buildAutocompleteData` accepts optional third param; `computeSuggestion` handles `otag` and `atag`/`art`; `PaneState` and `CreatePaneStateOpts` extended with `oracleTagLabels` and `illustrationTagLabels` accessors for dual-wield layout.
