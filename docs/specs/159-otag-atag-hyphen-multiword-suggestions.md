# Spec 159: Hyphen-joined multi-word bare terms for otag / atag suggestions

**Status:** Implemented

**Depends on:** Spec 151 (Suggestion System), Spec 154 (Bare-term field upgrade), Spec 036 (Source Spans), Spec 092 (Tag data model), Spec 093 (Tag query evaluation)

**Addresses:** [GitHub issue #180](https://github.com/jimbojw/frantic-search/issues/180)

**Related:** Spec 154 defines the multi-word sliding window for keywords and artists; this spec extends that pass with **hyphen-slug prefix** matching against oracle tag and illustration tag vocabularies.

## Goal

When a user types bare text that should be an oracle or illustration tag but does not match as a **name** search, offer **`bare-term-upgrade` rewrites** to `otag:{label}` or `atag:{label}` when the user’s input matches tag keys in the loaded index by **prefix** (case-insensitive), capped at three per field.

- **Multi-word:** Two or more adjacent bare words that correspond to one hyphenated tag (e.g. `mana rock` → `mana-rock`); the **hyphen slug** `mana-ro` prefixes `mana-rock`.
- **Single-token:** One bare word that prefixes a tag key (e.g. `triggere` → `otag:triggered-ability`) without requiring a second token.

## Background

Oracle tags in the data pipeline use **hyphenated** identifiers (e.g. `mana-rock`). Spec 154’s multi-word pass matches **space-separated** phrases against **keyword** and **artist** indexes (`kw:"…"`, `a:"…"`). Spec 154’s single-word path uses **exact** label match for `otag:` / `atag:`, so a partial token like `triggere` does not suggest `otag:triggered-ability` without this spec.

This spec adds **prefix** matching on tag keys: build a **slug** from one or more trimmed bare segments (multi-word: join with `-` after lowercasing each segment; single-word: one lowercased segment), then `key.toLowerCase().startsWith(slug)`. Emit **unquoted** `otag:` / `atag:` suggestions using the **canonical key** from the index. A **hard cap of three** matching tags applies **per field** (`otag` vs `atag`) per invocation (each multi-word window or each single bare node) so prefix search does not flood the empty state.

## Different from Spec 154 (multi-word summary)

| Aspect | Spec 154 (kw / artist) | Spec 159 (otag / atag) |
|--------|------------------------|-------------------------|
| Phrase form | Space-joined phrase vs keyword / artist index | **Hyphen-joined slug** vs tag label keys |
| Match semantics | Exact phrase in vocabulary | **Prefix** on slug: `key.toLowerCase().startsWith(slug)` |
| Suggested syntax | Quoted: `kw:"first strike"`, `a:"Dan Frazier"` | Unquoted: `otag:mana-rock`, `atag:…` |
| Volume | At most one chip per domain per window | **≤3** chips per field per window (oracle vs illustration separately) |
| Same adjacency / windows | Yes — reuse `getAdjacentBareWindows` and splice span rules | Yes (multi-word); single-token uses one node span |
| Single bare token | N/A (exact otag/atag only in Spec 154) | **Prefix** on slug = that token (Spec 159 extension) |

## Design

### Trigger conditions

All of the following must hold (aligned with Spec 154 bare-term-upgrade):

1. **Zero results** — `totalCards === 0` for the effective (pinned + live) query.
2. **Root shape** — AST root is `AND` or `BARE` (not `OR`).
3. **Live query gate** — Same as Spec 154: `hasLive` and not “pinned matches zero” empty-state skip.
4. **Tag data** — For `otag:`, `oracleTagLabels` (or equivalent) is non-empty; for `atag:`, illustration tag labels are non-empty. If a vocabulary is unavailable, skip only that field’s suggestions.

**Where prefix runs:**

- **Multi-word window** — Two or more **adjacent, positive, unquoted** bare nodes (whitespace-only gaps), same rules as Spec 154 § Multi-word bare terms. Handled in the sliding-window pass via `getMultiWordAlternatives`.
- **Single-segment (one bare token)** — A **positive, unquoted** bare node that was **not** consumed by a multi-word window. Handled in the single-node pass: after `getBareTermAlternatives` (exact domains), also run **`getBareTagPrefixAlternatives(value, context)`** (or equivalent) for tag prefix completions on that token’s trimmed value.

**Prefix length:** No minimum slug length; the **cap of three** per field bounds noise (e.g. a single-letter token yields at most three chips per field).

### Slug algorithm (segments from bare nodes)

Given ordered bare values `w1, w2, …, wk` with **k ≥ 1** (one segment for single-token; two or more for a multi-word window):

1. Use **one segment per bare node** (normal bare tokens are single words; do not rely on re-splitting a space-joined phrase unless it is equivalent to the node values in order).
2. **Trim** each segment (Unicode trim / `String#trim` semantics). Reject the window if **any** trimmed segment is empty. For slug construction, use the **trimmed** string: normalize each non-empty segment with `toLowerCase()` for lookup and joining only (labels in suggestions still use the vocabulary’s canonical key, not the user’s casing).
3. **Slug** = for **k === 1**, the single segment lowercased; for **k ≥ 2**, `segment1 + '-' + segment2 + …` (no leading/trailing hyphens; no empty segments).

**Examples:**

| Bare window (tokens) | Slug |
|----------------------|------|
| `mana`, `rock` | `mana-rock` |
| `Mana`, `ROCK` | `mana-rock` |
| `Mana `, ` rock ` (trim) | `mana-rock` |
| `mana`, `ro` | `mana-ro` |
| `triggere` (single segment) | `triggere` |

### Prefix match and cap

Let `slug` be the lowercase string built above (`segment1 + '-' + …` for multiple segments, or one segment alone). Multi-word slugs contain at least one hyphen; a single-segment slug has no hyphens (e.g. `triggere` prefix-matching `triggered-ability`).

For each vocabulary (oracle tags → `otag:`, illustration tags → `atag:`):

1. **Match rule** — A canonical key matches iff `key.toLowerCase().startsWith(slug)`.

   This implements **prefix completion on the full hyphenated string** (e.g. slug `mana-ro` matches `mana-rock`). Exact matches are included (`mana-rock` starts with `mana-rock`).

   **Tradeoff:** Plain string prefix can theoretically match keys that share the same leading characters without being the intended tag (e.g. slug `a-b` and a hypothetical key `a-basket`). Real oracle and illustration tag vocabularies are small and hyphen-shaped; the **cap of three** keeps noise low. Prefer a simple rule and stable ordering over exotic boundary heuristics.

2. **Deduplication** — If the label array contains multiple entries with the same `key.toLowerCase()` (duplicate or case-only alias), treat them as **one** match for ordering and cap: keep a **single** canonical `key` per lowercase form (e.g. the first occurrence in array iteration order).

3. **Order** — Sort matches for stable UX: **exact** match (`key.toLowerCase() === slug`) first, then all other prefix matches. Among non-exact matches, sort by **shorter `key` first**, then **lexicographic** on `key.toLowerCase()` (tie-break).

4. **Cap** — Take at most **three** keys after ordering.

5. **Emit** one `BareTermAlternative` per key (same explain/docRef as Spec 154 otag/atag).

Both `otag:` and `atag:` run independently; each may contribute **up to three** suggestions for the same window.

### Coexistence with keyword / artist multi-word

`getMultiWordAlternatives(phrase, context)` (or equivalent) should consider **keyword**, **artist**, **otag** (up to 3), and **atag** (up to 3) for the same window. If multiple domains hit, return **multiple** `BareTermAlternative` entries; `buildSuggestions` already iterates all alternatives and splices once per chip.

**Return order:** Append alternatives in a **stable, documented** order so chip order is predictable: **keyword** (at most one), **artist** (at most one), then **otag** (0–3), then **atag** (0–3). No cross-domain deduplication beyond what each domain already enforces.

**Precedence:** No need to prefer otag over kw when both match; show all chips returned. **Consumption:** Existing rule unchanged: if the window yields **any** multi-word alternative, **consume** all nodes in that window for the single-word pass (Spec 154).

**API note:** Slug segments should come from **the same bare node values** the worker used to build the window (e.g. pass `segments: string[]` into `getMultiWordAlternatives` or split the phrase only when it equals those tokens joined with spaces). Prefer an explicit segment list so behavior stays aligned with the AST.

### Single-segment coexistence with exact `otag:` / `atag:`

The single-node pass runs **`getBareTermAlternatives`** first (exact match for `otag:` / `atag:` and other domains). Then run tag **prefix** alternatives for the same token.

**Dedup:** If an exact alternative already emitted `otag:{key}` or `atag:{key}` for that node, **do not** emit a second chip for the same tag from the prefix pass. Compare normalized labels (e.g. lowercase full `otag:…` / `atag:…`). Prefix may still emit **other** keys (e.g. exact `otag:ramp` and prefix `otag:ramp-artifact`).

**Order:** Evaluate and surface **exact** domain alternatives first, then **prefix** `otag:` / `atag:` alternatives (otag block then atag block, each up to three), consistent with multi-word return order for tag fields.

### Suggestion model

- **`id`:** `bare-term-upgrade` (no new id).
- **Priority:** **21** for these `otag:` / `atag:` chips (Spec 151) so they sort after the oracle hint (**20**). Other bare-term-upgrade domains remain at **16**.
- **Placement:** Empty state only.
- **Label:** `otag:{key}` or `atag:{key}` with canonical key from data.
- **Explain:** Reuse Spec 154 otag/atag explain strings (“Use otag: for oracle tags.” / “Use atag: for illustration tags.”) and **docRef** (`reference/fields/face/otag`, `reference/fields/face/atag`).
- **`count` / `printingCount`:** Same as Spec 154 — include when `evaluateAlternative` returns `cardCount > 0`; omit when zero (field prefix still teaches correct syntax).

### Out of scope

- **Non-prefix** matching (fuzzy spell correction, substring not at start, edit distance).
- **OR** at query root (Spec 154 already skips bare-term-upgrade for OR).
- Changing parser or evaluator behavior.
- Hyphen slugs with **more than** the maximum multi-word window size already used for kw/artist (today **3** words in `worker-suggestions.ts`); if the window size changes globally, tag slug length follows the same cap unless a future spec says otherwise.

## Worker integration

- Shared: **`tagPrefixAlternativesFromSegments`** (slug from one or more segments) used by **`getMultiWordAlternatives`** and **`getBareTagPrefixAlternatives`** in [`shared/src/bare-term-upgrade-utils.ts`](../../shared/src/bare-term-upgrade-utils.ts).
- [`app/src/worker-suggestions.ts`](../../app/src/worker-suggestions.ts): pass bare node values for each window into `getMultiWordAlternatives` (sliding-window loop). In the **single-node** loop, after `getBareTermAlternatives`, merge in `getBareTagPrefixAlternatives(node.value, context)` filtered against exact `otag:` / `atag:` labels already returned for that node.
- **Pinned + live:** Spans remain live-query coordinates; effective query assembly matches Spec 154 / Spec 131.
- **Performance:** A linear scan over each tag list per window or per bare node is acceptable: vocabularies are small, and output is capped at three keys per field.

## Tests

- **Unit (shared):** With `oracleTagLabels` containing `mana-rock`, slug from `mana` + `rock` yields `otag:mana-rock` (canonical casing). Slug from `mana` + `ro` yields the same (prefix match).
- **Ordering:** Exact slug match sorts before longer keys; among non-exact prefix matches, shorter key before longer, then lexicographic.
- **Cap:** If four or more keys match the prefix rule, at most **three** `otag:` alternatives are returned.
- **Dedup:** If `oracleTagLabels` contains two entries differing only by case (same `toLowerCase()`), at most one `otag:` alternative is emitted for that logical tag toward the cap.
- **Negative:** Slug with no matching keys → no otag alts. Atag mirror where illustration labels present.
- **Trim:** Leading/trailing space on a bare token is trimmed before slug build; trimmed-empty segment rejects the window (no alternatives from slug pass for that window).
- **Regression:** Existing multi-word keyword and artist cases unchanged.
- **Single-token prefix:** With `oracleTagLabels` containing `triggered-ability`, bare value `triggere` yields `otag:triggered-ability` via `getBareTagPrefixAlternatives` (or end-to-end empty-state suggestion).
- **Single-node dedup:** When `getBareTermAlternatives` already returns exact `otag:foo` for a token, the prefix pass must not duplicate `otag:foo` (case-insensitive label match).

## Acceptance criteria

1. Query `mana rock` with zero combined results, and `mana-rock` present in oracle tag labels, yields at least one **`bare-term-upgrade`** suggestion whose rewrite is **`otag:mana-rock`** (or the canonical key if storage differs in casing only).
2. Query `mana ro` under the same conditions yields **`otag:mana-rock`** (prefix completion).
3. Tapping a chip applies the same rewrite path as other bare-term upgrades (Spec 151).
4. When oracle tag data is missing, no `otag:` suggestion is produced for hyphen windows; illustration tag data gated similarly for `atag:`.
5. At most three `otag:` suggestions and at most three `atag:` suggestions per multi-word window from tag prefix logic.
6. Spec 154 is updated to reference this spec for otag/atag multi-word behavior; Spec 151 documents **`bare-term-upgrade` priority 21** for `otag:` / `atag:` labels (oracle hint remains **20**).
7. Bare query `triggere` (zero results, tag data loaded, `triggered-ability` in oracle labels) yields a **`bare-term-upgrade`** suggestion **`otag:triggered-ability`** (single-token prefix).
8. When exact `otag:` / `atag:` already matches for a single bare token, no duplicate chip for the same tag from the prefix pass.

## Scope of changes (anticipated)

| Area | Change |
|------|--------|
| `docs/specs/159-…` (this file) | Design reference; set **Status** to **Implemented** when done |
| `docs/specs/154-bare-term-field-upgrade-suggestions.md` | Multi-word domains + examples; point to Spec 159 |
| `shared/src/bare-term-upgrade-utils.ts` | Hyphen slug + prefix match + cap in `getMultiWordAlternatives` (API tweak if needed) |
| `shared/src/bare-term-upgrade-utils.test.ts` | New cases for Spec 159 |
| `app/src/worker-suggestions.ts` | Pass window token array into `getMultiWordAlternatives` if required |

Optional: one line in [`docs/specs/151-suggestion-system.md`](151-suggestion-system.md) implementation notes for discoverability.

## Implementation notes

- **`tagPrefixAlternativesFromSegments`** in [`shared/src/bare-term-upgrade-utils.ts`](../../shared/src/bare-term-upgrade-utils.ts) builds the slug from **one or more** trimmed segments (join with `-` when multiple), dedupes labels by `toLowerCase()`, filters with `startsWith(slug)`, sorts (exact first, then shorter key, then lexicographic), caps at three per field.
- **`getMultiWordAlternatives(phrase, context, segments?)`** runs keyword and artist checks on `phrase` as before, then appends otag/atag tag-prefix alternatives.
- **`getBareTagPrefixAlternatives(value, context)`** runs tag-prefix for a **single** trimmed segment (otag then atag); the worker merges results after exact alternatives, deduping exact `otag:`/`atag:` labels.
- **Tests:** [`shared/src/bare-term-upgrade-utils.test.ts`](../../shared/src/bare-term-upgrade-utils.test.ts) — multi-word `describe('Spec 159: …')` plus single-token prefix cases.
