// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, ToWorker, FromWorker, BreakdownNode, DisplayColumns, QueryNodeResult } from '@frantic-search/shared'
import { CardIndex, NodeCache, parse, seededSort, collectBareWords } from '@frantic-search/shared'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string

function leafLabel(qnr: QueryNodeResult): string {
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

function isNotLeaf(qnr: QueryNodeResult): boolean {
  if (qnr.node.type !== 'NOT' || !qnr.children || qnr.children.length !== 1) return false
  const child = qnr.children[0]
  return !child.children || child.children.length === 0
}

function toBreakdown(qnr: QueryNodeResult): BreakdownNode {
  if (isNotLeaf(qnr)) {
    const childLabel = leafLabel(qnr.children![0])
    return { type: 'NOT', label: `-${childLabel}`, matchCount: qnr.matchCount }
  }
  const node: BreakdownNode = { type: qnr.node.type, label: leafLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.children) {
    node.children = qnr.children.map(toBreakdown)
  }
  return node
}

function extractDisplayColumns(data: ColumnarData): DisplayColumns {
  return {
    names: data.names,
    mana_costs: data.mana_costs,
    type_lines: data.type_lines,
    oracle_texts: data.oracle_texts,
    powers: data.powers,
    toughnesses: data.toughnesses,
    loyalties: data.loyalties,
    defenses: data.defenses,
    color_identity: data.color_identity,
    scryfall_ids: data.scryfall_ids,
    thumb_hashes: data.thumb_hashes,
    layouts: data.layouts,
    legalities_legal: data.legalities_legal,
    legalities_banned: data.legalities_banned,
    legalities_restricted: data.legalities_restricted,
    power_lookup: data.power_lookup,
    toughness_lookup: data.toughness_lookup,
    loyalty_lookup: data.loyalty_lookup,
    defense_lookup: data.defense_lookup,
    canonical_face: data.canonical_face,
  }
}

function post(msg: FromWorker, transfer?: Transferable[]): void {
  self.postMessage(msg, transfer ?? [])
}

async function init(): Promise<void> {
  post({ type: 'status', status: 'loading' })

  let data: ColumnarData
  try {
    const url = new URL(/* @vite-ignore */ `../${__COLUMNS_FILENAME__}`, import.meta.url)
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
  const display = extractDisplayColumns(data)

  post({ type: 'status', status: 'ready', display })

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type !== 'search') return

    const ast = parse(msg.query)
    const { result, matchingIndices } = cache.evaluate(ast)
    const totalMatches = matchingIndices.length
    const breakdown = toBreakdown(result)
    const deduped = index.deduplicateMatches(matchingIndices)
    const bareWords = collectBareWords(ast)
      .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 0)
    seededSort(deduped, msg.query, index.combinedNamesNormalized, bareWords)

    const indices = new Uint32Array(deduped)
    const resultMsg: FromWorker & { type: 'result' } = {
      type: 'result', queryId: msg.queryId, indices, totalMatches, breakdown,
    }
    post(resultMsg, [indices.buffer])
  }
}

init()
