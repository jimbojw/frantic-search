# Spec 006: CI/CD Pipeline

**Status:** Draft

## Goal

Automate the full build-and-deploy pipeline so that pushes to `main` produce a live site on GitHub Pages with fresh card data and the latest app code, with no manual steps.

## Background

The project has three build stages that must run in sequence:

1. **ETL download** — fetch Oracle Cards from Scryfall (~160 MB).
2. **ETL process** — transform raw data into `data/dist/columns.json` (~8 MB).
3. **App build** — Vite compiles the SPA and includes `columns.json` in the output (Spec 005).

The result is a static directory (`app/dist/`) ready to deploy. GitHub Pages is the hosting target (ADR-004).

## Workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      # -- ETL --
      - name: Restore Scryfall data cache
        id: scryfall-cache
        uses: actions/cache@v4
        with:
          path: data/raw
          key: scryfall-oracle-cards

      - name: Download Oracle Cards
        run: npm run etl -- download

      - name: Process card data
        run: npm run etl -- process

      # -- App --
      - name: Build app
        run: npm run build -w app

      # -- Deploy --
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

      - name: Deploy to GitHub Pages
        id: deploy
        uses: actions/deploy-pages@v4
```

### Key design choices

#### Scryfall data caching

The Scryfall download is ~160 MB and only updates a few times per week. The `actions/cache` step stores `data/raw/` (containing `oracle-cards.json` and `meta.json`) under a stable key. On cache hit, the `download` command's built-in freshness check (Spec 001) compares the cached `meta.json` timestamp against the Scryfall API and skips the download if the data is current.

The cache key is intentionally **not** content-addressed — we want to reuse the same cache entry and let the ETL's own freshness logic decide whether to re-download. If Scryfall has published newer data, the download command overwrites the cached files, and the updated `data/raw/` is saved back to the cache on workflow completion.

#### Concurrency

`cancel-in-progress: false` ensures a deploy that is already running completes rather than being interrupted by a newer push. GitHub Pages deployments are idempotent and fast, so the cost of letting a stale deploy finish is low, and it avoids partial-upload edge cases.

#### No scheduled trigger

The workflow runs on push to `main`, not on a schedule. Card data freshness depends on when Scryfall updates (typically daily), but deploying stale data is harmless — the site simply shows cards as of the last Scryfall snapshot. A scheduled trigger could be added later if near-real-time data freshness is desired.

## App build script

The `app/package.json` `"build"` script should invoke `tsc` followed by `vite build`. The Vite plugin from Spec 005 copies `columns.json` into the output during the `closeBundle` hook, so no extra CI step is needed between ETL and build.

## SPA routing

GitHub Pages does not support server-side routing. Since this is a single-page app with no client-side router (just a search box), this is not currently a concern. If routing is added later, a `404.html` fallback (copy of `index.html`) can be added to the build output.

## Acceptance Criteria

1. Pushing to `main` triggers the workflow and deploys the site to GitHub Pages.
2. The Scryfall download is cached across runs; repeated pushes do not re-download unless Scryfall data has been updated.
3. `columns.json` is present in the deployed site and loadable by the WebWorker.
4. The deployed site is accessible at `https://<username>.github.io/frantic-search/`.
5. The workflow uses the GitHub Pages deployment API (`upload-pages-artifact` + `deploy-pages`), not the legacy `gh-pages` branch approach.
