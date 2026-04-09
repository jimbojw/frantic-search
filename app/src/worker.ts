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
  buildKeywordDataRef,
  buildOracleTagEvalIndex,
  buildIllustrationTagEvalIndex,
  extractDisplayColumns,
  extractPrintingDisplayColumns,
  normalizeFlavorIndexForSearch,
  normalizeArtistIndexForSearch,
  resolveIllustrationTagsToPrintingRows,
  resolveArtistForPrintingRow,
  sortedArrayPosition,
  displayEqualityPercentileLabel,
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
  /** Raw artist-index keys (display casing) for Spec 183 card-detail lookup. */
  let artistIndexRaw: ArtistIndexData | null = null
  let faceToOtags: Map<number, string[]> | null = null
  let printingToAtags: Map<number, string[]> | null = null
  const tagDataRef = {
    oracle: null as OracleTagData | null,
    oracleEvalIndex: null as ReturnType<typeof buildOracleTagEvalIndex> | null,
    illustration: null as Map<string, Uint32Array> | null,
    illustrationEvalIndex: null as ReturnType<typeof buildIllustrationTagEvalIndex> | null,
    flavor: null as FlavorTagData | null,
    artist: null as ArtistIndexData | null,
  }
  const keywordsIndex = data.keywords_index ?? {}
  const keywordDataRef = buildKeywordDataRef(keywordsIndex)
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
      tagDataRef.oracleEvalIndex = buildOracleTagEvalIndex(otags)
      faceToOtags = buildFaceToOtags(otags)
      post({ type: 'status', status: 'otags-ready', tagLabels: Object.keys(otags) })
    }
  })

  printingsPromise.then(async (printingDataForAtags) => {
    if (!printingDataForAtags) return
    const atags = await fetchAtags()
    if (atags) {
      const resolved = resolveIllustrationTagsToPrintingRows(atags, printingDataForAtags)
      tagDataRef.illustration = resolved
      tagDataRef.illustrationEvalIndex = buildIllustrationTagEvalIndex(resolved)
      printingToAtags = buildPrintingToAtags(resolved)
      post({ type: 'status', status: 'atags-ready', tagLabels: Array.from(resolved.keys()) })
    }
    const [flavorRaw, artistRaw] = await Promise.all([fetchFlavorIndex(), fetchArtistIndex()])
    if (flavorRaw) {
      tagDataRef.flavor = normalizeFlavorIndexForSearch(flavorRaw)
      post({ type: 'status', status: 'flavor-ready' })
    }
    if (artistRaw) {
      artistIndexRaw = artistRaw
      tagDataRef.artist = normalizeArtistIndexForSearch(artistRaw)
      post({ type: 'status', status: 'artist-ready', tagLabels: Object.keys(tagDataRef.artist) })
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
    if (msg.type === 'get-artist-for-printing') {
      const artistName = resolveArtistForPrintingRow(
        artistIndexRaw,
        msg.printingRowIndex,
        msg.faceWithinCard,
      )
      post({
        type: 'artist-for-printing-result',
        requestId: msg.requestId,
        artistName,
      })
      return
    }
    if (msg.type === 'get-card-detail-percentiles') {
      const fi = msg.faceIndex
      const edhrecPos = sortedArrayPosition(index.sortedEdhrecIndices, index.sortedEdhrecCount, fi)
      const edhrecPercentile = edhrecPos != null
        ? displayEqualityPercentileLabel(edhrecPos, index.sortedEdhrecCount)
        : null
      const saltPos = sortedArrayPosition(index.sortedSaltIndices, index.sortedSaltCount, fi)
      const saltPercentile = saltPos != null
        ? displayEqualityPercentileLabel(saltPos, index.sortedSaltCount)
        : null
      const usdPercentiles = msg.printingRowIndices.map((pi) => {
        if (!printingIndex) return null
        const pos = sortedArrayPosition(printingIndex.sortedUsdIndices, printingIndex.sortedUsdCount, pi)
        return pos != null ? displayEqualityPercentileLabel(pos, printingIndex.sortedUsdCount) : null
      })
      post({
        type: 'card-detail-percentiles-result',
        requestId: msg.requestId,
        edhrecPercentile,
        saltPercentile,
        usdPercentiles,
      })
      return
    }
    if (msg.type !== 'search') return

    const hasPinned = !!msg.pinnedQuery?.trim()
    const hasLive = !!msg.query.trim()
    const allowEmptyUrlLive =
      !!msg.emptyUrlLiveQuery && !msg.query.trim() && !msg.pinnedQuery?.trim()

    if (!hasLive && !hasPinned && !allowEmptyUrlLive) return

    const resultMsg = runSearch({
      msg,
      cache,
      index,
      printingIndex,
      sessionSalt,
      tagData: tagDataRef,
      getListMask,
      keywordLabels: Object.keys(keywordsIndex),
      keywordDataRef,
    })

    const resultWithSide = msg.side !== undefined ? { ...resultMsg, side: msg.side } : resultMsg
    const transfer: Transferable[] = [resultMsg.indices.buffer]
    if (resultMsg.printingIndices) transfer.push(resultMsg.printingIndices.buffer)
    post(resultWithSide, transfer)
  }
}

init()
