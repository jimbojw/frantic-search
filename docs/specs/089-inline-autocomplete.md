# Spec 089: Inline Autocomplete & Typeahead for Search Queries

**Status:** Implemented

**Depends on:** Spec 053 (Search Input Syntax Highlighting)

**References:** [Issue #77](https://github.com/jimbojw/frantic-search/issues/77)

## Goal

Provide zero-latency inline autocomplete for the search query input. As the user types, the application tokenizes the input and predicts the most likely completion based on the local card dataset. Completions are presented as "ghost text" inline ahead of the cursor and can be accepted via Tab (desktop), swipe-right gesture, or tap (mobile).

## Background

### Problem

Magic: The Gathering features complex card names, unusual types, and a highly specific search syntax. The query input has `autocomplete="off"`, `autocorrect="off"`, and `spellcheck={false}` to prevent the mobile OS from "correcting" MTG terminology into standard English. Users get no assistance with:

- Expanding `set:u` to `set:usg`
- Completing `!"gris` to `!"Griselbrand"`
- Finishing `t:cre` to `t:creature`
- Shortening field names: `u` → `unique`

### Why not native autocomplete?

- **HTML5 `datalist`:** Binds to `<input>` only, matches against the entire string. Useless for tokenized, multi-term search syntax.
- **Mobile predictive text:** iOS/Android keyboard suggestion ribbons are black boxes. Web APIs cannot inject a custom MTG dictionary into the native OS UI.

### Why inline ghost text (not suggestion chips)?

Extreme vertical space constraints on mobile. Once the virtual keyboard and browser chrome are visible, we cannot afford to lose more screen real estate to a suggestion strip or dropdown.

### Existing infrastructure

- **Transparent overlay** (Spec 053): A `<pre>` highlight layer sits beneath a transparent `<textarea>` in the same CSS grid cell. Both share font, padding, and scroll. The highlight layer renders colored spans; the textarea handles input and caret.
- **Lexer** (`shared/src/search/lexer.ts`): Produces tokens with `start`/`end` character offsets.
- **FIELD_ALIASES** (`shared/src/search/eval-leaves.ts`): Canonical field names and aliases.
- **DisplayColumns** (worker protocol): `names`, `type_lines` — available on main thread after worker `ready`.
- **PrintingDisplayColumns** (worker protocol): `set_codes` (per-printing row) — available after `printings-ready`.
- **bits.ts**: `RARITY_NAMES`, `FORMAT_NAMES`, `COLOR_NAMES`, etc.

## Design

### Completion contexts

| Context | Trigger | Example | Data source |
|---------|---------|---------|-------------|
| Field name | Cursor in or after a WORD that precedes `:` or an operator | `u` → `unique`, `set` → `set` | FIELD_ALIASES |
| Field value | Cursor in or after a value token (WORD or QUOTED) following a field operator | `set:u` → `usg`, `t:cre` → `creature` | set_codes, type_lines, bits.ts (field-specific) |
| Exact name | Cursor inside `!"...` (BANG + QUOTED) | `!"gris` → `Griselbrand"` | names (prefix match, case-insensitive) |
| Bare word | Cursor in a standalone WORD (not field, not value) | `llan` → `Llanowar` | names (substring match) |

No completion is offered for: regex patterns, quoted strings that are not exact-name, operators, parens, or OR keywords.

### Context detection algorithm

1. Lex the query; get tokens with `start`/`end`.
2. Find the token containing `cursorOffset` (or the token immediately before the cursor if cursor is at a boundary).
3. Infer context from token type and surrounding tokens:
   - **Field name:** Current token is WORD; next token is COLON or operator.
   - **Field value:** Current token is WORD or QUOTED; previous token is operator; token before that is a known field.
   - **Exact name:** Previous token is BANG; current token is QUOTED (or we're mid-quote).
   - **Bare word:** Current token is WORD; not preceded by operator; not followed by operator.

### Suggestion logic

- **Field name:** Filter FIELD_ALIASES keys (and canonical values) by prefix; return first match alphabetically. Prefer shorter aliases when multiple match (e.g. `s` over `set` when both match).
- **Field value:** Depends on field. `set:` → unique set codes, prefix match. `t:` → type line substrings (first word or full line), prefix match. `r:` → RARITY_NAMES. `f:` / `legal:` → FORMAT_NAMES. `c:` / `identity:` → COLOR_NAMES. `is:` → known keywords (foil, dfc, etc.). Return first match; tie-break by relevance (e.g. most recent set for `set:`).
- **Exact name:** Prefix match on `names` (case-insensitive). Return first match; append closing `"` to suggestion.
- **Bare word:** Substring match on `names`; prefer prefix matches. Return first match.

**Multiple matches:** When multiple completions exist, we show the single "most likely" one. For set codes: prefer alphabetical. For names: prefer prefix over substring, then alphabetical. Future: could cycle with repeated Tab; out of scope for initial implementation.

### Ghost text presentation

- **Placement:** Rendered inline in the highlight layer, immediately after the cursor position.
- **Styling:** Muted color (e.g. `text-gray-400 dark:text-gray-500`) so it is visually distinct from typed text.
- **Content:** The portion of the suggestion that would be *appended* — i.e. the suffix after the user's current prefix. Example: user typed `gris`, suggestion is `Griselbrand"`; ghost text shows `elbrand"`.

### Acceptance behavior

When the user accepts a suggestion:

1. **Replace** the current token's text (from token start to cursor) with the full suggestion.
2. **Insert** any required delimiters (e.g. closing `"` for exact name).
3. **Position** the cursor after the inserted text.

Example: `!"gris` + accept → `!"Griselbrand"` with cursor after the closing quote.

### Acceptance triggers

| Platform | Trigger | Implementation |
|----------|---------|----------------|
| Desktop | Tab | `onKeyDown`: if `key === 'Tab'` and ghost text present, `preventDefault`, apply completion. |
| Mobile | Swipe right | Touch handlers on input container: horizontal swipe (e.g. deltaX > 40px, minimal vertical) = accept. |
| Mobile | Tap ghost | Invisible overlay div with padding, positioned over the ghost span region; `pointer-events: auto`. |

**Swipe details:** Attach `touchstart`/`touchmove`/`touchend` to the input container (the grid wrapper). Track `clientX` delta. If horizontal movement exceeds threshold (e.g. 40px) and vertical movement is small (< 20px), treat as swipe-right. Must not interfere with textarea vertical scroll.

**Tap target details:** The ghost span lives in the highlight layer (`pointer-events: none`). Add a sibling overlay div that:
- Is absolutely positioned in the same grid cell.
- Covers the region where the ghost text renders (right portion of input when ghost is visible).
- Has generous padding (e.g. 24px) for fat-finger targets.
- Uses `pointer-events: auto` so it receives clicks.
- On click: apply completion.

Positioning the tap target precisely requires knowing the pixel bounds of the ghost span. Options: (a) ref the ghost span and use `getBoundingClientRect()` on layout, or (b) use a simpler full-width overlay on the right half of the input when ghost is visible — less precise but easier. Spec recommends (a) for accuracy; fallback to (b) if measurement is unreliable.

### IME and composition

Do not show or update ghost text during IME composition (`compositionstart` → `compositionend`). The composition preview is handled natively by the textarea. Suppress completion logic while `compositionstart` has fired and `compositionend` has not.

### Data availability

- **Before `display` ready:** No completion. All sources require DisplayColumns or PrintingDisplayColumns.
- **Before `printings-ready`:** No completion for `set:` field. Other contexts work.
- **Empty display:** Graceful no-op; no completion offered.

### Performance

- **Debouncing:** Completion runs on every `input` and `selectionchange`. For name/type search over ~30k rows, a linear scan may be slow. Options: (a) debounce 50–100ms, or (b) build a prefix trie at init. Spec recommends profiling first; start with linear scan and debounce if needed.
- **Cursor tracking:** `selectionStart` is cheap. No need to debounce.

## Scope of changes

| File | Change |
|------|--------|
| `docs/specs/089-inline-autocomplete.md` | This spec. |
| `app/src/query-autocomplete.ts` | New: `getCompletionContext`, `computeSuggestion`. |
| `app/src/QueryHighlight.tsx` | Add `cursorOffset`, `ghostText` props; render ghost span at cursor. |
| `app/src/App.tsx` | Track cursor; call computeSuggestion; wire Tab, swipe, tap handlers. |
| `app/src/DualWieldLayout.tsx` | Same wiring for SearchPane (single and dual-pane). |
| `shared/src/worker-protocol.ts` | Optionally add `unique_set_codes: string[]` if deriving from printing rows is insufficient. |
| `app/src/worker.ts` | If protocol changes: extract and send unique set codes. |
| `app/src/index.css` | Ghost text color classes if not inline. |

## Edge cases

- **Empty query:** No completion.
- **Cursor at start/end of token:** Context still detected; suggestion may be full token or suffix.
- **Selection (range):** Use `selectionStart` as the effective cursor for completion. Ignore `selectionEnd` for context.
- **Multi-line query:** Cursor position is character offset; works across lines.
- **DualWieldLayout:** Each pane has independent query and cursor. Autocomplete state is per-pane; no cross-talk.
- **Worker error state:** Input disabled; no completion.
- **Rapid typing:** Ghost text may flicker. Debouncing reduces this; acceptable for v1.

## Acceptance criteria

1. Typing `u` (before `:`) suggests `unique` as ghost text; Tab accepts.
2. Typing `set:u` suggests a set code (e.g. `usg`) as ghost text; Tab accepts.
3. Typing `t:cre` suggests `creature` as ghost text; Tab accepts.
4. Typing `!"gris` suggests `elbrand"` (or similar) as ghost text; Tab accepts and produces `!"Griselbrand"`.
5. Typing `llan` as bare word suggests a card name; Tab accepts.
6. Ghost text is visually muted (gray) and appears immediately after the caret.
7. On desktop, Tab accepts the suggestion without inserting a tab character.
8. On mobile, swipe-right on the input area accepts the suggestion.
9. On mobile, tapping the ghost text region accepts the suggestion.
10. No ghost text during IME composition.
11. No completion before `display` is ready; no `set:` completion before `printings-ready`.
12. No regressions to syntax highlighting, scroll sync, or focus management.

## Implementation Notes

- 2026-03-06: `computeSuggestion` for field names returns the canonical field name (e.g. `unique`) rather than whichever alias prefix-matches first. Context detection prefers value context over field context when cursor is in a token after a colon.
- 2026-03-06: `IS_KEYWORDS` list exported from `shared/src/search/eval-is.ts` for autocomplete; combines face-level and printing-level keywords (deduped).
- 2026-03-06: Set codes for autocomplete are deduped from `PrintingDisplayColumns.set_codes` on the main thread; no worker protocol change needed.
- 2026-03-06: Tap target uses Option B (right-half overlay) rather than measuring ghost span bounds; simpler and sufficient for v1.
- 2026-03-06: `applyCompletion` for exact names: `computeSuggestion` returns `"CardName"` (with both quotes); the prefix starts after `!` at the opening quote, so replacement includes the full quoted name.
