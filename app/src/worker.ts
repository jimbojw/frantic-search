// SPDX-License-Identifier: Apache-2.0
import type {
  ColumnarData,
  PrintingColumnarData,
  ToWorker,
  FromWorker,
  OracleTagData,
  IllustrationTagData,
  FlavorTagData,
  ArtistIndexData,
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
  serializeMtgsalvation,
  validateLines,
  extractDisplayColumns,
  extractPrintingDisplayColumns,
} from '@frantic-search/shared'
import { runSearch } from './worker-search'

declare const self: DedicatedWorkerGlobalScope
declare const __COLUMNS_FILENAME__: string
declare const __COLUMNS_FILESIZE__: number
declare const __PRINTINGS_FILENAME__: string
declare const __OTAGS_FILENAME__: string
declare const __ATAGS_FILENAME__: string
declare const __FLAVOR_INDEX_FILENAME__: string
declare const __ARTIST_INDEX_FILENAME__: string

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

async function fetchFlavorIndex(): Promise<FlavorTagData | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__FLAVOR_INDEX_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as FlavorTagData
  } catch {
    return null
  }
}

async function fetchArtistIndex(): Promise<ArtistIndexData | null> {
  try {
    const url = new URL(/* @vite-ignore */ `../${__ARTIST_INDEX_FILENAME__}`, import.meta.url)
    const response = await fetch(url)
    if (!response.ok) return null
    return (await response.json()) as ArtistIndexData
  } catch {
    return null
  }
}

function normalizeFlavorKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Build normalized search index from raw flavor keys. Merges keys that normalize to same string. */
function buildNormalizedFlavorIndex(raw: FlavorTagData): FlavorTagData {
  const byNormalized = new Map<string, Array<[number, number]>>()
  for (const [key, arr] of Object.entries(raw)) {
    const norm = normalizeFlavorKey(key)
    if (!norm) continue
    const pairs: Array<[number, number]> = []
    for (let i = 0; i < arr.length; i += 2) {
      pairs.push([arr[i], arr[i + 1]])
    }
    const existing = byNormalized.get(norm)
    if (existing) {
      existing.push(...pairs)
    } else {
      byNormalized.set(norm, pairs)
    }
  }
  const result: FlavorTagData = {}
  for (const [norm, pairs] of byNormalized) {
    const seen = new Set<string>()
    const unique: Array<[number, number]> = []
    for (const [f, p] of pairs) {
      const k = `${f},${p}`
      if (!seen.has(k)) {
        seen.add(k)
        unique.push([f, p])
      }
    }
    unique.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
    const strided: number[] = []
    for (const [f, p] of unique) {
      strided.push(f, p)
    }
    result[norm] = strided
  }
  return result
}

function normalizeArtistKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Build normalized search index from raw artist keys. Merges keys that normalize to same string. */
function buildNormalizedArtistIndex(raw: ArtistIndexData): ArtistIndexData {
  const byNormalized = new Map<string, Array<[number, number]>>()
  for (const [key, arr] of Object.entries(raw)) {
    const norm = normalizeArtistKey(key)
    if (!norm) continue
    const pairs: Array<[number, number]> = []
    for (let i = 0; i < arr.length; i += 2) {
      pairs.push([arr[i], arr[i + 1]])
    }
    const existing = byNormalized.get(norm)
    if (existing) {
      existing.push(...pairs)
    } else {
      byNormalized.set(norm, pairs)
    }
  }
  const result: ArtistIndexData = {}
  for (const [norm, pairs] of byNormalized) {
    const seen = new Set<string>()
    const unique: Array<[number, number]> = []
    for (const [f, p] of pairs) {
      const k = `${f},${p}`
      if (!seen.has(k)) {
        seen.add(k)
        unique.push([f, p])
      }
    }
    unique.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
    const strided: number[] = []
    for (const [f, p] of unique) {
      strided.push(f, p)
    }
    result[norm] = strided
  }
  return result
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
  self.performance.mark('worker-init-start')
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
  const listMaskCache = new Map<
    string,
    { printingIndices?: Uint32Array; metadataIndex?: { keys: string[]; indexArrays: Uint32Array[] } }
  >()
  const getListMask = (listId: string) => listMaskCache.get(listId) ?? null
  const getMetadataIndex = () => listMaskCache.get("default")?.metadataIndex ?? null
  let faceToOtags: Map<number, string[]> | null = null
  let printingToAtags: Map<number, string[]> | null = null
  const tagDataRef = {
    oracle: null as OracleTagData | null,
    illustration: null as Map<string, Uint32Array> | null,
    flavor: null as FlavorTagData | null,
    artist: null as ArtistIndexData | null,
  }
  const keywordsIndex = data.keywords_index ?? {}
  const keywordDataRef = { keywords: keywordsIndex }
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    tagDataRef,
    keywordDataRef,
    getMetadataIndex,
  )
  const displayRef = extractDisplayColumns(data)
  const printingDisplayRef = printingData ? extractPrintingDisplayColumns(printingData) : null

  const facesMeasure = self.performance.measure('faces-load', 'worker-init-start')
  post({
    type: 'status',
    status: 'ready',
    display: displayRef,
    keywordLabels: Object.keys(keywordsIndex),
    facesLoadDurationMs: Math.round(facesMeasure.duration),
  })

  if (printingData) {
    const printingsMeasure = self.performance.measure('printings-load', 'worker-init-start')
    post({
      type: 'status',
      status: 'printings-ready',
      printingDisplay: printingDisplayRef!,
      printingsLoadDurationMs: Math.round(printingsMeasure.duration),
    })
  }

  function serializeList(
    instances: import('@frantic-search/shared').InstanceState[],
    format: import('@frantic-search/shared').DeckFormat,
    listName?: string
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
      case 'mtgsalvation':
        return serializeMtgsalvation(instances, displayRef, listName)
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
    const [flavorRaw, artistRaw] = await Promise.all([fetchFlavorIndex(), fetchArtistIndex()])
    if (flavorRaw) {
      tagDataRef.flavor = buildNormalizedFlavorIndex(flavorRaw)
      post({ type: 'status', status: 'flavor-ready' })
    }
    if (artistRaw) {
      tagDataRef.artist = buildNormalizedArtistIndex(artistRaw)
      post({ type: 'status', status: 'artist-ready' })
    }
  })

  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const msg = e.data
    if (msg.type === 'list-update') {
      listMaskCache.set(msg.listId, {
        printingIndices: msg.printingIndices,
        metadataIndex: msg.metadataIndex,
      })
      cache.clearAllComputed()
      return
    }
    if (msg.type === 'serialize-list') {
      const text = serializeList(msg.instances, msg.format, msg.listName)
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
