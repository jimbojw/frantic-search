// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, PrintingColumnarData, ToWorker, FromWorker, BreakdownNode, DisplayColumns, PrintingDisplayColumns, QueryNodeResult, Histograms } from '@frantic-search/shared'
import { CardIndex, PrintingIndex, NodeCache, Color, parse, seededSort, collectBareWords } from '@frantic-search/shared'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string
declare const __COLUMNS_FILESIZE__: number
declare const __PRINTINGS_FILENAME__: string

function leafLabel(qnr: QueryNodeResult): string {
  const n = qnr.node
  switch (n.type) {
    case 'FIELD': return `${n.field}${n.operator}${n.value}`
    case 'BARE': return n.value
    case 'EXACT': return `!"${n.value}"`
    case 'REGEX_FIELD': return `${n.field}${n.operator}/${n.pattern}/`
    case 'NOP': return '(no-op)'
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
  if (qnr.node.type === 'NOP') {
    return { type: 'NOP', label: '(no-op)', matchCount: -1 }
  }
  if (isNotLeaf(qnr)) {
    const childLabel = leafLabel(qnr.children![0])
    const node: BreakdownNode = { type: 'NOT', label: `-${childLabel}`, matchCount: qnr.matchCount }
    if (qnr.error) node.error = qnr.error
    if (qnr.node.span) node.span = qnr.node.span
    return node
  }
  const node: BreakdownNode = { type: qnr.node.type, label: leafLabel(qnr), matchCount: qnr.matchCount }
  if (qnr.error) node.error = qnr.error
  if (qnr.node.span) node.span = qnr.node.span
  if (qnr.node.type === 'FIELD' && qnr.node.valueSpan) node.valueSpan = qnr.node.valueSpan
  if (qnr.children) {
    node.children = qnr.children.map(toBreakdown)
  }
  return node
}

function extractDisplayColumns(data: ColumnarData): DisplayColumns {
  const len = data.names.length
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
    art_crop_thumb_hashes: data.art_crop_thumb_hashes ?? new Array<string>(len).fill(''),
    card_thumb_hashes: data.card_thumb_hashes ?? new Array<string>(len).fill(''),
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

function extractPrintingDisplayColumns(data: PrintingColumnarData): PrintingDisplayColumns {
  return {
    scryfall_ids: data.scryfall_ids,
    collector_numbers: data.collector_numbers,
    set_codes: data.set_indices.map(idx => data.set_lookup[idx]?.code ?? ''),
    set_names: data.set_indices.map(idx => data.set_lookup[idx]?.name ?? ''),
    rarity: data.rarity,
    finish: data.finish,
    price_usd: data.price_usd,
    canonical_face_ref: data.canonical_face_ref,
  }
}

function popcount(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55)
  v = (v & 0x33) + ((v >> 2) & 0x33)
  return (v + (v >> 4)) & 0x0f
}

function computeHistograms(deduped: number[], index: CardIndex): Histograms {
  const colorIdentity = [0, 0, 0, 0, 0, 0, 0]  // C, W, U, B, R, G, M
  const manaValue = [0, 0, 0, 0, 0, 0, 0, 0]    // 0..6, 7+
  const cardType = [0, 0, 0, 0, 0, 0, 0, 0]     // Lgn, Cre, Ins, Sor, Art, Enc, Plw, Lnd
  for (let i = 0; i < deduped.length; i++) {
    const idx = deduped[i]
    const ci = index.colorIdentity[idx]
    if (ci === 0) {
      colorIdentity[0]++
    } else {
      if (ci & Color.White) colorIdentity[1]++
      if (ci & Color.Blue) colorIdentity[2]++
      if (ci & Color.Black) colorIdentity[3]++
      if (ci & Color.Red) colorIdentity[4]++
      if (ci & Color.Green) colorIdentity[5]++
      if (popcount(ci) >= 2) colorIdentity[6]++
    }
    const mv = Math.floor(index.manaValue[idx])
    manaValue[Math.min(mv, 7)]++

    const tl = index.typeLinesLower[idx]
    if (tl.includes('legendary'))   cardType[0]++
    if (tl.includes('creature'))    cardType[1]++
    if (tl.includes('instant'))     cardType[2]++
    if (tl.includes('sorcery'))     cardType[3]++
    if (tl.includes('artifact'))    cardType[4]++
    if (tl.includes('enchantment')) cardType[5]++
    if (tl.includes('planeswalker'))cardType[6]++
    if (tl.includes('land'))        cardType[7]++
  }
  return { colorIdentity, manaValue, cardType }
}

function post(msg: FromWorker, transfer?: Transferable[]): void {
  self.postMessage(msg, transfer ?? [])
}

async function readJsonWithProgress(response: Response): Promise<unknown> {
  const body = response.body
  if (!body || !__COLUMNS_FILESIZE__) return response.json()

  const total = __COLUMNS_FILESIZE__
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    post({ type: 'status', status: 'progress', fraction: Math.min(loaded / total, 1) })
  }

  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return JSON.parse(new TextDecoder().decode(merged))
}

const sessionSalt = (Math.random() * 0xffffffff) >>> 0

async function fetchPrintings(): Promise<{ index: PrintingIndex; data: PrintingColumnarData } | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__PRINTINGS_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json() as PrintingColumnarData
    return { index: new PrintingIndex(data), data }
  } catch {
    return null
  }
}

async function init(): Promise<void> {
  post({ type: 'status', status: 'loading' })

  const printingsPromise = fetchPrintings()

  let data: ColumnarData
  try {
    const url = new URL(/* @vite-ignore */ `../${__COLUMNS_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch columns.json: ${response.status} ${response.statusText}`)
    }
    data = await readJsonWithProgress(response) as ColumnarData
  } catch (err) {
    post({ type: 'status', status: 'error', error: String(err) })
    return
  }

  const index = new CardIndex(data)
  const printingsResult = await printingsPromise
  const printingIndex = printingsResult?.index ?? null
  const cache = new NodeCache(index, printingIndex)
  const display = extractDisplayColumns(data)

  post({ type: 'status', status: 'ready', display })

  if (printingsResult) {
    post({ type: 'status', status: 'printings-ready', printingDisplay: extractPrintingDisplayColumns(printingsResult.data) })
  }

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type !== 'search') return

    const ast = parse(msg.query)
    const { result, indices: rawIndices, printingIndices: rawPrintingIndices, hasPrintingConditions, uniquePrints } = cache.evaluate(ast)
    const breakdown = toBreakdown(result)
    const deduped = Array.from(rawIndices)
    const bareWords = collectBareWords(ast)
      .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 0)
    seededSort(deduped, msg.query, index.combinedNamesNormalized, bareWords, sessionSalt)

    const histograms = computeHistograms(deduped, index)
    const indices = new Uint32Array(deduped)
    const printingIndices = rawPrintingIndices
    const transfer: Transferable[] = [indices.buffer]
    if (printingIndices) transfer.push(printingIndices.buffer)
    const resultMsg: FromWorker & { type: 'result' } = {
      type: 'result', queryId: msg.queryId, indices, breakdown, histograms,
      printingIndices, hasPrintingConditions, uniquePrints,
    }
    post(resultMsg, transfer)
  }
}

init()
