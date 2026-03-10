# Spec 108: List Import Syntax-Highlighting Textarea

**Status:** Implemented

**Depends on:** Spec 053 (Search Input Syntax Highlighting), Spec 075 (Card List Data Model), Spec 090 (Lists Page)

## Goal

Define a deck list textarea that provides syntax highlighting and validation against resident card data. This is the foundation for future list import features (apply to list, quick-fix, etc.). Scope is intentionally narrow: textarea + highlighting + validation only.

## Background

- **Overlay pattern:** Spec 053 and `QueryHighlight.tsx` use a transparent textarea over a `<pre>` highlight layer. Both use `grid-area: 1/1`, `.hl-layer` / `.hl-input` classes, and scroll sync. This pattern is proven and reusable.
- **Data sources:** The app receives `DisplayColumns` (names, oracle_ids, combined_names) and `PrintingDisplayColumns` (set_codes, collector_numbers, canonical_face_ref) from the worker. Spec 114 moves deck list validation to the worker and uses the search engine for name resolution.
- **Deck list formats:** Common formats are `1 Card Name`, `4x Card Name`, `1 Card Name (SET) 123`, `// Comment`, and section headers.

## Design

### 1. Textarea with Overlay

Reuse the Spec 053 overlay technique:

- Container `<div class="grid">` with both highlight layer and textarea at `grid-area: 1/1`
- Highlight layer: `<pre class="hl-layer">` with `pointer-events-none`, `aria-hidden`
- Textarea: `class="hl-input"` with `color: transparent`, `caret-color` for visibility
- Scroll sync: on `onInput` and `onScroll`, copy `scrollTop`/`scrollLeft` from textarea to highlight layer
- Shared font, padding, line-height between both elements

**Placement:** The textarea lives on the Lists page, in a new "Import" section above the list contents.

**CSS:** Reuse existing `.hl-layer` and `.hl-input` from `index.css`. No new CSS required unless list textarea needs different dimensions.

### 2. Deck List Lexer and Syntax Highlighting

**Module:** `shared/src/list-lexer.ts` (TDD — tests in `list-lexer.test.ts`)

**Line-based parsing:** Each line is parsed independently. Tokens have `{ type, value, start, end }` with character offsets in the full text (not per-line).

**Token types:**

| Type | Example | Notes |
|------|---------|-------|
| `QUANTITY` | `1`, `4x`, `2x` | Optional `x` suffix |
| `CARD_NAME` | `Lightning Bolt`, `Birds of Paradise` | Text between quantity and optional `(SET)` |
| `SET_CODE` | `M21`, `DMU` | Inside parentheses |
| `COLLECTOR_NUMBER` | `159`, `273` | After closing paren, before EOL |
| `FOIL_MARKER` | `*F*` | Optional; Moxfield foil indicator |
| `ALTER_MARKER` | `*A*` | Optional; Moxfield alter indicator |
| `ETCHED_MARKER` | `*E*` | Optional; Moxfield etched indicator |
| `CATEGORY` | `Land`, `Commander` | Main label; excludes brackets and optional `{tag}` |
| `CATEGORY_TAG` | `{top}`, `{bottom}` | Optional `{tag}` suffix within `[Category{tag}]` |
| `COLLECTION_STATUS_TEXT` | `Have`, `Getting` | Status text from Archidekt `^Status,#hex^` marker |
| `COLLECTION_STATUS_COLOR` | `#37d67a` | Hex color from Archidekt `^Status,#hex^` marker |
| `SECTION_HEADER` | `About`, `Deck`, `Sideboard`, `Commander` | Standalone line; Arena/Moxfield structure |
| `METADATA` | `Name The Birds (are rebels)` | Key-value under About; full line as one token |
| `COMMENT` | `// Sideboard`, `# notes` | Full line when starts with `//` or `#` |
| `SECTION` | `// Creatures` | Same as COMMENT for MVP; can distinguish later |
| `WHITESPACE` | spaces, newlines | Between tokens, preserved for span reconstruction |
| `VARIANT` | `251`, `extended`, `borderless` | MTGGoldfish: content of `<...>` (collector number or variant) |
| `SET_CODE_BRACKET` | `THB`, `OTJ` | MTGGoldfish: set code from `[SET]` brackets |
| `FOIL_PAREN` | `(F)` | MTGGoldfish: foil marker |
| `ETCHED_PAREN` | `(E)` | MTGGoldfish: etched marker (foil-etched) |
| `HASH_TAG` | `Land`, `Ramp/Reduction` | TappedOut: inline `#Tag` (slash preserved in tag name) |
| `ROLE_MARKER` | `*CMDR*`, `*CMPN*` | TappedOut: Commander or Companion role |
| `FOIL_PRERELEASE_MARKER` | `*f-pre*` | TappedOut: prerelease variant (like MTGGoldfish `<prerelease>`) |

**Line patterns:**

- **Card line:** quantity, name, optional `(SET) number`, optional `*F*`, optional `*A*`, optional `*E*`, optional `[Category]` or `[Category{tag}]`, optional `^Status,#hex^` (Archidekt collection marker)
- **MTGGoldfish card line:** quantity, name, `<variant>`, `[SET]`, optional `(F)` or `(E)` — e.g. `6 Island <251> [THB]`, `4 Spirebluff Canal <prerelease> [OTJ] (F)`
- **MTGGoldfish MTGO / no-variant:** quantity, name, `[SET]`, optional `(F)` or `(E)` — no `<variant>`; e.g. `2 Disdainful Stroke [KTK] (F)`, `1 Flashfreeze [M10]`
- **TappedOut inline:** quantity, name, optional `(SET)` or `(SET:num)`, optional `*f*`/`*f-etch*`/`*e*`/`*f-pre*`/`*f-pp*`, optional `*CMDR*`/`*CMPN*`, optional `#Tag` (multiple). E.g. `1x Sol Ring (SLD:589) *f* #Land #Ramp/Reduction`. Tried when line has `#Tag`, `*f*`, `*CMDR*`, or `(SET:num)`; `#` inside Archidekt `^...#hex^` is excluded.
- **MTGGoldfish card line:** try before Moxfield pattern
- **Section header:** `^\s*(About|Main\s*Deck|Deck|Sideboard|Commander)\s*:?\s*$` — case-insensitive; optional trailing colon. `MainDeck` and `Main Deck` are recognized for Melee.gg format.
- **Metadata:** `^\s*Name\s+(.+)$` — "Name" followed by deck name
- **Comment line:** `^\s*(//|#).*` — full line is COMMENT
- **Empty line:** No tokens (or single WHITESPACE)
- **Malformed:** e.g. `4x` with no name, `1` alone — produce tokens but mark for validation error

**Highlight roles (Tailwind, light/dark):**

| Role | Example | Classes |
|------|---------|---------|
| quantity | `4x` | `text-amber-600 dark:text-amber-400` |
| card-name | `Lightning Bolt` | `text-gray-900 dark:text-gray-100` |
| set-code | `M21` | `text-blue-600 dark:text-blue-400` |
| collector-number | `159` | `text-blue-600 dark:text-blue-400` |
| foil-marker | `*F*` | `text-violet-600 dark:text-violet-400` |
| alter-marker | `*A*` | `text-violet-600 dark:text-violet-400` |
| etched-marker | `*E*` | `text-violet-600 dark:text-violet-400` |
| category | `[Land]`, `Commander` | `text-emerald-600 dark:text-emerald-400` |
| category-tag | `{top}` | `text-slate-600 dark:text-slate-400` |
| collection-status-text | `Have` | `text-slate-600 dark:text-slate-400` |
| collection-status-color | `#37d67a` | `text-slate-500 dark:text-slate-500` |
| section-header | `Deck` | `text-sky-600 dark:text-sky-400 font-semibold` |
| metadata | `Name The Birds...` | `text-slate-600 dark:text-slate-400 italic` |
| comment | `// Sideboard` | `text-gray-500 dark:text-gray-400 italic` |
| variant | `251`, `extended` | `text-slate-600 dark:text-slate-400` |
| variant-approx | `prerelease` (known but no exact match) | `text-amber-600 dark:text-amber-400 underline decoration-wavy` |
| hash-tag | `#Land`, `#Ramp/Reduction` | `text-emerald-600 dark:text-emerald-400` |
| role-marker | `*CMDR*`, `*CMPN*` | `text-sky-600 dark:text-sky-400 font-semibold` |
| error | invalid spans | `text-red-600 dark:text-red-400 underline decoration-wavy` |

**Output:** `ListHighlightSpan[]` with `{ text, role, start, end }`. A `buildListSpans(text, validationResult?)` function produces spans; when validation is provided, error spans override the default role. Warning spans (from approximate variant resolution) override the default role with `variant-approx`.

### 3. Validation Against Resident Data

**Module:** `shared/src/list-validate.ts`

**Input:** `(text: string, display: DisplayColumns | null, printingDisplay: PrintingDisplayColumns | null)`

**Output:** `ListValidationResult` with `lines: LineValidation[]` and optional `resolved: ParsedEntry[]`.

**Validation rules:**

1. **Card name:** Normalize (lowercase, collapse whitespace). Look up in `display.names` or `display.combined_names`. Exact match → ok. No match → error span on name, message `"Unknown card"`.
2. **Set code:** When `(SET)` present, check `printingDisplay.set_codes` includes it (case-insensitive). Unknown set → error span on set code, message `"Unknown set"`.
3. **Collector number:** When both set and number present, find printing row where `set_codes[i] === set` and `collector_numbers[i] === number`. Verify `canonical_face_ref[i]` matches the oracle for the resolved card name. Mismatch → error span on number, message `"Collector number doesn't match"`.
4. **Malformed line:** `4x` with no name, `1` with no name → error span on line, message `"Missing card name"`.
5. **MTGGoldfish variant fallback:** When a non-numeric variant (e.g. `prerelease`, `promo pack`) cannot be resolved to a distinct Scryfall printing via `printing_flags` or `promo_types_flags`, check if the variant is in the known MTGGoldfish variations set (`showcase`, `extended`, `borderless`, `japanese`, `planeswalker stamp`, `precon`, `prerelease`, `pw_deck`, `brawl_deck`, `buy-a-box`, `promo pack`, `bundle`, `sealed`, `timeshifted`). If known: fall back to any printing in set matching the card, prefer foil if `(F)` present. Emit `kind: "warning"` with `"Variant resolved approximately"`. The variant string is preserved on `ParsedEntry.variant` for round-trip fidelity. If unknown: error as usual. Scryfall often does not model prerelease/promo-pack foils as separate printings, so this fallback avoids false errors.

**Data availability:** When `display` or `printingDisplay` is null (worker not ready), skip validation and show no error spans. Highlighting still works (syntax only).

### 4. Components

- **ListHighlight:** Takes `text`, `validation`, `class`. Calls `buildListSpans` and renders `<pre>` with `<span>` elements.
- **ListImportTextarea:** Wrapper with textarea, highlight layer, scroll sync, validation memo. Receives `display` and `printingDisplay` from parent. Debounces validation (e.g. 150ms).

### 5. Integration

Add `ListImportTextarea` to the Lists page. Placement: Import section above list contents.

## Out of Scope (this spec)

- Apply/import flow (adding resolved entries to the list)
- Quick-fix popup or suggestions
- Fuzzy/typo correction for card names
- Section mapping (main/sideboard to different lists)
- Export from list to text

## Implementation Notes

- 2026-03-08: Implemented per spec. ListImportTextarea in Import section on Lists page; list-lexer and list-validate in shared; validation debounced at 150ms.
- 2026-03-08: Extended CARD_LINE_RE to allow optional trailing `[Category]` (e.g. `[Land]`, `[Removal]`) for Moxfield/Archidekt-style exports.
- 2026-03-08: Added CATEGORY token type and category highlight role. Lexer now emits CATEGORY tokens for bracketed labels including `[Commander{top}]` format.
- 2026-03-08: Added CATEGORY_TAG token for `{position}` subfield within category labels; tag highlighted separately in slate.
- 2026-03-08: Added FOIL_MARKER and ALTER_MARKER tokens for Moxfield `*F*` and `*A*`; both highlighted in violet.
- 2026-03-08: Added ETCHED_MARKER for Moxfield `*E*` (etched); section headers allow optional trailing colon (e.g. `SIDEBOARD:`).
- 2026-03-08: Added SECTION_HEADER and METADATA tokens for Moxfield "Export for Arena" format; section headers (About, Deck, Sideboard, Commander) and Name metadata highlighted.
- 2026-03-08: Added COLLECTION_STATUS_TEXT and COLLECTION_STATUS_COLOR tokens for Archidekt `^Status,#hex^` collection markers; status text and hex color highlighted in slate.
- 2026-03-09: Added MTGGoldfish "Exact Card Versions (Tabletop)" support. New tokens: VARIANT (content of `<...>`), SET_CODE_BRACKET (`[SET]`), FOIL_PAREN (`(F)`). Lexer tries MTGGoldfish pattern before Moxfield. Validator resolves variant as collector number (numeric) or by printing_flags/promo_types_flags (extended, borderless, prerelease, etc.). PrintingDisplayColumns extended with printing_flags, promo_types_flags_0, promo_types_flags_1 for variant resolution.
- 2026-03-09: Added MTGGoldfish MTGO / no-variant format: `quantity name [SET] (F|E)?` without `<variant>`. New token ETCHED_PAREN (`(E)`). Modifiers (F)=foil, (E)=etched per MTGGoldfish CSV (FOIL, FOIL_ETCHED). Lexer only matches no-variant when line lacks Moxfield `(SET) number` pattern to avoid misparsing `[Category]` as `[SET]`.
- 2026-03-09: Added MTGGoldfish variant fallback. Known MTGGoldfish variations (14 values from [help page](https://www.mtggoldfish.com/help/import_formats)) that cannot resolve to a distinct Scryfall printing now fall back to best-match-in-set (prefer foil when `(F)` present) instead of erroring. `LineValidation.kind` extended with `"warning"`; new `variant-approx` highlight role with amber wavy underline (mirrors query highlighter `value-zero` style). Variant string preserved on `ParsedEntry.variant` for round-trip fidelity. `findPrintingBySetAndVariant` now returns -1 when `variantToFlags` cannot interpret the variant, preventing unrecognized variants from silently matching all printings.
- 2026-03-09: Added Melee.gg support. Section header regex now recognizes `MainDeck` and `Main Deck` (with optional space) as synonyms for `Deck`. Token value is the verbatim matched text; zone normalization (`MainDeck` → `Deck`) is handled by the importer (Spec 109).
- 2026-03-10: Added TappedOut inline format. New tokens: HASH_TAG (`#Tag`), ROLE_MARKER (`*CMDR*`, `*CMPN*`), FOIL_PRERELEASE_MARKER (`*f-pre*`). Card line pattern: `(SET)` or `(SET:num)`, `*f*`/`*f-etch*`/`*e*`/`*f-pre*`/`*f-pp*`, optional role, optional `#Tag` (multiple). Tried when line has TappedOut markers; `#` inside Archidekt `^...#hex^` excluded to avoid misparse. Validator: `*f-pre*` uses variant fallback; `(SET)` without collector uses `findAnyPrintingInSet`.

## Acceptance Criteria

1. A textarea with overlay renders on the Lists page; typing shows syntax-highlighted text beneath.
2. Quantity, card name, set code, collector number, and comments each render in distinct colors.
3. Scroll sync keeps highlight layer aligned with textarea during scroll and resize.
4. Caret and selection remain visible (reuse `hl-input` styles).
5. When display/printing data is available, invalid card names are marked with error style.
6. When printing data is available, unknown set codes and mismatched collector numbers are marked with error style.
7. Validation does not run when display or printingDisplay is null.
8. Lexer and validation have unit tests; lexer is developed TDD.
9. Category labels (e.g. `[Land]`, `[Commander{top}]`) render in distinct color.
