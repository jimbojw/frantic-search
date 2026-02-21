// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

function serveData(): Plugin {
  const dataFile = path.resolve(__dirname, '..', 'data', 'dist', 'columns.json')

  return {
    name: 'serve-data',

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
        fs.copyFileSync(dataFile, path.join(outDir, 'columns.json'))
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [serveData(), tailwindcss(), solid()],
})
