# Spec 185: Deck Characteristic Engine (Salt, Conformity, Bling)

**Status:** Draft

**GitHub Issue:** [#163](https://github.com/jimbojw/frantic-search/issues/163)

**Depends on:** Spec 003 (ETL / columnar data), Spec 046 (printing data model), Spec 099 (EDHREC rank), Spec 101 (EDHREC salt), Spec 080 (USD null semantics on printings), Spec 075 (card list persistence), Spec 076 (worker protocol / `list-update`), Spec 109 (deck instance model / zones), Spec 116 / Spec 114 (index-based list validation), Spec 024 (worker protocol, display columns), ADR-003 (client-side worker architecture)

**Related:** Spec 095 (percentile filters — different normalization; do not conflate with this engine)

## Goal

Define a **canonical, client-side** procedure that turns three volatile per-card metrics (EDHREC salt, EDHREC rank, printing USD price) into three **deck-level summary scores** on a **0–1000** integer scale: **Salt**, **Conformity**, and **Bling**. Scores are computed entirely in the browser from data already loaded for search (no network calls). The math favors interpretability and tunable trade-offs between **single-card extremes** ("one Stasis") and **density** ("full of mildly annoying cards").

## Background

Raw metrics do not aggregate linearly in a way that matches intuition. EDHREC rank and salt are oracle-level; USD is printing-level (Spec 080: `price_usd === 0` means no price data). The worker already holds `CardIndex`, `PrintingIndex`, and list membership via `list-update` (Spec 076). This spec adds **precomputed rank-weights** plus **aggregation** and **display scaling** — not new ETL fields.

### Gauges (informative)

| Gauge          | Source metric   | Higher score means                         | Lower score suggests        |
|----------------|-----------------|-------------------------------------------|-----------------------------|
| **Salt**       | EDHREC salt     | More miserable to play against            | "I come in peace"           |
| **Conformity** | EDHREC rank     | More by-the-book / staple-heavy         | Hipster brewer              |
| **Bling**      | Printing USD    | More money in the sleeves                 | Budget / Pauper attitude    |

**Disclaimer:** Summary statistics cannot capture full play nuance; the engine is a deliberate compromise for deck-level diagnostics and UI fun.

---

## Domain: Global pools and rows

The engine uses **three separate global pools** (one per metric). **N** always denotes the count of pool members with **valid** data for that metric after exclusions below.

### Salt and Conformity (oracle / face domain)

- **Pool member:** One **canonical oracle card** represented by a **canonical face row** in `ColumnarData`: face index `i` such that `canonical_face[i] === i` (same pattern as "one row per card" elsewhere). Multi-face cards contribute **once**.
- **Salt value:** `edhrec_salts[i]` when not `null` (Spec 101).
- **Conformity value:** `edhrec_ranks[i]` when not `null` (Spec 099).
- **Sort direction for ranking (see § Step 1):**
  - **Salt:** Descending by numeric salt (saltiest card first → best rank `R = 1`).
  - **Conformity:** Ascending by EDHREC rank (rank `1` = most popular → best rank `R = 1`).

### Bling (printing domain)

- **Pool member:** One **printing row** in `PrintingColumnarData` with **valid price**: `price_usd[k] !== 0` (Spec 080 null/sentinel semantics).
- **Value:** `price_usd[k]` (higher USD → best rank `R = 1`).
- **Sort direction:** Descending by USD (most expensive first).

### Deck instances

The instance model (Spec 109) stores **one `InstanceState` per physical copy** — there is no per-entry `quantity` field. Aggregation groups (e.g. "4× Lightning Bolt") are a display concern; the scoring engine operates on raw instances.

- A **scored instance** is a validated `InstanceState` that resolves to a **canonical face index** (via `oracle_id` → `oracleToCanonicalFace` map) and, when the instance is printing-specific (`scryfall_id` set), a **printing row index** (existing resolution in `list-mask-builder.ts`).
- **Deck size** `D` is the **count of scored instances** included in the scored set (§ Scoring scope). Each instance contributes exactly one copy to `D`.
- **Salt & Conformity:** Use the **canonical face index** for the instance's oracle; read precomputed weights by face index (canonical row). Multi-face cards: weight is stored on the canonical row; other face rows are not pool members and need not duplicate weights.
- **Bling:** Use the **resolved printing row** for that instance when it specifies a printing (`scryfall_id` + `finish`). If the instance is **oracle-only** (`scryfall_id` is null), resolve Bling using the **cheapest valid-USD printing** for that oracle: among all printing rows whose `canonical_face_ref` equals the instance's canonical face index and whose `price_usd !== 0` (Spec 080), pick the **minimum** `price_usd`. If several printings tie for that minimum, use the **smallest printing row index** as a deterministic tie-break. If **no** printing has valid USD for that oracle, Bling weight for that instance is **`0.0`** (missing price).

---

## Scoring scope (which instances count)

**v1 normative rule:** Include every **validated** `InstanceState` in the target list that the list editor counts toward the list body. Each instance contributes one copy to `D`.

**Zone filtering:** Out of scope for v1 unless a separate UX requirement mandates it; if added later, restrict to e.g. `zone ∈ { "Deck", null, "Commander", "Companion" }` and document here.

**Unresolved instances** (validation errors — `oracle_id` not in the canonical face map, or printing lookup failure for a printing-level instance) are excluded from `D` and from coverage numerators.

---

## Step 1 — Ordering and rank-based weights

For each metric independently:

1. Build the ordered list of pool members **with valid values**, sorted per § Domain (salt / conformity / bling).
2. Assign **standard competition ranking** ("1224"): tied values share the **better** (lower) rank number; the next distinct value skips accordingly.
3. Let `R` be the 1-based rank of a member (`1` = top of that metric's sort). Let `N` be the number of valid pool members.

**Weight formula** for a member with valid data:

\[
w = \begin{cases}
1.0 & N = 1 \\
\frac{N - R}{N - 1} & N > 1
\end{cases}
\]

**Degenerate case:** When all `N` pool members share the same value, competition ranking gives every member rank `R = 1` and weight `1.0`. Any deck composed of these cards scores `1000`. This is mathematically correct — no differentiation is possible — but worth noting for intuition.

**Missing data:** Any instance whose metric is invalid (`null` salt/rank; USD sentinel `0` for bling) receives weight **`0.0`** for that gauge. This is intentional; UI should show **coverage** (e.g. "Salt: 92/100 cards scored") so users understand when missing data drags a score.

**Precomputation:** Weights depend only on loaded columnar + printing data. The worker **should** compute three dense arrays at init: `Float32Array(faceCount)` for salt and conformity (indexed by face row), `Float32Array(printingCount)` for bling (indexed by printing row). This gives O(1) lookup during deck aggregation. The bling array may be 200k–400k entries (~1.5 MB as Float32); this is acceptable.

---

## Step 2 — Aggregation (p-mean) and UI scaling

**Empty deck (`D = 0`):** There are no instances to aggregate; **do not** evaluate the p-mean (division by `D` is undefined). For **each** gauge, the **final integer score is `0`**. Coverage: `total_copies = 0` and `scored_copies = 0` for that gauge.

For a deck with `D ≥ 1` scored instances and per-instance weights `w_i` for the relevant gauge:

\[
\text{raw} = \left( \frac{1}{D} \sum_{i=1}^{D} w_i^{\,p} \right)^{1/p}
\]

- `raw` is in `[0, 1]` when all `w_i ∈ [0, 1]` and `p > 0`.
- **p parameters** (defaults below; tune empirically if UX research warrants):

| Gauge       | Default `p` | Rationale (informative) |
|------------|---------------|-------------------------|
| Salt       | `3`           | Emphasize single extremely salty cards |
| Conformity | `2`           | Balance staples vs. one-off inclusions |
| Bling      | `2`           | Balance one flex piece vs. foiled-out deck |

**Scaled score before Renard:** `s = raw × 1000` (IEEE-754 double in practice; still a real number in the abstract).

**Logical true zero:** Iff **every** scored instance has weight `w_i = 0` for that gauge, then `raw = 0` (exact arithmetic) and § Step 3 yields display integer **`0`** (Renard is not applied). Implementations **may** test `raw === 0` after computing `raw` with the same expression as § Step 2, or use an equivalent predicate on instance weights; they **must not** depend on undocumented epsilon hacks unless a later spec revision pins numeric tolerances.

**Coverage:** For each gauge, report `scored_copies` = count of instances with non-missing metric, and `total_copies` = `D`.

---

## Step 3 — Renard-scaled precision ceiling

Map the **scaled score** `s = raw × 1000` to a **display integer** in `0`–`1000` using the procedure below. This reduces false precision and buckets similar decks. The GitHub issue that motivated the breakpoints is **not** normative; this section is self-contained.

### 3.1 Inputs and zero

- Input: `s`, the scaled score. When `D ≥ 1`, `s = raw × 1000` from § Step 2.
- **Output `0`:** If § Step 2 applied **logical true zero** (`raw = 0` / all weights zero for that gauge), **or** `D = 0` (empty deck), the **final integer is `0`**. Do not apply Renard to a zero deck score.
- **Otherwise** `s > 0`. The procedure below returns an integer in `1`–`1000`.

### 3.2 Breakpoints and bands

Define breakpoints (inclusive upper limits of bands, except the last band which ends at `1000`):

`b₁ = 21.5`, `b₂ = 46.4`, `b₃ = 100.0`, `b₄ = 215.4`, `b₅ = 464.2`, `b₆ = 1000.0`.

Partition `(0, 1000]` into six **left-open, right-closed** bands (test `s` **from smallest band upward** so boundaries land in the higher band where ranges meet):

| Band | Interval (see § 3.3) | Step | Allowed outputs (inclusive min/max) |
|------|------------------------|------|-------------------------------------|
| 1 | `(0, b₁]` | 1 | `1` … `22` |
| 2 | `(b₁, b₂]` | 2 | `24` … `48` |
| 3 | `(b₂, b₃]` | 5 | `50` … `100` |
| 4 | `(b₃, b₄]` | 10 | `110` … `220` |
| 5 | `(b₄, b₅]` | 20 | `240` … `480` |
| 6 | `(b₅, b₆]` | 50 | `500` … `1000` |

Gaps between bands (e.g. `22` → `24`, `48` → `50`) are intentional.

### 3.3 Mapping function

Let `ceil` be the mathematical ceiling on reals (IEEE-754 `Math.ceil` in JavaScript matches for finite positive inputs).

**Band 1:** If `0 < s ≤ b₁`, then

`output = min(22, ceil(s))`.

(For `s ∈ (0, 1]`, `ceil(s)` is `1`; for `s = b₁`, `ceil(s) = 22`.)

**Bands 2–6:** For a band with parameters `(lo, hi]`, output grid `minOut` … `maxOut` with step `step` (from the table in § 3.2), **`lo` exclusive, `hi` inclusive**:

Define helper **`ceilGrid(s, minOut, maxOut, step)`**:

1. If `s ≤ minOut`, return `minOut`.
2. Otherwise let `k = ceil((s - minOut) / step)` (integer-valued real).
3. Return `min(maxOut, minOut + k × step)`.

Then:

- If `b₁ < s ≤ b₂`: `output = ceilGrid(s, 24, 48, 2)`.
- If `b₂ < s ≤ b₃`: `output = ceilGrid(s, 50, 100, 5)`.
- If `b₃ < s ≤ b₄`: `output = ceilGrid(s, 110, 220, 10)`.
- If `b₄ < s ≤ b₅`: `output = ceilGrid(s, 240, 480, 20)`.
- If `b₅ < s ≤ b₆`: `output = ceilGrid(s, 500, 1000, 50)`.

**Invariant:** For `s` in `(0, 1000]`, exactly one band applies; `output` is always one of the allowed values in that band's column.

**Unit tests** must assert boundary behavior: `s = b₁` … `b₅`, values just above each `bᵢ`, `s = 1000`, and `s` in `(0, 1]`.

---

## Worker and app integration

- **Location:** Computation runs in the **search worker** after `CardIndex` / `PrintingIndex` and list caches are available (ADR-003). The worker holds the precomputed weight arrays (§ Step 1) and the columnar data needed for oracle-only Bling resolution.
- **Protocol (pull model):** Extend `shared/src/worker-protocol.ts` with a **request/response** pair. The main thread requests scores; the worker computes on demand. Scores are **not** pushed automatically on `list-update`.
  - **Request:** `type` (message discriminant), `requestId` (correlate with response), `lines` (resolved deck — see below).
  - **Response:** `type`, `requestId`, `salt` / `conformity` / `bling` (each integer `0`–`1000` per § Step 3), and per-gauge **coverage** objects each containing `scored_copies` and `total_copies` (non-negative integers; `total_copies` equals `D` from § Step 2 when the deck is non-empty).
  - Message **type names** are implementation choices as long as they are stable and documented next to other worker messages (Spec 024 family patterns).
- **Resolved deck lines:** The existing `list-update` message (Spec 076) sends deduplicated `printingIndices` for `my:` query evaluation — it intentionally discards copy counts. The scoring engine needs **per-instance** data, so the **request message** carries the resolved lines. The main thread builds them from its `MaterializedView`:
  - Each element represents one instance: `{ canonicalFaceIndex: number; printingRowIndex: number | -1 }`. Use `-1` (or a sentinel) when the instance is oracle-only (`scryfall_id` null) and the main thread cannot resolve a printing.
  - `lines.length` equals `D`. The main thread omits unresolved instances (oracle not in map).
  - The main thread already builds the `oracleToCanonicalFace`, `printingLookup`, and `canonicalPrintingPerFace` maps (Spec 076 / `list-mask-builder.ts`); reuse them to resolve instances.
- **Invalidation:** The main thread re-requests scores when a `list-update` is sent for the viewed list, or when card/printing data loads. The worker does **not** cache gauge results across requests.
- **UI:** Lists / deck surfaces show three gauges (0–1000 integers), optional tooltips explaining the gauge and coverage. Exact placement follows Lists page / deck editor specs (e.g. Spec 090, Spec 110) — **layout is not normative in this spec** beyond readability and accessibility (contrast, labels).

---

## Acceptance Criteria

1. **Weights:** For each metric, competition ranking and `(N - R) / (N - 1)` match § Step 1; missing data yields weight `0`.
2. **Pools:** Canonical-face deduplication for salt/conformity; printing pool for USD; `N` excludes missing members.
3. **Aggregation:** p-mean matches § Step 2 with documented default `p` per gauge; **`D = 0`** yields score `0` and coverage zeros without dividing.
4. **Output range:** Integers in `0`–`1000` per § Step 3; display `0` only for logical true zero (all weights zero for that gauge) **or** empty deck; Renard mapping matches § 3.3 including breakpoints.
5. **Coverage:** Exposes scored vs total **instance counts** per gauge for the scored list.
6. **Tests (Vitest):** Pure functions in `shared/` with table-driven cases for ties, `N = 1`, **Renard** boundaries per § 3.3, **`D = 0`**, and a small synthetic deck aggregation.
7. **No new ETL columns** required for v1 — engine consumes existing columns only.
8. **Oracle-only Bling:** Uses cheapest valid-USD printing for that oracle (§ Deck instances); tie-break by smallest printing row index; all-invalid-USD → weight `0` for that instance.
9. **Instance model:** Engine operates on raw `InstanceState` entries (one per physical copy); no dependency on a `quantity` field. `D` = count of scored instances.

## Open questions

1. **Zone filtering** for Commander vs Cube vs unsanctioned lists (still out of scope for v1 unless product adds a UX requirement).

## Implementation Notes

- 2026-04-10: **Oracle-only lines (Bling)** — Locked to cheapest valid-USD printing per canonical oracle (see § Deck instances); tie-break by smallest printing row index; no valid USD → weight `0`.
- 2026-04-10: **Renard schedule** — Fully specified in § Step 3 (breakpoints + `ceilGrid`); GitHub #163 is historical context only.
- 2026-04-10: **Salt `p`** — Ship default `3`; revisiting `4` is a product/telemetry decision, not a spec blocker.
- 2026-04-10: **Instance model alignment** — Reframed from "deck lines with quantity" to "one InstanceState per copy" to match Spec 109 implementation. `D` is the count of scored instances, not a sum of quantities. The existing `list-update` protocol (Spec 076) sends deduplicated printing indices for `my:` queries; the scoring request carries per-instance resolved lines instead, since copy counts matter for aggregation.
- 2026-04-10: **Pull model** — Scoring uses request/response (not auto-push on `list-update`) to avoid wasted computation for lists the user is not viewing.
