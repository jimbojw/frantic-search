# ADR-002: Technology Stack

**Status:** Accepted

## Context

The project is a client-side search tool for Magic: The Gathering cards. It must be fast, lightweight, and mobile-friendly. The ETL pipeline runs locally or in CI as a Node.js process.

## Decision

- **Language:** TypeScript across the entire project.
- **Runtime:** Node.js (ETL, tooling), Web (app).
- **Build tool:** Vite.
- **UI framework:** SolidJS.

## Rationale

- **TypeScript** provides type safety across the shared boundary between ETL and app.
- **Vite** offers fast HMR, first-class TypeScript support, and native WebWorker bundling.
- **SolidJS** has a very small runtime (~7 KB), fine-grained reactivity without virtual DOM diffing, and excellent performance benchmarks — all critical for a mobile-first "instant search" experience.

## Consequences

- **Positive:** A single language (TypeScript) across all packages reduces context switching.
- **Positive:** SolidJS's fine-grained reactivity avoids unnecessary re-renders, which is important when search results update on every keystroke.
- **Negative:** SolidJS has a smaller ecosystem than React; some third-party component libraries may not be available.
