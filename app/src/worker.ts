// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, ToWorker, FromWorker, CardResult, CardFace, BreakdownNode, QueryNodeResult } from '@frantic-search/shared'
import { CardIndex, NodeCache, nodeKey, parse, seededSort, collectBareWords } from '@frantic-search/shared'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string

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

  post({ type: 'status', status: 'ready' })

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type !== 'search') return

    const ast = parse(msg.query)
    const { result, matchingIndices } = cache.evaluate(ast)
    const totalMatches = matchingIndices.length
    const breakdown = toBreakdown(result)
    const deduped = index.deduplicateMatches(matchingIndices)
    const bareWords = collectBareWords(ast).map(w => w.toLowerCase())
    seededSort(deduped, nodeKey(ast), index.namesLower, bareWords)
    const cards: CardResult[] = deduped.map(canonIdx => {
      const faces = index.facesOf(canonIdx).map((fi): CardFace => {
        const face: CardFace = {
          name: data.names[fi],
          manaCost: data.mana_costs[fi],
          typeLine: data.type_lines[fi],
          oracleText: data.oracle_texts[fi],
        }
        const pow = data.power_lookup[data.powers[fi]]
        const tou = data.toughness_lookup[data.toughnesses[fi]]
        const loy = data.loyalty_lookup[data.loyalties[fi]]
        const def = data.defense_lookup[data.defenses[fi]]
        if (pow) face.power = pow
        if (tou) face.toughness = tou
        if (loy) face.loyalty = loy
        if (def) face.defense = def
        return face
      })
      const card: CardResult = {
        scryfallId: data.scryfall_ids[canonIdx],
        colorIdentity: data.color_identity[canonIdx],
        layout: data.layouts[canonIdx],
        faces,
        legalities: {
          legal: data.legalities_legal[canonIdx],
          banned: data.legalities_banned[canonIdx],
          restricted: data.legalities_restricted[canonIdx],
        },
      }
      return card
    })

    post({ type: 'result', queryId: msg.queryId, cards, totalMatches, breakdown })
  }
}

init()
