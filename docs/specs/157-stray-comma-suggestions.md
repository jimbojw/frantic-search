# Spec 157: Stray Comma Suggestions (Separator Mistakes)

**Status:** Draft

**Depends on:** Spec 151 (Suggestion System), Spec 036 (Source Spans), Spec 002 (Query Engine)

**Addresses:** [GitHub issue #179](https://github.com/jimbojw/frantic-search/issues/179) (comma mistaken for a field separator; complements Spec 156 color / identity operator relaxation)

**Related:** Spec 156 — operator relaxation and **replacement canonicalization** when rewriting a single color / identity clause; this spec covers **multi-clause** cleanup when **value-attached** commas act as false separators between intended terms.

## Goal

When a search returns **zero results** and the query contains **commas attached to field values** that are plausibly mistaken for “next term” separators (CSV-style typing), offer a **rewrite** suggestion that removes **only those trailing value commas**. Teach users that **terms are separated by whitespace**, not commas — while preserving **legitimate commas** inside values (notably **oracle** text and **quoted** strings).

Do **not** change parser or evaluator behavior or reject queries containing commas; Scryfall parity allows forms like `ci=u,` to parse without error. Suggestions are **opt-in** refinements when the combined query matches nothing.

## Background

Users sometimes type pseudo–SQL or CSV-style filters:

```text
ci=u, o=surveil, t=pl
```

In this **headline** shape, the lexer (Frantic Search and Scryfall-style behavior) places the mistaken commas **inside the field values** — e.g. `u,` and `surveil,` — not as whitespace-only gaps between operands. The suggestion addresses that **value-attached** comma, not a separate “comma token” between clauses.

Commas are **valid characters** in some field values (e.g. oracle substring search). A **trailing comma** on a value that was meant as a clause boundary (`o=surveil,` before the next field) is **rarely** intentional oracle punctuation in that position; it usually means “next filter.” That mistake can yield **zero combined results** even when each fragment would match cards under a correct layout (see issue #179 breakdown).

A different case — **punctuation-only bare operands** such as `c=u , o:surveil`, where `,` is its own `BARE` term — is **out of scope** for this spec (see **Out of scope**). That path does not need the same “detach from value” rewrite; it is also a poor fit for a chip that would imply **removing an entire term**.

Spec 156 handles **overly strict `=`** on color / identity and strips a **single trailing comma** on the **replaced fragment** only. It does **not** propose a dedicated chip for “remove mistaken separators” across the full query. This spec fills that gap.

## Different from Spec 156

| Aspect | Spec 156 | Spec 157 |
|--------|----------|----------|
| Trigger | `=` on color / identity with known non-count color value | Stray / separator-style commas in the effective query |
| Rewrite | Change operator (`=` → `:`, `>=`) on specific nodes | Remove **trailing commas attached to field values**; leave field names and non-comma value text unchanged |
| Comma handling | Canonicalize the **spliced** relaxed clause | Remove **value-terminal** stray commas under MVP rules below |

Both may apply to the same user string. **Stray-comma** uses **priority 23** vs **relaxed** at **24**, so the suggestion list (sorted by `priority` per Spec 151) shows syntax cleanup before operator relaxation; exact **push order** inside `buildSuggestions` does not matter as long as priorities are correct.

## Design

### Pattern

1. **Trigger** — Effective (combined) query evaluates to **zero cards** (`totalCards === 0`), with the same **pinned / live** empty-state gate as Specs 153, 154, and 156 (`app/src/worker-suggestions.ts`: require breakdown for the effective query; skip when a pinned segment exists and matches zero cards).
2. **Detection** — From the effective query string and/or breakdown spans, identify **removable comma positions** (see **MVP scope** below). Respect **string and regex literals** and other delimiter rules so commas **inside** protected regions are never removed.
3. **Build candidate** — Produce `cleanedQuery` by removing **all** eligible commas in one pass (or equivalent single rewrite). Normalize whitespace if removal leaves double spaces (collapse to single space; trim edges consistently with other suggestion rewrites).
4. **Filter** — `cleanedQuery` must be **different** from the effective query (after minimal normalization for comparison). Evaluate with `evaluateAlternative` (same helper as Specs 153 / 156). **Only** add a suggestion when **`cardCount > 0`**.
5. **Output** — At most **one** `Suggestion` per distinct `cleanedQuery` for this trigger class.

### MVP scope (normative)

The MVP **must** support removing **one trailing comma per affected field value** for top-level operands that are field clauses (including negated field clauses), so acceptance criterion 1 (`ci=u, o=surveil, t=pl`-style queries) is satisfiable. Implementation documents edge cases in code comments.

**Eligible:** The field’s **lexed value** ends with `,` — i.e. the mistaken separator was folded into the value token (same situation Spec 156 extends with `span.end + 1` when `effectiveQuery[span.end] === ','`). Strip **only** that final comma from the value for each qualifying `FIELD` node (and apply all such strips in one `cleanedQuery`). Examples: `ci=u,` → `ci=u`, `o=surveil,` → `o=surveil`.

**Recommended detection:** Use the parsed effective query (breakdown / AST + Spec 036 spans): for each top-level `AND` child that is a `FIELD` or `NOT` wrapping a `FIELD`, if the value ends with `,`, splice it out. Respect **quoted** and **regex** literal boundaries so a comma **inside** a quoted oracle phrase is never treated as value-terminal stray punctuation. Do not remove commas **inside** an unquoted oracle value except the **single** terminal `,` at the end of that value (the CSV mistake); no “strip every comma in `o:`” pass.

**Out of scope for MVP (explicit):** **Punctuation-only bare operands** (e.g. `,` as an entire `BARE` term in `c=u , o:surveil`) — no rewrite and no “remove term” suggestion here. **Inter-sibling gaps** that contain only commas and whitespace **without** attaching to a field value (if the lexer ever produced that shape) — not required for MVP; the confirmed headline failure mode is **value-attached** commas. Mid-value commas in unquoted `o:` (not terminal). When in doubt, **do not** remove.

### Suggestion model

- **`id`:** `stray-comma` — extend the `Suggestion` union in `shared/src/suggestion-types.ts` and the Spec 151 type block when implementing.
- **Placement:** Empty state only (same as wrong-field, relaxed, oracle).
- **Priority:** **23** — after **wrong-field** (22), before **relaxed** (24). Rationale: fix mistaken punctuation before suggesting different operators.
- **Variant:** `rewrite`.
- **Label:** Short action, e.g. `Remove stray commas` or the **minimal diff** preview (product choice); label must fit `ChipButton` patterns (Spec 150).
- **Explain:** Teach that **fields are separated by spaces**, not commas; optionally note that **commas inside oracle text** are allowed when they are part of the search phrase (deep-link helps).
- **`query`:** Full effective query with eligible commas removed (and whitespace normalized).
- **`count` / `printingCount`:** Set when `evaluateAlternative` returns `cardCount > 0`, consistent with wrong-field / relaxed chips.
- **`docRef`:** `reference/syntax` — maps to `app/src/docs/reference/syntax.mdx` (`?doc=reference/syntax`). Adjust if the reference tree adds a dedicated “building queries” article.

### Dedup and interaction

- If `cleanedQuery` is **identical** to a rewrite already emitted by another trigger in the same `buildSuggestions` pass, **omit** the duplicate chip or merge analytics idempotently (implementation choice; user sees one chip).
- Spec 156 **relaxed** suggestions may still appear **after** this chip when comma removal alone does not restore results (e.g. `c=u` still exact-match empty).

## Trigger conditions (summary)

1. `totalCards === 0` for the effective query.
2. Same pinned empty gate as Spec 156 / 153.
3. At least one comma matches **eligible** rules; `cleanedQuery !== effectiveQuery` (normalized comparison as defined in implementation).
4. `evaluateAlternative(cleanedQuery)` yields **cardCount > 0**.

## Out of scope

- **Bare operands that are only punctuation** (e.g. `c=u , o:surveil` with `,` as a standalone `BARE` term). Frantic Search already follows Scryfall-style tolerance for such tokens; suggesting removal would imply **dropping a whole term**, which is a different feature than detaching a mistaken comma from a **field value**.
- Parser / evaluator changes; treating stray commas as **errors**.
- Non–zero-result searches (no rider-only variant in MVP).
- Suggesting comma removal when the cleaned query still returns **zero** results (no “educational” chip without a positive count — Spec 151 “actionable” preference).
- Negated-clause **special cases** beyond mirroring the same span rules as positive clauses (if removal would change negation boundaries incorrectly, skip removal for that position).

## Worker and UI integration

- Implement detection + suggestion assembly in `buildSuggestions` (or a dedicated module imported by `worker-suggestions.ts`), using the **effective** query string and existing span / splice utilities where applicable.
- Add `stray-comma` to **`EMPTY_STATE_IDS`** in `SuggestionList.tsx` (required for empty-state rendering; same lesson as Spec 156 for `relaxed`).
- Update **Spec 151** priority table, placement table, migration row, and TypeScript snippet to include `stray-comma` when this spec is implemented.

## Tests

- **Unit tests** (shared or app, depending on where detection lives): eligible vs ineligible comma positions; quoted strings; regex literals; **value-terminal** comma on multiple field clauses (`ci=u, o=surveil,` style); query unchanged when no field values end with `,`; bare `,` operand present — suggestion builder does **not** target that operand (out of scope).
- **Worker / integration:** A zero-result query whose breakdown reflects separator commas (see issue #179) yields a `stray-comma` suggestion with `cardCount > 0` after tap query; a query with a comma **inside** a protected oracle phrase does **not** lose that comma.
- **Pinned + live:** When the empty-state gate allows suggestions (pinned segment matches, live contributes CSV-style commas, **combined** query is zero-result), the suggested `query` must be built from the **effective** combined string, not the live segment alone.

## Acceptance criteria

1. A query in the spirit of `ci=u, o=surveil, t=pl` (commas in the values `u,` / `surveil,` when lexed) that currently returns **zero** combined results can show a stray-comma suggestion when the **cleaned** effective query returns **at least one** card.
2. Tapping the chip applies `cleanedQuery` via the same path as other rewrite suggestions (Spec 151).
3. Legitimate commas inside **quoted** (and **regex**) spans are **not** removed by the suggestion builder.
4. Suggestion appears only in the **empty** state with **priority 23** (relative order vs wrong-field 22 and relaxed 24 documented in Spec 151).
5. No duplicate suggestion row when another trigger already emits the **same** `query` string.

## Scope of changes (anticipated)

| Area | Change |
|------|--------|
| `docs/specs/157-…` (this file) | Design reference; set **Status** to **Implemented** when done |
| `docs/specs/151-suggestion-system.md` | `stray-comma` id, priority **23**, placement, migration row, code snippet |
| `shared/src/suggestion-types.ts` | Add `'stray-comma'` to `Suggestion['id']` union |
| `app/src/worker-suggestions.ts` (or sibling) | Build suggestion when triggers match |
| `app/src/SuggestionList.tsx` | Include `stray-comma` in `EMPTY_STATE_IDS` |
| `docs/specs/156-…` | Cross-link to this spec (comma follow-up) |

## Implementation notes

*(Append dated bullets here when implementing, per ADR-008.)*
