# Research: Scryfall `collector_number` string shapes

**Status:** Empirical snapshot (refresh when bulk data changes)  
**Related:** [Spec 059](../specs/059-sort-directives.md) (`sort:set` collector tie-break uses numeric `localeCompare`), [shared `ordering.ts`](../../shared/src/search/ordering.ts)

## Purpose

Characterize **observed** `collector_number` values in Scryfall’s **default-cards** bulk export so we can:

- Design a **fast, allocation-free** ordering key (e.g. strided `Uint32Array`, per-printing encoding at load time).
- Know how much of the corpus fits **structured parsers** vs **fallback** (`localeCompare` or global rank).

This is **not** a spec for product behavior: sorting parity with Scryfall still targets ECMAScript `String.prototype.localeCompare` with `{ numeric: true, sensitivity: "base" }` on the original strings until we prove an encoder matches that order.

## Data source and reproduction

**Input:** `data/raw/default-cards.json` (Scryfall bulk **Default Cards** JSON array).

**Counts below** were produced by streaming `collector_number` from every object and bucketing in **first-match order** (Node + `jq`). Re-run after a new download to refresh numbers.

```bash
jq -r '.[] | .collector_number // ""' data/raw/default-cards.json | wc -l
```

Example bucket script (same rule order as the tables in this doc):

```bash
jq -r '.[] | .collector_number // ""' data/raw/default-cards.json | node --input-type=module -e "
import readline from 'readline';
const order = [
  ['empty', (s) => s === ''],
  ['digits_only', (s) => /^\\d+\$/.test(s)],
  ['yyyy_dash_digits', (s) => /^\\d{4}-\\d+\$/.test(s)],
  ['ends_unicode_star', (s) => /★\$/.test(s)],
  ['digit_letter_digits', (s) => /^\\d+[A-Za-z]\\d+\$/.test(s)],
  ['digits_then_letters_suffix', (s) => /^\\d+[a-zA-Z]+\$/.test(s)],
  ['letters_then_digits_compact', (s) => /^[a-zA-Z]+\\d+\$/.test(s)],
  ['hyphen_middle', (s) => /^[^-]+-[^-]+\$/.test(s) && !/^\\d{4}-\\d+\$/.test(s)],
  ['starts_letter_rest', (s) => /^[a-zA-Z]/.test(s)],
];
function classify(s) {
  for (const [name, fn] of order) if (fn(s)) return name;
  return 'misc';
}
const counts = Object.fromEntries([...order.map(([k]) => k), 'misc'].map((k) => [k, 0]));
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) counts[classify(line)]++;
console.log(counts);
"
```

**Note:** Ascii `*` suffix and `/` in the string were checked in an earlier pass; both had **zero** printings in that bulk snapshot, so they are **not** separate buckets here.

## Snapshot: printing-row counts (first-match buckets)

| Bucket | Rule (ordered) | Printings | Unique strings |
|--------|------------------|-----------|----------------|
| `empty` | `""` | 0 | — |
| `digits_only` | `^\d+$` | 94,497 | 5,704 |
| `yyyy_dash_digits` | `^\d{4}-\d+$` | 141 | 101 |
| `ends_unicode_star` | `★$` (U+2605 BLACK STAR) | 1,968 | 508 |
| `digit_letter_digits` | `^\d+[A-Za-z]\d+$` (one ASCII letter between digit runs) | 26 | 26 |
| `digits_then_letters_suffix` | `^\d+[a-zA-Z]+$` | 7,719 | 1,533 |
| `letters_then_digits_compact` | `^[a-zA-Z]+\d+$` | 2,130 | 1,968 |
| `hyphen_middle` | single hyphen, not `yyyy_dash_digits` | 5,276 | 5,217 |
| `starts_letter_rest` | starts with ASCII letter, no earlier match | 787 | 780 |
| `misc` | remainder | 92 | 83 |

**Total printing rows in sample:** 112,636.

**Notes:**

- Counts are **per printing**, not per unique `collector_number` string.
- `digits_then_letters_suffix` uses **ASCII letters only**; strings with †, ★, Φ, etc. fall through to `misc` unless another rule matches.
- `ends_unicode_star` does **not** match values where ★ is followed by more characters (e.g. `130★s`); those appear under `misc`.
- `digit_letter_digits` is disjoint from `digits_then_letters_suffix` (suffix rule requires **no** digit after the letters).

### `digit_letter_digits`: complete unique set (26 strings)

All values in this bucket in the sampled bulk:

`1E05` `1E06` `1E07` `1E08` `1N03` `1N04` `1N05` `1N06` `1N07` `1N08` `1U06` `1U07` `1U08` `2E05` `2E06` `2E07` `2E08` `2N04` `2N05` `2N06` `2N07` `2N08` `2U06` `2U07` `2U08` `3N08`

## Dagger † (U+2020) and star ★ (U+2605): adjacent characters

For **every occurrence** of † or ★ in a `collector_number`, we tallied the single code unit **immediately before** and **after** (empty string if none). Counts are **occurrence-weighted** (a string with two daggers contributes two rows). In this snapshot there are **86** † occurrences and **1,973** ★ occurrences (some strings contain both or multiple symbols).

### † Dagger — characters before / after

| Before † | Occurrences | | After † | Occurrences |
|----------|------------:|---|---------|------------:|
| `0`–`9` | 85 (sum of per-digit counts) | | *(end of string)* | 79 |
| `s` | 1 | | `a` | 2 |
| | | | `b` | 1 |
| | | | `c` | 1 |
| | | | `d` | 1 |
| | | | `e` | 1 |
| | | | `s` | 1 |

- **Distinct “before” characters:** 11 (digits `0`–`9` plus `s` from e.g. `265s†`).
- **Distinct “after” characters:** 7 — mostly **end of string** (79); among **continuation** characters, only **ASCII letters** appear: **`a` `b` `c` `d` `e` `s`** (six letters, seven letter-occurrence rows including two `a`).

So “flag” letters **immediately after †** are exactly **6** distinct letters: **a, b, c, d, e, s** (no other Unicode letters in this snapshot).

### ★ Star — characters before / after

| Before ★ | Occurrences | | After ★ | Occurrences |
|----------|------------:|---|---------|------------:|
| `0`–`9` | ~1.9k (digits only) | | *(end of string)* | 1,968 |
| `s` | 36 | | `s` | 5 |
| `F` | 1 | | | |

- **Distinct “before” characters:** 12 (`0`–`9`, `s`, `F`).
- **Distinct “after” characters:** 2 — almost always **end of string** (trailing ★); the only **following** character observed is **`s`** (5 printings), e.g. `130★s`.

So “flag” characters **immediately after ★** in this bulk: **only `s`** (5 rows); there is **no** second letter class after ★ in the sample beyond that.

## Single trailing lowercase ASCII (`/^\d+([a-z])$/`)

Strings that are **digits** then exactly **one** trailing **`a`–`z`** (case-sensitive; **no** uppercase suffix here).

**Printing rows matching:** 7,645  
**Distinct strings:** 1,500  

### Complete list of **15** distinct trailing letters (with printing counts)

| Letter | Printings |
|--------|----------:|
| `s` | 4,069 |
| `p` | 2,416 |
| `a` | 347 |
| `z` | 270 |
| `b` | 246 |
| `c` | 93 |
| `d` | 77 |
| `y` | 25 |
| `e` | 24 |
| `f` | 21 |
| `g` | 19 |
| `r` | 19 |
| `u` | 19 |
| `w` | 19 |
| `m` | 1 |

No other lowercase trailing letters appear in this snapshot.

The **1,500** distinct full strings are not inlined here (bulk). Dump with:

```bash
jq -r '.[] | .collector_number // ""' data/raw/default-cards.json | node --input-type=module -e "
import readline from 'readline';
const set = new Set();
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (/^\\d+([a-z])\$/.test(line)) set.add(line);
}
console.log([...set].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join('\\n'));
"
```

## `hyphen_middle` (informal)

Empirically, almost all rows in this bucket look like **set-style code, hyphen, collector tail** (e.g. `AER-69`, `DMU-29`, `C21-316`, `A-1`, `7ED-60`, `2J-b`). This is **distinct** from `yyyy_dash_digits` (exactly four digit year, hyphen, digits).

## `starts_letter_rest` (informal)

Mostly **hyphenless** promo or product codes with **letters + digits + optional variant letter**, e.g. `CA02a`, `PLA001a`, `RA03d`, `RB04f`. They did not match `letters_then_digits_compact` because of **extra trailing letters** or **more than one letter run**.

## `misc`: observed sub-families (83 unique strings in sample)

Rough grouping for future matchers (after `digit_letter_digits` split out):

| Sub-pattern | Examples |
|-------------|----------|
| Dagger (U+2020 †) | `7†`, `265†a`, `118†s`, `265s†` |
| Star not at string end | `130★s`, `139★s`, `289★s` |
| Phi suffix (U+03A6 Φ) | `633Φ`, `681Φ` |

No separate bucket was run for every Unicode symbol; expand this list as new shapes appear in `misc` after bulk updates.

## Length distribution (same sample)

- **Maximum length:** 9 characters (example: `tvdl154sb`).
- **~83.5%** of values have length ≤ 3; **~100%** have length ≤ 7 (only 30 strings of length 8 and 4 of length 9 in this snapshot).

Short strings support **fixed-width** encodings (e.g. packing a few ASCII code points into `Uint32` lanes) for many rows; long tails still need overflow or rank fallback.

## Implications for a strided compare key (non-normative)

These observations support a **ladder of format matchers** that write a **fixed strided** `Uint32Array` per printing, with lexicographic compare across lanes (see team discussion: kind / segment ordering vs `localeCompare` parity—**enum-first** compare is convenient but may not match cross-shape collation unless validated).

**Pragmatic split:**

- **Structured encodings** for high-volume buckets (`digits_only`, `hyphen_middle`, `digits_then_letters_suffix`, `letters_then_digits_compact`, `yyyy_dash_digits`, `digit_letter_digits`, star/dagger/phi variants once parsed).
- **Fallback** for `misc`: sort **after** all parsed rows (sentinel kind + optional stable tie-break rank or hash), or extend matchers as new `misc` clusters appear.

## Changelog

| Date | Change |
|------|--------|
| 2026-04-03 | Initial snapshot from `data/raw/default-cards.json` (~112k printings), bucket script and misc taxonomy. |
| 2026-04-04 | Dropped unused ascii-`*` and `/` buckets; added `digit_letter_digits`; dagger/star adjacency tables; single trailing lowercase `/^\d+([a-z])$/` letter inventory (15 letters) and stats; refreshed bucket counts and misc size. |
