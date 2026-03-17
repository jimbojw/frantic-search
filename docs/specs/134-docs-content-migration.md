# Spec 134: In-App Documentation Content Migration

**Status:** Draft

**Depends on:** Spec 132 (Docs Infrastructure), Spec 133 (Docs Navigation), Spec 098 (Syntax Help Content)

**GitHub Issue:** [#141](https://github.com/jimbojw/frantic-search/issues/141)

## Goal

Migrate the existing SyntaxHelp content to the new docs structure and add placeholder articles for the other three Diátaxis quadrants. This validates the layout and provides a complete docs hub at launch.

## Background

`app/src/SyntaxHelp.tsx` is the current syntax reference. It will become `app/src/docs/reference/syntax.tsx` (hybrid) or `syntax.mdx` (full MDX). Spec 098 defines the canonical content; the migrated component must satisfy Spec 098. The other three quadrants (Tutorials, How-To, Explanation) use MDX with YAML frontmatter.

## Reference — Syntax Guide (Migration)

### Two options

**Option A — Full MDX:** Migrate to `syntax.mdx`. Extract table-rendering into components (`SyntaxTable`, `OperatorsTable`, etc.). Data stays in `docs/reference/syntax-data.ts`; MDX imports and passes to components.

**Option B — Hybrid (recommended):** Keep `syntax.tsx`. The syntax doc is heavily component-driven (~350 lines, 6+ data arrays, multiple table types). TSX is a better fit. Spec explicitly allows: "Reference/syntax may remain TSX."

### Source and destination

- **Source:** `app/src/SyntaxHelp.tsx`
- **Destination:** `app/src/docs/reference/syntax.tsx` (hybrid) or `syntax.mdx` + `syntax-data.ts` (full MDX)

### Migration steps (hybrid)

1. Move `SyntaxHelp.tsx` content to `app/src/docs/reference/syntax.tsx`. Keep the inline `ExampleButton` (or equivalent) as a local component in the same file — do not extract to shared components yet.
2. Add `meta` export: `export const meta = { title: 'Syntax Guide' }`.
3. Add "Browse all docs" link at top of content → `?doc` (hub).
4. Remove `app/src/SyntaxHelp.tsx` (or keep as re-export during transition, then delete).
5. Update `App.tsx` and all consumers to import from `docs/reference/syntax` or render via DocsLayout.
6. Add entry to `app/src/docs/index.ts` per Spec 132 "Adding or Modifying Documentation."

### Spec 098 relationship

The Reference doc at `docs/reference/syntax.tsx` (hybrid) or `docs/reference/syntax.mdx` (full MDX) is the **canonical** in-app implementation. Spec 098 remains the content spec for contributors — it defines what the syntax doc must include.

Update Spec 098 to state: "The in-app Reference doc at `docs/reference/syntax.tsx` is the implementation; this spec defines its required content." (Or `syntax.mdx` with `syntax-data.ts` if full MDX.)

### Props

The syntax component receives `onSelectExample: (q: string) => void` from DocsLayout. DocsLayout obtains this from the app's `navigateToQuery` (or equivalent) so clickable examples populate the search bar and return to search.

## Placeholder Articles

Create minimal but real articles for the other three quadrants. All use `.mdx` with YAML frontmatter. Content should be substantive enough to validate layout and navigation, not lorem ipsum.

**For each new article:** Add the corresponding entry to `app/src/docs/index.ts` per Spec 132 "Adding or Modifying Documentation."

### Tutorials — Getting Started

**File:** `app/src/docs/tutorials/getting-started.mdx`

**Content:** Markdown-first with frontmatter:

```mdx
---
title: Getting Started
---

# Getting Started

1. Open the app.
2. Type a query in the search field (e.g. `t:creature`).
3. Use the `?` icon for syntax help when you need it.
4. Try an example from the syntax guide (e.g. tap `c:green` to try it).
5. Optionally: open the Menu to filter by format, layout, etc.
```

### How-To — Find Budget Alternatives

**File:** `app/src/docs/how-to/budget-alternatives.mdx`

**Content:** Markdown with steps and code blocks:

```mdx
---
title: Find Budget Alternatives
---

# Find Budget Alternatives

**Goal:** Find cards under a certain price.

1. Use the `usd` field (or `$` alias) with a comparison operator.
2. Example: `usd<5` finds printings under $5.
3. Combine with other filters: `t:creature usd<5` for cheap creatures.
4. Use `usd=null` to find printings with no price data.

**Tip:** Use the Menu's PRICES section for one-tap chips.
```

### Explanation — Engine Overview

**File:** `app/src/docs/explanation/engine-overview.mdx`

**Content:** Prose with bullet points:

```mdx
---
title: Query Engine Overview
---

# Query Engine Overview

- Frantic Search runs the query engine entirely in the browser (client-side).
- No server round-trips — filtering happens on every keystroke.
- The search uses a bit-packed data representation (ADR-007) and a bitmask-per-node AST (ADR-009).
- The query is parsed, evaluated in a WebWorker, and results are streamed back to the main thread.
- Data is loaded from processed columnar files (JSON, gzip-compressed).
```

## Docs Hub

**File:** `app/src/docs/DocsHub.tsx`

**Content:** Landing page with quadrant overview:

- Four sections: Tutorials, How-To, Reference, Explanation.
- Each section has a brief description and links to its articles.
- Links use `?doc=quadrant/slug` — preserve q, q2.

**Example structure:**

```
Documentation

Tutorials — Learn how to use Frantic Search
  • Getting Started

How-To — Find answers to specific questions
  • Find Budget Alternatives

Reference — Look up syntax and features
  • Syntax Guide

Explanation — Understand how it works
  • Query Engine Overview
```

## Article Component Contract

**MDX articles:** YAML frontmatter for metadata; `default` export is the compiled component. DocsLayout uses dynamic `import()` of `.mdx` modules and passes the MDX provider.

**TSX articles (if hybrid):** Export `meta: { title: string }`; default export is the component. Imported normally.

DocsLayout dynamically loads the article based on `parseDocParam(params)`.

**Loading strategy:** Dynamic `import()` of `.mdx` modules based on docParam. Map docParam to import path (e.g. `reference/syntax` → `./reference/syntax.mdx` or `./reference/syntax` for TSX). For hybrid, syntax as `.tsx` is imported normally; other articles use MDX imports.

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/docs/reference/syntax.tsx` | New — migrated from SyntaxHelp (hybrid) |
| `app/src/docs/reference/syntax-data.ts` | New — if full MDX: extract FACE_FIELDS, etc. here |
| `app/src/docs/tutorials/getting-started.mdx` | New — Markdown + frontmatter |
| `app/src/docs/how-to/budget-alternatives.mdx` | New — Markdown + frontmatter |
| `app/src/docs/explanation/engine-overview.mdx` | New — Markdown + frontmatter |
| `app/src/docs/index.ts` | Add entries for all articles (syntax + placeholders) |
| `app/src/docs/DocsHub.tsx` | New — hub landing page |
| `app/src/SyntaxHelp.tsx` | Remove or re-export (after migration) |
| `app/src/App.tsx` | Use DocsLayout for docs view; remove direct SyntaxHelp render |
| `docs/specs/098-syntax-help-content.md` | Update implementation note: docs/reference/syntax.tsx is canonical |

## Acceptance Criteria

1. `SyntaxHelp.tsx` content is migrated to `docs/reference/syntax.tsx` with no content loss.
2. Spec 098 content requirements are satisfied by the migrated syntax doc.
3. "Browse all docs" link appears at top of syntax article → hub.
4. Tutorials, How-To, and Explanation each have at least one placeholder article.
5. Prose articles use `.mdx` with YAML frontmatter.
6. Placeholder articles have real, substantive content (not placeholders).
7. DocsHub displays all four quadrants with links to articles.
8. `app/src/docs/index.ts` contains entries for syntax and all placeholder articles.
9. `app/src/SyntaxHelp.tsx` is removed; all imports updated.
10. Spec 098 is updated to reference `docs/reference/syntax.tsx` as the implementation.
11. Syntax reference may be `.tsx` (hybrid) or `.mdx` with wrapper components.
