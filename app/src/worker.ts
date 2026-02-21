// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, ToWorker, FromWorker } from '@frantic-search/shared'
import { CardIndex, NodeCache, parse } from '@frantic-search/shared'

declare const self: DedicatedWorkerGlobalScope

function post(msg: FromWorker): void {
  self.postMessage(msg)
}

async function init(): Promise<void> {
  post({ type: 'status', status: 'loading' })

  let data: ColumnarData
  try {
    const url = new URL(/* @vite-ignore */ '../columns.json', import.meta.url)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch columns.json: ${response.status} ${response.statusText}`)
    }
    data = await response.json() as ColumnarData
  } catch (err) {
    post({ type: 'status', status: 'error', error: String(err) })
    return
  }

  const index = new CardIndex(data)
  const cache = new NodeCache(index)

  post({ type: 'status', status: 'ready' })

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type !== 'search') return

    const ast = parse(msg.query)
    const { matchingIndices } = cache.evaluate(ast)
    const totalMatches = matchingIndices.length
    const deduped = index.deduplicateMatches(matchingIndices)
    const names = deduped.map(i => data.names[i])

    post({ type: 'result', queryId: msg.queryId, names, totalMatches })
  }
}

init()
