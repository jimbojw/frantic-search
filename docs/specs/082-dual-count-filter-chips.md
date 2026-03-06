# Spec 082: Dual Card/Print Counts on Filter Chips

**Status:** Draft

**Depends on:** Spec 054 (Pinned Search Criteria), Spec 079 (Consolidated Query Accordion), Spec 047 (Printing Query Fields)

**References:** [Issue #89](https://github.com/jimbojw/frantic-search/issues/89)

## Goal

Every filter chip displays both card count and print count so users instantly understand what each number means. This eliminates the cognitive load of domain-ambiguous counts — e.g. `t:creature` showing 15,000 and `is:foil` showing 80,000 with no indication that one is cards and the other is printings.

## Background

### Current behavior

Filter chips in the unified query accordion (Spec 079) show a single integer per chip: the match count for that term evaluated in isolation. The lip summary shows `N cards (M printings)` for the combined result, but individual chips do not indicate their unit of measurement.

The evaluator computes counts in two domains: **face** (card-level, e.g. `t:creature`, `ci:boros`) and **printing** (printing-level, e.g. `is:foil`, `set:mh2`). Each node's `matchCount` reflects its domain — face-domain nodes report card count, printing-domain nodes report printing-row count. The UI does not expose this distinction.

### Problem

Users encounter chips with wildly different numbers (15,000 vs 80,000) that appear to belong to the same domain. Without explicit unit labels, the UI falsely implies these numbers are comparable, leading to confusion and loss of trust.

### Design decision: always show both counts

Rather than visually differentiating card-level vs printing-level chips (e.g. different styling per domain), this spec adopts a uniform approach: **every chip shows both counts** in the format `X cards (Y prints)`. This:

- Removes the need to classify chips by domain
- Provides full information at a glance
- Aligns with the lip summary format
- Avoids edge cases (e.g. `format:commander`, mixed AND/OR) where domain classification is ambiguous

## Design

### Terminology

Use **"prints"** (not "printings") throughout the chip and lip UI. This saves space, aligns with the `unique:prints` query term, and is familiar to MTG users.

### Chip display format

Each non-NOP, non-error chip displays:

| Condition | Display |
|-----------|---------|
| Printing data loaded, both counts available | `30.6k cards (151k prints)` |
| Printing data not loaded | `30,654 cards` (card count only) |
| NOP node | `--` (unchanged) |
| Error node | `!!` (unchanged) |

**Abbreviation rule:** For values ≥ 1000, use compact form: one decimal place + `k` (e.g. `30.6k`, `151k`). For values < 1000, use full number (e.g. `456`). The `title` attribute (hover) shows full numbers: `30,654 cards (151,269 prints)`.

### Lip summary format

The PINNED and MATCHES rows in the accordion footer use "prints" instead of "printings":

```
[pin icon] PINNED           1,234 cards (1,500 prints)
 MATCHES [1 ignored]        456 cards (520 prints)
```

Full numbers in the lip (no abbreviation); the lip has more space than individual chips.

### Wire protocol

Extend `BreakdownNode` in `shared/src/worker-protocol.ts`:

```typescript
export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'NOP' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  /** Card count; present when dual counts available. */
  matchCountCards?: number
  /** Print count; present when PrintingIndex is loaded and dual counts available. */
  matchCountPrints?: number
  error?: string
  children?: BreakdownNode[]
  span?: { start: number; end: number }
  valueSpan?: { start: number; end: number }
}
```

- When `matchCountCards` and `matchCountPrints` are both present, the chip renders the dual-count format.
- When absent (e.g. printing data not loaded), the chip falls back to `matchCount` as today, or shows `matchCountCards` only if that is the sole count available.
- `matchCount` remains for backward compatibility and for nodes where only one count is meaningful (e.g. NOP, some error cases).

### Evaluator: dual-count computation

Extend `QueryNodeResult` in `shared/src/search/ast.ts`:

```typescript
export interface QueryNodeResult {
  node: ASTNode
  matchCount: number
  matchCountCards?: number
  matchCountPrints?: number
  // ... existing fields
}
```

In `NodeCache.buildResult()`, for each node with `computed`:

1. **Face-domain node** (`computed.domain === "face"`):
   - `matchCountCards` = `popcount(computed.buf)` (already the primary count)
   - `matchCountPrints` = when `_printingIndex` is available: sum over matching face indices of `printingsOf(face).length`
   - `matchCount` = `matchCountCards` (unchanged)

2. **Printing-domain node** (`computed.domain === "printing"`):
   - `matchCountPrints` = `popcount(computed.buf)` (already the primary count)
   - `matchCountCards` = when `_printingIndex` is available: promote buffer to face domain, then `popcount(faceBuf)`
   - `matchCount` = `matchCountPrints` (unchanged)

3. **PrintingIndex null:** Omit `matchCountPrints` for face-domain nodes; omit `matchCountCards` for printing-domain nodes (or both — printing-domain nodes would typically error when PrintingIndex is null).

### Worker: toBreakdown

In `app/src/worker-search.ts`, `toBreakdown()` maps `QueryNodeResult` to `BreakdownNode`. Pass through `matchCountCards` and `matchCountPrints` when present.

### UI components

| Component | Change |
|-----------|--------|
| `BreakdownChip` | Accept `cardCount?: number` and `printCount?: number` (or read from node). Render `formatDualCount(cardCount, printCount)`. Set `title` to full numbers. |
| `ChipTreeNode` | Pass `node.matchCountCards` and `node.matchCountPrints` to `BreakdownChip`. |
| `ChipSection` | When rendering flat chips, pass dual counts from `child.matchCountCards` / `child.matchCountPrints`. |
| `formatDualCount` | New helper: `(cards: number, prints?: number) => string`. Abbreviates per rule above. |
| `UnifiedBreakdown` | `formatCount` for lip: change `printings` to `prints`. |
| `BreakdownLip` | Change `printings` to `prints` in the count display. |

### Hover / tooltip

The native `title` attribute on each chip shows the full numbers, e.g. `30,654 cards (151,269 prints)`. This provides progressive disclosure without additional UI. A richer hover card (e.g. explaining "cards = unique card faces; prints = individual printings") is out of scope for this spec but can be added later.

## Edge cases

| Case | Behavior |
|------|----------|
| **PrintingIndex null** | Chips show card count only. Lip shows cards only when no printing data. |
| **NOP nodes** | No dual count; display `--` as today. |
| **Error nodes** | No dual count; display `!!` as today. |
| **Compound nodes (AND/OR)** | Each node's buffer has a domain (or promoted domain). Compute dual counts from that buffer. Mixed-domain AND/OR nodes are promoted to face domain; the printing count is derived by expanding matching faces to printings. |
| **format:commander** | Evaluates in printing domain (tournament-legal printings). Dual counts: card count = unique faces with commander-legal printings; print count = commander-legal printing rows. No special handling. |

## Scope of changes

| File | Change |
|------|--------|
| `shared/src/worker-protocol.ts` | Add `matchCountCards?`, `matchCountPrints?` to `BreakdownNode` |
| `shared/src/search/ast.ts` | Add `matchCountCards?`, `matchCountPrints?` to `QueryNodeResult` |
| `shared/src/search/evaluator.ts` | In `buildResult()`: compute secondary count per node |
| `app/src/worker-search.ts` | `toBreakdown()`: pass through dual counts |
| `app/src/InlineBreakdown.tsx` | Add `formatDualCount`; update `BreakdownChip`, `ChipTreeNode`, `BreakdownLip` |
| `app/src/UnifiedBreakdown.tsx` | `formatCount`: "printings" → "prints" |

## Test plan

### shared

- `evaluator-printing.test.ts` or new test: verify `buildResult` / `QueryNodeResult` includes `matchCountCards` and `matchCountPrints` for face-domain leaf (e.g. `t:creature`) and printing-domain leaf (e.g. `set:mh2`). Verify compound AND/OR nodes have dual counts.

### app

- `worker-search.test.ts`: verify `toBreakdown` propagates `matchCountCards` and `matchCountPrints` to `BreakdownNode`.
- Manual: chip display with/without printing data; lip uses "prints"; hover shows full numbers.

## Acceptance criteria

1. Every non-NOP, non-error chip displays `X cards (Y prints)` when printing data is loaded.
2. When printing data is not loaded, chips show card count only (single count).
3. Lip summary uses "prints" not "printings" throughout.
4. Compact abbreviation (e.g. `30.6k`) for chip values ≥ 1000.
5. Hover (`title`) shows full numbers.
6. No regression to pin, unpin, or remove behavior.
