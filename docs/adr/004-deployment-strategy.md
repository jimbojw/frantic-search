# ADR-004: Deployment Strategy

**Status:** Accepted

## Context

Frantic Search is a fully client-side application with no backend server. It needs a simple, free, and reliable static hosting solution.

## Decision

Deploy via **GitHub Actions** to **GitHub Pages**.

- A CI workflow builds both the Vite app and the ETL data artifacts.
- The combined output (compiled SPA + processed card data) is published to GitHub Pages.

## Consequences

- **Positive:** Free hosting with global CDN, HTTPS, and custom domain support.
- **Positive:** Deployment is automated on push — no manual steps.
- **Negative:** GitHub Pages does not support custom HTTP headers or server-side logic. Compression of binary assets must be handled at build time (see ADR-005).
- **Negative:** GitHub Pages has a soft size limit of 1 GB and a bandwidth limit of 100 GB/month, which is more than sufficient for this use case.
