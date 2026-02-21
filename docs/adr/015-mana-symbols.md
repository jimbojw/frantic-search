# ADR-015: Mana Symbol Rendering

**Status:** Accepted

## Context

The app displays search results as a list of card names. To be useful, each result should also show the card's mana cost. Mana costs in the dataset are Scryfall-format strings like `{2}{W}{U}` or `{B/P}`. Rendering these as raw text is functional but ugly — MTG players expect to see the familiar colored pip icons.

We need a rendering strategy for mana symbols that works with our static SPA (ADR-003, ADR-004) and keeps the bundle simple.

## Decision

Use **mana-font** (`mana-font` on npm, v1.18.0) — Andrew Gioia's icon font for Magic: The Gathering mana symbols.

Symbols are rendered as `<i class="ms ms-w ms-cost">` elements. The font is included as a static asset via the npm package — no runtime network requests. The CSS class names map directly from Scryfall's symbol codes (e.g., `{W}` → `ms-w`, `{2}` → `ms-2`, `{B/P}` → `ms-bp`).

## Alternatives Considered

### Scryfall SVG API

Scryfall hosts symbol SVGs at `https://svgs.scryfall.io/card-symbols/{W}.svg`. This produces crisp vector icons with no bundled font. However, it requires a network request per unique symbol (or a bulk fetch + cache strategy), adds a runtime dependency on Scryfall's CDN, and complicates offline/local development. The app already fetches card data from Scryfall at build time — adding a runtime dependency on their CDN for rendering is an unnecessary coupling.

### Inline SVGs (bundled)

Download all ~60 symbol SVGs at build time and embed them in the app bundle. Eliminates the CDN dependency but requires a custom build step, increases bundle size with raw SVG markup, and means maintaining our own symbol-to-SVG mapping. More engineering effort for no user-visible benefit over an icon font.

### Plain text

Render `{2}{W}{U}` as-is. Zero dependencies. But the result is visually noisy and unfamiliar — players expect colored pips.

## Consequences

- **Positive:** Symbols render as scalable font glyphs — they work at any size, support CSS color/shadow, and require no image requests at runtime.
- **Positive:** The font covers all standard mana symbols, including hybrid, Phyrexian, generic, snow, and colorless.
- **Positive:** MIT-licensed CSS/Sass, SIL OFL 1.1 font. Compatible with this project's Apache-2.0 license.
- **Negative:** Adds a font file (~100 KB) to the bundle. Acceptable for a SPA that already ships ~8 MB of card data.
- **Negative:** mana-font lags behind the latest sets by a few weeks/months. If a brand-new mana symbol is introduced, the font may not have it immediately. The text fallback (`{X}`) is acceptable in that case.
