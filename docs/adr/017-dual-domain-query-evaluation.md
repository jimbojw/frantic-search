# ADR-017: Dual-Domain Query Evaluation

**Status:** Accepted

## Context

The bitmask-per-node AST engine (ADR-009) operates on a single domain: **face rows** (~34k entries). Every leaf node produces a `Uint8Array(faceCount)` and AND/OR/NOT combine them byte-wise. This works because every queryable field — name, type, color, legality, power — lives on the face-level columnar data.

Players also want to search by **printing-level** attributes: set, rarity, frame, finish (foil/nonfoil/etched), price, and various boolean flags (full art, textless, promo, borderless, etc.). These properties vary per printing, not per card. A single oracle card can have 1–100+ printings across different sets, each with different rarities, frames, finishes, and prices.

Printing data is modeled as a separate columnar structure with its own row count (~120–150k rows, one per finish variant — see Spec 046). The face-domain and printing-domain are linked by a `canonical_face_ref` column that maps each printing row to the canonical face index of its oracle card.

The core question: how should the engine evaluate queries that mix face-level conditions (`t:creature`) with printing-level conditions (`set:mh2 r:mythic`)?

## Decision

Extend the bitmask-per-node AST to support **two evaluation domains** with promotion at composite node boundaries.

### Domain tagging

Each leaf node evaluates in exactly one domain:

- **Face domain** — all existing fields (name, type, oracle text, color, mana cost, power/toughness, legality, layout, flags). Buffer length = `faceCount`.
- **Printing domain** — set, rarity, finish, frame, price, collector number, printing flags. Buffer length = `printingCount`.

The domain is determined by the field name at parse/eval time. A `PRINTING_FIELDS` set enumerates which canonical field names belong to the printing domain; everything else is face domain.

### Composite nodes: promotion

AND, OR, and NOT nodes may have children in different domains. Before combining buffers, children are **promoted** to a common domain:

- **Printing → Face**: For each `p` where `printingBuf[p] = 1`, set `faceBuf[canonicalFaceRef[p]] = 1`. Semantics: "card has at least one matching printing." This is a many-to-one reduction.
- **Face → Printing**: For each canonical face `f` where `faceBuf[f] = 1`, set `printingBuf[p] = 1` for all printings `p` belonging to that card. Semantics: "all printings of matching cards are included." This uses a prebuilt `faceToPrintings` reverse map and is a one-to-many expansion.

**NOT** preserves its child's domain. If the child is printing-domain, the NOT inverts the printing buffer row-wise (each row flips). This means `-is:foil` evaluates to "printing rows that are not foil" (stays in printing domain), matching Scryfall's per-printing NOT semantics. When promoted to face domain via an enclosing AND/OR, the result becomes "cards with at least one non-foil printing." This is distinct from the old behavior where NOT always promoted to face domain first, which gave "cards with no foil printing at all."

The target domain for promotion is determined by what the query needs:

- If the query contains **no printing-domain leaves**, all buffers are face-domain and no promotion occurs. This is the common case — pure card-level queries are completely unaffected.
- If the query contains **any printing-domain leaves**, the root node must produce both a face-domain buffer (for card counts and the breakdown UX) and a printing-domain buffer (for printing-level result display). In practice, internal AND/OR nodes promote to face domain for combination, and the root additionally carries the printing-domain intersection for display purposes.

### Result shape

The root evaluation result always includes:

- `indices: Uint32Array` — canonical face indices of matching cards (face domain), as today.
- `breakdown: BreakdownNode` — per-node match counts in face domain, as today.

When printing-domain leaves are present, the result additionally includes:

- `printingIndices: Uint32Array` — matching printing-row indices, for use by the display layer when rendering specific printings.

### `is:` keywords that span domains

Some `is:` keywords that were previously unsupported (`foil`, `nonfoil`, `etched`, `fullart`, `textless`, `promo`, `reprint`, `borderless`, `extended`) are printing-domain conditions. They evaluate against the printing-domain buffer, then promote to face domain at the enclosing composite node. This is transparent to the user — `t:creature is:foil` works by evaluating `t:creature` in face domain, `is:foil` in printing domain, promoting the printing result to face domain, and AND-ing.

## Alternatives Considered

### Pure denormalization

Aggregate printing-level bitmasks to the face level at load time (e.g., `rarity_any[face] = OR of all printing rarities`). Face-level queries only, no second domain.

Rejected because it cannot handle set queries. A card can belong to 20+ sets, and there are 700+ set codes — this doesn't fit a bitmask. Dictionary-encoded set indices require per-printing iteration, which reintroduces the second domain. Denormalization also loses printing-level result granularity — you can't show "which specific printing matched."

### Separate printing-only engine

Run printing queries in a completely independent engine that returns printing rows, then map back to cards for display.

Rejected because it doesn't compose with face-level conditions. `t:creature set:mh2` requires both engines to coordinate, which is exactly what dual-domain evaluation provides — but without the overhead of maintaining two separate AST/cache/evaluation pipelines.

### Single domain via denormalized join

Expand every oracle card into N rows (one per printing) and evaluate everything in a single domain.

Rejected because it would inflate the primary dataset from ~34k to ~150k rows, making every card-level query 4× slower. The vast majority of queries are card-level only and should not pay this cost.

## Consequences

- **Positive:** Pure card-level queries (the common case) are completely unaffected — no performance impact, no code path changes.
- **Positive:** The promotion model composes naturally with the existing AST. No new node types are needed; the promotion is an internal step within AND/OR/NOT evaluation.
- **Positive:** The query debugger UX works unchanged — face-domain match counts per node are the natural output.
- **Positive:** Printing-domain evaluation uses the same linear-scan-over-bitmasks approach as face-domain, just with a different buffer length and different columns. No new algorithmic patterns.
- **Negative:** The evaluator and buffer pool must manage two buffer sizes. `NodeCache` needs to track which domain each interned node belongs to.
- **Negative:** Promotion adds a linear pass at domain boundaries. For printing→face this is O(printingCount); for face→printing it requires a prebuilt reverse map. Both are fast but not free.
- **Negative:** Memory usage increases: each printing-domain node allocates a `Uint8Array(~150k)` instead of `Uint8Array(~34k)`. For realistic queries with 2–3 printing-domain nodes, this is ~300–450KB additional.
