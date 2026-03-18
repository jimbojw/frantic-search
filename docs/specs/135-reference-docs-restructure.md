# Spec 135: Reference Documentation Restructure

**Status:** In Progress

**Depends on:** Spec 132 (Docs Infrastructure), Spec 133 (Docs Navigation), Spec 134 (Docs Content Migration), Spec 098 (Syntax Help Content)

**Referenced by:** (future Spec 098 update)

## Goal

Break the monolithic syntax reference into a granular, nested structure of MDX files organized by query-language component. Each filter field, modifier, composition rule, and special term gets its own document. This improves discoverability, maintainability, and alignment with Diátaxis ("reference should mirror the structure of the machinery").

## Background

Spec 134 migrated `SyntaxHelp.tsx` to `docs/reference/syntax.tsx` — a single hybrid TSX file with flat tables for fields, operators, combining, modifiers, regex, exclusives, and divergences. This is a holdover from an earlier at-a-glance syntax help page.

The query language has grown. Per field we document: canonical name, aliases, expected values, operators, operator behavior, allowed values, term behavior, and domain (face vs printing). Outside filtering we have `include:extras`, `unique:` aggregation, `view:` modes. Composition covers AND, OR, NOT (leaf-aware), and pinned queries. Sorting has the default "frantic" sort plus field-specific `sort:` terms. Special terms include `my:list` and `#tag` category filtering. Syntax-adjacent UX — query highlighting (functional colors), error behavior (red + squiggly, ignored terms), and zero-results styling — also merits reference documentation. Separately, the My List feature (paste decklists, transform formats) will need its own reference for import/export syntax.

A single table-based page cannot adequately document this. Industry practice (Stripe, OpenAPI, MDN) and Diátaxis recommend: structure mirrors product; one concept per page; consistent templates.

## Design Principles

1. **Mirror the query language** — Directory structure reflects the logical components: fields, modifiers, composition, sorting, special.
2. **One concept per file** — Each field, modifier, or rule is a linkable unit. Easier to maintain and cross-reference from How-To/Explanation.
3. **Standard patterns** — Per-field docs use a consistent template (canonical, aliases, domain, operators, values).
4. **MDX for prose** — New reference articles use `.mdx`. TSX retained only where heavy interactivity is required (e.g. a future syntax playground).

## Directory Structure

```
app/src/docs/reference/
├── index.mdx                    # Reference quadrant hub; ?doc=reference; links to sections + cheat sheet
├── fields/
│   ├── index.mdx                # Fields overview: face vs printing, operator summary
│   ├── face/
│   │   ├── name.mdx
│   │   ├── oracle.mdx
│   │   ├── type.mdx
│   │   ├── color.mdx
│   │   ├── identity.mdx
│   │   ├── power.mdx
│   │   ├── toughness.mdx
│   │   ├── loyalty.mdx
│   │   ├── defense.mdx
│   │   ├── mana-value.mdx
│   │   ├── mana.mdx
│   │   ├── legal.mdx
│   │   ├── banned.mdx
│   │   ├── restricted.mdx
│   │   ├── is.mdx
│   │   ├── kw.mdx
│   │   ├── otag.mdx
│   │   ├── atag.mdx
│   │   ├── edhrec.mdx
│   │   ├── salt.mdx
│   │   └── my.mdx
│   └── printing/
│       ├── set.mdx
│       ├── rarity.mdx
│       ├── usd.mdx
│       ├── collectornumber.mdx
│       ├── frame.mdx
│       ├── year.mdx
│       ├── date.mdx
│       ├── game.mdx
│       └── in.mdx
├── modifiers/
│   ├── include-extras.mdx        # include:extras, **
│   ├── unique.mdx                # unique:cards|prints|art, ++, @@
│   └── view.mdx                  # view:, v:, display: + Scryfall mapping
├── composition/
│   ├── and-or.mdx                # Default AND, explicit OR
│   ├── not.mdx                   # Leaf-aware NOT; -price>10 ⟺ price<=10; null exclusion
│   └── pinned.mdx                # Pinned AND live = effective query
├── sorting/
│   ├── overview.mdx              # Default "frantic" sort; -sort:field reverses direction
│   └── sort-fields.mdx           # sort:field table (field, aliases, default dir, domain, nulls)
├── special/
│   ├── bare-regex.mdx            # /pattern/ searches name, oracle, type; Frantic Search exclusive
│   ├── my-list.mdx               # my:list, my:trash, list semantics
│   └── tag-filter.mdx            # #tag for deck/category filtering
├── feedback/
│   └── query-feedback.mdx        # Syntax highlighting, error behavior, zero-results styling
├── scryfall/
│   ├── differences.mdx            # Divergences; known missing (new:, partial is:); links to per-field
│   └── gaps.mdx                   # Optional; split from differences.mdx if known-missing list grows large
├── lists/
│   └── index.mdx                 # Deck list: paste, transform formats; import/export syntax
└── syntax.mdx                    # Cheat sheet; ?help and ?doc=reference/syntax; links to each section
```

## docParam Format

Extend docParam to support multi-segment paths. Current format is `quadrant/slug` (e.g. `reference/syntax`). New format allows `reference/path/to/article` (e.g. `reference/fields/face/name`).

- **Loader:** `getDocLoader(docParam)` maps `reference/fields/face/name` → `import('./reference/fields/face/name.mdx')`. Path segments match directory structure. Use `import.meta.glob('./reference/**/*.mdx')` to build the loader map from the filesystem — adding a new article then only requires updating `DOC_INDEX`, not the loader.
- **Index:** `DOC_INDEX` entries use full docParam. Sidebar can show flat list or hierarchical structure (implementation choice).
- **URL:** `?doc=reference/fields/face/name` — no change to URL semantics.

## Per-Field Template

Each field MDX follows a consistent structure. Diátaxis: "adopt standard patterns."

```markdown
---
title: <Field Name>
---

# <field>

**Canonical:** `field`  
**Aliases:** `a`, `b` (or — if none)  
**Domain:** Face | Printing

## Operators

| Operator | Behavior | Example |
|----------|----------|---------|
| `:` | ... | `field:value` |
| `=` | ... | `field=value` |
| (etc. — only operators this field supports) |

## Allowed values

Description of valid values, value format, special cases (e.g. `null`, percentile).

## Notes

- Field-specific behavior (e.g. percentile semantics, null handling).
- Frantic Search exclusives for this field.
```

Fields that share behavior (e.g. `otag` and `atag` as tags in different domains) may be documented in a single file with clear subsections, or in separate files with cross-links.

Per-field docs may include a **Scryfall** or **Differences** subsection where the field diverges from Scryfall (e.g. `usd=null`, name range, percentile semantics). This subsection may also document **partial support** (known missing values, e.g. `is:` keywords we lack) or **missing fields** (Scryfall supports it; Frantic Search does not yet).

## Reference index vs cheat sheet

Two distinct entry points:

- **`reference/index.mdx`** — Reference quadrant hub. Shown when navigating to `?doc=reference` (e.g. from DocsHub). Overview with links to each section (fields, modifiers, composition, etc.) and to the cheat sheet.
- **`reference/syntax.mdx`** — Cheat sheet. Entry point for `?help` and `?doc=reference/syntax`. Compact quick-reference table (field names + aliases, operators) plus links to granular docs. Replaces the monolithic `syntax.tsx` as the main syntax entry.

Both link out to the granular docs. The cheat sheet may retain interactive examples (clickable queries); if so, DocsLayout passes `onSelectExample` when rendering `reference/syntax`.

### Bare regex

Bare regex (`/pattern/`) is a Frantic Search–exclusive search behavior: it matches against card name, oracle text, and type line without a field prefix. It lives in `reference/special/bare-regex.mdx`. Field-prefixed regex (e.g. `name:/bolt/`, `o:/trample/`) is documented in the relevant field articles. The cheat sheet includes a compact regex section with links to `bare-regex.mdx` and field docs.

## DocsHub and reference quadrant

DocsHub (`?doc`) is the main docs landing page. When the user clicks the **Reference** section:

- **Primary link:** `?doc=reference` — navigates to the reference quadrant hub (`reference/index.mdx`). The hub lists sections (fields, modifiers, composition, etc.) and links to the cheat sheet.
- **Optional quick link:** DocsHub may also show a direct "Syntax cheat sheet" link to `?doc=reference/syntax` for users who want one-click access to the quick reference.

The Reference section does *not* list all 50+ reference articles. Users reach granular articles via the reference hub, the cheat sheet, or the sidebar (when viewing any reference article).

## Scryfall divergences

Per-field docs include Scryfall notes when relevant. A high-level `scryfall/differences.mdx` provides a cross-cutting summary and links to field-specific sections. Per-field is primary; the overview supports users scanning "what's different" from Scryfall.

## Known missing features

Frantic Search may not yet support all Scryfall features. Document known gaps when discovered — no requirement for comprehensive coverage.

**Where to document:**
- **Per-field:** In the Scryfall/Differences subsection, note partial support (e.g. `is:` — we support a subset of keywords; document which are missing) or missing fields (Scryfall has it; we don't).
- **Cross-cutting:** `scryfall/differences.mdx` includes a "Known missing" section listing Scryfall features we don't support. Add `scryfall/gaps.mdx` if the list grows large.

**Examples:**
- `is:` — Partial support. Some Scryfall `is:` values are not yet implemented. Document missing values as discovered.
- `new:` — Not supported. Scryfall's `new:rarity` finds reprint cards printed at a new rarity for the first time (e.g. `new:mythic`). Use `in:rarity` for cards that have ever been printed at that rarity. Frantic Search has no equivalent.

## Modifiers, Composition, Sorting, Special

Each modifier/composition/sorting/special article documents:

- **Purpose** — What it does.
- **Syntax** — Canonical form, aliases (e.g. `++` → `unique:prints`).
- **Behavior** — How it affects results or evaluation.
- **Examples** — Succinct, illustrative (not instructional).
- **Scryfall mapping** — Where applicable (e.g. `view.mdx`: `display:checklist` → `view:slim`).

### Key content by article

| Article | Key content |
|---------|-------------|
| `include-extras.mdx` | `include:extras`, `**`; includes acorn, silver-border, etc.; default playable filter when absent |
| `unique.mdx` | `unique:cards`, `unique:prints` (++), `unique:art` (@@); aggregation semantics |
| `view.mdx` | `view:slim|detail|images|full`, `v:`, `display:`; Scryfall `display:` → `view:` mapping |
| `and-or.mdx` | Implicit AND; explicit `OR`; parentheses for grouping |
| `not.mdx` | `-term`; leaf-aware: `-price>10` ⟺ `price<=10`; both exclude nulls |
| `pinned.mdx` | Pinned query AND live query = effective query; localStorage persistence |
| `sorting/overview.mdx` | Default "frantic" sort: session-stable random + query-seeded; bare-word prefix boost; `-sort:field` reverses direction (NOT inverts default asc↔desc) |
| `sort-fields.mdx` | `sort:field`; table of field, aliases, default dir, domain, null handling; last-wins (right-to-left) |
| `bare-regex.mdx` | `/pattern` searches name, oracle text, type line; Frantic Search exclusive; field-prefixed regex (e.g. `name:/bolt/`) documented in field articles |
| `my-list.mdx` | `my:list`, `my:trash`; list semantics; face vs printing domain from list contents |
| `tag-filter.mdx` | `#tag`; matches zone, tags, collection_status; substring-based |
| `query-feedback.mdx` | Syntax highlighting, error behavior, zero-results styling (see below) |
| `differences.mdx` | Scryfall vs Frantic Search behavioral divergences; known missing features (e.g. `new:`, partial `is:`); links to per-field sections |
| `lists/index.mdx` | Deck list: paste decklists, transform formats; import/export syntax (see below) |

### Lists (deck list)

The My List feature lets users paste decklists and transform them into other formats. `reference/lists/` is reserved for this reference documentation. Content is separate from the query syntax (which is about the search bar).

`lists/index.mdx` covers: supported import formats (Arena, Moxfield, Archidekt, MTGGoldfish, and others) and their line syntax; supported export formats; section headers; metadata markers (tags, collection status, finish). Expand to `import-formats.mdx`, `export-formats.mdx` if the content grows.

### Sort fields structure

Sort fields (~10 canonical: name, mv, color, power, toughness, edhrec, salt, usd, date, rarity) are simpler than filter fields — no operators or allowed values, just default direction, domain, and null handling. One `sort-fields.mdx` with a table (field, aliases, default dir, domain, nulls).

### Query feedback (syntax-adjacent UX)

`feedback/query-feedback.mdx` documents how the interface surfaces query state to the user:

| Topic | Content |
|-------|---------|
| **Syntax highlighting** | The query input uses functional colors to distinguish field names, values, operators, etc. Specific colors are implementation-defined; doc describes the semantic categories (e.g. field, value, operator, error). |
| **Error behavior** | Errors (e.g. invalid regex `o:/bad regex [/`) are highlighted in red with squiggly underline. Erroneous terms are ignored during evaluation — the query runs as if those terms were absent. |
| **Zero results** | When an AST node yields zero matches, the breakdown shows this with special styling so the user can quickly spot potential issues (e.g. a typo in a field value). |

## Migration Phases

### Phase 1: Structure and index

1. Create the directory structure (empty or placeholder files).
2. Add `reference/index.mdx` — reference quadrant hub with links to sections (and placeholder link to cheat sheet).
3. Extend `doc-loader.ts` to support multi-segment docParams (use `import.meta.glob`; see docParam Format).
4. Extend `DOC_INDEX` for multi-segment docParams; update DocsLayout/sidebar to render reference articles (flat list initially).

### Phase 2: Modifiers, composition, sorting, feedback

1. Create `modifiers/include-extras.mdx`, `unique.mdx`, `view.mdx` from current Display modifiers table.
2. Create `composition/and-or.mdx`, `not.mdx`, `pinned.mdx` from Combining + NOT semantics.
3. Create `sorting/overview.mdx`, `sort-fields.mdx`.
4. Create `feedback/query-feedback.mdx` — syntax highlighting, error behavior, zero-results styling.
5. Add all entries to `DOC_INDEX`. Loader discovers articles via glob (Phase 1).

### Phase 3: Per-field docs

1. Create field MDX files, starting with high-traffic fields: `name`, `type`, `color`, `usd`, `set`, `legal`, `is`.
2. Populate using Spec 098 content and per-field template.
3. Add remaining face and printing fields.

### Phase 4: Special, Scryfall, and lists

1. Create `special/bare-regex.mdx`, `my-list.mdx`, `tag-filter.mdx`.
2. Create `scryfall/differences.mdx` — high-level divergences table with links to field-specific sections. Per-field Scryfall notes are added in Phase 3.
3. Create `lists/index.mdx` — deck list overview; import/export format syntax. Placeholder acceptable until content is written.

### Phase 5: Cheat sheet and entry point

1. Create `reference/syntax.mdx` — cheat sheet with links to all sections and compact quick-reference table. May retain interactive examples (clickable queries); DocsLayout passes `onSelectExample` when `docParam === 'reference/syntax'`.
2. Update `?help` and `?doc=reference/syntax` to resolve to the cheat sheet.
3. Remove `syntax.tsx` — the cheat sheet replaces it. Loader resolves `reference/syntax` to `syntax.mdx`.
4. Update `reference/index.mdx` to link to the cheat sheet.
5. Update Spec 098 to reference the new structure as canonical.

## Index and Navigation

**Index:** Each leaf article is a `DocEntry`. Prev/next follow index order within quadrant.

**Index order** (for prev/next): `reference/index` → `reference/syntax` → `reference/fields/index` → face fields (alphabetically by docParam) → printing fields (alphabetically) → modifiers → composition → sorting → special (bare-regex, my-list, tag-filter) → feedback → scryfall → lists. This order keeps related content adjacent.

### Hierarchical collapsible sidebar

The Reference sidebar uses a **hierarchical, collapsible** structure (accordion-style navigation). Top-level items are always visible; sections with children can expand or collapse.

**Top level (always visible):** Reference (hub), Syntax Cheat Sheet, Fields, Modifiers, Composition, Sorting, Special, Feedback, Scryfall, Lists.

**Indented children:** Under each section, child articles are shown when expanded. For example, Fields expands to show Fields Overview plus two sub-sections: **Face Fields** (atag, banned, color, …) and **Printing Fields** (collectornumber, date, …). Each sub-section is collapsible. Modifiers expands to include-extras, unique, view. And so on.

**Expand/collapse behavior:**
- **Auto-expand:** The section containing the current article is expanded when the user navigates to it (e.g. viewing `reference/fields/face/atag` → Fields expanded).
- **Manual toggle:** Users can click a section header to expand or collapse it. A chevron (▼ expanded / ▶ collapsed) indicates state.
- **Other quadrants:** Tutorials, How-To, and Explanation keep a flat sidebar (few items).

**Implementation:** The tree is derived from `DOC_INDEX` at runtime by grouping reference entries by docParam path prefix. No `parent` or `children` fields on `DocEntry`; the sidebar builder groups by `reference/fields/`, `reference/modifiers/`, etc. The Fields section uses special handling: entries under `reference/fields/face/` are grouped into a "Face Fields" sub-section, and entries under `reference/fields/printing/` into a "Printing Fields" sub-section. See `buildReferenceSidebarTree()` in `app/src/docs/index.ts`.

## Spec 098 Relationship

Spec 098 defines the canonical content for the syntax reference. After this restructure:

- Spec 098 remains the content authority — it defines *what* must be documented.
- This spec defines *where* and *how* that content is organized.
- Spec 098 will be updated to state: "Content is implemented across `docs/reference/` per Spec 135. Each field, modifier, composition rule, and special term has a dedicated article."

## Scope of Changes

| File | Change |
|------|--------|
| `app/src/docs/reference/index.mdx` | New — reference quadrant hub with links |
| `app/src/docs/reference/syntax.mdx` | New — cheat sheet; replaces syntax.tsx |
| `app/src/docs/reference/fields/**/*.mdx` | New — per-field docs |
| `app/src/docs/reference/modifiers/*.mdx` | New — include, unique, view |
| `app/src/docs/reference/composition/*.mdx` | New — and-or, not, pinned |
| `app/src/docs/reference/sorting/*.mdx` | New — overview, sort-fields |
| `app/src/docs/reference/special/*.mdx` | New — bare-regex, my-list, tag-filter |
| `app/src/docs/reference/feedback/query-feedback.mdx` | New — syntax highlighting, errors, zero-results |
| `app/src/docs/reference/scryfall/differences.mdx` | New — high-level divergences with links to per-field sections |
| `app/src/docs/reference/lists/index.mdx` | New — deck list overview; import/export format syntax |
| `app/src/docs/doc-loader.ts` | Extend for multi-segment paths; use import.meta.glob for reference articles |
| `app/src/docs/index.ts` | Add entries; add `buildReferenceSidebarTree()` helper; Fields section groups face vs printing into separate collapsible sub-sections |
| `app/src/docs/DocsHub.tsx` | Update Reference section: primary link to `?doc=reference` (hub); optional "Syntax cheat sheet" link to `?doc=reference/syntax` |
| `app/src/docs/DocsLayout.tsx` | Render hierarchical collapsible sidebar for Reference quadrant |
| `app/src/docs/reference/syntax.tsx` | Replaced by cheat sheet MDX |
| `docs/specs/098-syntax-help-content.md` | Update to reference Spec 135 structure |

## Acceptance Criteria

1. Directory structure exists per this spec.
2. `reference/index.mdx` is the reference quadrant hub; `reference/syntax.mdx` is the cheat sheet with quick overview and links to all sections.
3. docParam supports multi-segment paths (e.g. `reference/fields/face/name`).
4. Each modifier, composition, sorting, special (including `bare-regex.mdx`), feedback, and lists article exists with required content.
5. Per-field docs use the standard template (canonical, aliases, domain, operators, values); include Scryfall notes where relevant.
6. `feedback/query-feedback.mdx` documents syntax highlighting (functional colors), error behavior (red, squiggly, ignored terms), and zero-results styling.
7. All new articles are in `DOC_INDEX`; loader resolves docParams via glob (no hand-maintained loader map for reference articles).
8. `?doc=reference/fields/face/name` and `?doc=reference/syntax` load the correct articles; `reference/syntax` resolves to `syntax.mdx` (not `.tsx`).
9. Spec 098 content is fully represented across the new structure.
10. `?help` and `?doc=reference/syntax` resolve to the cheat sheet.
11. Spec 098 is updated to reference Spec 135 as the implementation structure.
12. `reference/lists/index.mdx` exists (placeholder acceptable); cheat sheet links to it.
13. DocsHub Reference section links to `?doc=reference` (reference hub); optional "Syntax cheat sheet" link to `?doc=reference/syntax`.
14. Reference sidebar shows hierarchical collapsible sections (Fields, Modifiers, etc.) with indented children; Fields has Face Fields and Printing Fields as nested sub-sections; section containing current article is auto-expanded; users can toggle sections manually.

## Changelog

- 2026-03-18: Face/printing split: Fields sidebar now shows Face Fields and Printing Fields as separate collapsible sub-sections for clearer navigation.
