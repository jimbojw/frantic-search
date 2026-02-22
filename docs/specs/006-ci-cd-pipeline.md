# Spec 006: CI/CD Pipeline

**Status:** Implemented

## Goal

Automate the full build-and-deploy pipeline so that pushes to `main` produce a live site on GitHub Pages with fresh card data and the latest app code, with no manual steps.

## Background

The project has five build stages that must run in sequence:

1. **ETL restore** — recover the ThumbHash manifest from the previous deployment's `columns.json`.
2. **ETL download** — fetch Oracle Cards from Scryfall (~160 MB).
3. **ETL thumbhash** — progressively generate ThumbHash placeholders for card art (Spec 017).
4. **ETL process** — transform raw data into `data/dist/columns.json` (~8 MB).
5. **App build** — Vite compiles the SPA and includes `columns.json` in the output (Spec 005).

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
      - name: Restore data from previous deployment
        run: >-
          npm run etl -- restore
          --site-url https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/
          --verbose
        continue-on-error: true

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

#### ThumbHash manifest restoration

The ThumbHash progressive backfill (Spec 017) depends on each build starting from the previous build's manifest. Two complementary mechanisms provide this:

1. **Previous deployment fetch.** The `restore` command downloads `columns.json` from the live GitHub Pages site, reconstructs a ThumbHash manifest from its `scryfall_ids` and `thumb_hashes` arrays, and merges it with any existing on-disk manifest. This is the primary recovery mechanism — it survives cache eviction and works from a cold start.

2. **`actions/cache`.** The ThumbHash cache step restores `data/thumbhash/` from the most recent prior run. When both sources are available, the cached manifest takes precedence for any overlapping entries (it may contain hashes generated after the last deploy).

The `restore` step runs first with `continue-on-error: true` so that a fetch failure (first-ever deploy, Pages outage) does not block the build. The Vite build outputs `columns.json` at a stable (non-hashed) URL alongside the content-hashed copy used by the app, so the restore step always has a predictable URL to fetch.

#### Scryfall data caching

The Scryfall download (`data/raw/`) is cached using `actions/cache@v4`.

Each cache step uses a **run-unique key** (`*-${{ github.run_id }}`) with a **`restore-keys` prefix fallback**. This is necessary because `actions/cache` entries are immutable — once saved under a given key, they are never overwritten. The pattern works as follows:

1. **Restore**: The exact key (containing the current run ID) misses. The `restore-keys` prefix matches the most recent prior cache entry.
2. **Save (post-job)**: Since the exact key was a miss, the updated directory is saved under the new run-specific key.

On cache hit, the `download` command's freshness check (Spec 001) compares the cached `meta.json` timestamp against the Scryfall API and skips the download if the data is current.

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
4. The ThumbHash manifest is restored from the previous deployment's `columns.json` and extended with new hashes each build.
5. The ThumbHash manifest is also cached via `actions/cache` as a complementary fast path.
6. A stable-named `columns.json` (no content hash) is deployed alongside the hashed copy for use by the restore step.
7. The restore step tolerates a missing or unreachable site (first deploy, outage) without failing the build.
8. `columns.json` is present in the deployed site and loadable by the WebWorker.
9. The deployed site is accessible at `https://<username>.github.io/frantic-search/`.
10. The workflow uses the GitHub Pages deployment API (`upload-pages-artifact` + `deploy-pages`), not the legacy `gh-pages` branch approach.
