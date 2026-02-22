# Spec 006: CI/CD Pipeline

**Status:** Implemented

## Goal

Automate the full build-and-deploy pipeline so that pushes to `main` produce a live site on GitHub Pages with fresh card data and the latest app code, with no manual steps.

## Background

The project has four build stages that must run in sequence:

1. **ETL download** — fetch Oracle Cards from Scryfall (~160 MB).
2. **ETL thumbhash** — progressively generate ThumbHash placeholders for card art (Spec 017).
3. **ETL process** — transform raw data into `data/dist/columns.json` (~8 MB).
4. **App build** — Vite compiles the SPA and includes `columns.json` in the output (Spec 005).

The result is a static directory (`app/dist/`) ready to deploy. GitHub Pages is the hosting target (ADR-004).

## Workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * *'

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
          key: scryfall-oracle-cards-${{ github.run_id }}
          restore-keys: |
            scryfall-oracle-cards-

      - name: Download Oracle Cards
        run: npm run etl -- download

      - name: Restore ThumbHash cache
        uses: actions/cache@v4
        with:
          path: data/thumbhash
          key: thumbhash-manifest-${{ github.run_id }}
          restore-keys: |
            thumbhash-manifest-

      - name: Generate ThumbHashes
        run: npm run etl -- thumbhash --verbose

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

#### Data caching

Both the Scryfall download (`data/raw/`) and the ThumbHash manifest (`data/thumbhash/`) are cached across workflow runs using `actions/cache@v4`.

Each cache step uses a **run-unique key** (`*-${{ github.run_id }}`) with a **`restore-keys` prefix fallback**. This is necessary because `actions/cache` entries are immutable — once saved under a given key, they are never overwritten. The pattern works as follows:

1. **Restore**: The exact key (containing the current run ID) misses. The `restore-keys` prefix matches the most recent prior cache entry.
2. **Save (post-job)**: Since the exact key was a miss, the updated directory is saved under the new run-specific key.

This ensures each build picks up where the previous one left off.

For Scryfall data, the cache avoids redundant downloads. On cache hit, the `download` command's freshness check (Spec 001) compares the cached `meta.json` timestamp against the Scryfall API and skips the download if the data is current.

For the ThumbHash manifest, the cache enables progressive backfill (Spec 017). Each build restores the previous manifest, generates additional ThumbHashes up to a time limit, and saves the extended manifest for the next run.

#### Concurrency

`cancel-in-progress: false` ensures a deploy that is already running completes rather than being interrupted by a newer push. GitHub Pages deployments are idempotent and fast, so the cost of letting a stale deploy finish is low, and it avoids partial-upload edge cases.

#### Triggers

The workflow runs on three triggers:

- **Push to `main`** — deploys the latest code with fresh data.
- **Daily schedule** (`cron: '0 0 * * *'`) — keeps card data and ThumbHash coverage current even without code changes. The ThumbHash progressive backfill (Spec 017) benefits from frequent runs to accumulate coverage.
- **Manual dispatch** (`workflow_dispatch`) — allows on-demand builds for testing or recovery.

## App build script

The `app/package.json` `"build"` script should invoke `tsc` followed by `vite build`. The Vite plugin from Spec 005 copies `columns.json` into the output during the `closeBundle` hook, so no extra CI step is needed between ETL and build.

## SPA routing

GitHub Pages does not support server-side routing. Since this is a single-page app with no client-side router (just a search box), this is not currently a concern. If routing is added later, a `404.html` fallback (copy of `index.html`) can be added to the build output.

## Acceptance Criteria

1. Pushing to `main` triggers the workflow and deploys the site to GitHub Pages.
2. The daily schedule and manual dispatch also trigger successful builds.
3. The Scryfall download is cached across runs; repeated pushes do not re-download unless Scryfall data has been updated.
4. The ThumbHash manifest is cached across runs; each build extends the previous manifest with additional hashes.
5. `columns.json` is present in the deployed site and loadable by the WebWorker.
6. The deployed site is accessible at `https://<username>.github.io/frantic-search/`.
7. The workflow uses the GitHub Pages deployment API (`upload-pages-artifact` + `deploy-pages`), not the legacy `gh-pages` branch approach.
