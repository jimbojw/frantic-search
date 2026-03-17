# Spec 132: In-App Documentation Infrastructure

**Status:** Implemented

**Depends on:** ADR-008 (Documentation Strategy)

**Referenced by:** Spec 133 (Docs Navigation), Spec 134 (Docs Content Migration)

**GitHub Issue:** [#141](https://github.com/jimbojw/frantic-search/issues/141)

## Goal

Establish the folder structure, authoring format, and hand-maintained index for the in-app documentation suite. In-app docs are separate from contributor-facing `docs/` — they live in the app bundle, are authored in MDX (with optional TSX for component-heavy articles), and follow the Diátaxis framework (Tutorials, How-To, Reference, Explanation).

## Background

The app currently has a single syntax help page (`SyntaxHelp.tsx`). Issue #141 expands this into a full documentation hub. This spec defines the infrastructure before navigation (Spec 133) and content migration (Spec 134).

## Directory Structure

```
app/src/docs/
├── index.ts              # Hand-maintained; see "Adding or Modifying Documentation" below
├── components/           # Shared doc components
│   └── MdxProvider.tsx   # Minimal provider for MDX custom components
├── tutorials/
│   └── getting-started.mdx
├── how-to/
│   └── budget-alternatives.mdx
├── reference/
│   └── syntax.tsx        # Migrated from SyntaxHelp.tsx (Spec 134); TSX if hybrid
└── explanation/
    └── engine-overview.mdx
```

The folder structure **explicitly mirrors** the four Diátaxis quadrants. No subcategories initially; extend if needed later.

## Authoring Format

**Decision: MDX for prose-heavy articles; TSX allowed for component-heavy reference.**

- Use `@mdx-js/rollup` with `jsxImportSource: 'solid-js'`. Client-only SPA simplifies integration (no SSR concerns).
- Prose articles (Tutorials, How-To, Explanation) authored in `.mdx` with YAML frontmatter.
- Reference/syntax may remain `.tsx` if component density makes MDX unwieldy (hybrid approach); otherwise `.mdx` with wrapper components.

## Vite Configuration

- **Dependencies:** `@mdx-js/rollup`, `remark-frontmatter`, `remark-gfm` (optional, for GFM tables)
- **Plugin:** Add `@mdx-js/rollup` to `app/vite.config.ts` before `vite-plugin-solid`. Use `enforce: 'pre'` so MDX runs before Solid:
  ```js
  { ...mdx({
    jsxImportSource: 'solid-js',
    remarkPlugins: [remarkFrontmatter],
    providerImportSource: './src/docs/components/MdxProvider',
  }), enforce: 'pre' }
  ```

## MDX Provider

- Create `app/src/docs/components/MdxProvider.tsx` (or equivalent) that exports the provider API expected by the chosen MDX runtime (e.g. `solid-mdx` or `@mdx-js/rollup` with Solid). Use industry-standard integration; exact API to be determined at implementation time.
- Custom components (e.g. interactive examples) can be added to the provider as needed; defer to later specs when they are required.

## Hand-Maintained Index

The docs index is **not** generated. It is maintained by hand in `app/src/docs/index.ts`. Document authoring is AI-driven; explicit guidance below ensures AI agents update the index correctly when adding or modifying docs.

### Index Structure

```typescript
// SPDX-License-Identifier: Apache-2.0
// Hand-maintained — update when adding, removing, or reordering articles

export type DocQuadrant = 'tutorials' | 'how-to' | 'reference' | 'explanation'

export interface DocEntry {
  id: string
  docParam: string   // Value for ?doc= (e.g., "reference/syntax")
  title: string
  quadrant: DocQuadrant
  prev?: string     // docParam of previous article in same quadrant
  next?: string     // docParam of next article in same quadrant
}

export const DOC_INDEX: DocEntry[] = [
  // tutorials: one article → no prev/next
  { id: 'getting-started', docParam: 'tutorials/getting-started', title: 'Getting Started', quadrant: 'tutorials' },
  // how-to: one article → no prev/next
  { id: 'budget-alternatives', docParam: 'how-to/budget-alternatives', title: 'Find Budget Alternatives', quadrant: 'how-to' },
  // reference: one article → no prev/next
  { id: 'syntax', docParam: 'reference/syntax', title: 'Syntax Guide', quadrant: 'reference' },
  // explanation: one article → no prev/next
  // (With multiple per quadrant: first omits prev, last omits next, middle has both)
  { id: 'engine-overview', docParam: 'explanation/engine-overview', title: 'Query Engine Overview', quadrant: 'explanation' },
]
```

**Rules:**
- Entries are ordered by quadrant (tutorials → how-to → reference → explanation), then alphabetically within quadrant.
- `prev` and `next` link only within the same quadrant.
- First article in a quadrant: omit `prev`.
- Last article in a quadrant: omit `next`.

### Article Metadata

**MDX:** YAML frontmatter at top of file:

```yaml
---
title: Getting Started
---
```

**TSX (if hybrid):** Export `meta` object:

```typescript
export const meta = { title: 'Syntax Guide' }
```

## Adding or Modifying Documentation

Documentation changes are AI-driven. When adding or modifying user-facing docs, follow this guidance:

### Adding a new article

1. **Create the source file** in the appropriate quadrant directory:
   - `app/src/docs/tutorials/` — Tutorials
   - `app/src/docs/how-to/` — How-To guides
   - `app/src/docs/reference/` — Reference material
   - `app/src/docs/explanation/` — Conceptual explanations

2. **Choose format:**
   - **MDX** (`.mdx`): For prose-heavy articles. Add YAML frontmatter with `title`.
   - **TSX** (`.tsx`): For component-heavy articles (e.g. syntax with tables). Export `meta: { title: string }`.

3. **Add entry to `app/src/docs/index.ts`:** Add a `DocEntry` to the `DOC_INDEX` array. Entries must be in quadrant order (tutorials, how-to, reference, explanation), then alphabetical within quadrant. Compute `prev` and `next` for each entry from sibling order within the same quadrant.
   - `id`: filename without extension
   - `docParam`: `quadrant/id` (e.g. `tutorials/getting-started`)
   - `title`: from frontmatter or meta
   - `quadrant`: directory name
   - `prev`: docParam of previous article in same quadrant, or omit for first
   - `next`: docParam of next article in same quadrant, or omit for last

4. **Draft articles:** Articles that exist but are not yet in the index do not appear in the app. Add to the index when ready to publish.

### Modifying an existing article

1. Edit the source file.
2. If the title changes, update the corresponding entry in `app/src/docs/index.ts`.
3. If the article is renamed or moved, update the index entry (`id`, `docParam`, `quadrant`) and recompute `prev`/`next` for affected quadrants.

### Removing an article

1. Delete the source file.
2. Remove the entry from `DOC_INDEX` in `app/src/docs/index.ts`.
3. Recompute `prev` and `next` for remaining entries in that quadrant.

## Shared Components

- **MdxProvider** — minimal provider that supplies the component map to compiled MDX. Use industry-standard MDX + Solid integration; exact API determined at implementation time.

Other shared components (breadcrumbs, prev/next links) may be added in Spec 133. Interactive components (e.g. clickable query examples) may be added in later specs when needed.

## Scope of Changes

| File | Change |
|------|--------|
| `app/package.json` | Add `@mdx-js/rollup`, `remark-frontmatter` |
| `app/vite.config.ts` | Add MDX plugin with `jsxImportSource: 'solid-js'`, `enforce: 'pre'` |
| `app/src/docs/index.ts` | New — hand-maintained, git-tracked |
| `app/src/docs/components/MdxProvider.tsx` | New — component map for MDX |

## Acceptance Criteria

1. `app/src/docs/` exists with `tutorials/`, `how-to/`, `reference/`, `explanation/`, and `components/` subdirectories.
2. MDX plugin configured in Vite with `jsxImportSource: 'solid-js'` and `enforce: 'pre'`.
3. `app/src/docs/index.ts` exists with `DocEntry` type and `DOC_INDEX` array.
4. Index has correct shape: `id`, `docParam`, `title`, `quadrant`, `prev`, `next`.
5. `prev` and `next` are computed within quadrant only (no cross-quadrant links).
6. MDX provider supplies the component map to compiled MDX.
