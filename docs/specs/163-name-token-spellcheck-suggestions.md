# Spec 163: Name-token spellcheck suggestions (zero results)

**Status:** Implemented

**Unified by:** Spec 151 (Suggestion System)

**Depends on:** Spec 002 (Query Engine), Spec 018 (Combined Name Search), Spec 036 (Source Spans), Spec 131 (Oracle Did You Mean)

**Addresses:** [Issue #208](https://github.com/jimbojw/frantic-search/issues/208)

## Goal

When a search returns zero results, suggest a corrected query that fixes a **single** misspelled **bare** name token by matching against a vocabulary of words taken from card names, using Levenshtein distance with first-letter pre-filtering. Only suggest when the substituted query returns at least one card (verified in the worker).

## Motivation

Users often mistype a substring of a card name (e.g. `hearthfire` vs `heartfire`). Bare tokens search the name field (Spec 018). Oracle hints (Spec 131) address “meant oracle text,” not typos. A dedicated spellcheck suggestion closes that gap.

## Trigger conditions

All of the following must hold:

1. **Zero results** — Effective combined search has zero cards (`totalCards === 0`), same notion as Spec 131.
2. **Live query** — Non-empty live query (`hasLive`).
3. **Pinned guard** — Same as Spec 131: if a pinned query is present **and** `pinnedIndicesCount === 0`, skip (rewriting live cannot help).
4. **Eligible bare tokens** — At least one positive BARE node (`getBareNodes`, Spec 154 / oracle-hint) with a `span`, after per-token filters below.

## Token eligibility

- **Positive BARE only** — Negated bare terms are excluded (walk skips NOT), matching Spec 131.
- **No multi-word bare values** — If `value` contains whitespace (quoted phrase or multiple words in one BARE), skip that node (vocabulary is single-word; phrase-level typos are out of scope).
- **Operator clauses** — `key:value` terms are FIELD nodes, not BARE; never spellchecked.
- **Known words still considered** — A token may appear in `nameWords` (a word drawn from some card name) while the **combined** query still matches nothing — e.g. `hearthfire` and `hero` each occur on cards, but not together. **Do not** skip Levenshtein when the token is already in `nameWords`; nearby candidates are still evaluated and accepted only if `evaluateAlternative` returns &gt; 0 results.

## Candidate selection

For each eligible token:

1. **Bucket by first character** — Candidates are words in `nameWords` whose first Unicode code unit equals the token’s first code unit (after lowercasing both). Empty bucket → no candidate for that token.
2. **Levenshtein** — Compute edit distance between the token (lowercase) and each candidate. **Threshold:** distance ≤ 1 for any token length; distance ≤ 2 allowed only when token length ≥ 7 (per Issue #208).
3. **Reuse** — Use `levenshteinDistance` in `shared` with an appropriate `maxDistance` cap for performance.

Do **not** suggest a candidate equal to the token (`candidate === token`); that would be a no-op substitution.

## Single suggestion rule

- **One token corrected** — Among all (token, candidate) pairs satisfying the threshold, choose **one** pair: minimize distance; break ties by **higher** effective card count after `evaluateAlternative` (same playable-filter path as Spec 131 / `worker-alternative-eval.ts`); then lexicographic candidate string; then smaller `span.start`.
- **Substitution** — Replace **only** that token’s source span in the **live** query with the candidate (lowercase). Combine with pinned via `sealQuery` when applicable.
- **Verification** — If the effective query after substitution still has zero cards, **do not** emit the suggestion.

## Suggestion payload (Spec 151)

- `id: 'name-typo'`
- `variant: 'rewrite'`
- `query` — Full effective query to apply
- `label` — Corrected live query (or equivalent short chip text)
- `count` / `printingCount` — When evaluation returns &gt; 0, populated like other rewrites
- `explain` — e.g. did-you-mean style copy for the right column
- `priority: 17` — After bare-term-upgrade (16), before oracle (20)

## Interaction with other suggestions

- **Spec 131 (oracle)** — May appear alongside this suggestion; priority orders name correction before oracle.
- **Spec 154 (bare-term-upgrade)** — Independent; may both apply.

## Performance

Runs only when `totalCards === 0` and trigger conditions hold. Vocabulary is built once on `CardIndex` construction. First-letter buckets limit Levenshtein calls.

## Acceptance criteria

- [x] Zero-result query with a misspelled bare name token surfaces a rewrite when some single-token substitution yields &gt; 0 results after verification.
- [x] `key:value` tokens are never spellchecked (FIELD nodes, not BARE).
- [x] No suggestion when the corrected effective query still has zero results.
- [x] Non-zero-result searches unchanged (suggestion builder not applicable).
- [x] Tokens that are exact `nameWords` members are still considered when a single-token substitution can fix a zero-hit query (words valid in isolation but not together).
- [x] Multi-word bare values (whitespace in `value`) are skipped.
- [x] Pinned-only-zero guard matches Spec 131.
- [x] Dual-wield / worker protocol unchanged aside from new optional suggestion in `suggestions[]`.
