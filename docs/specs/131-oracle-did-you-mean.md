# Spec 131: Oracle "Did You Mean?" Empty-State Hint

**Status:** Implemented

**Depends on:** Spec 002 (Query Engine), Spec 018 (Combined Name Search), Spec 036 (Source Spans), Spec 057 (include:extras), Spec 082 (Dual Count Filter Chips), Spec 126 (Empty List CTA), Spec 024 (Index-Based Result Protocol)

**Addresses:** [Issue #143](https://github.com/jimbojw/frantic-search/issues/143)

## Goal

When a search returns zero results but the query contains bare words (which search the name field by default), offer a "Did you mean to search oracle text?" hint if an alternative query that searches oracle text instead would return results. Tapping the hint applies the alternative query.

## Background

Bare tokens are interpreted as name-search terms (Spec 018). If a user meant to search oracle text — e.g., typing `damage` expecting to find cards that deal damage — they must go back and type `o:` before their term(s). When there are no name matches but there would be oracle matches, we can offer a targeted hint, similar to the `include:extras` hint (Spec 057) and the empty-list CTA (Spec 126).

## Trigger Conditions

All of the following must hold for the oracle hint to appear:

1. **Zero results** — The effective (combined) search returned zero cards (`totalCards() === 0`). With a pinned query, this is the pinned+live combined result.
2. **Root shape** — The root AST node is either (a) an AND node, or (b) a leaf BARE node (single bare word, quoted or unquoted). Skip when root is OR (e.g. `(xyc OR abc)` does not trigger).
3. **Trailing bare tokens** — When root is AND, only the *trailing* bare tokens are considered: those that appear after the last non-bare token in source order. When root is a single BARE, that token is the trailing set. There must be at least one trailing bare token.
4. **An alternative returns results** — The phrase variant (or per-word variant when applicable) returns at least one card.
5. **Lower priority than other empty-state CTAs** — Do not show when the empty-list CTA (Spec 126) or `include:extras` hint (Spec 057) applies. The oracle hint appears only when those conditions do not hold.

### Examples

| Query | Root | Trailing bare tokens | Variants tried |
|-------|------|----------------------|----------------|
| `lightning ci:r deal 3` | AND | `deal`, `3` | phrase `o:"deal 3"`, per-word `o:deal o:3` |
| `"deal 3"` | BARE (quoted) | `"deal 3"` | phrase only `o:"deal 3"` — user quoted, don't split |
| `lightning bolt` | AND | `lightning`, `bolt` | phrase, per-word |
| `(xyc OR abc)` | OR | — | skip (root not AND/BARE) |

## Design

### Alternative query variants

When the main query returns zero and has trailing bare tokens, the worker builds alternative query(ies) by splicing those tokens into oracle field terms. All other terms remain in place.

| Variant | Replacement | Example |
|---------|-------------|---------|
| **Phrase** | Replace trailing bare tokens with a single `o:"word1 word2 ..."` | `lightning ci:r deal 3` → `lightning ci:r o:"deal 3"` |
| **Per-word** | Replace each trailing bare token with `o:value` | `lightning ci:r deal 3` → `lightning ci:r o:deal o:3` |

**Quoted bare words:** When the trailing bare tokens are a single BARE node with `quoted: true` (e.g. `"deal 3"`), only try the phrase variant. The user explicitly quoted — take them at their word; do not split into per-word.

**Negated bare words:** Do not convert. Only positive BARE nodes (those not under a NOT) are considered. Negated terms stay as-is.

### Splicing logic

- Use AST spans from the parser (Spec 036). BARE nodes carry `span: { start, end }`.
- **Trailing bare tokens:** Walk the root's children in source order (by span.start). The trailing bare tokens are the contiguous suffix of BARE nodes at the end. When root is a single BARE, that node is the trailing set.
- **Phrase variant:** Replace the first trailing BARE's span with `o:"<all trailing bare values joined by space>"`; splice out the remaining trailing BARE spans. Splice from end to start to preserve offsets.
- **Per-word variant:** Replace each trailing BARE span with `o:value` (escape/quote if value contains spaces or special chars). Skip this variant when the trailing set is a single quoted BARE.
- Reuse `spliceQuery` from `app/src/query-edit-core.ts`.

### Variant preference

When both variants are tried and both return results, prefer the **phrase** variant (more specific). Return only one hint to avoid UI clutter. When only the phrase variant is tried (quoted trailing bare), use that result.

### Worker protocol

Add optional fields to the `result` variant of `FromWorker`:

```typescript
oracleHint?: {
  query: string;           // Full alternative query to apply when user taps (e.g. lightning ci:r o:deal o:3)
  label: string;           // Oracle part only, for button display (e.g. o:deal o:3 or o:"deal 3")
  count: number;           // Face (card) count
  printingCount?: number;  // Printing count when PrintingIndex is loaded; always populate when available so UI can show both
  variant: 'phrase' | 'per-word';
}
```

Present only when:
- Main query returned zero results.
- Root is AND or leaf BARE; at least one trailing bare token exists.
- At least one alternative (phrase preferred over per-word when both tried) returns results.

### Empty-results UX

When the oracle hint is present, add to the empty state (below "No cards found" and the Scryfall/Report links):

> Did you mean to search oracle text? Try [button]?

The button uses the same two-line nomenclature as pinnable chips in the query breakdown (Spec 082): top line shows the oracle label (e.g. `o:deal o:3` or `o:"deal 3"`); bottom line shows `N cards (M prints)` using `formatDualCount`. Always show both counts when `printingCount` is present. Clicking applies the **full** alternative query (e.g. `lightning ci:r o:deal o:3`). Styled like `include:extras` in Spec 057. Clicking calls `ctx.setQuery(oracleHint.query)`.

### Pinned query

Pinned-query handling is minimal for this feature. The zero-results check uses the **effective** (combined) result. Alternatives are built from the **live** query only and applied to the live query when the user taps the hint.

**When the pinned query itself yields zero results:** Skip trying alternatives. The live query cannot change the outcome — the user will never see results. In that case, consider alerting the user that their pinned query yields no results, so no matter what they type in the live query, nothing will appear. (Exact UX for that alert is out of scope here; a future spec may address it.)

### Performance

Run alternative evaluations only when:
- Main query returned zero results,
- Root is AND or leaf BARE, and
- There is at least one trailing bare token.

Queries like `t:creature` or `(xyc OR abc)` with zero results do not trigger the extra work.

## Scope of Changes

| File | Change |
|------|--------|
| `shared/` or `app/` | Add `getTrailingBareNodes(ast)` and `spliceBareToOracle(query, trailingBareNodes, variant)` — root must be AND or leaf BARE; trailing = contiguous suffix of BARE nodes at end of AND children. |
| `app/src/worker-search.ts` | When deduped.length === 0, root is AND or BARE, and trailing bare nodes exist: if pinned query alone yields zero, skip alternatives. Otherwise build variant(s) from live query, evaluate, populate `oracleHint` (phrase only when trailing is single quoted BARE). |
| `shared/src/worker-protocol.ts` | Add `oracleHint?: { query, label, count, printingCount?, variant }` to result variant. |
| `app/src/App.tsx` | Store `oracleHint` from result message; pass to SearchContext. |
| `app/src/SearchContext.tsx` | Add `oracleHint?: Accessor<...>` to context. |
| `app/src/SearchResults.tsx` | In empty-state fallback: when `oracleHint` present (and empty-list CTA / include:extras do not apply), render the "Did you mean?" hint with two-line button (label + `formatDualCount`). |
| `app/src/DualWieldLayout.tsx` | Pass `oracleHint` through `buildPaneContext` for Dual Wield. |

## Acceptance Criteria

- [ ] When `lightning ci:r deal 3` returns zero and the phrase variant returns results, the hint shows `lightning ci:r o:"deal 3"`.
- [ ] When `"deal 3"` returns zero and `o:"deal 3"` returns results, the hint shows only the phrase variant (no per-word split).
- [ ] When the phrase variant returns zero but the per-word variant returns results, the hint shows the per-word query.
- [ ] When both variants return results, the phrase variant is preferred.
- [ ] `(xyc OR abc)` with zero results does not trigger the oracle hint (root is OR).
- [ ] Button displays only the oracle part (e.g. `o:deal o:3`); tapping applies the full query (e.g. `lightning ci:r o:deal o:3`).
- [ ] Negated bare words are not converted; they remain in the alternative query as-is.
- [ ] The empty-list CTA and `include:extras` hint take priority over the oracle hint when their conditions hold.
- [ ] Works in both single-pane and Dual Wield layouts.
- [ ] Button uses two-line layout: oracle label on top, `N cards (M prints)` on bottom (via `formatDualCount`); both counts shown when printing data available.
- [ ] When pinned query alone yields zero results, oracle hint is not shown (alternatives skipped); future UX for alerting user about empty pinned query is out of scope.
