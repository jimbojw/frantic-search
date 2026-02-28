# Spec 053: Search Input Syntax Highlighting

**Status:** Draft

**Depends on:** Spec 049 (Expandable Search Input)

## Goal

Add syntax highlighting to the search input so that field names, operators, values, quoted strings, regex patterns, negation, parentheses, and OR keywords are visually distinct. Unrecognized field names are marked with an error style. Highlighting works in both the single-line `<input>` and the multi-line `<textarea>` (Spec 049).

## Background

### Problem

The search input renders plain monochrome text. For complex queries it is hard to distinguish fields from values, see where negation applies, or spot malformed terms like misspelled field names.

### Existing infrastructure

- `lex()` already produces tokens with character-level `start`/`end` spans.
- `FIELD_ALIASES` (in `shared/src/search/eval-leaves.ts`) provides the canonical set of known field names.
- The parser never throws — malformed input produces best-effort tokens.

## Approach: Transparent Overlay

Native `<input>` and `<textarea>` cannot render styled inline spans. The standard overlay technique solves this:

1. Layer a `<pre>` (the "highlight layer") beneath a transparent `<input>`/`<textarea>` in the same CSS grid cell.
2. Match font, padding, line-height, and scroll position exactly.
3. The textarea/input has `color: transparent` and `caret-color: currentColor` so the caret stays visible.
4. On every input change, re-lex the query and render colored `<span>` elements into the highlight layer.

This preserves all native editing behavior (selection, clipboard, undo, IME, mobile keyboards) while displaying highlighted text underneath.

## Design

### Highlight component

A new `QueryHighlight` component (`app/src/QueryHighlight.tsx`):

- **Input:** `query: string` (the reactive signal), `class?: string`
- **Output:** A `<pre>` containing `<span>` elements, one per token, plus literal whitespace between tokens (reconstructed from gaps between consecutive token spans).

### Token classification

The highlight layer needs slightly more than raw `TokenType` — it needs to know whether a `WORD` is acting as a field name, a value, or a bare word. This is derivable from token context without a full AST parse:

- A `WORD` immediately followed by an operator (`:`, `=`, `!=`, `<`, `>`, `<=`, `>=`) is a **field**.
- A `WORD` or `QUOTED` immediately after an operator is a **value**.
- A standalone `WORD` is a **bare word** (name search).
- `OR` tokens are **keywords**.

For field validation: check the field token's value against `FIELD_ALIASES`. An unrecognized field gets an error style.

### Color palette (Tailwind, light/dark)

| Role | Light | Dark |
|------|-------|------|
| Field (known) | `text-blue-600` | `dark:text-blue-400` |
| Field (unknown) | `text-red-600 underline decoration-wavy decoration-red-400` | `dark:text-red-400 dark:decoration-red-500` |
| Operator | `text-blue-600` | `dark:text-blue-400` |
| Value | `text-gray-900` | `dark:text-gray-100` |
| Bare word | `text-gray-900` | `dark:text-gray-100` |
| Quoted string (incl. delimiters) | `text-emerald-700` | `dark:text-emerald-400` |
| Regex (incl. slashes) | `text-violet-700` | `dark:text-violet-400` |
| NOT `-` / `!` | `text-red-600` | `dark:text-red-400` |
| Parens | `text-amber-600` | `dark:text-amber-400` |
| OR keyword | `text-blue-600 font-semibold` | `dark:text-blue-400` |

These are initial values and may be tuned during implementation.

### Integration with input/textarea

Both the `<input>` (collapsed) and `<textarea>` (expanded) need the overlay:

- Wrap each in a container `<div>` with `display: grid` where both the highlight `<pre>` and the input/textarea occupy the same grid cell (`grid-area: 1/1`).
- The `<pre>` is `pointer-events-none`, `aria-hidden`, and has `overflow: hidden` (for `<input>` mode) or scroll-synced overflow (for `<textarea>` mode).
- The `<input>`/`<textarea>` gets `color: transparent` and `caret-color` set appropriately for light/dark.
- Both elements share identical `font-family`, `font-size`, `padding`, `line-height`, and `letter-spacing` classes.

### Scroll sync (textarea only)

In textarea mode, scroll the `<pre>` to match the textarea's `scrollTop`/`scrollLeft` on every `scroll` event.

## Scope of changes

| File | Change |
|------|--------|
| `app/src/QueryHighlight.tsx` | New component: takes `query` string, returns highlighted `<pre>`. |
| `app/src/App.tsx` | Wrap input and textarea in overlay grid containers. Add `color: transparent`, `caret-color`. Wire scroll sync for textarea. |
| `app/src/index.css` | CSS additions for `caret-color` and `::selection` overrides on the overlay input. |
| `shared/src/index.ts` | Export `FIELD_ALIASES` at the top level. |

## Edge cases

- **Empty query**: No tokens; highlight layer shows nothing. Placeholder text is on the transparent input and shows through naturally.
- **Partial typing mid-token**: Lexer handles partial input gracefully (never throws). Tokens update on every keystroke.
- **Long single-line queries**: The `<pre>` in input mode uses `overflow: hidden` and `white-space: pre` to match the input's horizontal scroll behavior. Scroll sync via `onScroll`.
- **Selection highlight**: `::selection` on the transparent input is invisible by default; a CSS rule gives it a visible background.
- **IME / composition**: The overlay mirrors committed text; composition preview is handled by the browser natively in the transparent textarea layer.

## Acceptance criteria

1. Field names, operators, values, bare words, quoted strings, regex patterns, negation, parens, and OR keywords each render in a distinct color.
2. Colors are readable in both light and dark mode.
3. Unrecognized field names show an error style (e.g. red + wavy underline).
4. The caret and text selection remain visible and functional.
5. Highlighting works in both single-line input and multi-line textarea modes.
6. Scroll position stays in sync between the highlight layer and the input/textarea.
7. No regressions to focus management, placeholder display, or the textarea toggle (Spec 049).
8. Performance: `lex()` runs on every keystroke; for typical query lengths (< 500 chars) this should be sub-millisecond and not observable.
