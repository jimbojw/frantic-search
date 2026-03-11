// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, createEffect, onMount, onCleanup } from 'solid-js'
import {
  lexDeckList,
  detectDeckFormat,
  importDeckList,
  diffDeckList,
  parsedEntriesFromInstances,
} from '@frantic-search/shared'
import type {
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
} from './storage'
import { serialize, ALL_FORMATS } from './serialization'
import {
  buildValidationResultFromCache,
  type CachedError,
  type ResolvedCacheEntry,
} from './validation-cache'
import { DeckEditorContext, type DeckEditorContextValue } from './DeckEditorContext'
import DeckEditorToolbar from './DeckEditorToolbar'
import DeckEditorStatus from './DeckEditorStatus'
import DeckEditorFormatChips from './DeckEditorFormatChips'
import DeckEditorTextarea from './DeckEditorTextarea'
import type { EditorMode } from './types'

export type { EditorMode } from './types'

const VALIDATION_DEBOUNCE_MS = 150

export default function DeckEditor(props: {
  listId: string
  instances: InstanceState[]
  metadata: ListMetadata | null
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  workerStatus: () => 'loading' | 'ready' | 'error'
  cardListStore: CardListStore
  onApplySuccess?: () => void
  onSerializeRequest?: (instances: InstanceState[], format: DeckFormat) => Promise<string>
  onValidateRequest?: (lines: string[]) => Promise<{ result: LineValidationResult[]; indices: Int32Array }>
  onDraftActiveChange?: (active: boolean) => void
}) {
  const [draftText, setDraftText] = createSignal<string | null>(null)
  const [baselineText, setBaselineText] = createSignal<string | null>(null)
  const [selectedFormat, setSelectedFormat] = createSignal<DeckFormat>(readFormatFromStorage())
  const [applyInProgress, setApplyInProgress] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [quickFixApplying, setQuickFixApplying] = createSignal<{ lineIndex: number; fixIndex: number } | null>(null)
  const [debouncedDraft, setDebouncedDraft] = createSignal<string>('')
  const [textareaEl, setTextareaEl] = createSignal<HTMLTextAreaElement | null>(null)

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
  const mode = createMemo<EditorMode>(() => {
    if (draftText() !== null) return 'edit'
    if (hasInstances()) return 'display'
    return 'init'
  })

  createEffect(() => {
    props.onDraftActiveChange?.(draftText() !== null)
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
      props.onSerializeRequest(ins, fmt).then((text) => {
        setBaselineText(text)
        writeBaselineToStorage(props.listId, text)
      })
    } else {
      const text = serialize(fmt, ins, props.display!, props.printingDisplay)
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
      props.onSerializeRequest(ins, fmt).then((text) => {
        if (version === serializeVersion) setSerializedText(text)
      })
    } else {
      setSerializedText(serialize(fmt, ins, props.display!, props.printingDisplay))
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
      setValidationResult(null)
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
    if (!text.trim() || !props.display || hasValidationErrors()) return null
    const vr = validationResult()
    if (!vr) return null
    const result = importDeckList(text, props.display, props.printingDisplay, vr)
    const diff = diffDeckList(result.candidates, props.instances)
    return { additions: diff.additions.length, removals: diff.removals.length }
  })

  const detectedFormat = createMemo<DeckFormat | null>(() => {
    const d = draftText()
    if (d === null) return null
    return detectDeckFormat(lexDeckList(d))
  })

  const editFormatLabel = createMemo(() => {
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

  function handleEdit() {
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
    clearLineCache()
    setDraftText(null)
    setDebouncedDraft('')
    setBaselineText(null)
    clearDraftFromStorage(props.listId)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  function handleRevert() {
    const base = baselineText()
    if (base === null) return
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
      setTimeout(() => setQuickFixApplying(null), 100)
    }, 50)
  }

  async function handleApply() {
    const text = draftText()
    if (!text || !props.display) return
    setApplyInProgress(true)
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
      const result = importDeckList(text, props.display, props.printingDisplay, vr)
      const currentInstances = props.instances
      const diff = diffDeckList(result.candidates, currentInstances)

      await props.cardListStore.applyDiff(props.listId, diff.removals, diff.additions)

      if (result.deckName || Object.keys(result.tagColors).length > 0) {
        const meta = props.metadata
        await props.cardListStore.updateListMetadata(props.listId, {
          name: result.deckName ?? meta?.name ?? 'My List',
          ...(meta?.description ? { description: meta.description } : {}),
          ...(meta?.short_name ? { short_name: meta.short_name } : {}),
          ...(Object.keys(result.tagColors).length > 0 ? { tag_colors: result.tagColors } : {}),
        })
      }

      const detected = detectedFormat()
      if (detected) {
        setSelectedFormat(detected)
        writeFormatToStorage(detected)
      }
      handleCancel()
      props.onApplySuccess?.()
    } finally {
      setApplyInProgress(false)
    }
  }

  async function handleCopy() {
    const text = mode() === 'edit' ? draftText()! : serializedText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  function handleFormatSelect(format: DeckFormat) {
    if (mode() !== 'display') return
    setSelectedFormat(format)
    writeFormatToStorage(format)
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
    textareaValue,
    highlightText,
    highlightValidation,
    workerStatus: props.workerStatus,
    isValidating,
    applyInProgress,
    copied,
    quickFixApplying,
    handleEdit,
    handleCancel,
    handleRevert,
    handleApply,
    handleCopy,
    handleFormatSelect,
    handleInput,
    applyQuickFix,
    registerTextareaRef: setTextareaEl,
  }

  return (
    <DeckEditorContext.Provider value={contextValue}>
      <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div class="flex flex-col">
          <DeckEditorToolbar />
          <DeckEditorStatus />
          <DeckEditorFormatChips />
          <DeckEditorTextarea />
        </div>
      </div>
    </DeckEditorContext.Provider>
  )
}
