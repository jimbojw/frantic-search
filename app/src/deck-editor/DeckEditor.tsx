// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, createEffect, onMount, onCleanup, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import {
  lexDeckList,
  detectDeckFormat,
  importDeckList,
  diffDeckList,
  enrichDiffForPreserve,
  parsedEntriesFromInstances,
} from '@frantic-search/shared'
import type {
  DeckScores,
  DisplayColumns,
  PrintingDisplayColumns,
  InstanceState,
  ListMetadata,
  DeckFormat,
  LineValidation,
  LineValidationResult,
  QuickFix,
  ValidationResult,
} from '@frantic-search/shared'
import type { DiffResult, ImportCandidate } from '@frantic-search/shared'
import type { CardListStore } from '../card-list-store'
import {
  draftKey,
  baselineKey,
  readDraftFromStorage,
  writeDraftToStorage,
  clearDraftFromStorage,
  readBaselineFromStorage,
  writeBaselineToStorage,
  readFormatFromStorage,
  writeFormatToStorage,
  readPreserveTags,
  writePreserveTags,
  readPreserveCollectionStatus,
  writePreserveCollectionStatus,
  readPreserveVariants,
  writePreserveVariants,
} from './storage'
import { serialize, ALL_FORMATS } from './serialization'
import {
  buildValidationResultFromCache,
  type CachedError,
  type ResolvedCacheEntry,
} from './validation-cache'
import {
  captureMyListInteracted,
  toMyListListId,
  type MyListEditorMode,
  type MyListExportOutlinkId,
} from '../analytics'
import { DeckEditorContext, type DeckEditorContextValue, type DeckReportContext } from './DeckEditorContext'
import DeckEditorToolbar from './DeckEditorToolbar'
import DeckEditorStatus from './DeckEditorStatus'
import DeckEditorFormatChips from './DeckEditorFormatChips'
import DeckEditorTextarea from './DeckEditorTextarea'
import DeckEditorReviewView from './DeckEditorReviewView'
import type { EditorMode } from './types'

export type { EditorMode } from './types'

const VALIDATION_DEBOUNCE_MS = 150

const ERRORS_EXPANDED_KEY = 'frantic-deck-editor-errors-expanded'

export default function DeckEditor(props: {
  listId: string
  instances: InstanceState[]
  metadata: ListMetadata | null
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  workerStatus: () => 'loading' | 'ready' | 'error'
  deckScores?: Accessor<DeckScores | null>
  cardListStore: CardListStore
  onApplySuccess?: () => void
  onSerializeRequest?: (instances: InstanceState[], format: DeckFormat, listName?: string) => Promise<string>
  onValidateRequest?: (lines: string[]) => Promise<{ result: LineValidationResult[]; indices: Int32Array }>
  onDraftActiveChange?: (active: boolean) => void
  onDeckReportClick?: (context: DeckReportContext) => void
  onViewInSearch?: (listId: string) => void
  onEditorModeChange?: (mode: EditorMode) => void
}) {
  const [draftText, setDraftText] = createSignal<string | null>(null)
  const [baselineText, setBaselineText] = createSignal<string | null>(null)
  const [selectedFormat, setSelectedFormat] = createSignal<DeckFormat>(readFormatFromStorage())
  const [saveInProgress, setSaveInProgress] = createSignal(false)
  const [reviewModeActive, setReviewModeActive] = createSignal(false)
  const [reviewFilterAdded, setReviewFilterAdded] = createSignal(true)
  const [reviewFilterRemoved, setReviewFilterRemoved] = createSignal(true)
  const [reviewFilterUnchanged, setReviewFilterUnchanged] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [quickFixApplying, setQuickFixApplying] = createSignal<{ lineIndex: number; fixIndex: number } | null>(null)
  const [debouncedDraft, setDebouncedDraft] = createSignal<string>('')
  const [textareaEl, setTextareaEl] = createSignal<HTMLTextAreaElement | null>(null)
  const [preserveTags, setPreserveTags] = createSignal(readPreserveTags())
  const [preserveCollectionStatus, setPreserveCollectionStatus] = createSignal(readPreserveCollectionStatus())
  const [preserveVariants, setPreserveVariants] = createSignal(readPreserveVariants())
  const [validationErrorsExpanded, setValidationErrorsExpanded] = createSignal(
    typeof localStorage !== 'undefined' && localStorage.getItem(ERRORS_EXPANDED_KEY) === 'true',
  )

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const lineCache = new Map<string, 'valid' | CachedError>()
  const resolvedCache = new Map<string, ResolvedCacheEntry>()

  function clearLineCache(): void {
    lineCache.clear()
    resolvedCache.clear()
  }

  onMount(() => {
    const cached = readDraftFromStorage(props.listId)
    const baseline = readBaselineFromStorage(props.listId)
    if (cached !== null) {
      setDraftText(cached)
      setDebouncedDraft(cached)
    }
    if (baseline !== null) {
      setBaselineText(baseline)
    }
  })

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  function handleStorageEvent(e: StorageEvent) {
    if (e.key === draftKey(props.listId)) {
      if (e.newValue === null) {
        setDraftText(null)
        setDebouncedDraft('')
        setBaselineText(null)
        clearLineCache()
      } else {
        try {
          const parsed = JSON.parse(e.newValue) as { text?: string }
          if (typeof parsed.text === 'string') {
            setDraftText(parsed.text)
            setDebouncedDraft(parsed.text)
          }
        } catch {
          // ignore malformed
        }
      }
    } else if (e.key === baselineKey(props.listId) && e.newValue !== null) {
      setBaselineText(e.newValue)
    }
  }

  onMount(() => {
    window.addEventListener('storage', handleStorageEvent)
  })
  onCleanup(() => {
    window.removeEventListener('storage', handleStorageEvent)
  })

  const hasInstances = () => props.instances.length > 0

  const preserveCounts = createMemo(() => {
    const ins = props.instances
    let tagsCount = 0
    let collectionCount = 0
    let variantsCount = 0
    for (const i of ins) {
      if (i.tags.length > 0) tagsCount++
      if (i.collection_status && i.collection_status !== '') collectionCount++
      if (i.variant && i.variant !== '') variantsCount++
    }
    return { tagsCount, collectionCount, variantsCount }
  })

  const mode = createMemo<EditorMode>(() => {
    if (reviewModeActive()) return 'review'
    if (draftText() !== null) return 'edit'
    if (hasInstances()) return 'display'
    return 'init'
  })

  function myListAnalyticsBase(): { list_id: ReturnType<typeof toMyListListId>; editor_mode: MyListEditorMode } {
    return {
      list_id: toMyListListId(props.listId),
      editor_mode: mode() as MyListEditorMode,
    }
  }

  createEffect(() => {
    props.onDraftActiveChange?.(draftText() !== null)
  })

  createEffect(() => {
    props.onEditorModeChange?.(mode())
  })

  // Populate baseline when in Edit mode with cached draft (restore-from-cache case)
  createEffect(() => {
    if (mode() !== 'edit' || baselineText() !== null) return
    const ins = props.instances
    const fmt = selectedFormat()
    if (!props.display) {
      setBaselineText('')
      return
    }
    if (props.onSerializeRequest) {
      props.onSerializeRequest(ins, fmt, props.metadata?.name).then((text) => {
        setBaselineText(text)
        writeBaselineToStorage(props.listId, text)
      })
    } else {
      const text = serialize(fmt, ins, props.display!, props.printingDisplay, props.metadata?.name)
      setBaselineText(text)
      writeBaselineToStorage(props.listId, text)
    }
  })

  const [serializedText, setSerializedText] = createSignal<string>('')
  let serializeVersion = 0
  createEffect(() => {
    if (mode() !== 'display' || !hasInstances() || !props.display) return
    const ins = props.instances
    const fmt = selectedFormat()
    if (props.onSerializeRequest) {
      const version = ++serializeVersion
      props.onSerializeRequest(ins, fmt, props.metadata?.name).then((text) => {
        if (version === serializeVersion) setSerializedText(text)
      })
    } else {
      setSerializedText(serialize(fmt, ins, props.display!, props.printingDisplay, props.metadata?.name))
    }
  })

  function buildValidationResult(text: string): ValidationResult {
    if (!props.display) return { lines: [], resolved: [] }
    return buildValidationResultFromCache(text, lineCache, resolvedCache, props.display, props.printingDisplay)
  }

  const [validationResult, setValidationResult] = createSignal<ValidationResult | null>(null)
  let validationVersion = 0
  createEffect(() => {
    const t = debouncedDraft()
    if (!t.trim()) {
      setValidationResult(buildValidationResult(t))
      return
    }
    const draft = draftText()
    const base = baselineText()

    if (draft !== null && base !== null && draft === base) {
      const baseLines = base.split(/\r?\n/)
      let needsSeed = false
      for (const line of baseLines) {
        const trimmed = line.trim()
        if (trimmed && !lineCache.has(trimmed)) {
          needsSeed = true
          break
        }
      }
      if (needsSeed && props.display) {
        if (props.instances.length > 0) {
          const fmt = selectedFormat()
          const entries = parsedEntriesFromInstances(props.instances, props.display, props.printingDisplay, fmt)
          let idx = 0
          for (const line of baseLines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('//') || /^\s*[A-Z]+\s*:?\s*$/.test(trimmed)) continue
            if (!lineCache.has(trimmed)) {
              lineCache.set(trimmed, 'valid')
              if (idx < entries.length && /^\d+x?\s/.test(trimmed)) {
                resolvedCache.set(trimmed, entries[idx]!)
                idx++
              }
            }
          }
        } else if (props.onValidateRequest && props.workerStatus() !== 'error') {
          const toValidate = baseLines.map((l) => l.trim()).filter((trimmed) => trimmed !== '' && !lineCache.has(trimmed))
          if (toValidate.length > 0) {
            setValidationResult(buildValidationResult(t))
            const version = ++validationVersion
            props.onValidateRequest(toValidate).then(({ result, indices }) => {
              if (version !== validationVersion) return
              for (let i = 0; i < toValidate.length; i++) {
                const trimmed = toValidate[i]!
                const err = result.find((r) => r.lineIndex === i)
                if (err) {
                  lineCache.set(trimmed, { kind: err.kind, message: err.message, quickFixes: err.quickFixes, spanRel: err.spanRel })
                } else {
                  lineCache.set(trimmed, 'valid')
                  const oracleIndex = indices[i * 2] ?? -1
                  const scryfallIndex = indices[i * 2 + 1] ?? -1
                  if (oracleIndex >= 0) resolvedCache.set(trimmed, { oracleIndex, scryfallIndex })
                }
              }
              setValidationResult(buildValidationResult(t))
            })
            return
          }
        } else if (props.workerStatus() === 'error') {
          for (const line of baseLines) {
            const trimmed = line.trim()
            if (trimmed && !lineCache.has(trimmed)) {
              lineCache.set(trimmed, { kind: 'error', message: 'Validation unavailable' })
            }
          }
        }
      }
      setValidationResult(buildValidationResult(t))
      return
    }

    const lineStrings = t.split(/\r?\n/)
    const toValidate = [...new Set(
      lineStrings
        .map((l) => l.trim())
        .filter((trimmed) => trimmed !== '' && !lineCache.has(trimmed))
    )]

    if (toValidate.length === 0) {
      setValidationResult(buildValidationResult(t))
      return
    }

    if (props.workerStatus() === 'error' || !props.onValidateRequest) {
      for (const trimmed of toValidate) {
        lineCache.set(trimmed, { kind: 'error', message: 'Validation unavailable' })
      }
      setValidationResult(buildValidationResult(t))
    } else {
      setValidationResult(buildValidationResult(t))
      const version = ++validationVersion
      props.onValidateRequest(toValidate).then(({ result, indices }) => {
        if (version !== validationVersion) return
        for (let i = 0; i < toValidate.length; i++) {
          const trimmed = toValidate[i]!
          const err = result.find((r) => r.lineIndex === i)
          if (err) {
            lineCache.set(trimmed, {
              kind: err.kind,
              message: err.message,
              quickFixes: err.quickFixes,
              spanRel: err.spanRel,
            })
          } else {
            lineCache.set(trimmed, 'valid')
            const oracleIndex = indices[i * 2] ?? -1
            const scryfallIndex = indices[i * 2 + 1] ?? -1
            if (oracleIndex >= 0) resolvedCache.set(trimmed, { oracleIndex, scryfallIndex })
          }
        }
        setValidationResult(buildValidationResult(t))
      })
    }
  })

  const validation = createMemo(() => validationResult())

  const hasValidationErrors = createMemo(() => {
    const v = validation()
    if (!v) return true
    return v.lines.some((l) => l.kind === 'error')
  })

  const validationErrors = createMemo(() => {
    const v = validation()
    if (!v) return []
    return v.lines.filter((l) => l.kind === 'error')
  })

  const hasChanges = createMemo(() => {
    const base = baselineText()
    const draft = draftText()
    return mode() === 'edit' && base !== null && draft !== null && draft !== base
  })

  const editDiffSummary = createMemo<{ additions: number; removals: number } | null>(() => {
    if (mode() !== 'edit') return null
    const text = debouncedDraft()
    if (!props.display || hasValidationErrors()) return null
    const vr = validationResult()
    if (!vr) return null
    const fmt = detectedFormat() ?? selectedFormat()
    const result = importDeckList(text, props.display, props.printingDisplay, vr, fmt)
    const diff = diffDeckList(result.candidates, props.instances)
    const enriched = enrichDiffForPreserve(diff, {
      preserveTags: preserveTags(),
      preserveCollectionStatus: preserveCollectionStatus(),
      preserveVariants: preserveVariants(),
    })
    return { additions: enriched.additions.length, removals: enriched.removals.length }
  })

  const enrichedReviewDiff = createMemo<DiffResult | null>(() => {
    if (!reviewModeActive()) return null
    const text = draftText()
    if (text === null || !props.display) return null
    const vr = buildValidationResult(text)
    if (vr.lines.some((l) => l.kind === 'error')) return null
    const fmt = detectedFormat() ?? selectedFormat()
    const result = importDeckList(text, props.display, props.printingDisplay, vr, fmt)
    const diff = diffDeckList(result.candidates, props.instances)
    const enriched = enrichDiffForPreserve(diff, {
      preserveTags: preserveTags(),
      preserveCollectionStatus: preserveCollectionStatus(),
      preserveVariants: preserveVariants(),
    })
    return enriched
  })

  const reviewMatchedInstances = createMemo(() => {
    const diff = enrichedReviewDiff()
    if (!diff) return []
    const removalUuids = new Set(diff.removals.map((r) => r.uuid))
    return props.instances.filter((i) => !removalUuids.has(i.uuid))
  })

  const detectedFormat = createMemo<DeckFormat | null>(() => {
    const d = draftText()
    if (d === null) return null
    return detectDeckFormat(lexDeckList(d))
  })

  const editFormatLabel = createMemo<string | null>(() => {
    const d = draftText()
    if (d === null || !d.trim()) return null
    const fmt = detectedFormat() ?? selectedFormat()
    return ALL_FORMATS.find((f) => f.id === fmt)?.label ?? 'Unknown'
  })

  const textareaValue = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return serializedText()
    return ''
  })

  const highlightText = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return serializedText()
    return ''
  })

  const highlightValidation = createMemo(() => {
    if (mode() === 'edit') return validation()
    return null
  })

  const isValidating = createMemo(
    () =>
      mode() === 'edit' &&
      props.workerStatus() !== 'error' &&
      debouncedDraft().trim() !== '' &&
      validationResult() === null &&
      !!props.onValidateRequest,
  )

  createEffect(() => {
    textareaValue()
    const el = textareaEl()
    if (!el) return
    const resize = () => {
      el.style.minHeight = '0'
      el.style.height = '0'
      el.style.height = `${Math.max(200, el.scrollHeight)}px`
      el.style.minHeight = '200px'
    }
    resize()
    requestAnimationFrame(resize)
  })

  function handleInput(e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement
    const value = el.value
    setDraftText(value)
    writeDraftToStorage(props.listId, value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      setDebouncedDraft(value)
      debounceTimer = undefined
    }, VALIDATION_DEBOUNCE_MS)
  }

  function handleDeckPaste() {
    captureMyListInteracted({
      control: 'deck_paste',
      from_mode: mode() === 'init' ? 'init' : 'edit',
      ...myListAnalyticsBase(),
    })
  }

  function togglePreserveTags() {
    const c = preserveCounts()
    if (c.tagsCount === 0) return
    const next = !preserveTags()
    setPreserveTags(next)
    writePreserveTags(next)
    captureMyListInteracted({
      control: 'preserve_toggle',
      preserve_kind: 'tags',
      enabled: next,
      ...myListAnalyticsBase(),
    })
  }

  function togglePreserveCollectionStatus() {
    const c = preserveCounts()
    if (c.collectionCount === 0) return
    const next = !preserveCollectionStatus()
    setPreserveCollectionStatus(next)
    writePreserveCollectionStatus(next)
    captureMyListInteracted({
      control: 'preserve_toggle',
      preserve_kind: 'collection',
      enabled: next,
      ...myListAnalyticsBase(),
    })
  }

  function togglePreserveVariants() {
    const c = preserveCounts()
    if (c.variantsCount === 0) return
    const next = !preserveVariants()
    setPreserveVariants(next)
    writePreserveVariants(next)
    captureMyListInteracted({
      control: 'preserve_toggle',
      preserve_kind: 'variants',
      enabled: next,
      ...myListAnalyticsBase(),
    })
  }

  function toggleReviewFilterAdded() {
    const diff = enrichedReviewDiff()
    const n = diff?.additions.length ?? 0
    if (n === 0) return
    const next = !reviewFilterAdded()
    setReviewFilterAdded(next)
    captureMyListInteracted({
      control: 'review_filter_toggle',
      filter: 'added',
      visible: next,
      ...myListAnalyticsBase(),
    })
  }

  function toggleReviewFilterRemoved() {
    const diff = enrichedReviewDiff()
    const m = diff?.removals.length ?? 0
    if (m === 0) return
    const next = !reviewFilterRemoved()
    setReviewFilterRemoved(next)
    captureMyListInteracted({
      control: 'review_filter_toggle',
      filter: 'removed',
      visible: next,
      ...myListAnalyticsBase(),
    })
  }

  function toggleReviewFilterUnchanged() {
    const matched = reviewMatchedInstances()
    const k = matched.length
    if (k === 0) return
    const next = !reviewFilterUnchanged()
    setReviewFilterUnchanged(next)
    captureMyListInteracted({
      control: 'review_filter_toggle',
      filter: 'unchanged',
      visible: next,
      ...myListAnalyticsBase(),
    })
  }

  function toggleValidationErrorsExpanded() {
    setValidationErrorsExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(ERRORS_EXPANDED_KEY, String(next))
      } catch {
        // ignore
      }
      captureMyListInteracted({
        control: 'validation_panel_toggle',
        expanded: next,
        ...myListAnalyticsBase(),
      })
      return next
    })
  }

  function handleExportOutlinkClick(payload: { outlink_id: MyListExportOutlinkId; deck_format: DeckFormat }) {
    captureMyListInteracted({
      control: 'export_outlink',
      ...myListAnalyticsBase(),
      ...payload,
    })
  }

  function handleEdit() {
    captureMyListInteracted({ control: 'edit_open', ...myListAnalyticsBase() })
    clearLineCache()
    const text = serializedText()
    setBaselineText(text)
    setDraftText(text)
    writeDraftToStorage(props.listId, text)
    writeBaselineToStorage(props.listId, text)
    setTimeout(() => setDebouncedDraft(text), 0)
    setTimeout(() => {
      const el = textareaEl()
      if (!el) return
      el.focus()
      el.setSelectionRange(0, 0)
      el.scrollTop = 0
    }, 0)
  }

  function handleCancel() {
    if (mode() === 'edit' && !hasChanges()) {
      captureMyListInteracted({ control: 'cancel_edit', ...myListAnalyticsBase() })
    }
    clearLineCache()
    setDraftText(null)
    setDebouncedDraft('')
    setBaselineText(null)
    setReviewModeActive(false)
    clearDraftFromStorage(props.listId)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  function handleRevert() {
    const base = baselineText()
    if (base === null) return
    captureMyListInteracted({ control: 'revert', ...myListAnalyticsBase() })
    setDraftText(base)
    setDebouncedDraft(base)
    writeDraftToStorage(props.listId, base)
    writeBaselineToStorage(props.listId, base)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  function applyQuickFix(err: LineValidation, fix: QuickFix, fixIndex: number) {
    setQuickFixApplying({ lineIndex: err.lineIndex, fixIndex })
    setTimeout(() => {
      const text = draftText()
      if (text == null) return
      const newText =
        text.slice(0, err.lineStart) + fix.replacement + text.slice(err.lineEnd)
      setDraftText(newText)
      setDebouncedDraft(newText)
      writeDraftToStorage(props.listId, newText)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }
      setTimeout(() => {
        captureMyListInteracted({
          control: 'quick_fix_apply',
          line_index: err.lineIndex,
          fix_index: fixIndex,
          ...myListAnalyticsBase(),
        })
        setQuickFixApplying(null)
      }, 100)
    }, 50)
  }

  function applyAllQuickFixes() {
    const errors = validationErrors().filter(
      (e) => e.quickFixes && e.quickFixes.length > 0
    )
    if (errors.length === 0) return
    captureMyListInteracted({
      control: 'quick_fix_apply_all',
      fix_count: errors.length,
      ...myListAnalyticsBase(),
    })
    const sorted = [...errors].sort((a, b) => b.lineStart - a.lineStart)
    let text = draftText()
    if (text == null) return
    setQuickFixApplying({ lineIndex: -1, fixIndex: -1 })
    for (const err of sorted) {
      const fix = err.quickFixes![0]!
      text = text.slice(0, err.lineStart) + fix.replacement + text.slice(err.lineEnd)
    }
    setDraftText(text)
    setDebouncedDraft(text)
    writeDraftToStorage(props.listId, text)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
    setTimeout(() => setQuickFixApplying(null), 100)
  }

  function handleReview() {
    const s = editDiffSummary()
    if (s) {
      captureMyListInteracted({
        control: 'review_open',
        additions_count: s.additions,
        removals_count: s.removals,
        ...myListAnalyticsBase(),
      })
    }
    setReviewModeActive(true)
  }

  function handleBackToEdit() {
    captureMyListInteracted({ control: 'review_back', ...myListAnalyticsBase() })
    setReviewModeActive(false)
  }

  async function handleSave() {
    const text = draftText()
    if (text == null || !props.display) return
    setSaveInProgress(true)
    try {
      const lineStrings = text.split(/\r?\n/)
      const cardLinesNeedingValidation: string[] = []
      for (const line of lineStrings) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('//') || /^\s*[A-Z]+\s*:?\s*$/.test(trimmed)) continue
        if (!/^\d+x?\s/.test(trimmed)) continue
        if (lineCache.get(trimmed) === 'valid' && !resolvedCache.has(trimmed)) {
          cardLinesNeedingValidation.push(trimmed)
        }
      }
      if (cardLinesNeedingValidation.length > 0) {
        if (!props.onValidateRequest) return
        const { result, indices } = await props.onValidateRequest(cardLinesNeedingValidation)
        for (let i = 0; i < cardLinesNeedingValidation.length; i++) {
          const trimmed = cardLinesNeedingValidation[i]!
          const err = result.find((r) => r.lineIndex === i)
          if (err) {
            lineCache.set(trimmed, { kind: err.kind, message: err.message, quickFixes: err.quickFixes, spanRel: err.spanRel })
          } else {
            lineCache.set(trimmed, 'valid')
            const oracleIndex = indices[i * 2] ?? -1
            const scryfallIndex = indices[i * 2 + 1] ?? -1
            if (oracleIndex >= 0) resolvedCache.set(trimmed, { oracleIndex, scryfallIndex })
          }
        }
        if (cardLinesNeedingValidation.some((trimmed) => lineCache.get(trimmed) !== 'valid')) {
          setValidationResult(buildValidationResult(text))
          return
        }
      }

      const vr = buildValidationResult(text)
      const fmt = detectedFormat() ?? selectedFormat()
      const result = importDeckList(text, props.display, props.printingDisplay, vr, fmt)
      const currentInstances = props.instances
      const diff = diffDeckList(result.candidates, currentInstances)
      const enriched = enrichDiffForPreserve(diff, {
        preserveTags: preserveTags(),
        preserveCollectionStatus: preserveCollectionStatus(),
        preserveVariants: preserveVariants(),
      })

      await props.cardListStore.applyDiff(props.listId, enriched.removals, enriched.additions)

      const metadataUpdated = !!(result.deckName || Object.keys(result.tagColors).length > 0)
      if (metadataUpdated) {
        const meta = props.metadata
        await props.cardListStore.updateListMetadata(props.listId, {
          name: result.deckName ?? meta?.name ?? 'My List',
          ...(meta?.description ? { description: meta.description } : {}),
          ...(meta?.short_name ? { short_name: meta.short_name } : {}),
          ...(Object.keys(result.tagColors).length > 0 ? { tag_colors: result.tagColors } : {}),
        })
      }

      const detected = detectedFormat()
      const formatPersisted = detected !== null
      if (detected) {
        setSelectedFormat(detected)
        writeFormatToStorage(detected)
      }

      captureMyListInteracted({
        control: 'save_committed',
        list_id: toMyListListId(props.listId),
        editor_mode: 'review',
        additions_count: enriched.additions.length,
        removals_count: enriched.removals.length,
        metadata_updated: metadataUpdated,
        format_persisted: formatPersisted,
      })

      handleCancel()
      props.onApplySuccess?.()
    } finally {
      setSaveInProgress(false)
    }
  }

  function getWouldBeCommittedText(): string {
    const diff = enrichedReviewDiff()
    const matched = reviewMatchedInstances()
    if (!diff || !props.display) return ''
    const additionsAsInstances: InstanceState[] = diff.additions.map((c: ImportCandidate) => ({
      uuid: '',
      list_id: props.listId,
      oracle_id: c.oracle_id,
      scryfall_id: c.scryfall_id,
      finish: c.finish,
      zone: c.zone,
      tags: c.tags,
      collection_status: c.collection_status,
      variant: c.variant,
    }))
    const wouldBe = [...matched, ...additionsAsInstances]
    return serialize(selectedFormat(), wouldBe, props.display, props.printingDisplay, props.metadata?.name)
  }

  async function handleCopy() {
    let text: string
    if (mode() === 'review') {
      text = getWouldBeCommittedText()
    } else if (mode() === 'edit') {
      text = draftText()!
    } else {
      text = serializedText()
    }
    const base = myListAnalyticsBase()
    const m = mode()
    const copySource = m === 'review' ? 'review' : m === 'edit' ? 'edit' : 'display'
    try {
      await navigator.clipboard.writeText(text)
      captureMyListInteracted({
        control: 'copy',
        copy_source: copySource,
        ...base,
      })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  function handleFormatSelect(format: DeckFormat) {
    if (mode() !== 'display' && mode() !== 'review') return
    const prev = selectedFormat()
    if (prev === format) return
    captureMyListInteracted({
      control: 'format_select',
      deck_format: format,
      previous_format: prev,
      ...myListAnalyticsBase(),
    })
    setSelectedFormat(format)
    writeFormatToStorage(format)
  }

  function handleViewInSearch() {
    captureMyListInteracted({ control: 'view_in_search', ...myListAnalyticsBase() })
    props.onViewInSearch?.(props.listId)
  }

  function handleDeckReport() {
    captureMyListInteracted({ control: 'bug_report_open', ...myListAnalyticsBase() })
    let listContent: string
    let reportMode: 'display' | 'edit' | 'review'
    if (mode() === 'display') {
      listContent = serializedText()
      reportMode = 'display'
    } else if (mode() === 'review') {
      listContent = getWouldBeCommittedText()
      reportMode = 'review'
    } else {
      listContent = draftText() ?? ''
      reportMode = 'edit'
    }
    props.onDeckReportClick?.({
      listContent,
      format: editFormatLabel() ?? 'No format',
      listName: props.metadata?.name ?? 'My List',
      listId: props.listId,
      mode: reportMode,
      validationErrors: validation()?.lines.filter((l) => l.kind !== 'ok') ?? [],
      instanceCount: mode() === 'display' ? props.instances.length : undefined,
    })
  }

  const contextValue: DeckEditorContextValue = {
    mode,
    instances: () => props.instances,
    draftText,
    baselineText,
    selectedFormat,
    serializedText,
    validation,
    validationErrors,
    hasValidationErrors,
    hasChanges,
    editDiffSummary,
    editFormatLabel,
    preserveTags,
    preserveCollectionStatus,
    preserveVariants,
    preserveCounts,
    togglePreserveTags,
    togglePreserveCollectionStatus,
    togglePreserveVariants,
    textareaValue,
    highlightText,
    highlightValidation,
    workerStatus: props.workerStatus,
    deckScores: () => (props.deckScores ? props.deckScores() : null),
    isValidating,
    saveInProgress,
    copied,
    quickFixApplying,
    reviewDiff: enrichedReviewDiff,
    reviewMatchedInstances,
    reviewFilterAdded,
    reviewFilterRemoved,
    reviewFilterUnchanged,
    toggleReviewFilterAdded,
    toggleReviewFilterRemoved,
    toggleReviewFilterUnchanged,
    validationErrorsExpanded,
    toggleValidationErrorsExpanded,
    handleEdit,
    handleCancel,
    handleRevert,
    handleSave,
    handleReview,
    handleBackToEdit,
    handleCopy,
    handleFormatSelect,
    handleInput,
    handleDeckPaste,
    applyQuickFix,
    applyAllQuickFixes,
    registerTextareaRef: setTextareaEl,
    handleDeckReport,
    handleViewInSearch,
    onExportOutlinkClick: handleExportOutlinkClick,
  }

  return (
    <DeckEditorContext.Provider value={contextValue}>
      <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div class="flex flex-col">
          <DeckEditorToolbar />
          <DeckEditorStatus />
          <DeckEditorFormatChips />
          <Show when={mode() !== 'review'} fallback={null}>
            <DeckEditorTextarea />
          </Show>
          <Show
            when={
              mode() === 'review' &&
              enrichedReviewDiff() !== null &&
              (enrichedReviewDiff()!.additions.length > 0 || enrichedReviewDiff()!.removals.length > 0)
            }
            fallback={null}
          >
            <DeckEditorReviewView
              diff={enrichedReviewDiff()!}
              matchedInstances={reviewMatchedInstances()}
              format={selectedFormat()}
              display={props.display!}
              printingDisplay={props.printingDisplay}
              listId={props.listId}
              addedVisible={reviewFilterAdded()}
              removedVisible={reviewFilterRemoved()}
              unchangedVisible={reviewFilterUnchanged()}
            />
          </Show>
        </div>
      </div>
    </DeckEditorContext.Provider>
  )
}
