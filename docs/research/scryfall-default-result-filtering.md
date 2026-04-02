# Research: Scryfall default result filtering

**Status:** In progress (living document)  
**Tracking:** [GitHub #227](https://github.com/jimbojw/frantic-search/issues/227)  
**Related:** [Spec 178](../specs/178-default-search-inclusion-filter.md) (draft default inclusion filter; supersedes Spec 057), [Spec 057](../specs/057-include-extras-default-playable-filter.md) (historical playable filter), [Spec 170](../specs/170-is-content-warning.md) (`is:content_warning`), [ADR-019](../adr/019-scryfall-parity-by-default.md) (Scryfall parity)

## Purpose

Scryfall’s default search behavior is only partly documented. Frantic previously modeled “playable by default” in Spec 057; [Spec 178](../specs/178-default-search-inclusion-filter.md) (draft) replaces that with a layout / playtest / set / content-warning inclusion model. **API probing shows Scryfall’s rules are not reducible to a single legality bitmask** and likely depend on **query shape** and flags.

This file records **incremental progress**: confirmed observations, falsified hypotheses, open questions, and a **repeatable test matrix**. It is intentionally incomplete until the spike’s acceptance criteria are met (or we explicitly close the track with documented divergences).

**Spike acceptance (from #227):** Known rules, falsified hypotheses, unknowns, and a repeatable test grid—not necessarily a perfect clone of Scryfall’s server logic.

## How to extend this document

1. Run a **minimal** experiment (change one variable: query text, `include:extras`, `unique:`, etc.).
2. Record **reproducible** evidence: full `q=` string, `unique` mode, date checked, total count, and whether named anchor cards appear. Prefer stable API URLs:

   `https://api.scryfall.com/cards/search?q=<url-encoded-query>`

3. Add a row to the **Test matrix** (or update cells) and summarize the implication under **Confirmed**, **Falsified hypotheses**, or **Open questions**.
4. When something is **stable** and actionable, **graduate** it: update `docs/guides/scryfall-comparison.md`, Spec 178 (or product behavior), or ADR-019 as appropriate—then link back here from the guide instead of duplicating long prose.

## Confirmed (empirical)

_Steady observations with reproduction. Keep entries short; link or cite queries._

- **`set:`-only queries show the full set.** `set:arn` lists Arabian Nights printings including those with **content warnings**. `set:unk` lists Unknown Event printings even though those cards are **not playable** in any format on bulk legalities—so default “extras”-style hiding does **not** apply the same way as for a bare mechanical search.
- **`set:` inside a larger query still pulls full set slices.** Example: `e (set:unk OR set:arn)` returns cards with `e` in the name from UNK **or** ARN, including content-warning **Stone-Throwing Devils** (ARN), without `include:extras`. So a positive `set:` disjunct is enough to **include** cards that would be suppressed under other default query shapes (see #227, Pradesh Gypsies).
- **Astral (`set:past`) vs generic mechanical queries:** `goblin mv=2 pow=1 tou=1 ci=r` does **not** surface **Goblin Polka Band** (Astral, `set:past`) on default Scryfall—so **PAST** can stay hidden in set-agnostic searches even when name + stats + CI match, unlike **UNK** / **ARN** when pulled in via `set:`. _(Re-verify with `include:extras` and with `set:past` alone; see matrix.)_
- **Bare `goblin` vs `goblin include:extras`:** Default **249** hits, with extras **283** (**+34**); extras is a **strict superset** (diff by `oracle_id`). Of the **34** extras-only objects, **30** are `token`, `double_faced_token`, `art_series`, or `vanguard`; **4** are layout **`normal`**—each explained by the [working model](#working-model-scryfall-default-search-hypothesis-v03) below (**`past`**, **`promo_types: playtest`** ×2, **`hho`**), not by a global “omit funny” rule. Detail in [case study](#case-study-goblin-vs-goblin-includeextras-api-2026-04-02).
- **Bare `amulet` and ante:** Default search **`amulet`** returns **Amulet of Quoz** (`set:ice`, ante-related oracle) without `include:extras`. In Scryfall bulk **every format is `banned` or `not_legal`**—there is **no** `legal` or `restricted` entry—so this oracle would be **dropped by Frantic’s superseded Spec 057** playable filter (legal \| restricted in ≥1 format). Spec 178 is intended to fix this class of gap. Another gap between “legality bitmask only” stories and Scryfall’s default name search.
- **Happy Holidays (`hho`) wholesale omission:** **`gifts`** (default search) returns **3** results and **does not** include **Gifts Given** (`set:hho`, `promo_types: datestamped + event`). **`set:hho`** alone returns **21** cards including **Gifts Given** (API, 2026-04-03)—same **`set:`** bypass class as ARN/UNK. **Goblin Sleigh Ride** is also **`set:hho`** (not `playtest`).
- **Gold-bordered printings hidden by default filter, not format.** `!"Static Orb" unique:prints` returns **5** results (no gold-bordered WC01 printing). `!"Static Orb" unique:prints include:extras` returns **6** (WC01 gold-bordered printing recovers). `!"Static Orb" unique:prints set:wc01` returns **1** (set widening recovers it). This confirms gold-bordered hiding is a default-filter pass, not format evaluation—Scryfall's `f:` / `legal:` is oracle-level.
- **Oversized printings hidden by default filter.** `!"All Hallow's Eve" unique:prints` excludes the oversized OLEP printing. `!"All Hallow's Eve" unique:prints include:extras` recovers it. `!"All Hallow's Eve" unique:prints set:olep` returns **1** (set widening recovers it). Same pattern as gold-bordered: default-filter pass with `include:extras` / `set:` widening.
- **Query shape (regex / quotes) changes inclusions:** **`name:/^gifts/`** returns **Gifts Given** while bare **`gifts`** does not; **`name:/^stone/`** includes **Stone-Throwing Devils** and **Stone Drake** (`playtest`) while **`ston de`** and **`name:"stone d"`** do not. Detail and a **fallthrough** hypothesis in [Query shape, regex, and fallthrough](#query-shape-regex-and-empty-result-fallthrough).

## Working model: Scryfall default search (hypothesis v0.3)

**Scope:** Empirical model of **Scryfall’s** default result shaping. **Frantic:** Spec 178 (draft) supersedes Spec 057’s default filter in documentation; **code** may still implement Spec 057 until Spec 178 ships—see ADR-019 for parity vs divergence.

Scryfall’s default inclusion is **not** “legal or restricted somewhere.” A workable **hypothesis** that fits **known** observations (goblin diff, `past`/`hho`, playtest, content-warning stories, `set:` bypass, Amulet of Quoz, Hurloon):

1. **Layout / object kind:** Omit **`token`**, **`double_faced_token`**, **`art_series`**, **`vanguard`**, and analogous “extras” layouts unless widened (matches **`include:extras`** documentation and the bulk of the **`goblin`** delta).
2. **`promo_types`:** Omit printings that include **`playtest`** in default, set-agnostic search. **Bypass:** **`is:playtest`**, **`include:extras`**, and likely positive **`set:`** when the printing’s set is named. **Verified (API, 2026-04-03):** **Goblin Savant** (`unk`) has `promo_types: ["playtest"]`; **Lazier Goblin** (`cmb2`) has `promo_types: ["playtest"]`. Playtest is **not** a `layout` or `frame` value on Scryfall—it lives on **`promo_types`** (see Spec 046 / 047 in-repo).
3. **Content-warning pass:** On **some** query shapes (e.g. purely mechanical defaults), suppress certain content-warning oracles. **Bypass:** **`is:content_warning`**, and **positive `set:`** for the printing’s set (e.g. Stone-Throwing Devils under **`set:arn`** / `e (set:unk OR set:arn)`).
4. **Wholesale omitted set codes:** Omit **all** printings from selected **`set`** codes in default search when the query does **not** name that set. **Confirmed codes:** **`past`** (Astral—e.g. **Goblin Polka Band** missing from bare **`goblin`** and from **`goblin mv=2…`** default), **`hho`** (Happy Holidays—**Goblin Sleigh Ride**, **Gifts Given** / **`gifts`** probe). **Open:** additional codes (discover by “card exists + generic query omits it” + **`set:<code>`** restores).
5. **Explicit wideners (non-exhaustive):** **`include:extras`** (full widening), **positive `set:`** on the relevant code, **`is:playtest`**, **`is:content_warning`**, and other targeted **`is:`** terms as discovered.

**Limit (v0.3):** The list above does **not** yet encode **query grammar** (substring vs quoted vs **regex** on a field) or any **result-count / empty-set** behavior. Those effects are tracked in [Query shape, regex, and fallthrough](#query-shape-regex-and-empty-result-fallthrough) below.

**Hurloon Wrangler** still fits: **`unh`** is not in the **known** wholesale list, that printing is not **`playtest`** in the API sense we checked for Savant/Lazier, and **`layout`** is **`normal`**—so it remains in default **`hurloon`** without contradicting steps 1–4.

## Query shape, regex, and empty-result fallthrough

**Motivation:** The [working model](#working-model-scryfall-default-search-hypothesis-v03) is largely **card-centric** (layout, promo, set code). The **same** card can be **in** or **out** depending on **how** the query is written—especially **regex** on field values—and some pairs of queries defy “tighter substring ⇒ fewer hits” intuition.

### Reproduced via `/cards/search` (2026-04-04)

| Query | Approx. hits | Notable inclusions / exclusions |
|-------|-------------|--------------------------------|
| `ston de` | 20 | **Stone-Throwing Devils** absent (content-warning ARN oracle). |
| `name:/^stone/` | 54 | **Stone-Throwing Devils** present; **Stone Drake** (`playtest`) present—both often dropped under v0.3-style defaults for bare name search. |
| `name:"stone d"` | 3 | **Stone Drake** absent; **Stone-Throwing Devils** absent. (Hits: *Brimstone Dragon*, *Sandstone Deadfall*, *Sisters of Stone Death*.) |
| `name:/^gifts/` | 2 | **Gifts Ungiven** and **Gifts Given** (`hho`). Regex name query surfaces **`hho`** card that bare **`gifts`** omits (see Confirmed). |
| `t:ok` | 10 | Same 10 for `t:/ok/`: mostly **Ashiok** / **Oko** planeswalkers (type line contains `ok`). |
| `is:token t:oke` | 775 | Same total for `is:token t:/oke/` (first page identical). |

### `t:ok` vs token type fragment (API nuance)

Bare **`t:oke`** alone returns **no** hits (404) on the API. The **775**-hit “all tokens” behavior matches **`is:token t:oke`** / **`is:token t:/oke/`**, not bare **`t:oke`**. So **`t:ok`** (10 hits, non-token emphasis) vs **`is:token t:oke`** (775 tokens) is **not** purely “`ok` is looser than `oke`” on the same domain—**`is:token`** changes which objects are candidates.

That said, the broader point stands: **query surface form** (regex, quotes, `is:token`, …) shifts **which** default omissions appear to apply, beyond the static v0.3 checklist.

### Reported but not reproduced here

- **`o:/random target creatures/`** — Maintainer-observed **2** hits (**Goblin Polka Band**, **Orcish Catapult**, both **`past`**). A quick **`GET /cards/search`** with that exact `q` returned **404** (2026-04-04)—oracle text on **Goblin Polka Band** uses the phrase *random target creatures*. Re-verify escaping, website vs API, or Scryfall-side drift.

### Hypothesis: empty-set / low-cardinality fallthrough

**Idea:** When evaluation under the **strict default pool** would yield **no** (or very few?) results, Scryfall **sometimes** expands into objects that would normally be excluded (extras, wholesale-omit sets, playtest, …)—so **query shape** and **match cardinality** interact.

**Status:** Speculative. The **`name:/^gifts/`** vs **`gifts`** pattern is consistent with “widen when you’d otherwise miss obvious name hits,” but we do **not** have a controlled proof (threshold, which fields trigger it, interaction with regex). **Falsify** with a pair of queries that differ only in regex vs non-regex yet share the same **non-empty** strict pool and still flip inclusion of a known excluded card.

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

| Name | `set` | `promo_types` (API) | Explained by (v0.3 model) |
|------|-------|---------------------|---------------------------|
| Goblin Polka Band | `past` | _(none on sample)_ | Wholesale omit **`past`** |
| Goblin Savant | `unk` | `playtest` | Omit **`playtest`** |
| Goblin Sleigh Ride | `hho` | `datestamped`, `event` | Wholesale omit **`hho`** (not playtest) |
| Lazier Goblin | `cmb2` | `playtest` | Omit **`playtest`** |

### Interpretation

- The bulk of **+34** matches documented **extras** layouts (tokens, art_series, vanguard).
- The **four** `normal` oracles are fully explained by **`past`**, **`hho`**, and **`promo_types: playtest`**—no separate global “omit **`set_type: funny`**” rule is required for this slice. **`hurloon`** (Unglued) remains compatible: **`unh`** is not in the **known** wholesale-omit set list, and the anchor printing is not **`playtest`** in the API sense used above.

## Falsified hypotheses

_Simple models we can rule out with counterexamples._

| Hypothesis | Counterexample / reason |
|------------|-------------------------|
| Default Scryfall = only cards legal or restricted somewhere in bulk `legalities` | **Hurloon Wrangler** (Unglued, all formats `not_legal`) appears for `hurloon` without `include:extras`. |
| Default Scryfall name search hides oracles that are never `legal`/`restricted` (only `banned`/`not_legal`) | **Amulet of Quoz** appears for bare **`amulet`**; bulk `legalities` are exclusively **`banned`** or **`not_legal`** in every format (API check, 2026-04-03). |
| All `is:funny` cards are omitted from default search unless `include:extras` or the query explicitly targets them | `hurloon`, `e:unh t:creature` return funny-set cards without `include:extras`. |
| `include:extras` widening is only user-supplied | Content-warning style suppression on some default queries behaves like an internal “extras” pass when comparing with/without `include:extras`. |

## Open questions

_Systematic follow-ups from #227._

1. **Decision tree:** Which query AST shapes trigger which suppressions (bare words vs `o:` / `m:` / `pow:` / `date:` / `f:` / `e:` / `name:` / `is:`, combinations, `OR`, negation, **regex** vs quoted vs fuzzy)? **Partial:** positive **`set:`** widens; **regex** on **`name:`** can surface cards hidden for equivalent-ish bare strings—see [Query shape](#query-shape-regex-and-empty-result-fallthrough).
2. **Categories:** How do funny / `set_type: funny` / silver border / acorn / `is:content_warning` interact with each pass? **Partial:** for the **`goblin`** extras-only `normal` rows, **`set_type: funny`** on UNK is **not** the primary lever—**`playtest`** and wholesale **`hho`** / **`past`** carry the weight. Global funny behavior is still **query-dependent** (`hurloon` vs narrow mechanical queries).
3. **API vs website:** Same `q=` and default UI toggles—parity?
4. **Ranking vs hard filter:** e.g. `name:"Black Lotus"` vs funny “Black Lotus Lounge”—ordering vs exclusion?
5. **Format weighting:** Minor formats (Predh, Old School, Premodern) vs Frantic’s all-format bitmask in practice on Scryfall.
6. **`unique:`** and printing-level queries vs oracle-unique defaults.
7. **Wholesale omitted sets (`past`, `hho`, …):** What is the **full** set-code list? Same treatment for digital-only vs paper? **Partial:** **`set:past`** and **`set:hho`** behave like “omit entire set from default unless named.” **`set:hho`** returns 21 cards including **Gifts Given**; **`gifts`** omits **Gifts Given** (2026-04-03). Still verify **`goblin mv=2 pow=1 tou=1 ci=r` include:extras** for Polka Band.
8. **Ante / `banned`-only oracles:** Are other ante cards always visible on bare-word search like **Amulet of Quoz**, or is this name-fragment / set-specific? Interaction with `game:paper` and Commander banlist philosophy on Scryfall’s side vs Frantic’s default filter (Spec 178).
9. **Empty-result / low-count fallthrough:** Does Scryfall **expand** into normally excluded objects when the strict pool is empty (or small)? If so, what threshold and which fields? See [fallthrough hypothesis](#query-shape-regex-and-empty-result-fallthrough).

## Test matrix

_Add rows as you run checks. `In default` / `With extras` = whether the anchor appears in Scryfall’s result set for that query variant._

| Query | `unique` | `include:extras` | Anchor card(s) | In default? | With extras? | Checked (UTC) | Notes |
|-------|----------|------------------|----------------|-------------|--------------|---------------|-------|
| `m=2g pow=1 tou=1 date<1997` | `cards` | no | Pradesh Gypsies | no (7 hits, not in list) | _(re-verify)_ | | Content warning; legal in some casual formats in bulk |
| `is:content_warning` | `cards` | no | Pradesh Gypsies | yes | — | | Bypass when query targets `is:content_warning`? |
| `hurloon` | `cards` | no | Hurloon Wrangler | yes | — | | Unglued; all `not_legal` |
| `amulet` | `cards` | no | Amulet of Quoz (`ice`) | yes | — | 2026-04-03 | Ante; every format `banned` or `not_legal` in bulk—never `legal`/`restricted` |
| `name:"Black Lotus"` | `cards` | no | Black Lotus vs Black Lotus Lounge | real Lotus; not Lounge without narrowing | | | Funny name collision |
| `is:funny name:"Black Lotus"` | `cards` | no | Black Lotus Lounge | _(fill in)_ | | | |
| `e:unh t:creature` | `cards` | no | _(Unhinged creatures)_ | yes | — | | |
| `(legal:oldschool OR legal:premodern) -restricted:vintage -legal:vintage` | `cards` | no | _(slice from prior discussion)_ | _(fill in)_ | | | 11-card slice |
| `set:arn` | `cards` | no | Stone-Throwing Devils, other ARN with content warning | yes | — | 2026-04-01 | Full set visible; not reduced to “playable” subset |
| `set:unk` | `cards` | no | Unknown Event printings | yes | — | 2026-04-01 | `set_type`/playtest-style set; still shown without `include:extras` |
| `e (set:unk OR set:arn)` | `cards` | no | Stone-Throwing Devils | yes | — | 2026-04-01 | Bare word + `OR` of sets; content-warning ARN card included |
| `goblin mv=2 pow=1 tou=1 ci=r` | `cards` | no | Goblin Polka Band (`past`) | no | _(verify)_ | 2026-04-02 | Astral; absent from default results |
| `goblin` | `cards` | no | Goblin Polka Band | no | yes | 2026-04-02 | 249 vs 283 with extras; [case study](#case-study-goblin-vs-goblin-includeextras-api-2026-04-02) |
| `goblin` | `cards` | no | Lazier Goblin (`cmb2`) | no | yes | 2026-04-02 | `promo_types: playtest`; see [model](#working-model-scryfall-default-search-hypothesis-v03) |
| `goblin` | `cards` | no | Goblin Savant (`unk`) | no | yes | 2026-04-03 | `promo_types: playtest` |
| `goblin` | `cards` | no | Goblin Sleigh Ride (`hho`) | no | yes | 2026-04-03 | Wholesale omit **`hho`**; not playtest |
| `gifts` | `cards` | no | Gifts Given (`hho`) | no | — | 2026-04-03 | 3 hits; Gifts Given absent—supports **`hho`** list |
| `set:hho` | `cards` | no | Gifts Given | yes | — | 2026-04-03 | 21 hits; **`set:`** restores wholesale-omitted set |
| `set:past` | `cards` | no | Goblin Polka Band | _(verify)_ | — | | Expected: full Astral slice when set named |
| `goblin mv=2 pow=1 tou=1 ci=r` | `cards` | yes | Goblin Polka Band | _(verify)_ | | | Confirms extras gate for mechanical + name shape |
| `ston de` | `cards` | no | Stone-Throwing Devils | no | — | 2026-04-04 | 20 hits; [query shape](#query-shape-regex-and-empty-result-fallthrough) |
| `name:/^stone/` | `cards` | no | Stone-Throwing Devils | yes | — | 2026-04-04 | 54 hits; also **Stone Drake** (`playtest`) |
| `name:/^stone/` | `cards` | no | Stone Drake | yes | — | 2026-04-04 | Playtest oracle in regex name results |
| `name:"stone d"` | `cards` | no | Stone Drake | no | — | 2026-04-04 | 3 hits; quoted exact-ish name |
| `name:/^gifts/` | `cards` | no | Gifts Given (`hho`) | yes | — | 2026-04-04 | 2 hits vs bare **`gifts`** omits it |
| `t:ok` | `cards` | no | _(Ashiok / Oko)_ | yes (10) | — | 2026-04-04 | Same 10 for `t:/ok/` |
| `is:token t:oke` | `cards` | no | Token type `oke` fragment | yes | — | 2026-04-04 | **775** hits; bare **`t:oke`** alone = API 404—use **`is:token`** for this shape |
| `o:/random target creatures/` | `cards` | no | Goblin Polka Band | _(reported yes)_ | — | | API 404 (2026-04-04)—re-verify |
| `!"Static Orb" unique:prints` | `prints` | no | WC01 gold-bordered | no (5 hits) | yes (6 hits) | 2026-04-02 | Gold-bordered hidden by default filter |
| `!"Static Orb" unique:prints set:wc01` | `prints` | no | WC01 gold-bordered | yes (1 hit) | — | 2026-04-02 | Set widening recovers gold-bordered |
| `!"All Hallow's Eve" unique:prints` | `prints` | no | OLEP oversized | no | yes | 2026-04-02 | Oversized hidden by default filter |
| `!"All Hallow's Eve" unique:prints set:olep` | `prints` | no | OLEP oversized | yes (1 hit) | — | 2026-04-02 | Set widening recovers oversized |

## Hypotheses under test

_Short-lived theories; move to Confirmed or Falsified when you have evidence._

- **Content-warning suppression:** On some generic/mechanical default searches, Scryfall may suppress content-warning oracles, with a **bypass** when the query explicitly includes `is:content_warning`. _(Hypothesis—not proven.)_
- **`set:` bypass / widening:** If the query contains a **positive** `set:` constraint (possibly any expansion that names a set code), Scryfall may **include all matching printings from that set**, ignoring default filters that would hide the same card in a set-agnostic query. **Evidence:** `set:arn`, `set:unk`, `e (set:unk OR set:arn)` (2026-04-01), **`set:hho`** + **Gifts Given** (2026-04-03). **Unknown:** negated `set:`, multiple sets with AND, `s:` alias parity, printing-only modes.
- **Default pipeline (v0.3):** Layout extras + **`promo_types: playtest`** + content-warning pass + **wholesale set list** `{ past, hho, … }` + explicit wideners—see [Working model](#working-model-scryfall-default-search-hypothesis-v03). **Falsify if:** a counterexample card slips through or is blocked in a way the model cannot express without new rules.
- **Empty-result fallthrough:** If the strict default candidate set is **empty** or **below a threshold**, Scryfall may **merge in** normally excluded printings. **Consistent with** `name:/^gifts/` surfacing **Gifts Given** while **`gifts`** does not, but **not proven**—could instead be “regex name queries skip omission pass.” See [section](#query-shape-regex-and-empty-result-fallthrough).

## Links

- Frantic comparison workflow: [`docs/guides/scryfall-comparison.md`](../guides/scryfall-comparison.md)
- CLI: `npm run cli -- diff "<query>"` (Frantic vs Scryfall for a given query; does not replace Scryfall-only characterization above)
