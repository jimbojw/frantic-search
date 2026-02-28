// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import checker from 'vite-plugin-checker'
import pkg from '../package.json' with { type: 'json' }

function contentHash(filePath: string): string {
  return createHash('md5').update(fs.readFileSync(filePath)).digest('hex').slice(0, 8)
}

function serveData(): Plugin {
  const columnsFile = path.resolve(__dirname, '..', 'data', 'dist', 'columns.json')
  const thumbsFile = path.resolve(__dirname, '..', 'data', 'dist', 'thumb-hashes.json')
  const printingsFile = path.resolve(__dirname, '..', 'data', 'dist', 'printings.json')
  let columnsFilename = 'columns.json'
  let thumbsFilename = 'thumb-hashes.json'
  let printingsFilename = 'printings.json'

  return {
    name: 'serve-data',

    config(_config, { command }) {
      if (command === 'build') {
        if (fs.existsSync(columnsFile)) {
          columnsFilename = `columns.${contentHash(columnsFile)}.json`
        }
        if (fs.existsSync(thumbsFile)) {
          thumbsFilename = `thumb-hashes.${contentHash(thumbsFile)}.json`
        }
        if (fs.existsSync(printingsFile)) {
          printingsFilename = `printings.${contentHash(printingsFile)}.json`
        }
      }
      const columnsSize = fs.existsSync(columnsFile) ? fs.statSync(columnsFile).size : 0
      return {
        define: {
          __COLUMNS_FILENAME__: JSON.stringify(columnsFilename),
          __COLUMNS_FILESIZE__: String(columnsSize),
          __THUMBS_FILENAME__: JSON.stringify(thumbsFilename),
          __PRINTINGS_FILENAME__: JSON.stringify(printingsFilename),
        },
      }
    },

    configureServer(server) {
      for (const [route, file] of [
        ['/columns.json', columnsFile],
        ['/thumb-hashes.json', thumbsFile],
        ['/printings.json', printingsFile],
      ] as const) {
        server.middlewares.use(route, (_req, res) => {
          if (!fs.existsSync(file)) {
            res.writeHead(404)
            res.end(`${path.basename(file)} not found — run ETL first`)
            return
          }
          res.setHeader('Content-Type', 'application/json')
          fs.createReadStream(file).pipe(res)
        })
      }
    },

    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      if (fs.existsSync(columnsFile)) {
        fs.copyFileSync(columnsFile, path.join(outDir, columnsFilename))
        fs.copyFileSync(columnsFile, path.join(outDir, 'columns.json'))
      }
      if (fs.existsSync(thumbsFile)) {
        fs.copyFileSync(thumbsFile, path.join(outDir, thumbsFilename))
        fs.copyFileSync(thumbsFile, path.join(outDir, 'thumb-hashes.json'))
      }
      if (fs.existsSync(printingsFile)) {
        fs.copyFileSync(printingsFile, path.join(outDir, printingsFilename))
        fs.copyFileSync(printingsFile, path.join(outDir, 'printings.json'))
      }
    },
  }
}

function gitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(gitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUGS_URL__: JSON.stringify(pkg.bugs),
    __REPO_URL__: JSON.stringify(`https://github.com/${pkg.repository.replace('github:', '')}`),
  },
  plugins: [
    serveData(),
    checker({ typescript: { tsconfigPath: './tsconfig.json', buildMode: true } }),
    tailwindcss(),
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /columns\.[a-f0-9]+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /thumb-hashes\.[a-f0-9]+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /printings\.[a-f0-9]+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'card-art',
              expiration: { maxEntries: 500 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Frantic Search',
        short_name: 'Frantic',
        description: 'Instant MTG card search',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
