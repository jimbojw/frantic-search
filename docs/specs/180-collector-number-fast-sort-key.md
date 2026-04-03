# Spec 180: Collector Number — Parsed Shape and Fast Sort Key

**Status:** Draft

**Depends on:** Spec 059 (Sort Directives — `sort:set` tie-break uses collector number; **§ Sort implementation → Allocation discipline** is normative for how this spec is wired into the worker sort path), [Research: Scryfall `collector_number` shapes](../research/scryfall-collector-number-shapes.md)

**Related code:** [`shared/src/search/ordering.ts`](../../shared/src/search/ordering.ts) (printing-domain collector tie-break; today uses a reused `Intl.Collator` for string compare — see Spec 059)

## Goal

Formalize a **two-stage** contract for Scryfall-style `collector_number` strings:

1. **Parse:** map a string to a small **tagged struct** (`ParsedCollectorNumber`) when the value matches a **supported** shape.
2. **Encode:** map that struct to a fixed **strided `Uint32Array`** slice so comparisons between **fast-key** rows use **lane compare only** (no `localeCompare`).

For values **outside** supported shapes, implementations use a **fallback** key (`lane 0 === 0`) and compare those rows with the **same ordering semantics** as today’s numeric-aware string collation (`numeric: true`, `sensitivity: "base"`) on the same surface string — typically lowercased collector number. **Spec 059 allocation discipline:** that comparison must **not** allocate per pairwise invocation (reuse a **single** `Intl.Collator` per sort, or equivalent — no fresh `localeCompare` options object on every compare). See § Implementation vs logical model below.

**Practical target:** The bulk of printings use a few shapes (digits only, trailing Unicode star, ASCII letter suffix after digits, compact letters-then-digits). Fast-pathing those alone yields large wins for `sort:set` and any other ordering that compares collector numbers at scale.

**Explicit non-goal (v1):** Bit-for-bit ordering parity with ECMAScript `localeCompare`. In particular, **all fast-key rows are ordered before all fallback rows** (ascending collector tie-break), even if a strict string sort would interleave them. Fallback rows are a small minority; this avoids mixing `localeCompare` into the hot path whenever one operand is fast.

## Background

- Scryfall exposes `collector_number` as a **string** with many ad hoc conventions; empirical buckets and counts live in the research note above.
- `sort:set` (Spec 059) breaks ties within the same set using collector number before other keys. Today that uses `localeCompare`, which is correct but hot.
- ADR-009 / shared query code favor **pre-allocated buffers** and tight loops; a strided numeric key fits that model for the worker sort path.
- Spec 059 forbids **heap allocation inside sort comparators** and per-call `localeCompare` options objects; fast lanes + pre-materialized keys are the intended way to honor both specs together.

## Implementation vs logical model

- **`ParsedCollectorNumber` / `CollectorParseResult` in this document** are **logical** types for clarity, tests, and proving the parse ladder. They are **not** required as runtime values on every keystroke.
- **Worker sort integration (normative with Spec 059):**
  - **Fast-key rows:** Compare **only** pre-materialized strided `uint32` lanes (decorate-sort-undecorate or an ETL-resident column) inside the sort comparator — **no** parse structs, **no** string collation.
  - **Fallback rows:** When both sides are fallback, ordering must match § Comparison rules (string collation semantics) but must follow **Spec 059** — e.g. **one** `Intl.Collator` instance per sort, reused for all fallback–fallback pairs; **no** object literals or fresh options objects inside the comparator callback.
  - **Whole-sort allocation** (building the strided key buffer once per index build or once per sort, allocating the collator once per sort, permutation arrays, etc.) is **allowed** and expected.

## Requirements

1. **Deterministic parse:** Given the same input string and spec version, the parser yields the same `ParsedCollectorNumber` or **unsupported** (`Fallback`).
2. **First-match ladder:** Classification uses a **fixed ordered** list of shape rules (below). The first matching rule wins; no rule may overlap an earlier one.
3. **Testability:** Parsing is specified with **regex-style predicates** and **examples** sufficient for unit tests; encoding is specified with **lane layout** and **integer ordering** rules **per kind**.
4. **Fast vs fallback partition:** If **either** side has a fast key (`lane 0 > 0`) and the **other** does not, the fast row **precedes** the fallback row in **ascending** collector order (see § Comparison rules). **Do not** use string collation for that pair. If **both** sides are fallback, use the same **ordering semantics** as Spec 059 for collector strings (empty-last rules as in `comparePrintingCollectorRaw` / `comparePrintingCollectorInto`), implemented **without per-comparison allocation** per Spec 059. If **both** sides are fast, compare lanes **0..7** only.
5. **Extensibility:** New shapes or lane layouts are added by bumping a **spec revision** (changelog) and extending the enum; implementations may ship parsers that recognize only a **subset** if they always fall back for unrecognized strings.
6. **Comparator allocation (Spec 059):** Production code that sorts by collector key (including mixed fast/fallback logic) must satisfy Spec 059 § **Allocation discipline** — in particular, no heap allocation inside the sort comparison callback and no per-call `localeCompare` options objects; prefer precomputed strided keys for the fast path and a reused collator (or precomputed fallback keys) for the fallback path.

## Normalization

The canonical input to this spec is the **same string** the sort pipeline already uses for collector tie-breaks (today: lowercased copy in the printing index, see `ordering.ts`).

- **v1 parse rules** are defined on that string unless stated otherwise.
- **ASCII letter** classes in regexes use **case-sensitive** matching on the stored string; because the pipeline lowercases collector numbers, **uppercase `A–Z` in patterns** mainly matters if a future pipeline stops lowercasing or for tests that pass mixed case.

## Parse ladder (normative order)

Let `s` be the collector number string (possibly empty).

| Step | Kind | Predicate (matches `s`) | Notes |
|-----|------|---------------------------|--------|
| 1 | `DigitsOnly` | `^\d+$` | Integer decimal value must fit `uint32` for fast encode; otherwise treat as `Fallback`. |
| 2 | `YearDashDigits` | `^\d{4}-\d+$` | Exactly four digit year, hyphen, one+ digits (no other hyphens). |
| 3 | `DigitsUnicodeStarEnd` | `^(\d+)★$` | U+2605 BLACK STAR only as final code unit; prefix is non-empty digits. Values like `130★s` do **not** match; they are `Fallback`. |
| 4 | `DigitLetterDigits` | `^(\d+)([A-Za-z])(\d+)$` | Exactly one ASCII letter between two non-empty digit runs. |
| 5 | `DigitsAsciiSuffix` | `^(\d+)([a-zA-Z]+)$` | Suffix is **ASCII letters only**; no digits after the suffix. |
| 6 | `LettersDigitsCompact` | `^([a-zA-Z]+)(\d+)$` | Letters then digits; no other characters. |
| 7 | `Fallback` | (else) | Includes `""`, hyphen forms, leading-letter promos, dagger/star/phi variants, `★` not at end, etc. |

### Ladder notes

- **Empty string:** Scryfall default-cards bulk has **zero** `collector_number === ""` rows (see research). Spec 059 still defines empty-last ordering when the string is empty; implementations keep that behavior on the **fallback** path (same empty checks as collector compare in `ordering.ts`). There is **no** separate fast kind for empty.
- **`YearDashDigits` before `DigitsUnicodeStarEnd`:** Years are four digits; star forms are disjoint.
- **`DigitLetterDigits` before `DigitsAsciiSuffix`:** `1E05` matches the former; a suffix with **no** trailing digits matches the latter.
- **Hyphenated codes** (`hyphen_middle` in research, e.g. `AER-69`): **v1** → always `Fallback` (fast encoding may be specified in a later revision).

## Parsed shape (logical struct)

TypeScript-style **documentation types** (not a runtime requirement):

```ts
/** Discriminant after successful parse (non-fallback). */
type ParsedCollectorNumber =
  | { kind: "digits_only"; value: number } // uint32
  | { kind: "year_dash_digits"; year: number; seq: number } // year 1000–9999, seq fits uint32
  | { kind: "digits_unicode_star_end"; n: number } // digits before ★, uint32
  | {
      kind: "digit_letter_digits";
      prefix: number;
      letter: string; // one code unit
      suffix: number;
    }
  | { kind: "digits_ascii_suffix"; n: number; suffix: string } // suffix non-empty ASCII letters
  | { kind: "letters_digits_compact"; letters: string; n: number };

/** Parser result: either a structured shape or fallback (lane 0 === 0). */
type CollectorParseResult =
  | { ok: true; parsed: ParsedCollectorNumber }
  | { ok: false }; // fallback: string compare vs other fallback; loses to any fast key
```

**Overflow:** If any numeric field would exceed `uint32`, `ok: false` (fallback).

## Fast encoding: strided `Uint32Array`

### Stride and lanes

- **Stride:** `COLLECTOR_KEY_STRIDE = 8` consecutive `uint32` words per key. Indices **0..7**.
- **Lane 0:** `kind` discriminator (see table). Value **`0`** means **fallback** (no fast key).
- **Lanes 1–7:** Kind-specific payload. Any unused lane is **`0`**.

### Kind discriminators (lane 0)

| Value | Kind |
|------:|------|
| 0 | Fallback / no fast key |
| 1 | `digits_only` |
| 2 | `year_dash_digits` |
| 3 | `digits_unicode_star_end` |
| 4 | `digit_letter_digits` |
| 5 | `digits_ascii_suffix` |
| 6 | `letters_digits_compact` |

### Payload by kind

**`digits_only` (1):** Lane 1 = `value`.

**`year_dash_digits` (2):** Lane 1 = `year`, lane 2 = `seq`.

**`digits_unicode_star_end` (3):** Lane 1 = `n` (numeric value of digit run before `★`).

**`digit_letter_digits` (4):** Lane 1 = `prefix`, lane 2 = Unicode code unit of `letter` (ASCII in practice), lane 3 = `suffix`. Lanes 4–7 = `0`.

**`digits_ascii_suffix` (5) and `letters_digits_compact` (6):** Variable-length ASCII needs a **length** so shorter suffixes sort before longer prefixes that share bytes (e.g. `1` vs `1a` under byte packing).

- Let `bytes` be the **UTF-8** encoding of the substring (`suffix` or `letters` only). Let `L = bytes.length`.
- If `L > 20`, **fallback** (`ok: false`) — exceeds packing capacity below (not expected for current bulk; max observed collector length is small; see research).
- **Lane 1:** For kind **5**, numeric `n` (leading digit run). For kind **6**, numeric `n` (trailing digit run).
- **Lane 2:** `L` (UTF-8 byte length, `0 ≤ L ≤ 20`).
- **Lanes 3–7:** Pack `bytes` in order. Each lane holds up to **four** bytes in **big-endian** order within the word: `lane = (b0<<24)|(b1<<16)|(b2<<8)|b3`. Lane 3 holds bytes 0–3, lane 4 holds 4–7, … lane 7 holds bytes 16–19. Unused byte positions in the last used lane are **`0`.

## Comparison rules

### Partition: fast before fallback

Ascending collector tie-break (within the same set, after higher-level sort keys):

1. If **exactly one** side has `lane 0 === 0` (fallback), that side **loses**: the fast key row precedes the fallback row (`cmp` negative if the first argument is fast and the second is fallback).
2. If **both** sides have `lane 0 === 0`, compare using the **same ordering semantics** as numeric-aware, case-insensitive-base string sort (`numeric: true`, `sensitivity: "base"`), including **empty-last** semantics for `""` (match Spec 059). **Implementation:** satisfy Spec 059 — e.g. `Intl.Collator` with those options, **constructed once per sort** (or precomputed keys), **not** `localeCompare` with a new options object per comparison.
3. If **both** sides have `lane 0 > 0`, compare lanes **0..7** as unsigned 32-bit integers in lexicographic order (first differing lane decides). **Cross-kind** ordering is whatever this total order yields (kind discriminator in lane 0 is the primary key among fast rows).

This deliberately diverges from a global string collation ordering when fallback strings would sort before or between fast-shaped strings; that tradeoff keeps the comparator free of string collation whenever at least one operand is fast (and keeps the fast–fast path to lane compares only).

### Payload ordering (kinds 5 and 6)

For kinds **5** and **6**, the `(lane 1 numeric, lane 2 length, lanes 3–7 packed bytes)` ordering matches **byte-wise lexicographic** order of the UTF-8 substring **after** comparing the primary numeric field `n`, when `L ≤ 20`.

## Acceptance criteria (for implementation)

1. **Unit tests** assert parse results for representative strings from each supported kind, including at least:
   - `DigitsOnly`: `1`, `10`, `316`
   - `YearDashDigits`: `1993-1`
   - `DigitsUnicodeStarEnd`: any `^\d+★$` observed in data (see research)
   - `DigitLetterDigits`: full set from research (`1E05`, `3N08`, …)
   - `DigitsAsciiSuffix`: `1a`, `10s`
   - `LettersDigitsCompact`: e.g. `s1`, `ab12` (promo shapes with extra trailing letters such as `PLA001a` remain `Fallback` under v1)
2. **Fallback:** `AER-69`, `130★s`, `7†`, `633Φ` parse as `ok: false` under v1.
3. **Encode round-trip sense:** For a fixed kind, two values that should order ascending under lane compare produce `cmp < 0` when compared lane-wise (same tests as parse, plus edge cases for length field: `1` vs `1a` within kind 5).
4. **Partition:** For any fast-encoded string `a` and fallback string `b`, the comparator reports `a` before `b` in ascending order (without string collation on `(a, b)` when `a` is fast and `b` is not).
5. **Spec 059 alignment:** Sort-path integration does not allocate inside the comparator and does not use per-call `localeCompare` options objects (see § Implementation vs logical model).

## Future work

- **Hyphen middle** (~5k printings): structured parse + encoding without blowing stride.
- **`130★s` and dagger/phi families:** extend ladder with well-tested rules.
- **Single combined hot path:** parse+encode writing directly into a pre-allocated strided buffer (no intermediate heap struct per row at query time), once the logical contract stabilizes — this is the expected production shape under Spec 059 for the fast path.
- **Golden ordering:** optional corpus comparing lane order vs `localeCompare` for supported kinds only.

## Changelog

| Date | Change |
|------|--------|
| 2026-04-04 | Draft: parse ladder (v1), logical types, 8×`uint32` encoding, fast-before-fallback partition, `""` as fallback only, kind discriminators 1–6, acceptance criteria. **Update:** Align with Spec 059 allocation discipline (§ Implementation vs logical model, requirement 6, acceptance criterion 5, collator / no per-compare `localeCompare` options wording). |
