# Spec 131: Oracle "Did You Mean?" Empty-State Hint

**Status:** Implemented

**Extended by:** Spec 150 (ChipButton)

**Unified by:** Spec 151 (Suggestion System)

**Depends on:** Spec 002 (Query Engine), Spec 018 (Combined Name Search), Spec 036 (Source Spans), Spec 057 (include:extras), Spec 082 (Dual Count Filter Chips), Spec 126 (Empty List CTA), Spec 024 (Index-Based Result Protocol), Spec 154 (Bare-Term Field Upgrade)

**Addresses:** [Issue #143](https://github.com/jimbojw/frantic-search/issues/143), [Issue #209](https://github.com/jimbojw/frantic-search/issues/209) (oracle vs tag suppression), [Issue #221](https://github.com/jimbojw/frantic-search/issues/221) (single-token hybrid when all-oracle variants fail)

**Related:** Spec 163 (name-token spellcheck) — also targets zero-result bare tokens but suggests a **name** correction (Levenshtein) instead of oracle text. Both may appear; Spec 151 priority puts **name-typo** (17) before **oracle** (20).

## Goal

When a search returns zero results but the query contains bare words (which search the name field by default), offer a "Did you mean to search oracle text?" hint if an alternative query that searches oracle text instead would return results. Tapping the hint applies the alternative query.

## Background

Bare tokens are interpreted as name-search terms (Spec 018). If a user meant to search oracle text — e.g., typing `damage` expecting to find cards that deal damage — they must go back and type `o:` before their term(s). When there are no name matches but there would be oracle matches, we can offer a targeted hint, similar to the `include:extras` hint (Spec 057) and the empty-list CTA (Spec 126).

## Trigger Conditions

All of the following must hold for the oracle hint to appear:

1. **Zero results** — The effective (combined) search returned zero cards (`totalCards() === 0`). With a pinned query, this is the pinned+live combined result.
2. **Root shape** — The root AST node is either (a) an AND node, or (b) a leaf BARE node (single bare word, quoted or unquoted). Skip when root is OR (e.g. `(xyc OR abc)` does not trigger).
3. **Trailing bare tokens** — When root is AND, only the *trailing* bare tokens are considered: those that appear after the last non-bare token in source order. When root is a single BARE, that token is the trailing set. There must be at least one trailing bare token.
4. **An alternative returns results** — At least one candidate returns at least one card after the selection rules below: primary variants (phrase, ordered-regex, per-word), or when those all fail, **single-token hybrid** variants (see Design).
5. **Lower priority than other empty-state CTAs** — Do not show when the empty-list CTA (Spec 126) or `include:extras` hint (Spec 057) applies. The oracle hint appears only when those conditions do not hold.
6. **Non-tag bare-term-upgrade suppresses oracle for that token** — When a **trailing** bare token receives a **non-tag** bare-term-upgrade suggestion (Spec 154 domains other than `otag:` / `atag:` — e.g. `kw:landfall` for "landfall", or multi-word `kw:"first strike"`), do not also suggest the oracle variant (`o:landfall` or `o:first` / `o:strike` as part of the oracle hint) **for that token**. The worker maintains a set of suppressed bare **values** (case-insensitive) populated **only** from non-tag upgrades; trailing nodes whose value is in that set are omitted from the oracle phrase / per-word construction.

   **`otag:` / `atag:`** bare-term upgrades (exact label per Spec 154 or prefix per Spec 159) **do not** suppress the oracle hint. Tag chips are optional discovery (Spec 159); users often mean oracle rules text instead. Example: `opponent skips` may show both `o:"opponent skips"` (when evaluation returns results) **and** `otag:…` prefix chips; oracle sorts before tag chips by priority (Spec 151).

### Examples

| Query | Root | Trailing bare tokens | Variants tried |
|-------|------|----------------------|----------------|
| `lightning ci:r deal 3` | AND | `deal`, `3` | Candidates: phrase `o:"deal 3"`, ordered-regex `o:/deal.*3/`, per-word `o:deal o:3` — worker picks one per selection rules |
| `"deal 3"` | BARE (quoted) | `"deal 3"` | phrase only `o:"deal 3"` — user quoted, don't split |
| `lightning bolt` | AND | `lightning`, `bolt` | phrase, per-word |
| `(xyc OR abc)` | OR | — | skip (root not AND/BARE) |
| `opponent skips` (with tag prefix matches) | AND | `opponent`, `skips` | phrase `o:"opponent skips"` **and** separate `bare-term-upgrade` chips for `otag:…` (priority 21); tag chips do not remove tokens from oracle trailing set |
| `landfall` (keyword match) | AND | `landfall` | Oracle skips `landfall` because `kw:landfall` is emitted (non-tag); no redundant `o:landfall` for that token |
| `raptor double` | AND | `raptor`, `double` | Primaries: phrase `o:"raptor double"`, regex `o:/raptor.*double/`, per-word `o:raptor o:double`. If all return zero, **hybrids**: `o:raptor double`, `raptor o:double` — selection picks e.g. `raptor o:double` when it is the unique or tie-breaking winner (Issue #221) |

## Design

### Alternative query variants

When the main query returns zero and has trailing bare tokens, the worker first evaluates up to **three primary** candidate splices (phrase, ordered-regex, per-word). **Only one** suggestion is shown (`id: 'oracle'`, Spec 151). All other terms in the query remain in place.

If **no** primary variant is selected (all return zero matches after steps 1–4 below), and there are **at least two** trailing bare tokens after suppression, the worker evaluates **single-token hybrid** candidates (step 5+). Hybrids are skipped when the trailing set is exactly one **quoted** BARE (same gate as per-word / ordered-regex: only phrase runs).

| Variant | Replacement | Example |
|---------|-------------|---------|
| **Phrase** (primary) | Replace trailing span with a single `o:"word1 word2 ..."` (or `o:word` when one token, no quoting needed) | `lightning ci:r deal 3` → `lightning ci:r o:"deal 3"` |
| **Ordered-regex** (primary) | Replace trailing span with `o:/word1.*word2.*…/` (words in order, not necessarily adjacent) | `ci:r damage target` → `ci:r o:/damage.*target/` |
| **Per-word** (primary) | Replace each trailing span with `o:value` (quoted when needed) | `lightning ci:r deal 3` → `lightning ci:r o:deal o:3` |
| **Single-token hybrid** | Replace **one** trailing BARE span with `o:value` (same quoting rules as per-word); leave **all other** query text unchanged, including other trailing bare tokens | `raptor double` → `o:raptor double` (first token only) or `raptor o:double` (second token only) |

**Quoted bare words:** When the trailing bare tokens are a single BARE node with `quoted: true` (e.g. `"deal 3"`), only evaluate the **phrase** variant. Do not split into per-word, ordered-regex, or hybrid.

**Negated bare words:** Do not convert. Only positive BARE nodes (those not under a NOT) are considered. Negated terms stay as-is.

### Ordered-regex eligibility

Do **not** build or evaluate the ordered-regex candidate when:

- There is only **one** trailing bare token (phrase and per-word are already equivalent to a single `o:` term; regex adds no useful distinction), or
- **Any** trailing token’s `value` contains a character outside the safe set **`[a-zA-Z0-9'-]`** (letters, digits, apostrophe, hyphen only). This avoids embedding regex escapes in the suggestion (e.g. mana symbols like `{C}{C}`).

When ineligible, treat the ordered-regex candidate as having **zero** matches for selection purposes.

### Single-suggestion selection (after evaluation)

Evaluate candidates against the effective (pinned + live) query using the same playable-filter rules as other suggestion rewrites. Let `phraseCount`, `regexCount`, and `perWordCount` be the resulting card counts (0 if not evaluated).

**Suggestion payload (`query`):** The chip’s `query` field is the **live** query after `spliceBareToOracle` on `msg.query` (trailing spans are in live coordinates). Evaluation uses the combined `sealQuery(pinned) + ' ' + sealQuery(live)` string when pinned; **`query` must not** repeat the pinned prefix (Spec 151 / Issue #258).

1. If **`phraseCount > 0`**, use the **phrase** variant (stop).
2. Else if ordered-regex was **eligible** and **`regexCount > 0`** and **`regexCount < perWordCount`**, use **ordered-regex**.
3. Else if **`perWordCount > 0`**, use **per-word**.
4. Else if ordered-regex was **eligible** and **`regexCount > 0`**, use **ordered-regex** (only option with matches).

**Tie:** If **`regexCount === perWordCount`** (and both &gt; 0), step 2 does **not** apply; step 3 chooses **per-word** (simpler form).

5. **Single-token hybrid (only if steps 1–4 did not select a primary variant):** Require **at least two** trailing bare nodes and **not** the single-quoted-trailing-only case. For each trailing index `i` in source order (`span.start`), build the query that splices **only** that token’s span to `o:<value>`. Let `hybridCount[i]` be the card count (0 if not evaluated). Among indices with `hybridCount[i] > 0`, choose the index with **maximum** count. **Tie-break:** if two hybrids tie on count, prefer the candidate that upgrades the token with the **largest** `span.start` (rightmost in the query), so `raptor o:double` wins over `o:raptor double` when both match the same number of faces.

6. **Chip label for hybrid:** The button’s oracle label shows **only** the upgraded fragment (e.g. `o:double`), not the full trailing oracle span, consistent with “oracle part only” for other variants.

### Splicing logic

- Use AST spans from the parser (Spec 036). BARE nodes carry `span: { start, end }`.
- **Trailing bare tokens:** Walk the root's children in source order (by span.start). The trailing bare tokens are the contiguous suffix of BARE nodes at the end. When root is a single BARE, that node is the trailing set.
- **Phrase variant:** Replace the first trailing BARE's span with `o:"<all trailing bare values joined by space>"`; splice out the remaining trailing BARE spans. Splice from end to start to preserve offsets.
- **Ordered-regex variant:** Same span replacement as phrase; replacement is `o:/w1.*w2.*…/` where each `wi` is the bare token value (only when every token passes the safe charset; no escaping).
- **Per-word variant:** Replace each trailing BARE span with `o:value` (escape/quote if value contains spaces or special chars). Skip when the trailing set is a single quoted BARE.
- **Single-token hybrid:** Replace exactly **one** trailing BARE span with `o:value`; do not merge spans. Other bare tokens (trailing or not) stay as typed.
- Reuse `spliceQuery` from `app/src/query-edit-core.ts`. Implementation: `spliceBareToOracleSingle` in `app/src/oracle-hint-edit.ts`.

### Variant preference

See **Single-suggestion selection** above. Historically only phrase vs per-word were considered; ordered-regex sits **between** them when phrase fails and regex is strictly narrower than per-word. **Single-token hybrid** runs only after no primary variant is chosen.

### Worker protocol

Add optional fields to the `result` variant of `FromWorker`:

```typescript
oracleHint?: {
  query: string;           // Full alternative query to apply when user taps (e.g. lightning ci:r o:deal o:3)
  label: string;           // Oracle part only, for button display (e.g. o:deal o:3 or o:"deal 3")
  count: number;           // Face (card) count
  printingCount?: number;  // Printing count when PrintingIndex is loaded; always populate when available so UI can show both
  variant: 'phrase' | 'per-word';  // legacy shape; runtime uses unified suggestions (id: 'oracle') from buildSuggestions
}
```

**Note:** Post–Spec 151, the live UI consumes `suggestions` with `id: 'oracle'`, not the `oracleHint` field above. Hybrid wins are still a single oracle chip; no separate protocol field is required.

Present only when:
- Main query returned zero results.
- Root is AND or leaf BARE; at least one trailing bare token exists.
- At least one candidate (after selection rules) returns results.

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
| `shared/` or `app/` | `getTrailingBareNodes(ast)`; `spliceBareToOracle(query, trailing, variant)` with `variant: 'phrase' \| 'per-word' \| 'regex'`; `spliceBareToOracleSingle(query, trailing, index)`; `getOracleLabelSingleUpgrade(node)`; `trailingOracleRegexEligible(trailing)` in `app/src/oracle-hint-edit.ts`. |
| `app/src/worker-search.ts` | When deduped.length === 0, root is AND or BARE, and trailing bare nodes exist: if pinned query alone yields zero, skip alternatives. Otherwise build variant(s) from live query, evaluate, populate `oracleHint` (phrase only when trailing is single quoted BARE). |
| `shared/src/worker-protocol.ts` | Add `oracleHint?: { query, label, count, printingCount?, variant }` to result variant. |
| `app/src/App.tsx` | Store `oracleHint` from result message; pass to SearchContext. |
| `app/src/SearchContext.tsx` | Add `oracleHint?: Accessor<...>` to context. |
| `app/src/SearchResults.tsx` | In empty-state fallback: when `oracleHint` present (and empty-list CTA / include:extras do not apply), render the "Did you mean?" hint with two-line button (label + `formatDualCount`). |
| `app/src/DualWieldLayout.tsx` | Pass `oracleHint` through `buildPaneContext` for Dual Wield. |

**Current location (post–Spec 151, worker refactor):** Oracle suggestion is built in `buildSuggestions` (app/src/worker-suggestions.ts), using `evaluateAlternative` from app/src/worker-alternative-eval.ts. Delivered via `suggestions` array (id: 'oracle').

**Sort order vs tag chips:** When the same query also produces `bare-term-upgrade` chips for **`otag:`** or **`atag:`** (Spec 154 / 159), the unified list is sorted by `priority`; oracle uses **20** and those tag chips use **21** (Spec 151), so the oracle rewrite appears first.

## Acceptance Criteria

- [ ] When `lightning ci:r deal 3` returns zero and the phrase variant returns results, the hint shows `lightning ci:r o:"deal 3"`.
- [ ] When `"deal 3"` returns zero and `o:"deal 3"` returns results, the hint shows only the phrase variant (no per-word split).
- [ ] When the phrase variant returns zero but the per-word variant returns results (and ordered-regex does not win per selection rules), the hint shows the per-word query.
- [ ] When phrase and per-word both return results, the phrase variant is preferred.
- [ ] When phrase returns zero, ordered-regex is eligible, and `regexCount` is strictly less than `perWordCount`, the hint uses `o:/…/` ordered-regex.
- [ ] When `regexCount === perWordCount` (both &gt; 0), the hint uses per-word, not ordered-regex.
- [ ] When a trailing token fails the regex safe charset (e.g. `{C}{C}`), the hint label is not an `o:/…/` regex form.
- [ ] Single trailing bare token never produces an ordered-regex-only hint distinct from phrase/per-word.
- [ ] `(xyc OR abc)` with zero results does not trigger the oracle hint (root is OR).
- [ ] Button displays only the oracle part (e.g. `o:deal o:3`); tapping applies the full query (e.g. `lightning ci:r o:deal o:3`).
- [ ] Negated bare words are not converted; they remain in the alternative query as-is.
- [ ] The empty-list CTA and `include:extras` hint take priority over the oracle hint when their conditions hold.
- [ ] When a bare term receives a **non-tag** bare-term-upgrade suggestion (Spec 154, e.g. `kw:landfall` for "landfall"), the oracle hint does not also suggest `o:landfall` for that term.
- [ ] When trailing tokens only receive **`otag:`** / **`atag:`** bare-term upgrades (Spec 159), the oracle hint is still evaluated for those tokens when other conditions hold (e.g. `opponent skips` with `o:"opponent skips"` returning results).
- [ ] Works in both single-pane and Dual Wield layouts.
- [ ] Button uses two-line layout: oracle label on top, `N cards (M prints)` on bottom (via `formatDualCount`); both counts shown when printing data available.
- [ ] When pinned query alone yields zero results, oracle hint is not shown (alternatives skipped); future UX for alerting user about empty pinned query is out of scope.
- [ ] When phrase, ordered-regex, and per-word all return zero matches but a single-token hybrid returns matches, the hint uses that hybrid (after primary selection fails).
- [ ] Issue #221 style: `raptor double` with name+oracle fixture yields oracle suggestion `raptor o:double` (or equivalent) with label showing the upgraded fragment (e.g. `o:double`) when primaries fail and that hybrid wins on count / tie-break.
- [ ] When the **phrase** primary returns matches, phrase is still chosen; hybrid pass does not override a winning primary.
