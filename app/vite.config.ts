// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
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
  const otagsFile = path.resolve(__dirname, '..', 'data', 'dist', 'otags.json')
  const atagsFile = path.resolve(__dirname, '..', 'data', 'dist', 'atags.json')
  const flavorFile = path.resolve(__dirname, '..', 'data', 'dist', 'flavor-index.json')
  const artistFile = path.resolve(__dirname, '..', 'data', 'dist', 'artist-index.json')
  const outDir = path.resolve(__dirname, 'dist')
  let workerFileName: string | null = null
  let columnsFilename = 'columns.json'
  let thumbsFilename = 'thumb-hashes.json'
  let printingsFilename = 'printings.json'
  let otagsFilename = 'otags.json'
  let atagsFilename = 'atags.json'
  let flavorFilename = 'flavor-index.json'
  let artistFilename = 'artist-index.json'

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
        if (fs.existsSync(otagsFile)) {
          otagsFilename = `otags.${contentHash(otagsFile)}.json`
        }
        if (fs.existsSync(atagsFile)) {
          atagsFilename = `atags.${contentHash(atagsFile)}.json`
        }
        if (fs.existsSync(flavorFile)) {
          flavorFilename = `flavor-index.${contentHash(flavorFile)}.json`
        }
        if (fs.existsSync(artistFile)) {
          artistFilename = `artist-index.${contentHash(artistFile)}.json`
        }
      }
      const columnsSize = fs.existsSync(columnsFile) ? fs.statSync(columnsFile).size : 0
      return {
        define: {
          __COLUMNS_FILENAME__: JSON.stringify(columnsFilename),
          __COLUMNS_FILESIZE__: String(columnsSize),
          __THUMBS_FILENAME__: JSON.stringify(thumbsFilename),
          __PRINTINGS_FILENAME__: JSON.stringify(printingsFilename),
          __OTAGS_FILENAME__: JSON.stringify(otagsFilename),
          __ATAGS_FILENAME__: JSON.stringify(atagsFilename),
          __FLAVOR_INDEX_FILENAME__: JSON.stringify(flavorFilename),
          __ARTIST_INDEX_FILENAME__: JSON.stringify(artistFilename),
        },
      }
    },

    configureServer(server) {
      for (const [route, file] of [
        ['/columns.json', columnsFile],
        ['/thumb-hashes.json', thumbsFile],
        ['/printings.json', printingsFile],
        ['/otags.json', otagsFile],
        ['/atags.json', atagsFile],
        ['/flavor-index.json', flavorFile],
        ['/artist-index.json', artistFile],
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

    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle as Record<string, { type: string; fileName: string; name?: string }> | undefined
        if (!bundle) return

        type HeadTag = { tag: string; attrs?: Record<string, string | boolean>; injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend' }
        const tags: HeadTag[] = []

        const workerChunk = Object.values(bundle).find(
          (c) =>
            c.type === 'chunk' &&
            (c.fileName.toLowerCase().includes('worker') || (c.name && c.name.toLowerCase().includes('worker'))),
        )
        if (workerChunk) {
          const href = workerChunk.fileName.startsWith('/') ? workerChunk.fileName : `./${workerChunk.fileName}`
          tags.push({ tag: 'link', attrs: { rel: 'modulepreload', href }, injectTo: 'head-prepend' })
          tags.push({ tag: 'link', attrs: { rel: 'preload', href, as: 'worker' }, injectTo: 'head-prepend' })
        }

        for (const [filename, exists] of [
          [columnsFilename, fs.existsSync(columnsFile)],
          [printingsFilename, fs.existsSync(printingsFile)],
          [otagsFilename, fs.existsSync(otagsFile)],
          [atagsFilename, fs.existsSync(atagsFile)],
          [flavorFilename, fs.existsSync(flavorFile)],
          [artistFilename, fs.existsSync(artistFile)],
        ] as const) {
          if (exists) {
            const href = `./${filename}`
            tags.push({
              tag: 'link',
              attrs: { rel: 'preload', href, as: 'fetch', crossorigin: 'anonymous' },
              injectTo: 'head-prepend',
            })
          }
        }

        return tags
      },
    },

    generateBundle(_outputOptions, bundle) {
      const workerEntry = Object.values(bundle).find(
        (c) => c.type === 'chunk' && 'fileName' in c && String(c.fileName).toLowerCase().includes('worker'),
      ) as { fileName: string } | undefined
      if (workerEntry) workerFileName = workerEntry.fileName
    },

    closeBundle() {
      if (!workerFileName && fs.existsSync(outDir)) {
        const assetsDir = path.join(outDir, 'assets')
        if (fs.existsSync(assetsDir)) {
          const match = fs.readdirSync(assetsDir).find((n) => n.toLowerCase().startsWith('worker') && n.endsWith('.js'))
          if (match) workerFileName = `assets/${match}`
        }
      }
      if (workerFileName) {
        const indexPath = path.join(outDir, 'index.html')
        if (fs.existsSync(indexPath)) {
          const href = workerFileName.startsWith('/') ? workerFileName : `./${workerFileName}`
          const workerLinks = [
            `<link rel="modulepreload" href="${href}">`,
            `<link rel="preload" href="${href}" as="worker">`,
          ].join('\n    ')
          const html = fs.readFileSync(indexPath, 'utf-8')
          const patched = html.replace(
            /(<head[^>]*>)/,
            `$1\n    ${workerLinks}`,
          )
          if (patched !== html) fs.writeFileSync(indexPath, patched)
        }
      }
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
      if (fs.existsSync(otagsFile)) {
        fs.copyFileSync(otagsFile, path.join(outDir, otagsFilename))
        fs.copyFileSync(otagsFile, path.join(outDir, 'otags.json'))
      }
      if (fs.existsSync(atagsFile)) {
        fs.copyFileSync(atagsFile, path.join(outDir, atagsFilename))
        fs.copyFileSync(atagsFile, path.join(outDir, 'atags.json'))
      }
      if (fs.existsSync(flavorFile)) {
        fs.copyFileSync(flavorFile, path.join(outDir, flavorFilename))
        fs.copyFileSync(flavorFile, path.join(outDir, 'flavor-index.json'))
      }
      if (fs.existsSync(artistFile)) {
        fs.copyFileSync(artistFile, path.join(outDir, artistFilename))
        fs.copyFileSync(artistFile, path.join(outDir, 'artist-index.json'))
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
  resolve: {
    alias: [
      { find: '@frantic-docs-runtime/jsx-dev-runtime', replacement: path.resolve(__dirname, 'src/docs/jsx-runtime.ts') },
      { find: '@frantic-docs-runtime/jsx-runtime', replacement: path.resolve(__dirname, 'src/docs/jsx-runtime.ts') },
      { find: '@frantic-docs-runtime', replacement: path.resolve(__dirname, 'src/docs') },
      { find: '@frantic-docs-provider', replacement: path.resolve(__dirname, 'src/docs/components/MdxProvider.tsx') },
    ],
  },
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
    {
      ...mdx({
        jsxImportSource: '@frantic-docs-runtime',
        remarkPlugins: [remarkFrontmatter, remarkGfm],
        providerImportSource: '@frantic-docs-provider',
      }),
      enforce: 'pre' as const,
    },
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Frantic Search',
        short_name: 'Frantic',
        description: 'Instant MTG card search',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
