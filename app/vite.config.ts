// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from '../package.json' with { type: 'json' }

function serveData(): Plugin {
  const dataFile = path.resolve(__dirname, '..', 'data', 'dist', 'columns.json')
  let columnsFilename = 'columns.json'

  return {
    name: 'serve-data',

    config(_config, { command }) {
      if (command === 'build' && fs.existsSync(dataFile)) {
        const hash = createHash('md5')
          .update(fs.readFileSync(dataFile))
          .digest('hex')
          .slice(0, 8)
        columnsFilename = `columns.${hash}.json`
      }
      return {
        define: {
          __COLUMNS_FILENAME__: JSON.stringify(columnsFilename),
        },
      }
    },

    configureServer(server) {
      server.middlewares.use('/columns.json', (_req, res) => {
        if (!fs.existsSync(dataFile)) {
          res.writeHead(404)
          res.end('columns.json not found — run ETL first')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(dataFile).pipe(res)
      })
    },

    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      if (fs.existsSync(dataFile)) {
        fs.copyFileSync(dataFile, path.join(outDir, columnsFilename))
        fs.copyFileSync(dataFile, path.join(outDir, 'columns.json'))
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
