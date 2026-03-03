// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, PrintingColumnarData, ToWorker, FromWorker, DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'
import { CardIndex, PrintingIndex, NodeCache } from '@frantic-search/shared'
import { runSearch } from './worker-search'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string
declare const __COLUMNS_FILESIZE__: number
declare const __PRINTINGS_FILENAME__: string

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

async function fetchPrintings(): Promise<PrintingColumnarData | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__PRINTINGS_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as PrintingColumnarData
  } catch {
    return null
  }
}

type FetchResult =
  | { ok: true; response: Response }
  | { ok: false; cause: 'stale' | 'network' | 'unknown'; detail: string }

async function fetchColumns(url: URL): Promise<FetchResult> {
  try {
    const response = await fetch(url)
    if (response.ok) return { ok: true, response }
    return {
      ok: false,
      cause: response.status === 404 ? 'stale' : 'unknown',
      detail: `${response.status} ${response.statusText}`,
    }
  } catch {
    return { ok: false, cause: 'network', detail: 'Network error' }
  }
}

async function init(): Promise<void> {
  post({ type: 'status', status: 'loading' })

  const printingsPromise = fetchPrintings()

  let data: ColumnarData
  try {
    const url = new URL(/* @vite-ignore */ `../${__COLUMNS_FILENAME__}`, import.meta.url)
    let result = await fetchColumns(url)

    // Retry once on 404 — covers brief CDN propagation windows.
    if (!result.ok && result.cause === 'stale') {
      await new Promise(r => setTimeout(r, 2000))
      result = await fetchColumns(url)
    }

    if (!result.ok) {
      post({ type: 'status', status: 'error', error: `Failed to fetch card data: ${result.detail}`, cause: result.cause })
      return
    }

    data = await readJsonWithProgress(result.response) as ColumnarData
  } catch (err) {
    post({ type: 'status', status: 'error', error: String(err), cause: 'unknown' })
    return
  }

  const index = new CardIndex(data)
  const printingData = await printingsPromise
  const printingIndex = printingData
    ? new PrintingIndex(printingData, data.scryfall_ids)
    : null
  const cache = new NodeCache(index, printingIndex)
  const display = extractDisplayColumns(data)

  post({ type: 'status', status: 'ready', display })

  if (printingData) {
    post({ type: 'status', status: 'printings-ready', printingDisplay: extractPrintingDisplayColumns(printingData) })
  }

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type !== 'search') return

    const hasPinned = !!msg.pinnedQuery?.trim()
    const hasLive = !!msg.query.trim()

    if (!hasLive && !hasPinned) return

    const resultMsg = runSearch({
      msg,
      cache,
      index,
      printingIndex,
      sessionSalt,
    })

    const transfer: Transferable[] = [resultMsg.indices.buffer]
    if (resultMsg.printingIndices) transfer.push(resultMsg.printingIndices.buffer)
    post(resultMsg, transfer)
  }
}

init()
