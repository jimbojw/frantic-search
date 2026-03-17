# Spec 133: In-App Documentation Navigation

**Status:** Draft

**Depends on:** Spec 132 (Docs Infrastructure), Spec 013 (URL State), Spec 014 (Syntax Help Overlay), Spec 083 (MenuDrawer)

**Referenced by:** Spec 134 (Docs Content Migration)

**GitHub Issue:** [#141](https://github.com/jimbojw/frantic-search/issues/141)

## Goal

Provide navigation for the in-app documentation suite: URL structure, routing integration, sidebar, breadcrumbs, prev/next pagination, and entry points. Docs use the same query-param pattern as the rest of the app — no router library required.

## Background

The app manages state via URL query parameters (`?help`, `?card=`, `?report`, `?list`). Docs follow the same pattern to avoid introducing a router and to keep history/scroll behavior unified with Spec 013.

## URL Structure

### Decision: Query params for docs

| URL | View | Description |
|-----|------|-------------|
| `?doc` | Docs hub | Param present, no value — landing page with quadrant overview |
| `?doc=quadrant/slug` | Specific article | e.g., `?doc=reference/syntax`, `?doc=tutorials/getting-started` |

### Query param preservation

When navigating to docs, preserve `q` (and `q2` if Dual Wield) so returning to search restores the user's query.

- Example: `?doc=reference/syntax&q=t:creature` — user can close docs and land back on their search.
- URLs remain shareable: `https://example.com/?doc=reference/syntax` works.

## Routing Integration

### View type

Extend `View` in `app-utils.ts`:

```typescript
export type View = 'search' | 'help' | 'card' | 'report' | 'lists' | 'docs'
```

### parseView logic

Add docs detection **before** other views (docs takes precedence when `doc` param is present):

```typescript
export function parseView(params: URLSearchParams): View {
  if (params.has('doc')) return 'docs'
  if (params.has('card')) return 'card'
  // ... rest unchanged
}
```

### parseDocParam helper

```typescript
/** Returns doc param value (e.g., "reference/syntax") or null for hub. */
export function parseDocParam(params: URLSearchParams): string | null {
  return params.get('doc') ?? null
}
```

When `params.has('doc')` is true but `params.get('doc')` is empty string or absent, treat as hub (`?doc` with no value).

### help param migration

- **During transition:** `?help` continues to work. Redirect or treat as `?doc=reference/syntax` (preserve q, q2).
- **Long term:** `?help` may be deprecated in favor of `?doc=reference/syntax`. Spec 014 entry points are updated to use the new URL.

## Docs Layout Component

Create `app/src/docs/DocsLayout.tsx` — the shell for all doc views.

### Article Loading Strategy

- Use dynamic `import()` of `.mdx` modules: `import(\`./docs/${docParam}.mdx\`)` or a pre-built map from docParam to import path.
- Each `.mdx` file compiles to a module with `default` export (the component).
- DocsLayout wraps the rendered article with the MDX provider so custom components resolve when present.
- For hybrid (syntax as `.tsx`): syntax is imported normally; other articles use MDX dynamic imports.

### Structure

- **Sidebar** (left): Collapsible on narrow viewports. Structure mirrors folder tree: Tutorials, How-To, Reference, Explanation, each with child links. Generated from `DOC_INDEX` (Spec 132). Active route highlighted.
- **Content area** (right): Renders the active article component or the hub. DocsLayout passes the MDX provider (component map) when rendering MDX articles.
- **Breadcrumbs** (top of content): `Docs > Quadrant > Article` (e.g., `Docs > Reference > Syntax Guide`). Two levels initially.
- **Prev/Next** (footer of each article): "← Previous: [title]" and "Next: [title] →".

### Sidebar

- Collapsible on narrow viewports (e.g., `< 768px`). Toggle button or slide-out drawer.
- Links use `?doc=quadrant/slug` — preserve `q` and `q2` when building URLs.
- Active link: match `parseDocParam(params)` to `entry.docParam`.

### Breadcrumbs

- Format: `Docs > Quadrant > Article`
- Quadrant label: "Tutorials" | "How-To" | "Reference" | "Explanation" (human-readable)
- Article: from `DOC_INDEX` entry title
- Hub view: `Docs` only (no quadrant/article)

### Prev/Next pagination

- **Diátaxis principle:** Prev/Next are restricted **within the current quadrant only**. A user in "learning mode" (Tutorial) should not click Next and land in "information-seeking mode" (Reference).
- First article in a quadrant: no Previous link.
- Last article in a quadrant: no Next link, or "Next" links back to docs hub (`?doc`).
- Use `prev` and `next` from `DOC_INDEX` (Spec 132).

## Entry Points

| Entry point | Behavior |
|-------------|----------|
| **`?` icon on search input** | Navigates to `?doc=reference/syntax` (direct to syntax — most common need). Add `IconQuestionMarkCircle` or similar if not present. |
| **Syntax page "Browse all docs"** | Link at top of syntax article → hub (`?doc`). |
| **Menu drawer** | Add "Documentation" item (or rename "Syntax Help" to "Documentation") linking to hub (`?doc`). Keep "Syntax Help" as quick link to `?doc=reference/syntax` or consolidate — see design choice below. |

**Design choice:** The MenuDrawer currently has "Syntax Help" in the sticky footer. Options:
- (A) Rename to "Documentation" and link to hub. Power users lose one-click to syntax.
- (B) Add "Documentation" as new item linking to hub; keep "Syntax Help" linking to `?doc=reference/syntax`.
- (C) Single "Documentation" item → hub; syntax is reachable from hub and from `?` icon on search input.

Recommendation: **(B)** — Documentation (hub) + Syntax Help (direct). Preserves current MenuDrawer behavior while adding hub discoverability.

### QueryBreakdown / UnifiedBreakdown

Per Spec 014, the breakdown has a "Syntax help" link. Update to navigate to `?doc=reference/syntax` (unchanged intent).

## Navigation Helpers

```typescript
function navigateToDocs(docParam?: string) {
  // docParam undefined or null → hub (?doc)
  // docParam "reference/syntax" → ?doc=reference/syntax
  // Preserve q, q2 from current URL
}

function navigateToSearch() {
  // Close docs, return to search. Preserve q, q2.
  // Use history.back() or explicit URL construction.
}
```

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/app-utils.ts` | Add `'docs'` to View; update parseView; add parseDocParam |
| `app/src/app-utils.test.ts` | Tests for doc param parsing, parseView with doc |
| `app/src/App.tsx` | Add docs view branch; wire navigateToDocs; handle `?help` → `?doc=reference/syntax` |
| `app/src/docs/DocsLayout.tsx` | New — sidebar, breadcrumbs, prev/next, content area; pass MDX provider/component map when rendering article |
| `app/src/docs/DocsHub.tsx` | New — hub landing page (quadrant overview) |
| `app/src/MenuDrawer.tsx` | Add "Documentation" item → hub; keep or update "Syntax Help" |
| `app/src/Icons.tsx` | Add IconQuestionMarkCircle if needed for `?` icon |
| `app/src/DualWieldLayout.tsx` | Add `?` icon near search input; pass navigateToDocs |
| `app/src/UnifiedBreakdown.tsx` | Update "Syntax help" link to use navigateToDocs |
| `app/src/SearchContext.tsx` | Add navigateToDocs to context if needed by breakdown |

## Acceptance Criteria

1. `?doc` shows the docs hub. `?doc=reference/syntax` shows the syntax article.
2. `parseView` returns `'docs'` when `doc` param is present.
3. `q` and `q2` are preserved when navigating to/from docs.
4. Sidebar lists all quadrants and articles; active route highlighted.
5. Breadcrumbs show `Docs > Quadrant > Article` on article pages.
6. Prev/Next links work within quadrant only; first has no Prev, last has no Next (or Next → hub).
7. `?` icon on search input navigates to `?doc=reference/syntax`.
8. Menu drawer has "Documentation" (hub) and "Syntax Help" (syntax) or equivalent.
9. "Syntax help" in UnifiedBreakdown navigates to `?doc=reference/syntax`.
10. `?help` continues to work (redirect or alias to `?doc=reference/syntax`).
