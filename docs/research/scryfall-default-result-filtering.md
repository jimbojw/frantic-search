# Research: Scryfall default result filtering

**Status:** In progress (living document)  
**Tracking:** [GitHub #227](https://github.com/jimbojw/frantic-search/issues/227)  
**Related:** [Spec 057](../specs/057-include-extras-default-playable-filter.md) (Frantic default playable filter), [Spec 170](../specs/170-is-content-warning.md) (`is:content_warning`), [ADR-019](../adr/019-scryfall-parity-by-default.md) (Scryfall parity)

## Purpose

Scryfall’s default search behavior is only partly documented. Frantic models “playable by default” in Spec 057; we assumed alignment with Scryfall, but **API probing shows Scryfall’s rules are not reducible to a single legality bitmask** and likely depend on **query shape** and flags.

This file records **incremental progress**: confirmed observations, falsified hypotheses, open questions, and a **repeatable test matrix**. It is intentionally incomplete until the spike’s acceptance criteria are met (or we explicitly close the track with documented divergences).

**Spike acceptance (from #227):** Known rules, falsified hypotheses, unknowns, and a repeatable test grid—not necessarily a perfect clone of Scryfall’s server logic.

## How to extend this document

1. Run a **minimal** experiment (change one variable: query text, `include:extras`, `unique:`, etc.).
2. Record **reproducible** evidence: full `q=` string, `unique` mode, date checked, total count, and whether named anchor cards appear. Prefer stable API URLs:

   `https://api.scryfall.com/cards/search?q=<url-encoded-query>`

3. Add a row to the **Test matrix** (or update cells) and summarize the implication under **Confirmed**, **Falsified hypotheses**, or **Open questions**.
4. When something is **stable** and actionable, **graduate** it: update `docs/guides/scryfall-comparison.md`, Spec 057 / product behavior, or ADR-019 as appropriate—then link back here from the guide instead of duplicating long prose.

## Confirmed (empirical)

_Steady observations with reproduction. Keep entries short; link or cite queries._

- **`set:`-only queries show the full set.** `set:arn` lists Arabian Nights printings including those with **content warnings**. `set:unk` lists Unknown Event printings even though those cards are **not playable** in any format on bulk legalities—so default “extras”-style hiding does **not** apply the same way as for a bare mechanical search.
- **`set:` inside a larger query still pulls full set slices.** Example: `e (set:unk OR set:arn)` returns cards with `e` in the name from UNK **or** ARN, including content-warning **Stone-Throwing Devils** (ARN), without `include:extras`. So a positive `set:` disjunct is enough to **include** cards that would be suppressed under other default query shapes (see #227, Pradesh Gypsies).
- **Astral (`set:past`) vs generic mechanical queries:** `goblin mv=2 pow=1 tou=1 ci=r` does **not** surface **Goblin Polka Band** (Astral, `set:past`) on default Scryfall—so **PAST** can stay hidden in set-agnostic searches even when name + stats + CI match, unlike **UNK** / **ARN** when pulled in via `set:`. _(Re-verify with `include:extras` and with `set:past` alone; see matrix.)_
- **Bare `goblin` vs `goblin include:extras`:** Default **249** hits, with extras **283** (**+34**); extras is a **strict superset** (diff by `oracle_id`). Of the **34** extras-only objects, **30** are `token`, `double_faced_token`, `art_series`, or `vanguard`; **4** are layout **`normal`**: **Goblin Polka Band** (`past`, digital), **Goblin Savant** (`unk`, `set_type: funny`), **Goblin Sleigh Ride** (`hho`, funny), **Lazier Goblin** (`cmb2`, funny). Detail in [case study](#case-study-goblin-vs-goblin-includeextras-api-2026-04-02) below.

## Case study: goblin vs goblin include:extras (API, 2026-04-02)

Fetched with `GET https://api.scryfall.com/cards/search?q=…`, default parameters, pagination, ~100ms between pages.

| Query | Total results |
|-------|----------------:|
| `goblin` | 249 |
| `goblin include:extras` | 283 |

**Diff:** 34 objects appear only with `include:extras`; **0** appear only in the default query. Comparison used `oracle_id` with fallback to `id`.

### Extras-only breakdown by `layout`

| `layout` | Count |
|----------|------:|
| `token` | 14 |
| `double_faced_token` | 4 |
| `art_series` | 10 |
| `normal` | 4 |
| `vanguard` | 2 |

### The four `layout: normal` oracles

All other extras-only rows are tokens, art-series cards, or vanguard avatars.

| Name | `set` | `set_type` | Notes |
|------|-------|------------|--------|
| Goblin Polka Band | `past` | `box` | Digital; Astral |
| Goblin Savant | `unk` | `funny` | Unknown Event |
| Goblin Sleigh Ride | `hho` | `funny` | Holiday / funny product |
| Lazier Goblin | `cmb2` | `funny` | Unfinity commander–adjacent |

### Interpretation

- The bulk of **+34** matches expectations for **extras**: named Goblin **tokens**, **art_series** / memorabilia entries, and **vanguard** avatars.
- The **oracle-level** signal is small but clear: **one Astral (`past`)** card plus **three funny-set** cards are excluded from bare **`goblin`** without extras. That differs from **`hurloon`**, where an Unglued card can appear without extras—more evidence that **funny** (and extras) behavior is **query-shape dependent**, not a single global rule.

## Falsified hypotheses

_Simple models we can rule out with counterexamples._

| Hypothesis | Counterexample / reason |
|------------|-------------------------|
| Default Scryfall = only cards legal or restricted somewhere in bulk `legalities` | **Hurloon Wrangler** (Unglued, all formats `not_legal`) appears for `hurloon` without `include:extras`. |
| All `is:funny` cards are omitted from default search unless `include:extras` or the query explicitly targets them | `hurloon`, `e:unh t:creature` return funny-set cards without `include:extras`. |
| `include:extras` widening is only user-supplied | Content-warning style suppression on some default queries behaves like an internal “extras” pass when comparing with/without `include:extras`. |

## Open questions

_Systematic follow-ups from #227._

1. **Decision tree:** Which query AST shapes trigger which suppressions (bare words vs `o:` / `m:` / `pow:` / `date:` / `f:` / `e:` / `name:` / `is:`, combinations, `OR`, negation)? **Partial answer:** positive **`set:`** (including under `OR`) appears to **disable** (or bypass) at least some default exclusions for printings in those sets—contrast with purely mechanical queries like `m=2g pow=1 tou=1 date<1997` that hide some content-warning cards.
2. **Categories:** How do funny / `set_type: funny` / silver border / acorn / `is:content_warning` interact with each pass?
3. **API vs website:** Same `q=` and default UI toggles—parity?
4. **Ranking vs hard filter:** e.g. `name:"Black Lotus"` vs funny “Black Lotus Lounge”—ordering vs exclusion?
5. **Format weighting:** Minor formats (Predh, Old School, Premodern) vs Frantic’s all-format bitmask in practice on Scryfall.
6. **`unique:`** and printing-level queries vs oracle-unique defaults.
7. **Astral / `PAST`:** Is exclusion tied to `include:extras`, digital-only product type, or something else? Does **`set:past`** alone show the full Astral list (analogous to `set:unk`)? **Partial (2026-04-02):** **Goblin Polka Band** appears in **`goblin include:extras`** but not default **`goblin`** (case study below). Still verify **`set:past`** alone and **`goblin mv=2 pow=1 tou=1 ci=r` include:extras**.

## Test matrix

_Add rows as you run checks. `In default` / `With extras` = whether the anchor appears in Scryfall’s result set for that query variant._

| Query | `unique` | `include:extras` | Anchor card(s) | In default? | With extras? | Checked (UTC) | Notes |
|-------|----------|------------------|----------------|-------------|--------------|---------------|-------|
| `m=2g pow=1 tou=1 date<1997` | `cards` | no | Pradesh Gypsies | no (7 hits, not in list) | _(re-verify)_ | | Content warning; legal in some casual formats in bulk |
| `is:content_warning` | `cards` | no | Pradesh Gypsies | yes | — | | Bypass when query targets `is:content_warning`? |
| `hurloon` | `cards` | no | Hurloon Wrangler | yes | — | | Unglued; all `not_legal` |
| `name:"Black Lotus"` | `cards` | no | Black Lotus vs Black Lotus Lounge | real Lotus; not Lounge without narrowing | | | Funny name collision |
| `is:funny name:"Black Lotus"` | `cards` | no | Black Lotus Lounge | _(fill in)_ | | | |
| `e:unh t:creature` | `cards` | no | _(Unhinged creatures)_ | yes | — | | |
| `(legal:oldschool OR legal:premodern) -restricted:vintage -legal:vintage` | `cards` | no | _(slice from prior discussion)_ | _(fill in)_ | | | 11-card slice |
| `set:arn` | `cards` | no | Stone-Throwing Devils, other ARN with content warning | yes | — | 2026-04-01 | Full set visible; not reduced to “playable” subset |
| `set:unk` | `cards` | no | Unknown Event printings | yes | — | 2026-04-01 | `set_type`/playtest-style set; still shown without `include:extras` |
| `e (set:unk OR set:arn)` | `cards` | no | Stone-Throwing Devils | yes | — | 2026-04-01 | Bare word + `OR` of sets; content-warning ARN card included |
| `goblin mv=2 pow=1 tou=1 ci=r` | `cards` | no | Goblin Polka Band (`past`) | no | _(verify)_ | 2026-04-02 | Astral; absent from default results |
| `goblin` | `cards` | no | Goblin Polka Band | no | yes | 2026-04-02 | 249 vs 283 with extras; [case study](#case-study-goblin-vs-goblin-includeextras-api-2026-04-02) |
| `goblin` | `cards` | no | Lazier Goblin (`cmb2`) | no | yes | 2026-04-02 | Funny oracle; extras-only vs bare `goblin` |
| `set:past` | `cards` | no | Goblin Polka Band | _(verify)_ | — | | Expected: full set if `set:` bypass generalizes to PAST |
| `goblin mv=2 pow=1 tou=1 ci=r` | `cards` | yes | Goblin Polka Band | _(verify)_ | | | Confirms extras gate for mechanical + name shape |

## Hypotheses under test

_Short-lived theories; move to Confirmed or Falsified when you have evidence._

- **Content-warning suppression:** On some generic/mechanical default searches, Scryfall may suppress content-warning oracles, with a **bypass** when the query explicitly includes `is:content_warning`. _(Hypothesis—not proven.)_
- **`set:` bypass / widening:** If the query contains a **positive** `set:` constraint (possibly any expansion that names a set code), Scryfall may **include all matching printings from that set**, ignoring default filters that would hide the same card in a set-agnostic query. **Evidence:** `set:arn`, `set:unk`, and `e (set:unk OR set:arn)` (2026-04-01). **Unknown:** negated `set:`, multiple sets with AND, `s:` alias parity, printing-only modes.
- **Astral / digital product bucket:** Astral (`set:past`) may be treated as **extras-only** (or similar) in default search for **generic** queries, stronger than Unknown Event / Arabian Nights in the same shape. **Evidence:** Goblin Polka Band missing from `goblin mv=2 pow=1 tou=1 ci=r` (2026-04-02); present in **`goblin include:extras`** but not default **`goblin`** (2026-04-02 case study). **Falsify if:** `set:past` alone does not list those cards, or they appear without `include:extras` under a narrower query than recorded.

## Links

- Frantic comparison workflow: [`docs/guides/scryfall-comparison.md`](../guides/scryfall-comparison.md)
- CLI: `npm run cli -- diff "<query>"` (Frantic vs Scryfall for a given query; does not replace Scryfall-only characterization above)
