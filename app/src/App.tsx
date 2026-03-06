// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, createMemo, Show, onCleanup } from 'solid-js'
import type { FromWorker, DisplayColumns, PrintingDisplayColumns, UniqueMode, BreakdownNode, Histograms } from '@frantic-search/shared'
import { parse, toScryfallQuery } from '@frantic-search/shared'
import SearchWorker from './worker?worker'
import SyntaxHelp from './SyntaxHelp'
import CardDetail from './CardDetail'
import BugReport from './BugReport'
import UnifiedBreakdown from './UnifiedBreakdown'
import MenuDrawer from './MenuDrawer'
import QueryHighlight from './QueryHighlight'
import { SearchProvider } from './SearchContext'
import SearchResults from './SearchResults'
import { BATCH_SIZES, isViewMode } from './view-mode'
import { dedupePrintingItems } from './dedup-printing-items'
import {
  buildFacesOf, buildScryfallIndex, buildPrintingScryfallIndex,
  buildPrintingScryfallGroupIndex,
  parseView, isDualWield, getPaneQueries,
} from './app-utils'
import type { View } from './app-utils'
import {
  saveScrollPosition, pushIfNeeded, scheduleDebouncedCommit,
  flushPendingCommit, cancelPendingCommit,
} from './history-debounce'
import { appendTerm, parseBreakdown, sealQuery } from './query-edit'
import { extractViewMode } from './view-query'
import { CardListStore } from './card-list-store'
import {
  buildOracleToCanonicalFaceMap,
  buildPrintingLookup,
  buildMasksForList,
  hasPrintingLevelEntries,
} from './list-mask-builder'
import { captureSearchExecuted, captureUiInteracted } from './analytics'
import { DualWieldLayout, useViewportWide } from './DualWieldLayout'
import { createPaneState } from './pane-state-factory'

declare const __REPO_URL__: string
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __THUMBS_FILENAME__: string

const HEADER_ART_BLUR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiuim5woNqirr7EztDOfJri8uDI8LjKzsb/2wBDASIkJDAqMF40NF7GhHCExsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsb/wAARCAAYACADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAEDAv/EACEQAAICAQQCAwAAAAAAAAAAAAECABEDEhMhMUFhIjJR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAgED/8QAFxEBAQEBAAAAAAAAAAAAAAAAAQACEf/aAAwDAQACEQMRAD8AxjUKTY9VXUGofYH1xK7QxqWZwx8yOVRQYZCwsCqkVGIDIhdttKgauO+jM5kBz6EHYHQjVWuwAteY8iH4kmzVWDDnT3lpoA7UymlJUDn3InKNKrxYu7hCLVlmQzNq45M0wORTuAjT+DsQhIBLS3//2Q=='

function App() {
  history.scrollRestoration = 'manual'
  const viewportWide = useViewportWide()

  const initialParams = new URLSearchParams(location.search)
  const initialQueries = getPaneQueries(initialParams)
  const [query, setQuery] = createSignal(initialQueries.left)
  const [query2, setQuery2] = createSignal(initialQueries.right)
  const [view, setView] = createSignal<View>(parseView(initialParams))
  const [cardId, setCardId] = createSignal(initialParams.get('card') ?? '')
  const [headerArtLoaded, setHeaderArtLoaded] = createSignal(false)
  const [dataProgress, setDataProgress] = createSignal(0)
  const [workerStatus, setWorkerStatus] = createSignal<'loading' | 'ready' | 'error'>('loading')
  const [workerError, setWorkerError] = createSignal('')
  const [errorCause, setErrorCause] = createSignal<'stale' | 'network' | 'unknown'>('unknown')
  const [display, setDisplay] = createSignal<DisplayColumns | null>(null)
  const [indices, setIndices] = createSignal<Uint32Array>(new Uint32Array(0))
  const [pinnedQuery, setPinnedQuery] = createSignal(
    localStorage.getItem('frantic-pinned-query') ?? ''
  )
  const [pinnedQuery2, setPinnedQuery2] = createSignal(
    localStorage.getItem('frantic-pinned2') ?? ''
  )
  createEffect(() => {
    const stored = localStorage.getItem('frantic-view-mode')
    if (!stored || !isViewMode(stored)) return
    const pq = pinnedQuery()
    if (extractViewMode(pq) !== 'slim') return
    setPinnedQuery(appendTerm(pq, `v:${stored}`, parseBreakdown(pq)))
    localStorage.removeItem('frantic-view-mode')
  })
  const [breakdown, setBreakdown] = createSignal<BreakdownNode | null>(null)
  const [histograms, setHistograms] = createSignal<Histograms | null>(null)
  const [printingDisplay, setPrintingDisplay] = createSignal<PrintingDisplayColumns | null>(null)
  const [printingIndices, setPrintingIndices] = createSignal<Uint32Array | undefined>(undefined)
  const [hasPrintingConditions, setHasPrintingConditions] = createSignal(false)
  const [uniqueMode, setUniqueMode] = createSignal<UniqueMode>('cards')
  const [indicesIncludingExtras, setIndicesIncludingExtras] = createSignal<number | undefined>(undefined)
  const [printingIndicesIncludingExtras, setPrintingIndicesIncludingExtras] = createSignal<number | undefined>(undefined)
  const [pinnedBreakdown, setPinnedBreakdown] = createSignal<BreakdownNode | null>(null)
  const [effectiveBreakdown, setEffectiveBreakdown] = createSignal<BreakdownNode | null>(null)
  const [pinnedIndicesCount, setPinnedIndicesCount] = createSignal<number | undefined>(undefined)
  const [pinnedPrintingCount, setPinnedPrintingCount] = createSignal<number | undefined>(undefined)
  // Right-pane state (Dual Wield only)
  const [indices2, setIndices2] = createSignal<Uint32Array>(new Uint32Array(0))
  const [breakdown2, setBreakdown2] = createSignal<BreakdownNode | null>(null)
  const [histograms2, setHistograms2] = createSignal<Histograms | null>(null)
  const [printingIndices2, setPrintingIndices2] = createSignal<Uint32Array | undefined>(undefined)
  const [hasPrintingConditions2, setHasPrintingConditions2] = createSignal(false)
  const [uniqueMode2, setUniqueMode2] = createSignal<UniqueMode>('cards')
  const [pinnedBreakdown2, setPinnedBreakdown2] = createSignal<BreakdownNode | null>(null)
  const [effectiveBreakdown2, setEffectiveBreakdown2] = createSignal<BreakdownNode | null>(null)
  const [pinnedIndicesCount2, setPinnedIndicesCount2] = createSignal<number | undefined>(undefined)
  const [pinnedPrintingCount2, setPinnedPrintingCount2] = createSignal<number | undefined>(undefined)
  const [indicesIncludingExtras2, setIndicesIncludingExtras2] = createSignal<number | undefined>(undefined)
  const [printingIndicesIncludingExtras2, setPrintingIndicesIncludingExtras2] = createSignal<number | undefined>(undefined)
  const [visibleCount2, setVisibleCount2] = createSignal(BATCH_SIZES.slim)
  const [breakdownExpanded2, setBreakdownExpanded2] = createSignal(
    localStorage.getItem('frantic-breakdown-expanded') !== 'false'
  )
  const [histogramsExpanded2, setHistogramsExpanded2] = createSignal(
    localStorage.getItem('frantic-results-options-expanded') === 'true'
  )
  function getInitialBreakdownExpanded(): boolean {
    const pinned = localStorage.getItem('frantic-pinned-expanded')
    const breakdown = localStorage.getItem('frantic-breakdown-expanded')
    const hasOldKeys = pinned !== null || breakdown !== null
    if (hasOldKeys) {
      const expanded = pinned === 'true' || breakdown === 'true'
      localStorage.setItem('frantic-breakdown-expanded', String(expanded))
      localStorage.removeItem('frantic-pinned-expanded')
      localStorage.removeItem('frantic-breakdown-expanded')
      return expanded
    }
    return localStorage.getItem('frantic-breakdown-expanded') !== 'false'
  }
  const [breakdownExpanded, setBreakdownExpanded] = createSignal(
    getInitialBreakdownExpanded()
  )
  const [histogramsExpanded, setHistogramsExpanded] = createSignal(
    localStorage.getItem('frantic-results-options-expanded') === 'true'
  )
  const [termsExpanded, setTermsExpanded] = createSignal(
    localStorage.getItem('frantic-terms-expanded') === 'true'
  )
  function toggleTerms() {
    setTermsExpanded(prev => {
      const next = !prev
      localStorage.setItem('frantic-terms-expanded', String(next))
      captureUiInteracted({ element_name: 'terms', action: 'toggled', state: next ? 'expanded' : 'collapsed' })
      captureUiInteracted({ element_name: 'menu_drawer', action: 'clicked', state: next ? 'opened' : 'closed' })
      return next
    })
  }
  const [inputFocused, setInputFocused] = createSignal(false)
  const urlEngaged = () => {
    const p = new URLSearchParams(location.search)
    return p.has('q') && p.get('q') === ''
  }
  const [userEngaged, setUserEngaged] = createSignal(
    initialParams.has('q') && initialParams.get('q') === ''
  )
  let programmaticFocusInProgress = false
  let textareaRef: HTMLTextAreaElement | undefined
  let textareaHlRef: HTMLDivElement | undefined

  const effectiveQuery = createMemo(() => {
    const p = pinnedQuery().trim()
    const q = query().trim()
    if (!p) return q
    if (!q) return p
    return sealQuery(p) + ' ' + sealQuery(q)
  })
  const viewMode = createMemo(() => extractViewMode(effectiveQuery()))
  const showOracleText = () => viewMode() === 'detail' || viewMode() === 'full'

  const facesOf = createMemo(() => {
    const d = display()
    return d ? buildFacesOf(d.canonical_face) : new Map<number, number[]>()
  })

  const scryfallIndex = createMemo(() => {
    const d = display()
    return d ? buildScryfallIndex(d.scryfall_ids, d.canonical_face) : new Map<string, number>()
  })

  const printingScryfallIndex = createMemo(() => {
    const pd = printingDisplay()
    return pd ? buildPrintingScryfallIndex(pd) : new Map<string, number>()
  })

  const printingScryfallGroupIndex = createMemo(() => {
    const pd = printingDisplay()
    return pd ? buildPrintingScryfallGroupIndex(pd) : new Map<string, number[]>()
  })

  const batchSize = () => BATCH_SIZES[viewMode()]
  const [visibleCount, setVisibleCount] = createSignal(BATCH_SIZES[viewMode()])

  createEffect(() => {
    indices()
    printingIndices()
    viewMode()
    setVisibleCount(batchSize())
  })
  createEffect(() => {
    indices2()
    printingIndices2()
    viewMode2()
    setVisibleCount2(BATCH_SIZES[viewMode2()])
  })

  const visibleIndices = createMemo(() => {
    const idx = indices()
    const len = Math.min(idx.length, visibleCount())
    const result: number[] = new Array(len)
    for (let i = 0; i < len; i++) result[i] = idx[i]
    return result
  })

  const showPrintingResults = () => {
    const pi = printingIndices()
    return pi !== undefined && pi.length > 0
  }

  const firstPrintingForCard = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
    if (!pi || !pd) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const idx of pi) {
      const ci = pd.canonical_face_ref[idx]
      if (!map.has(ci)) map.set(ci, idx)
    }
    return map
  })

  const totalPrintingItems = () => {
    const pi = printingIndices()
    return pi ? pi.length : 0
  }

  const dedupedPrintingItems = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
    if (!pi || !pd) return null
    return dedupePrintingItems(
      Array.from(pi),
      (idx) => pd.canonical_face_ref[idx],
      uniqueMode(),
      pd.illustration_id_index ? (idx) => pd.illustration_id_index![idx] : undefined,
    )
  })

  const finishGroupMap = createMemo(() => {
    const pi = printingIndices()
    const pd = printingDisplay()
    if (!pi || !pd) return new Map<string, { finish: number; price: number }[]>()
    const map = new Map<string, { finish: number; price: number }[]>()
    for (const idx of pi) {
      const sid = pd.scryfall_ids[idx]
      let group = map.get(sid)
      if (!group) { group = []; map.set(sid, group) }
      group.push({ finish: pd.finish[idx], price: pd.price_usd[idx] })
    }
    return map
  })

  const printingExpanded = () =>
    showPrintingResults() && (viewMode() === 'images' || viewMode() === 'full')

  const totalDisplayItems = () => {
    if (!printingExpanded()) return indices().length
    const d = dedupedPrintingItems()
    return d ? d.length : 0
  }

  const visibleDisplayItems = createMemo(() => {
    if (!printingExpanded()) return null
    const items = dedupedPrintingItems()
    if (!items) return null
    const len = Math.min(items.length, visibleCount())
    return items.slice(0, len)
  })

  const hasMore = () => totalDisplayItems() > visibleCount()

  const totalCards = () => indices().length

  const headerCollapsed = () =>
    urlEngaged() ||
    query().trim() !== '' ||
    termsExpanded() ||
    (inputFocused() && userEngaged())
  const scryfallUrl = () => {
    const q = effectiveQuery().trim()
    if (!q) return ''
    const canonical = toScryfallQuery(parse(q))
    return canonical ? `https://scryfall.com/search?q=${encodeURIComponent(canonical)}` : ''
  }

  async function fetchThumbHashes(): Promise<void> {
    try {
      const url = new URL(__THUMBS_FILENAME__, location.href)
      const resp = await fetch(url)
      if (!resp.ok) return
      const data: { art_crop: string[]; card: string[] } = await resp.json()
      setDisplay(prev => prev ? {
        ...prev,
        art_crop_thumb_hashes: data.art_crop,
        card_thumb_hashes: data.card,
      } : prev)
    } catch {
      // Thumb hashes are optional; gracefully degrade to gradients.
    }
  }

  const worker = new SearchWorker()
  let latestQueryId = 0
  let latestQueryIdLeft = 0
  let latestQueryIdRight = 0
  let searchCaptureTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSearchCapture: { query: string; used_extension: boolean; results_count: number } | null = null

  function scheduleSearchCapture(
    query: string,
    usedExtension: boolean,
    resultsCount: number
  ): void {
    if (!query.trim()) return
    pendingSearchCapture = { query: query.trim(), used_extension: usedExtension, results_count: resultsCount }
    if (searchCaptureTimer) clearTimeout(searchCaptureTimer)
    searchCaptureTimer = setTimeout(() => {
      if (pendingSearchCapture) {
        captureSearchExecuted(pendingSearchCapture)
        pendingSearchCapture = null
      }
      searchCaptureTimer = null
    }, 750)
  }

  function flushSearchCapture(): void {
    if (searchCaptureTimer) {
      clearTimeout(searchCaptureTimer)
      searchCaptureTimer = null
    }
    if (pendingSearchCapture) {
      captureSearchExecuted(pendingSearchCapture)
      pendingSearchCapture = null
    }
  }

  function sendListUpdatesFor(
    workerRef: Worker,
    affectedListIds: string[],
    d: DisplayColumns,
    pd: PrintingDisplayColumns | null,
    store: CardListStore
  ): void {
    const oracleMap = buildOracleToCanonicalFaceMap(d)
    const view = store.getView()
    const faceCount = d.oracle_ids.length
    const printingCount = pd?.scryfall_ids.length ?? 0
    const printingLookup = pd ? buildPrintingLookup(pd) : undefined
    for (const listId of affectedListIds) {
      const { faceMask, printingMask } = buildMasksForList({
        view,
        listId,
        faceCount,
        printingCount,
        oracleToCanonicalFace: oracleMap,
        printingLookup,
      })
      const transfer: Transferable[] = [faceMask.buffer]
      if (printingMask) transfer.push(printingMask.buffer)
      workerRef.postMessage({ type: 'list-update', listId, faceMask, printingMask }, transfer)
    }
  }

  const [listVersion, setListVersion] = createSignal(0)
  let cardListStore: CardListStore
  cardListStore = new CardListStore((affectedListIds) => {
    setListVersion((v) => v + 1)
    const d = display()
    if (!d) return
    sendListUpdatesFor(worker, affectedListIds, d, printingDisplay(), cardListStore)
  })
  createEffect(() => {
    cardListStore.init().catch((err) => {
      console.error('CardListStore init failed:', err)
    })
  })

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    switch (msg.type) {
      case 'status':
        if (msg.status === 'progress') {
          setDataProgress(msg.fraction)
        } else if (msg.status === 'printings-ready') {
          setPrintingDisplay(msg.printingDisplay)
          const view = cardListStore.getView()
          const listsWithPrintings = [...view.lists.keys()].filter((lid) =>
            hasPrintingLevelEntries(view, lid)
          )
          if (listsWithPrintings.length > 0) {
            const d = display()
            if (d) {
              sendListUpdatesFor(
                worker,
                listsWithPrintings,
                d,
                msg.printingDisplay,
                cardListStore
              )
            }
          }
        } else {
          if (msg.status === 'ready') {
            setDataProgress(1)
            setDisplay(msg.display)
            fetchThumbHashes()
            cardListStore
              .init()
              .then(() => {
                const d = msg.display
                const pd = printingDisplay()
                const oracleMap = buildOracleToCanonicalFaceMap(d)
                const view = cardListStore.getView()
                const faceCount = d.oracle_ids.length
                const printingCount = pd?.scryfall_ids.length ?? 0
                const printingLookup = pd ? buildPrintingLookup(pd) : undefined
                const listIds = [...view.lists.keys()]
                for (const listId of listIds) {
                  const { faceMask, printingMask } = buildMasksForList({
                    view,
                    listId,
                    faceCount,
                    printingCount,
                    oracleToCanonicalFace: oracleMap,
                    printingLookup,
                  })
                  const transfer: Transferable[] = [faceMask.buffer]
                  if (printingMask) transfer.push(printingMask.buffer)
                  worker.postMessage({ type: 'list-update', listId, faceMask, printingMask }, transfer)
                }
                setWorkerStatus('ready')
              })
              .catch((err) => {
                console.error('CardListStore init failed:', err)
                setWorkerStatus('ready')
              })
          } else {
            setWorkerStatus(msg.status)
          }
          if (msg.status === 'error') {
            setWorkerError(msg.error)
            setErrorCause(msg.cause)
          }
        }
        break
      case 'result': {
        const side = msg.side
        const matchesLeft = !side && msg.queryId === latestQueryId
        const matchesLeftDual = side === 'left' && msg.queryId === latestQueryIdLeft
        const matchesRight = side === 'right' && msg.queryId === latestQueryIdRight
        if (matchesRight) {
          setIndices2(msg.indices)
          setBreakdown2(msg.breakdown)
          setPinnedBreakdown2(msg.pinnedBreakdown ?? null)
          setEffectiveBreakdown2(msg.effectiveBreakdown ?? msg.breakdown)
          setPinnedIndicesCount2(msg.pinnedIndicesCount)
          setPinnedPrintingCount2(msg.pinnedPrintingCount)
          setHistograms2(msg.histograms)
          setPrintingIndices2(msg.printingIndices)
          setHasPrintingConditions2(msg.hasPrintingConditions)
          setUniqueMode2(msg.uniqueMode)
          setIndicesIncludingExtras2(msg.indicesIncludingExtras)
          setPrintingIndicesIncludingExtras2(msg.printingIndicesIncludingExtras)
        } else if (matchesLeft || matchesLeftDual) {
          setIndices(msg.indices)
          setBreakdown(msg.breakdown)
          setPinnedBreakdown(msg.pinnedBreakdown ?? null)
          setEffectiveBreakdown(msg.effectiveBreakdown ?? msg.breakdown)
          setPinnedIndicesCount(msg.pinnedIndicesCount)
          setPinnedPrintingCount(msg.pinnedPrintingCount)
          setHistograms(msg.histograms)
          setPrintingIndices(msg.printingIndices)
          setHasPrintingConditions(msg.hasPrintingConditions)
          setUniqueMode(msg.uniqueMode)
          setIndicesIncludingExtras(msg.indicesIncludingExtras)
          setPrintingIndicesIncludingExtras(msg.printingIndicesIncludingExtras)
          const eq = effectiveQuery().trim()
          if (eq) {
            const usedExtension = (msg.includeExtras ?? false) || msg.uniqueMode !== 'cards'
            const resultsCount = msg.printingIndices && msg.printingIndices.length > 0 && (viewMode() === 'images' || viewMode() === 'full')
              ? msg.printingIndices.length
              : msg.indices.length
            scheduleSearchCapture(eq, usedExtension, resultsCount)
          }
        }
        break
      }
    }
  }

  createEffect(() => {
    const pq = pinnedQuery()
    if (pq) localStorage.setItem('frantic-pinned-query', pq)
    else localStorage.removeItem('frantic-pinned-query')
  })
  createEffect(() => {
    const pq = pinnedQuery2()
    if (pq) localStorage.setItem('frantic-pinned2', pq)
    else localStorage.removeItem('frantic-pinned2')
  })

  createEffect(() => {
    const params = new URLSearchParams(location.search)
    const dual = isDualWield(params)
    const q = query().trim()
    const pq = pinnedQuery().trim()
    const q2 = query2().trim()
    const pq2 = pinnedQuery2().trim()

    if (dual) {
      if (workerStatus() === 'ready') {
        if (q || pq) {
          latestQueryIdLeft++
          worker.postMessage({
            type: 'search', queryId: latestQueryIdLeft, query: query(),
            pinnedQuery: pq || undefined,
            viewMode: viewMode(),
            side: 'left',
          })
        } else {
          setIndices(new Uint32Array(0))
          setBreakdown(null)
          setPinnedBreakdown(null)
          setEffectiveBreakdown(null)
          setPinnedIndicesCount(undefined)
          setPinnedPrintingCount(undefined)
          setHistograms(null)
          setPrintingIndices(undefined)
          setHasPrintingConditions(false)
          setUniqueMode('cards')
          setIndicesIncludingExtras(undefined)
          setPrintingIndicesIncludingExtras(undefined)
        }
        if (q2 || pq2) {
          latestQueryIdRight++
          const viewMode2 = extractViewMode(
            pq2 ? sealQuery(pq2) + ' ' + sealQuery(q2) : q2
          )
          worker.postMessage({
            type: 'search', queryId: latestQueryIdRight, query: query2(),
            pinnedQuery: pq2 || undefined,
            viewMode: viewMode2,
            side: 'right',
          })
        } else {
          setIndices2(new Uint32Array(0))
          setBreakdown2(null)
          setPinnedBreakdown2(null)
          setEffectiveBreakdown2(null)
          setPinnedIndicesCount2(undefined)
          setPinnedPrintingCount2(undefined)
          setHistograms2(null)
          setPrintingIndices2(undefined)
          setHasPrintingConditions2(false)
          setUniqueMode2('cards')
          setIndicesIncludingExtras2(undefined)
          setPrintingIndicesIncludingExtras2(undefined)
        }
      }
    } else {
      if (workerStatus() === 'ready' && (q || pq)) {
        latestQueryId++
        worker.postMessage({
          type: 'search', queryId: latestQueryId, query: query(),
          pinnedQuery: pq || undefined,
          viewMode: viewMode(),
        })
      }
      if (!q && !pq) {
        setIndices(new Uint32Array(0))
        setBreakdown(null)
        setPinnedBreakdown(null)
        setEffectiveBreakdown(null)
        setPinnedIndicesCount(undefined)
        setPinnedPrintingCount(undefined)
        setHistograms(null)
        setPrintingIndices(undefined)
        setHasPrintingConditions(false)
        setUniqueMode('cards')
        setIndicesIncludingExtras(undefined)
        setPrintingIndicesIncludingExtras(undefined)
      } else if (!q) {
        setIndices(new Uint32Array(0))
        setBreakdown(null)
        setHistograms(null)
        setPrintingIndices(undefined)
        setHasPrintingConditions(false)
        setUniqueMode('cards')
        setIndicesIncludingExtras(undefined)
        setPrintingIndicesIncludingExtras(undefined)
      }
    }
  })

  createEffect(() => {
    const engaged = userEngaged() || termsExpanded()
    if (view() !== 'search') return
    const params = new URLSearchParams(location.search)
    if (isDualWield(params)) {
      const q1 = query().trim()
      if (q1) params.set('q1', query())
      else params.delete('q1')
      params.set('q2', query2())
      params.delete('q')
    } else {
      const q = query().trim()
      if (q) {
        params.set('q', query())
      } else if (engaged) {
        params.set('q', '')
      } else {
        params.delete('q')
      }
      params.delete('q1')
      params.delete('q2')
    }
    const url = params.toString() ? `?${params}` : location.pathname
    pushIfNeeded()
    history.replaceState(history.state, '', url)
    scheduleDebouncedCommit()
  })

  window.addEventListener('popstate', () => {
    cancelPendingCommit()

    const params = new URLSearchParams(location.search)
    setView(parseView(params))
    const { left, right } = getPaneQueries(params)
    setQuery(left)
    setQuery2(right)
    setCardId(params.get('card') ?? '')
    setUserEngaged(params.has('q') && params.get('q') === '')

    const scrollY = history.state?.scrollY ?? 0
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
  })

  window.addEventListener('online', () => {
    if (workerStatus() === 'error' && errorCause() === 'network') {
      location.reload()
    }
  })

  function navigateToHelp() {
    cancelPendingCommit()
    saveScrollPosition()
    captureUiInteracted({ element_name: 'syntax_help', action: 'clicked' })
    const params = new URLSearchParams(location.search)
    params.set('help', '')
    history.pushState(null, '', `?${params}`)
    setView('help')
    window.scrollTo(0, 0)
  }

  function navigateToQuery(q: string) {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const url = params.toString() ? `?${params}` : location.pathname
    history.pushState(null, '', url)
    setQuery(q)
    setQuery2('')
    setView('search')
    window.scrollTo(0, 0)
  }

  function navigateToCard(scryfallId: string) {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams(location.search)
    params.delete('help')
    params.set('card', scryfallId)
    history.pushState(null, '', `?${params}`)
    setCardId(scryfallId)
    setView('card')
    window.scrollTo(0, 0)
  }

  function navigateToReport() {
    cancelPendingCommit()
    saveScrollPosition()
    captureUiInteracted({ element_name: 'bug_report', action: 'clicked' })
    const params = new URLSearchParams()
    const q = query().trim()
    if (q) params.set('q', q)
    params.set('report', '')
    history.pushState(null, '', `?${params}`)
    setView('report')
    window.scrollTo(0, 0)
  }

  function enterDualWield() {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams(location.search)
    const current = query().trim() || query2().trim() || params.get('q1') || params.get('q') || ''
    params.delete('q')
    params.set('q1', current)
    params.set('q2', current)
    history.pushState(null, '', `?${params}`)
    setQuery(current)
    setQuery2(current)
    setView('search')
    window.scrollTo(0, 0)
  }

  function leaveDualWield() {
    cancelPendingCommit()
    saveScrollPosition()
    const params = new URLSearchParams(location.search)
    const left = query().trim()
    if (left) params.set('q', left)
    else params.delete('q')
    params.delete('q1')
    params.delete('q2')
    const url = params.toString() ? `?${params}` : location.pathname
    history.pushState(null, '', url)
    setQuery2('')
    setView('search')
    window.scrollTo(0, 0)
  }

  function focusSearchInput(programmatic = false) {
    if (!textareaRef || workerStatus() === 'error') return
    if (programmatic) programmaticFocusInProgress = true
    textareaRef.focus()
  }

  const prefersFinePointer = () => matchMedia('(pointer: fine)').matches

  const slashKeyHandler = (e: KeyboardEvent) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    const target = e.target as Node
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return
    e.preventDefault()
    e.stopPropagation()
    if (view() !== 'search') navigateToQuery(query())
    queueMicrotask(focusSearchInput)
  }
  document.addEventListener('keydown', slashKeyHandler, true)
  onCleanup(() => document.removeEventListener('keydown', slashKeyHandler, true))

  createEffect(() => {
    if (view() !== 'search') return
    if (!prefersFinePointer()) return
    queueMicrotask(() => focusSearchInput(true))
  })

  function hardReload() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  function navigateHome() {
    if (termsExpanded()) {
      setTermsExpanded(false)
      localStorage.setItem('frantic-terms-expanded', 'false')
      return
    }

    const isAtHome =
      view() === 'search' &&
      !query().trim() &&
      !cardId() &&
      !userEngaged()

    if (isAtHome) {
      history.replaceState(null, '', location.pathname)
      hardReload()
      return
    }

    // Not at home — soft reset to initial state
    cancelPendingCommit()
    saveScrollPosition()
    history.pushState(null, '', location.pathname)
    setQuery('')
    setQuery2('')
    setView('search')
    setCardId('')
    setUserEngaged(false)
    window.scrollTo(0, 0)
  }

  const effectiveQuery2 = createMemo(() => {
    const p = pinnedQuery2().trim()
    const q = query2().trim()
    if (!p) return q
    if (!q) return p
    return sealQuery(p) + ' ' + sealQuery(q)
  })
  const viewMode2 = createMemo(() => extractViewMode(effectiveQuery2()))

  const params = () => new URLSearchParams(location.search)
  const showDualWield = () =>
    view() === 'search' && isDualWield(params()) && viewportWide()

  const leftPaneState = createPaneState({
    query,
    setQuery,
    pinnedQuery,
    setPinnedQuery,
    indices,
    breakdown,
    pinnedBreakdown,
    effectiveBreakdown,
    pinnedIndicesCount,
    pinnedPrintingCount,
    histograms,
    printingIndices,
    hasPrintingConditions,
    uniqueMode,
    indicesIncludingExtras,
    printingIndicesIncludingExtras,
    display,
    printingDisplay,
    breakdownExpanded,
    setBreakdownExpanded,
    histogramsExpanded,
    setHistogramsExpanded,
    visibleCount,
    setVisibleCount,
    flushPendingCommit,
    navigateToReport,
    navigateToCard,
  })

  const rightPaneState = createPaneState({
    query: query2,
    setQuery: setQuery2,
    pinnedQuery: pinnedQuery2,
    setPinnedQuery: setPinnedQuery2,
    indices: indices2,
    breakdown: breakdown2,
    pinnedBreakdown: pinnedBreakdown2,
    effectiveBreakdown: effectiveBreakdown2,
    pinnedIndicesCount: pinnedIndicesCount2,
    pinnedPrintingCount: pinnedPrintingCount2,
    histograms: histograms2,
    printingIndices: printingIndices2,
    hasPrintingConditions: hasPrintingConditions2,
    uniqueMode: uniqueMode2,
    indicesIncludingExtras: indicesIncludingExtras2,
    printingIndicesIncludingExtras: printingIndicesIncludingExtras2,
    display,
    printingDisplay,
    breakdownExpanded: breakdownExpanded2,
    setBreakdownExpanded: setBreakdownExpanded2,
    histogramsExpanded: histogramsExpanded2,
    setHistogramsExpanded: setHistogramsExpanded2,
    visibleCount: visibleCount2,
    setVisibleCount: setVisibleCount2,
    flushPendingCommit,
    navigateToReport,
    navigateToCard,
  })

  const searchContextValue = {
    query,
    setQuery,
    display,
    histograms,
    histogramsExpanded: leftPaneState.histogramsExpanded,
    toggleHistograms: leftPaneState.toggleHistograms,
    hasPrintingConditions,
    printingDisplay,
    uniqueMode,
    indicesIncludingExtras,
    printingIndicesIncludingExtras,
    viewMode,
    changeViewMode: leftPaneState.changeViewMode,
    changeUniqueMode: leftPaneState.changeUniqueMode,
    showOracleText,
    facesOf,
    visibleIndices,
    visibleDisplayItems,
    firstPrintingForCard,
    dedupedPrintingItems,
    finishGroupMap,
    totalCards,
    totalPrintingItems,
    totalDisplayItems,
    hasMore,
    batchSize,
    visibleCount,
    printingExpanded,
    showPrintingResults,
    scryfallUrl,
    flushPendingCommit,
    setVisibleCount,
    navigateToReport,
    navigateToCard,
    appendTerm,
    parseBreakdown,
  }

  return (
    <div class="min-h-dvh overscroll-y-none bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      <Show when={view() === 'help'}>
        <SyntaxHelp onSelectExample={navigateToQuery} />
      </Show>
      <Show when={view() === 'card'}>
        {(() => {
          const oracleCI = () => scryfallIndex().get(cardId())
          const printingPI = () => printingScryfallIndex().get(cardId())
          const printingPIs = () => printingScryfallGroupIndex().get(cardId())
          const resolvedCI = () => {
            const oci = oracleCI()
            if (oci !== undefined) return oci
            const pi = printingPI()
            const pd = printingDisplay()
            if (pi !== undefined && pd) return pd.canonical_face_ref[pi]
            return undefined
          }
          return (
            <CardDetail
              canonicalIndex={resolvedCI()}
              scryfallId={cardId()}
              display={display()}
              facesOf={facesOf()}
              printingIndices={printingPIs()}
              printingDisplay={printingDisplay()}
              onNavigateToQuery={navigateToQuery}
              cardListStore={cardListStore}
              listVersion={listVersion()}
            />
          )
        })()}
      </Show>
      <Show when={view() === 'report'}>
        <BugReport
          query={effectiveQuery()}
          breakdown={effectiveBreakdown()}
          resultCount={totalCards()}
          printingCount={
            hasPrintingConditions() || uniqueMode() !== 'cards'
              ? totalPrintingItems()
              : undefined
          }
        />
      </Show>
      <Show when={view() === 'search'}>
        <Show when={showDualWield()}>
          <DualWieldLayout
            leftState={leftPaneState}
            rightState={rightPaneState}
            setUserEngaged={setUserEngaged}
            workerStatus={workerStatus}
            navigateToHelp={navigateToHelp}
            navigateToReport={navigateToReport}
            onLeaveDualWield={leaveDualWield}
          />
        </Show>
        <Show when={!showDualWield()}>
        <SearchProvider value={searchContextValue}>
      <header class={`mx-auto max-w-2xl px-4 transition-all duration-200 ease-out ${headerCollapsed() ? 'pt-[max(1rem,env(safe-area-inset-top))] pb-4' : 'pt-[max(4rem,env(safe-area-inset-top))] pb-8'}`}>
        <Show when={headerCollapsed()} fallback={
          <>
            <button
              type="button"
              onClick={() => navigateHome()}
              aria-label="Go to home"
              class="relative w-full overflow-hidden shadow-md bg-cover block text-left border-0 p-0 cursor-pointer transition-all duration-200 ease-out hover:opacity-95 active:opacity-90 h-14 bg-[center_20%] rounded-xl mb-4"
              style={{ "background-image": `url(${HEADER_ART_BLUR})` }}
            >
              <img
                src="https://cards.scryfall.io/art_crop/front/1/9/1904db14-6df7-424f-afa5-e3dfab31300a.jpg?1764758766"
                alt="Frantic Search card art by Mitchell Malloy"
                onLoad={() => setHeaderArtLoaded(true)}
                class="h-full w-full object-cover pointer-events-none object-[center_20%]"
                style={{
                  opacity: headerArtLoaded() ? dataProgress() : 0,
                  'clip-path': headerArtLoaded() ? `inset(0 ${(1 - dataProgress()) * 100}% 0 0)` : 'inset(0 100% 0 0)',
                  transition: 'clip-path 100ms linear, opacity 100ms linear',
                }}
              />
              <div
                class="absolute bottom-0 left-0 h-1 bg-blue-500 dark:bg-blue-400 rounded-b-xl"
                style={{
                  width: `${dataProgress() * 100}%`,
                  opacity: 1 - (dataProgress() ** 20),
                  transition: 'width 100ms linear, opacity 200ms ease-out',
                }}
              />
            </button>
            <div class="overflow-hidden transition-all duration-200 ease-out max-h-80 opacity-100">
              <h1 class="text-3xl font-bold tracking-tight text-center mb-1">
                Frantic Search
              </h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
                Instant MTG card search
              </p>
            </div>
          </>
        }>
          <div class="flex h-11 items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => navigateHome()}
              aria-label="Go to home"
              class="flex h-11 min-w-11 -ml-2 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <img src="/pwa-192x192.png" alt="" class="size-8 rounded-lg" />
            </button>
            <div class="flex items-center gap-1">
              <Show when={viewportWide()}>
                <button
                  type="button"
                  onClick={enterDualWield}
                  aria-label="Split view"
                  title="Split view"
                  class="flex h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <rect x="3" y="3" width="9" height="18" rx="1" />
                    <rect x="12" y="3" width="9" height="18" rx="1" />
                  </svg>
                </button>
              </Show>
              <button
                type="button"
                onClick={toggleTerms}
                aria-label="Menu"
                class={`flex h-11 min-w-11 items-center justify-center rounded-lg transition-colors ${termsExpanded() ? 'text-blue-500 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>
          </div>
        </Show>

        <Show when={termsExpanded() && headerCollapsed()}>
          <div
            role="presentation"
            class="fixed inset-0 z-40 bg-black/30 transition-opacity"
            onClick={toggleTerms}
          />
          <aside
            class="fixed top-0 right-0 bottom-0 z-50 w-[min(100%,20rem)] overflow-hidden flex flex-col bg-white dark:bg-gray-900 shadow-xl transition-transform duration-200 ease-out translate-x-0"
            aria-label="Filters menu"
            onWheel={(e) => e.stopPropagation()}
          >
            <div class="flex flex-col flex-1 min-h-0 pt-[env(safe-area-inset-top)]">
              <MenuDrawer
                query={query()}
                onSetQuery={(q) => { flushPendingCommit(); setQuery(q) }}
                onHelpClick={navigateToHelp}
                onReportClick={navigateToReport}
                onClose={toggleTerms}
              />
            </div>
          </aside>
        </Show>

        <div class="overflow-hidden rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
          <Show when={termsExpanded() && !headerCollapsed()}>
            <div class="max-h-96 overflow-hidden flex flex-col">
              <MenuDrawer
                query={query()}
                onSetQuery={(q) => { flushPendingCommit(); setQuery(q) }}
                onHelpClick={navigateToHelp}
                onReportClick={navigateToReport}
                onClose={toggleTerms}
              />
            </div>
          </Show>
          <div class={`relative bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 ${termsExpanded() && !headerCollapsed() ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}>
            <div class="absolute left-0 top-0 flex items-center pl-2.5 pr-1 py-3 text-gray-400 dark:text-gray-500 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <div class="grid overflow-hidden">
              <div ref={textareaHlRef} class={`hl-layer overflow-hidden whitespace-pre-wrap break-words px-4 py-3 pl-11 ${headerCollapsed() ? 'pr-4' : 'pr-10'}`}>
                <QueryHighlight query={query()} class="text-base leading-normal whitespace-pre-wrap break-words" />
              </div>
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder='Search cards…'
                autocapitalize="none"
                autocomplete="off"
                autocorrect="off"
                spellcheck={false}
                value={query()}
                onInput={(e) => { setQuery(e.currentTarget.value); setUserEngaged(true); if (textareaHlRef) { textareaHlRef.scrollTop = e.currentTarget.scrollTop; textareaHlRef.scrollLeft = e.currentTarget.scrollLeft } }}
                onScroll={(e) => { if (textareaHlRef) { textareaHlRef.scrollTop = e.currentTarget.scrollTop; textareaHlRef.scrollLeft = e.currentTarget.scrollLeft } }}
                onFocus={(e) => { setInputFocused(true); if (!programmaticFocusInProgress) setUserEngaged(true); else programmaticFocusInProgress = false; e.preventDefault() }}
                onBlur={() => { setInputFocused(false); flushSearchCapture() }}
                disabled={workerStatus() === 'error'}
                class={`hl-input w-full bg-transparent px-4 py-3 pl-11 text-base leading-normal font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all disabled:opacity-50 resize-y ${headerCollapsed() ? 'pr-4' : 'pr-10'}`}
              />
            </div>
            <Show when={!headerCollapsed()}>
              <button
                type="button"
                onClick={toggleTerms}
                class={`absolute right-0 top-0 py-3 px-3 flex items-center justify-center transition-colors ${termsExpanded() ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                aria-label="Toggle search filters"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
                </svg>
              </button>
            </Show>
          </div>
          <Show when={pinnedBreakdown() || (query().trim() !== '' && breakdown())}>
            <UnifiedBreakdown
              pinnedBreakdown={pinnedBreakdown()}
              pinnedCardCount={pinnedIndicesCount() ?? 0}
              pinnedPrintingCount={pinnedPrintingCount()}
              liveBreakdown={query().trim() !== '' ? breakdown() : null}
              liveCardCount={totalCards()}
              livePrintingCount={showPrintingResults() ? totalPrintingItems() : undefined}
              expanded={breakdownExpanded()}
              onToggle={leftPaneState.toggleBreakdown}
              onPin={(nodeLabel) => { flushPendingCommit(); leftPaneState.handlePin(nodeLabel) }}
              onUnpin={(nodeLabel) => { flushPendingCommit(); leftPaneState.handleUnpin(nodeLabel) }}
              onPinnedRemove={(q) => { flushPendingCommit(); leftPaneState.handlePinnedRemove(q) }}
              onLiveRemove={(q) => { flushPendingCommit(); setQuery(q) }}
            />
          </Show>
        </div>
      </header>

      <main class="mx-auto max-w-2xl px-4">
        <Show when={workerStatus() === 'error'}>
          <div class="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 shadow-sm">
            <Show when={errorCause() === 'stale'} fallback={<>
              <p class="text-sm font-medium text-red-800 dark:text-red-200">Could not load card data</p>
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                {errorCause() === 'network'
                  ? 'Check your internet connection. The page will reload automatically when connectivity is restored.'
                  : workerError()}
              </p>
              <button
                type="button"
                onClick={() => location.reload()}
                class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                Try again
              </button>
            </>}>
              <p class="text-sm font-medium text-red-800 dark:text-red-200">Card data is out of date</p>
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                A newer version of Frantic Search has been deployed. Reload to get the latest data.
              </p>
              <button
                type="button"
                onClick={() => hardReload()}
                class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                Reload
              </button>
            </Show>
          </div>
        </Show>

        <Show when={workerStatus() === 'loading'}>
          <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
            Loading card data…
          </p>
        </Show>

        <Show when={workerStatus() === 'ready' && display()}>
          <SearchResults />
        </Show>
      </main>
        </SearchProvider>
        </Show>
      </Show>
    </div>
  )
}

export default App
