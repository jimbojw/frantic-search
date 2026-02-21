# ADR-014: CSS Framework

**Status:** Accepted

## Context

The app workspace is entering active UI development. We need a styling strategy that meets these requirements:

- **Mobile-optimized.** The app is mobile-first (ADR-002 chose SolidJS partly for its small runtime on mobile). The styling approach must produce responsive layouts with minimal effort.
- **Light/dark mode.** Must support `prefers-color-scheme` so the UI follows the user's OS preference without a manual toggle.
- **SolidJS-compatible.** Must work with SolidJS and plain DOM — no React dependency or framework-specific runtime.
- **Low friction.** The app's component surface is small (search input, card grid, card detail). A heavyweight component library is unnecessary.

## Decision

Use **Tailwind CSS v4** with the `@tailwindcss/vite` plugin.

Tailwind is integrated via Vite's plugin pipeline — no PostCSS config or `tailwind.config.js` is needed. The CSS entry point (`src/index.css`) contains a single `@import "tailwindcss"` directive. All styling is expressed as utility classes in JSX markup.

Dark mode uses Tailwind's `dark:` variant, which maps to `@media (prefers-color-scheme: dark)` by default — no JavaScript theme switching required.

## Alternatives Considered

### UnoCSS

An atomic CSS engine with a similar utility-class model. Lighter than Tailwind and deeply Vite-native. However, Tailwind has a vastly larger community, more documentation, and better AI-assistant support for generating correct class names. The marginal size difference is irrelevant for this app.

### Vanilla CSS (modern)

Modern CSS covers the technical requirements: custom properties for theming, `@media (prefers-color-scheme)`, nesting, container queries. Zero dependencies. However, it requires designing a responsive utility/token system from scratch, which is undifferentiated effort that Tailwind eliminates. For a project focused on search-engine correctness, minimizing frontend yak-shaving is valuable.

### Open Props

A lightweight set of CSS custom properties (design tokens) that pair with vanilla CSS. A good middle ground, but still requires writing all layout and component CSS by hand. Tailwind's utility classes are faster to iterate with.

## Consequences

- **Positive:** Dark mode and responsive design are built in — `dark:` and `sm:`/`md:`/`lg:` prefixes work immediately with no configuration.
- **Positive:** No runtime CSS-in-JS cost. Tailwind compiles to plain CSS at build time; only the classes actually used are emitted.
- **Positive:** Framework-agnostic. Tailwind operates on class names, so it works identically with SolidJS, React, or plain HTML.
- **Negative:** Utility classes in JSX can be verbose. Mitigated by extracting repeated patterns into SolidJS components.
- **Negative:** Adds `tailwindcss` and `@tailwindcss/vite` as dev dependencies.
