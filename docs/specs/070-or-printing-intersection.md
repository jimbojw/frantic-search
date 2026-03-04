# Spec 070: OR Printing Intersection

**Status:** Implemented

**Depends on:** ADR-009 (Bitmask-per-node AST), Spec 047 (Printing Query Fields)

**Issue:** [#76](https://github.com/jimbojw/frantic-search/issues/76)

## Goal

Fix `_intersectPrintingLeaves` so that OR nodes containing printing-domain children correctly filter the printing buffer, instead of being silently skipped.

## Background

The evaluator's `evaluate()` method has two code paths for producing `printingIndices`:

1. **Root is printing-domain:** The root buffer is used directly — already correct.
2. **Root is face-domain with printing leaves:** The face buffer is expanded to all printings via `promoteFaceToPrinting`, then `_intersectPrintingLeaves` walks the AST and ANDs each printing leaf's buffer into `printBuf` to narrow down to only the matching printings.

`_intersectPrintingLeaves` handles FIELD (individual leaves), AND (recurse into children), and NOT (use the interned NOT node's buffer). However, OR nodes are skipped entirely:

```typescript
case "OR":
  // OR children are alternatives — skip refinement for correctness.
  break;
```

This means a query like `(is:ub OR s:sld) ci:boros t:equipment unique:art` returns all printings of matching boros equipment cards, instead of only UB or SLD printings. The OR's printing condition is lost.

## Fix

`computeTree` already correctly computes printing-domain OR nodes as the union of their children's buffers. The interned OR node holds the correct combined buffer. The fix mirrors the existing NOT case: look up the interned OR node and AND its buffer into `printBuf` when it is printing-domain.

```typescript
case "OR": {
  const orInterned = this.intern(ast);
  if (orInterned.computed && orInterned.computed.domain === "printing") {
    const lb = orInterned.computed.buf;
    for (let i = 0; i < printBuf.length; i++) printBuf[i] &= lb[i];
  }
  break;
}
```

Mixed-domain ORs (e.g., `set:mh2 OR t:creature`) resolve to face-domain in `computeTree`, so `domain === "printing"` will not match and they are correctly skipped — a mixed OR cannot act as a pure printing-level filter.

## Affected Code

| File | Change |
|------|--------|
| `shared/src/search/evaluator.ts` | Replace OR break in `_intersectPrintingLeaves` with interned buffer AND. |
| `shared/src/search/evaluator-printing.test.ts` | Add unit tests for OR printing intersection. |
| `cli/suites/printing.yaml` | Add compliance test case. |

## Acceptance Criteria

1. `(set:sld OR set:mh2) lightning` returns `printingIndices` containing only SLD and MH2 rows.
2. `(set:sld OR set:c21) t:instant` returns only SLD printings of instants (not C21 Sol Ring rows).
3. `(set:sld OR is:ub) lightning` returns only printing #8 (SLD with UB promo type).
4. Pure printing-domain OR without face constraints (`set:sld OR set:mh2`) still works correctly.
5. Mixed-domain ORs (`set:mh2 OR t:creature`) continue to work as before.
6. `npm run cli -- diff "(is:ub OR s:sld) ci:boros t:equipment unique:art"` shows significantly fewer "Frantic Search Only" discrepancies.
