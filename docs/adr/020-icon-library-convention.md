# ADR-020: Icon Library Convention

**Status:** Accepted

## Context

The app workspace has a shared icon library at `app/src/Icons.tsx` (Heroicons outline, 24x24). However, icons were scattered: some components used the library, others inlined SVG markup directly. This led to inconsistency, duplication, and no clear guidance for developers or AI agents.

## Decision

Prefer `app/src/Icons.tsx` for all Heroicons (and similar outline icons). When an icon is needed:

1. Add it to the library rather than inlining.
2. Use Heroicons outline 24x24 as the source (https://heroicons.com).
3. Follow the existing pattern: `export function IconXxx(props: { class?: string })` with `SVG_PROPS` and `class={props.class ?? 'size-4'}`.

Branded or non-Heroicon assets (e.g. GitHub logo) may remain inline when they do not fit the shared library's style.

## Consequences

- **Positive:** Single source of truth for icon markup. Changes to stroke, viewBox, or accessibility apply once.
- **Positive:** Consistent styling via `SVG_PROPS`. Icons inherit `currentColor` and scale via Tailwind `size-*` classes.
- **Positive:** Discoverability. Developers and AI agents can scan `Icons.tsx` to see available icons.
- **Negative:** One extra step when adding a new icon — must add to the library before use.
