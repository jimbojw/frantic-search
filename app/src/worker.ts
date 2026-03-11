// SPDX-License-Identifier: Apache-2.0
import type {
  ColumnarData,
  PrintingColumnarData,
  ToWorker,
  FromWorker,
  DisplayColumns,
  PrintingDisplayColumns,
  OracleTagData,
  IllustrationTagData,
} from '@frantic-search/shared'
import {
  CardIndex,
  PrintingIndex,
  NodeCache,
  serializeArena,
  serializeMoxfield,
  serializeArchidekt,
  serializeMtggoldfish,
  serializeMelee,
  serializeTappedOut,
  serializeTcgplayer,
  serializeManapool,
  validateLines,
} from '@frantic-search/shared'
import { runSearch } from './worker-search'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string
declare const __COLUMNS_FILESIZE__: number
declare const __PRINTINGS_FILENAME__: string
declare const __OTAGS_FILENAME__: string
declare const __ATAGS_FILENAME__: string

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
    oracle_ids: data.oracle_ids ?? new Array<string>(len).fill(''),
    edhrec_rank: data.edhrec_ranks,
    edhrec_salt: data.edhrec_salts,
    alternate_name_to_canonical_face: data.alternate_names_index,
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
    illustration_id_index: data.illustration_id_index,
    printing_flags: data.printing_flags,
    promo_types_flags_0: data.promo_types_flags_0,
    promo_types_flags_1: data.promo_types_flags_1,
    alternate_name_to_printing_indices: data.alternate_names_index,
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

async function fetchOtags(): Promise<OracleTagData | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__OTAGS_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as OracleTagData
  } catch {
    return null
  }
}

async function fetchAtags(): Promise<IllustrationTagData | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__ATAGS_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as IllustrationTagData
  } catch {
    return null
  }
}

/** Build reverse index: face index → otag labels. */
function buildFaceToOtags(otags: OracleTagData): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const [label, faceIndices] of Object.entries(otags)) {
    for (const fi of faceIndices) {
      let arr = map.get(fi)
      if (!arr) {
        arr = []
        map.set(fi, arr)
      }
      arr.push(label)
    }
  }
  return map
}

/** Build reverse index: printing row index → atag labels. */
function buildPrintingToAtags(illustration: Map<string, Uint32Array>): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const [label, printingIndices] of illustration) {
    for (let i = 0; i < printingIndices.length; i++) {
      const pi = printingIndices[i]
      let arr = map.get(pi)
      if (!arr) {
        arr = []
        map.set(pi, arr)
      }
      arr.push(label)
    }
  }
  return map
}

/** Resolve strided (face, illust_idx) pairs to printing row indices using PrintingIndex data. */
function resolveAtagsToPrintingRows(
  atags: IllustrationTagData,
  printingData: PrintingColumnarData,
): Map<string, Uint32Array> {
  const faceRef = printingData.canonical_face_ref
  const illustIdx = printingData.illustration_id_index ?? []
  const pairToRows = new Map<string, number[]>()
  for (let i = 0; i < faceRef.length; i++) {
    const face = faceRef[i]
    const idx = illustIdx[i] ?? 0
    const key = `${face},${idx}`
    let arr = pairToRows.get(key)
    if (!arr) {
      arr = []
      pairToRows.set(key, arr)
    }
    arr.push(i)
  }

  const result = new Map<string, Uint32Array>()
  for (const [label, arr] of Object.entries(atags)) {
    const rows: number[] = []
    for (let i = 0; i < arr.length; i += 2) {
      const face = arr[i]
      const illust = arr[i + 1]
      const key = `${face},${illust}`
      const rowList = pairToRows.get(key)
      if (rowList) rows.push(...rowList)
    }
    if (rows.length > 0) {
      rows.sort((a, b) => a - b)
      result.set(label, new Uint32Array(rows))
    }
  }
  return result
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
  const otagsPromise = fetchOtags()

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
  const listMaskCache = new Map<string, { faceMask: Uint8Array; printingMask?: Uint8Array }>()
  const getListMask = (listId: string) => listMaskCache.get(listId) ?? null
  let faceToOtags: Map<number, string[]> | null = null
  let printingToAtags: Map<number, string[]> | null = null
  const tagDataRef = {
    oracle: null as OracleTagData | null,
    illustration: null as Map<string, Uint32Array> | null,
  }
  const keywordsIndex = data.keywords_index ?? {}
  const keywordDataRef = { keywords: keywordsIndex }
  const cache = new NodeCache(index, printingIndex, getListMask, tagDataRef, keywordDataRef)
  const displayRef = extractDisplayColumns(data)
  const printingDisplayRef = printingData ? extractPrintingDisplayColumns(printingData) : null

  post({ type: 'status', status: 'ready', display: displayRef, keywordLabels: Object.keys(keywordsIndex) })

  if (printingData) {
    post({ type: 'status', status: 'printings-ready', printingDisplay: printingDisplayRef! })
  }

  function serializeList(
    instances: import('@frantic-search/shared').InstanceState[],
    format: import('@frantic-search/shared').DeckFormat
  ): string {
    switch (format) {
      case 'moxfield':
        return serializeMoxfield(instances, displayRef, printingDisplayRef)
      case 'archidekt':
        return serializeArchidekt(instances, displayRef, printingDisplayRef)
      case 'mtggoldfish':
        return serializeMtggoldfish(instances, displayRef, printingDisplayRef)
      case 'melee':
        return serializeMelee(instances, displayRef)
      case 'tappedout':
        return serializeTappedOut(instances, displayRef, printingDisplayRef)
      case 'tcgplayer':
        return serializeTcgplayer(instances, displayRef, printingDisplayRef)
      case 'manapool':
        return serializeManapool(instances, displayRef, printingDisplayRef)
      case 'arena':
      default:
        return serializeArena(instances, displayRef)
    }
  }

  otagsPromise.then((otags) => {
    if (otags) {
      tagDataRef.oracle = otags
      faceToOtags = buildFaceToOtags(otags)
      post({ type: 'status', status: 'otags-ready', tagLabels: Object.keys(otags) })
    }
  })

  printingsPromise.then(async (printingDataForAtags) => {
    if (!printingDataForAtags) return
    const atags = await fetchAtags()
    if (atags) {
      const resolved = resolveAtagsToPrintingRows(atags, printingDataForAtags)
      tagDataRef.illustration = resolved
      printingToAtags = buildPrintingToAtags(resolved)
      post({ type: 'status', status: 'atags-ready', tagLabels: Array.from(resolved.keys()) })
    }
  })

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type === 'list-update') {
      listMaskCache.set(msg.listId, {
        faceMask: msg.faceMask,
        printingMask: msg.printingMask,
      })
      cache.clearAllComputed()
      return
    }
    if (msg.type === 'serialize-list') {
      const text = serializeList(msg.instances, msg.format)
      post({ type: 'serialize-result', requestId: msg.requestId, text })
      return
    }
    if (msg.type === 'validate-list') {
      const { result, indices } = validateLines(
        msg.lines, index, printingIndex, displayRef, printingDisplayRef, cache,
      )
      post({ type: 'validate-result', requestId: msg.requestId, result, indices }, [indices.buffer])
      return
    }
    if (msg.type === 'get-tags-for-card') {
      const otagLabels = faceToOtags?.get(msg.canonicalIndex) ?? []
      const atagLabels =
        msg.primaryPrintingIndex !== undefined
          ? printingToAtags?.get(msg.primaryPrintingIndex) ?? []
          : []
      const otags = otagLabels.map((label) => ({
        label,
        cards: tagDataRef.oracle?.[label]?.length ?? 0,
      }))
      const atags = atagLabels.map((label) => ({
        label,
        prints: tagDataRef.illustration?.get(label)?.length ?? 0,
      }))
      post({ type: 'card-tags', otags, atags })
      return
    }
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
      tagData: tagDataRef,
    })

    const resultWithSide = msg.side !== undefined ? { ...resultMsg, side: msg.side } : resultMsg
    const transfer: Transferable[] = [resultMsg.indices.buffer]
    if (resultMsg.printingIndices) transfer.push(resultMsg.printingIndices.buffer)
    post(resultWithSide, transfer)
  }
}

init()
