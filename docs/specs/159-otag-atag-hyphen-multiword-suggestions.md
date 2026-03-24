# Spec 159: Hyphen-joined multi-word bare terms for otag / atag suggestions

**Status:** Draft

**Depends on:** Spec 151 (Suggestion System), Spec 154 (Bare-term field upgrade), Spec 036 (Source Spans), Spec 092 (Tag data model), Spec 093 (Tag query evaluation)

**Addresses:** [GitHub issue #180](https://github.com/jimbojw/frantic-search/issues/180)

**Related:** Spec 154 defines the multi-word sliding window for keywords and artists; this spec extends that pass with **hyphen-slug prefix** matching against oracle tag and illustration tag vocabularies.

## Goal

When a user types **two or more adjacent bare words** that correspond to a **single hyphenated** oracle or illustration tag (e.g. `mana rock` → tag `mana-rock`), the search often returns **zero results** because each word is interpreted as a separate name clause under AND. Offer **`bare-term-upgrade` rewrites** to `otag:{label}` or `atag:{label}` when the user’s **hyphen slug** matches tags in the loaded index by **prefix** (case-insensitive), so users discover the correct field without finishing every segment or learning tag spelling first. Example: `mana ro` forms slug `mana-ro`, which prefixes `mana-rock`.

## Background

Oracle tags in the data pipeline use **hyphenated** identifiers (e.g. `mana-rock`). Spec 154’s multi-word pass only matches **space-separated** phrases against the **keyword** and **artist** indexes (`kw:"…"`, `a:"…"`). Tags are excluded from that pass and the **single-word** path requires an **exact** label match, so neither `mana` nor `rock` alone suggests `otag:mana-rock`, and the pair `mana rock` never forms a hyphen slug in today’s logic.

This spec adds a **third multi-word shape**: join adjacent bare **words** with `-` (each segment lowercased for lookup), find tag keys whose lowercase form **starts with** that slug string, and emit **unquoted** `otag:` / `atag:` suggestions using the **canonical key** from the index. A **hard cap of three** matching tags applies **per field** (`otag` vs `atag`) per window so prefix search does not flood the empty state.

## Different from Spec 154 (multi-word summary)

| Aspect | Spec 154 (kw / artist) | Spec 159 (otag / atag) |
|--------|------------------------|-------------------------|
| Phrase form | Space-joined phrase vs keyword / artist index | **Hyphen-joined slug** vs tag label keys |
| Match semantics | Exact phrase in vocabulary | **Prefix** on slug: `key.toLowerCase().startsWith(slug)` |
| Suggested syntax | Quoted: `kw:"first strike"`, `a:"Dan Frazier"` | Unquoted: `otag:mana-rock`, `atag:…` |
| Volume | At most one chip per domain per window | **≤3** chips per field per window (oracle vs illustration separately) |
| Same adjacency / windows | Yes — reuse `getAdjacentBareWindows` and splice span rules | Yes |

Single-token **partial** tag match (e.g. bare `mana` alone → top-N `otag:` candidates) is **out of scope**; see issue #180 discussion (Path B). Prefix matching applies only to the **multi-word hyphen slug**, not to a single bare token against the whole tag list.

## Design

### Trigger conditions

All of the following must hold (aligned with Spec 154 bare-term-upgrade):

1. **Zero results** — `totalCards === 0` for the effective (pinned + live) query.
2. **Root shape** — AST root is `AND` or `BARE` (not `OR`).
3. **Live query gate** — Same as Spec 154: `hasLive` and not “pinned matches zero” empty-state skip.
4. **Multi-word window** — Two or more **adjacent, positive, unquoted** bare nodes (whitespace-only gaps), same rules as Spec 154 § Multi-word bare terms.
5. **Tag data** — For `otag:`, `oracleTagLabels` (or equivalent) is non-empty; for `atag:`, illustration tag labels are non-empty. If a vocabulary is unavailable, skip only that field’s suggestions.

### Hyphen slug algorithm

Given the ordered bare values in the window `w1, w2, …, wk` (as parsed, before field resolution):

1. Use **one segment per bare node** (normal bare tokens are single words; do not rely on re-splitting a space-joined phrase unless it is equivalent to the node values in order).
2. **Trim** each segment (Unicode trim / `String#trim` semantics). Reject the window if **any** trimmed segment is empty. For slug construction, use the **trimmed** string: normalize each non-empty segment with `toLowerCase()` for lookup and joining only (labels in suggestions still use the vocabulary’s canonical key, not the user’s casing).
3. **Slug** = `segment1 + '-' + segment2 + …` (no leading/trailing hyphens; no empty segments).

**Examples:**

| Bare window (tokens) | Slug |
|----------------------|------|
| `mana`, `rock` | `mana-rock` |
| `Mana`, `ROCK` | `mana-rock` |
| `Mana `, ` rock ` (trim) | `mana-rock` |
| `mana`, `ro` | `mana-ro` |

### Prefix match and cap

Let `slug` be the lowercase hyphen string above. Because this pass requires **two or more** bare nodes, `slug` always contains at least one hyphen (e.g. `mana-ro`, `mana-rock`).

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

### Suggestion model

- **`id`:** `bare-term-upgrade` (no new id).
- **Priority:** **16** (unchanged; Spec 151).
- **Placement:** Empty state only.
- **Label:** `otag:{key}` or `atag:{key}` with canonical key from data.
- **Explain:** Reuse Spec 154 otag/atag explain strings (“Use otag: for oracle tags.” / “Use atag: for illustration tags.”) and **docRef** (`reference/fields/face/otag`, `reference/fields/face/atag`).
- **`count` / `printingCount`:** Same as Spec 154 — include when `evaluateAlternative` returns `cardCount > 0`; omit when zero (field prefix still teaches correct syntax).

### Out of scope

- **Path B:** Single bare token → ranked list of partial otag matches over the whole vocabulary.
- **OR** at query root (Spec 154 already skips bare-term-upgrade for OR).
- Changing parser or evaluator behavior.
- Hyphen slugs with **more than** the maximum multi-word window size already used for kw/artist (today **3** words in `worker-suggestions.ts`); if the window size changes globally, tag slug length follows the same cap unless a future spec says otherwise.

## Worker integration

- Implement slug building, prefix collection (`startsWith(slug)` on lowercase key), ordering, cap, and alternatives inside **`getMultiWordAlternatives`** in [`shared/src/bare-term-upgrade-utils.ts`](../../shared/src/bare-term-upgrade-utils.ts) (or helpers called from it). If the function currently accepts only a space-joined `phrase`, extend it to accept **segment strings** (or `phrase` plus `segments`) so prefix logic uses the same tokens as the window.
- [`app/src/worker-suggestions.ts`](../../app/src/worker-suggestions.ts): pass bare node values for the window into `getMultiWordAlternatives` (minimal change to the sliding-window loop).
- **Pinned + live:** Spans remain live-query coordinates; effective query assembly matches Spec 154 / Spec 131.
- **Performance:** A linear scan over each tag list per multi-word window is acceptable: vocabularies are small, windows are bounded (max three bare nodes today), and output is capped at three keys per field.

## Tests

- **Unit (shared):** With `oracleTagLabels` containing `mana-rock`, slug from `mana` + `rock` yields `otag:mana-rock` (canonical casing). Slug from `mana` + `ro` yields the same (prefix match).
- **Ordering:** Exact slug match sorts before longer keys; among non-exact prefix matches, shorter key before longer, then lexicographic.
- **Cap:** If four or more keys match the prefix rule, at most **three** `otag:` alternatives are returned.
- **Dedup:** If `oracleTagLabels` contains two entries differing only by case (same `toLowerCase()`), at most one `otag:` alternative is emitted for that logical tag toward the cap.
- **Negative:** Slug with no matching keys → no otag alts. Atag mirror where illustration labels present.
- **Trim:** Leading/trailing space on a bare token is trimmed before slug build; trimmed-empty segment rejects the window (no alternatives from slug pass for that window).
- **Regression:** Existing multi-word keyword and artist cases unchanged.

## Acceptance criteria

1. Query `mana rock` with zero combined results, and `mana-rock` present in oracle tag labels, yields at least one **`bare-term-upgrade`** suggestion whose rewrite is **`otag:mana-rock`** (or the canonical key if storage differs in casing only).
2. Query `mana ro` under the same conditions yields **`otag:mana-rock`** (prefix completion).
3. Tapping a chip applies the same rewrite path as other bare-term upgrades (Spec 151).
4. When oracle tag data is missing, no `otag:` suggestion is produced for hyphen windows; illustration tag data gated similarly for `atag:`.
5. At most three `otag:` suggestions and at most three `atag:` suggestions per multi-word window from tag prefix logic.
6. Spec 154 is updated to reference this spec for otag/atag multi-word behavior; Spec 151 needs **no** new `id` or priority row (optional short cross-link under bare-term-upgrade notes).

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

*(None yet — append when implementing.)*
