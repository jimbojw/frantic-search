# Spec 116: Index-Based Deck Validation Protocol

**Status:** Implemented

**Depends on:** Spec 109 (Deck Instance Model), Spec 114 (Worker-Based Deck List Validation), Spec 115 (Deck Editor Line-Centric Validation)

## Goal

Revamp IPC between the main thread and worker for the DeckEditor flow by returning **oracle and scryfall indices** instead of string IDs from validation. The main thread derives line metadata locally; the worker supplies only the indices needed to resolve trimmed lines to Instances. This enables Transferable payloads, reduces wire traffic, and ensures Apply can run without re-validation or main-thread blocking.

## Background

Specs 114 and 115 move deck list validation to the worker and add line-centric memoization. The worker returns `ParsedEntry` objects with `oracle_id` and `scryfall_id` strings. The main thread already receives `DisplayColumns` and `PrintingDisplayColumns` (including `oracle_ids` and `scryfall_ids` arrays) at init. Returning indices instead of strings:

- Reduces payload size (8 bytes per line vs ~72+ chars)
- Enables `Transferable` for zero-copy transfer
- Aligns with the index-based result protocol (Spec 024)
- Keeps resolution logic in the worker while the main thread performs cheap lookups

## Key Concepts

| Term | Definition |
|------|-------------|
| **Draft deck list** | A sequence of lines of text, each representing one card or specific printing, plus optional metadata. |
| **Instance** | Internal Frantic Search model for a card or printing. Has immutable `oracle_id`, optionally `scryfall_id` and `finish`. Mutable metadata: `list_id`, `zone`, `tags`, `collection_status`, `variant`. |
| **Trimmed line** | A line from a draft deck list with whitespace trimmed. Memoization key for validation status and resolved data. |
| **Validation status** | `Unvalidated` (not yet resolved), `Valid` (exact Scryfall match), or `Invalid` (no match). |
| **Line metadata** | Everything in a trimmed line except oracle_id/scryfall_id/finish: `zone`, `tags`, `collection_status`, `variant`. Derived from lexing. |

## Design

### 1. Responsibility Split

**Main thread can derive:**

- **Line metadata** — From RegEx-based lexing. Zone, tags, collection_status, variant are token-driven.
- **Order-based metadata** — Several deck formats use section headers or line separation to denote zones (e.g. Melee.gg `MainDeck`, `Commander`, `Sideboard` / `SIDEBOARD:`). This is a main-thread responsibility. Line-based metadata (e.g. `#Commander`, `[Commander{top}]`) takes precedence over order-based when both apply. How this is parsed and applied is implementation detail; the IPC and worker are unaffected.
- **Validation status (some cases)** — Baseline lines (serialized from saved Instances) are known valid by construction. Display→Edit: no worker call.

**Main thread cannot derive:**

- **Validation status (general case)** — Pasted deck lists require search-engine resolution. The worker has CardIndex, PrintingIndex, NodeCache.
- **oracle_id / scryfall_id** — Resolution requires the worker's search path. The main thread needs these (or indices into its display arrays) to build Instances for Apply.

**Worker supplies:** For each valid trimmed line, the **index** of the card's canonical face (oracle) and optionally the **index** of the specific printing (scryfall). The main thread looks up strings via `display.oracle_ids[oracleIndex]` and `printingDisplay.scryfall_ids[scryfallIndex]`.

### 2. Wire Format: Strided Int32Array

Extend the `validate-result` message to include a **strided Int32Array** (Transferable) parallel to the request `lines` array:

```typescript
// Per valid line: [oracleIndex, scryfallIndex]
// - oracleIndex: index into display.oracle_ids; -1 = error/invalid
// - scryfallIndex: index into printingDisplay.scryfall_ids; -1 = card-level only (no specific printing)
// Stride = 2. Length = lines.length * 2.
indices: Int32Array  // Transferable
```

**Semantics:**

| oracleIndex | scryfallIndex | Meaning |
|-------------|---------------|---------|
| ≥ 0 | ≥ 0 | Valid printing-level match |
| ≥ 0 | -1 | Valid card-level match (no specific printing) |
| -1 | -1 | Error / invalid line |

For error/warning lines, `result` already contains `LineValidationResult` entries. The `indices` array uses -1 for those positions. The main thread never looks up -1; it only uses valid indices for resolved lines.

**Index alignment:** The worker uses the same index space as `DisplayColumns` and `PrintingDisplayColumns`. Explicitly:
- `oracleIndex` = face index into `display.oracle_ids` (DisplayColumns is face-level; each row is a card face).
- `scryfallIndex` = printing row index into `printingDisplay.scryfall_ids` (PrintingDisplayColumns is printing-row level).
- For card-level resolution (no specific printing), `scryfallIndex` = -1; the oracle index is the face index used for resolution.
- For DFC / transform cards, `oracleIndex` is the canonical face (front face row). Both face rows share the same `oracle_id`, so lookups via `display.oracle_ids[oracleIndex]` are correct regardless of which face was matched.
- For printing-level resolution, `oracleIndex` = `printingDisplay.canonical_face_ref[printingRow]` (the canonical face the printing belongs to) and `scryfallIndex` = the printing row index.
- Comment, empty, and section-header lines produce `-1, -1` in the indices array — the array is always `lines.length * 2` entries.
- Main-thread conversion: `display.oracle_ids[oracleIndex]` → `oracle_id`, `printingDisplay.scryfall_ids[scryfallIndex]` → `scryfall_id` (when `scryfallIndex ≥ 0`). Finish and variant are derived from lexing on the main thread.
- Tested in `shared/src/list-validate-engine.test.ts` § "Spec 116 — index alignment".

### 3. Protocol Change

**FromWorker (updated):**

```typescript
| {
    type: 'validate-result';
    requestId: number;
    result: LineValidationResult[];
    indices: Int32Array;  // strided [oracleIdx, scryfallIdx, ...], Transferable
  }
```

`resolved` (ParsedEntry with strings) is removed. The main thread builds `ParsedEntry` from `indices` plus display lookup. The app is built and deployed as one unit; no version skew between worker and main thread.

### 4. Main-Thread Resolution Cache

The resolved cache (Spec 115 § 11) stores per trimmed line either:

- **From worker:** `{ oracleIndex, scryfallIndex }` — convert to `ParsedEntry` at use time via `display.oracle_ids[oracleIndex]`, `printingDisplay.scryfall_ids[scryfallIndex]` (when scryfallIndex ≥ 0).
- **From baseline:** `ParsedEntry` (strings) — derived from `parsedEntriesFromInstances(instances, display, printingDisplay, format)`. The parent (ListsPage) loads the list from CardListStore and passes `instances` — the in-memory materialized view of the IndexedDB append-only log for the active list (Spec 075) — to DeckEditor. No indices needed; instances are already in memory when entering Edit from Display, or when the list loads after refresh.

**Baseline seeding race:** When `draft === baseline` (e.g. after refresh from localStorage) but `instances` is not yet loaded (CardListStore still hydrating), we cannot seed from `parsedEntriesFromInstances`. In that case, validate the baseline lines with the worker. This is more robust to bad state (e.g. IndexedDB issues) and avoids blocking on store readiness.

**Conversion at use time:** `buildValidationResultFromCache` (or equivalent) converts index-based cache entries to `ParsedEntry` via display lookup when building `ValidationResult` for `importDeckList` and `editDiffSummary`.

At `importDeckList` / Apply time, the main thread has `ParsedEntry` (with strings) for every valid line, whether from the index-based cache (converted) or from baseline seeding.

### 5. Apply Flow

1. **User clicks Apply.** Main thread has draft text and validation cache.
2. **Check coverage:** For each trimmed card line, do we have resolved data (ParsedEntry or indices)?
   - **Baseline lines:** Seeded from `parsedEntriesFromInstances` at Display→Edit (when instances are available). We have ParsedEntry.
   - **Worker-validated lines:** We have indices in cache. Convert to ParsedEntry via display lookup.
   - **Gap (e.g. after refresh, or baseline seeding race):** Any line marked `'valid'` but lacking resolved data → batch validate those lines with the worker before proceeding.
3. **Run import:** `importDeckList(text, display, printingDisplay, validationResult)` with the cache-derived `ValidationResult` (including `resolved`).
4. **Diff and commit:** Same as Spec 109. No main-thread `validateDeckList` fallback.

**Edge case:** If Apply-time validation reveals an error (e.g. data changed, race), Apply fails. User remains in Edit mode with errors and quick fixes.

### 6. Apply Responsibility: DeckEditor Owns It

**Current gap:** `ListsPage.handleApply` receives only `draftText`. It calls `importDeckList(draftText, display, printingDisplay)` without `validationResult`, so it falls back to main-thread `validateDeckList` (blocking).

**Recommendation:** DeckEditor owns the Apply logic (import, diff, commit). It has all required state: draft text, validation cache, resolved cache, format. The parent (ListsPage) provides `cardListStore`, `listId`, `display`, and `printingDisplay` as props. DeckEditor performs the full pipeline (Spec 109 §§ 4–7) and calls `onApplySuccess` / `onApplyCancel` (or equivalent) so the parent can handle navigation and UX only. A confirmation/Review phase before Apply is out of scope for this spec; that will be a future spec.

**Rationale:** The component that holds the data should own the mutation. Passing `validationResult` up to the parent for Apply would require prop drilling and couples the parent to validation internals. Keeping Apply in DeckEditor keeps the parent simple and colocates the logic with the cache it depends on.

**Requirement:** Apply must not call `validateDeckList` on the main thread. It must use the cached validation (indices or ParsedEntry) from the DeckEditor session.

**Deletion of `validateDeckList`:** Once Spec 116 is implemented, the blocking main-thread `validateDeckList` in `shared/src/list-validate.ts` can be removed. The app uses the worker path exclusively; `importDeckList` always receives `validationResult` from DeckEditor's cache; the CLI does not use `validateDeckList`. `ListImportTextarea` (which previously used `validateDeckList`) was replaced by DeckEditor per Spec 110 and is dead code — no active UI depends on it. Remove the DeckEditor fallback (the branch that runs `validateDeckList` when `onValidateRequest` is absent) — the worker is required for the app to function. If the worker fails to init, the app shows an error state; there is no main-thread validation fallback.

### 7. Finish and Variant

Finish (`foil` / `etched`) and variant (MTGGoldfish `<...>`) are derived on the main thread from lexing. The worker does not need to return them. The `ParsedEntry` built from indices includes `finish` and `variant` from the line's tokens.

## Relationship to Existing Specs

- **Spec 109:** Import procedure, diff, confirmation, write operations unchanged. This spec changes only *how* `resolved` (ParsedEntry) is produced — from indices + display lookup instead of worker-sent strings.
- **Spec 114:** Validation logic (cascade, quick fixes, NodeCache) unchanged. This spec changes the *wire format* of the validation response.
- **Spec 115:** Line cache, trimmed-line identity, baseline seeding unchanged. This spec extends the resolved cache to store indices (or ParsedEntry from indices) for worker-validated lines.
- **Spec 024:** Aligns with index-based result protocol; main thread does column lookups.

## Acceptance Criteria

1. Worker `validate-result` includes `indices: Int32Array` (strided, Transferable) with `[oracleIndex, scryfallIndex]` per line; -1 for invalid or card-only.
2. Main thread converts indices to `ParsedEntry` via `display.oracle_ids` and `printingDisplay.scryfall_ids` lookup.
3. Resolved cache stores index-based data for worker-validated lines; baseline lines use `parsedEntriesFromInstances` (no indices).
4. Apply uses cached validation; never calls `validateDeckList` on the main thread.
5. DeckEditor owns Apply logic; parent provides store and receives success/cancel callbacks (per § 6).
6. Payload size for validation response is reduced (indices vs strings); `indices` is transferred as Transferable when present.
7. Index alignment between worker output and main-thread display columns is documented and tested.
8. `validateDeckList` (blocking main-thread validator) is removed from `shared/src/list-validate.ts`; DeckEditor has no fallback to it.
9. When Apply detects lines marked `'valid'` but lacking resolved data, batch validate those lines with the worker before proceeding.

## Out of Scope

- Changing validation cascade or quick-fix behavior (Spec 114).
- Changing line cache semantics or baseline persistence (Spec 115).
- Smart diff or rich diff view (Spec 109).
- Confirmation/Review phase before Apply (Spec 109 § 6). A future spec will define a "Review" step in the Edit flow.
