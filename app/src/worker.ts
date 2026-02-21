// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, ToWorker, FromWorker, CardResult, BreakdownNode, QueryNodeResult } from '@frantic-search/shared'
import { CardIndex, NodeCache, parse } from '@frantic-search/shared'

declare const self: DedicatedWorkerGlobalScope

function nodeLabel(qnr: QueryNodeResult): string {
  const n = qnr.node
  switch (n.type) {
    case 'FIELD': return `${n.field}${n.operator}${n.value}`
    case 'BARE': return n.value
    case 'EXACT': return `!"${n.value}"`
    case 'REGEX_FIELD': return `${n.field}${n.operator}/${n.pattern}/`
    case 'NOT': return 'NOT'
    case 'AND': return 'AND'
    case 'OR': return 'OR'
  }
}

function toBreakdown(qnr: QueryNodeResult): BreakdownNode {
  const node: BreakdownNode = { label: nodeLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.children) {
    node.children = qnr.children.map(toBreakdown)
  }
  return node
}

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
    const { result, matchingIndices } = cache.evaluate(ast)
    const totalMatches = matchingIndices.length
    const breakdown = toBreakdown(result)
    const deduped = index.deduplicateMatches(matchingIndices)
    const cards: CardResult[] = deduped.map(i => ({
      name: data.names[i],
      manaCost: data.mana_costs[i],
      typeLine: data.type_lines[i],
      oracleText: data.oracle_texts[i],
    }))

    post({ type: 'result', queryId: msg.queryId, cards, totalMatches, breakdown })
  }
}

init()
