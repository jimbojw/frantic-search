# ADR-018: Search Context for State Sharing

**Status:** Accepted

## Context

App.tsx has grown large (~850 lines) with 30+ signals and many derived values. Extracting components such as SearchResults would require passing 25+ props through the tree. Prop drilling is unwieldy and will worsen with future extractions (e.g., SearchHeader).

## Decision

Use SolidJS `createContext` / `useContext` for sharing search state across the search view.

- A `SearchProvider` wraps the search view (header + main) and provides the context value.
- Components that need search state (SearchResults, future extractions) call `useSearchContext()`.
- App remains the single source of truth; the context passes signals and accessors through, not evaluated values.

## Consequences

- **Positive:** Cleaner component boundaries; SearchResults and future components avoid prop drilling.
- **Positive:** Single place to add new consumers; establishes a pattern for app extractions.
- **Negative:** Context consumers are coupled to the provider; `useSearchContext()` must only be called within the search view.
