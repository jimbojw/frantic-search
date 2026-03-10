// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For } from 'solid-js'
import {
  validateDeckList,
  lexDeckList,
  detectDeckFormat,
  serializeArena,
  serializeMoxfield,
  serializeArchidekt,
  serializeMtggoldfish,
  serializeMelee,
  serializeTappedOut,
  importDeckList,
  diffDeckList,
} from '@frantic-search/shared'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  InstanceState,
  ListMetadata,
  DeckFormat,
  ListValidationResult,
  LineValidation,
  QuickFix,
} from '@frantic-search/shared'
import ListHighlight from './ListHighlight'

export type EditorMode = 'init' | 'display' | 'edit'

/** Parse text with "..." (card-name) and `...` (set-code) for syntax-highlight-style rendering. */
function parseStyledParts(text: string): { text: string; role?: 'card-name' | 'set-code' }[] {
  const result: { text: string; role?: 'card-name' | 'set-code' }[] = []
  let s = text
  while (s.length > 0) {
    const dq = s.indexOf('"')
    const bt = s.indexOf('`')
    if (dq < 0 && bt < 0) {
      result.push({ text: s })
      break
    }
    const next = dq < 0 ? bt : bt < 0 ? dq : Math.min(dq, bt)
    if (next > 0) {
      result.push({ text: s.slice(0, next) })
    }
    if (dq === next) {
      const end = s.indexOf('"', next + 1)
      if (end >= 0) {
        result.push({ text: s.slice(next + 1, end), role: 'card-name' })
        s = s.slice(end + 1)
      } else {
        result.push({ text: s.slice(next) })
        break
      }
    } else {
      const end = s.indexOf('`', next + 1)
      if (end >= 0) {
        result.push({ text: s.slice(next + 1, end), role: 'set-code' })
        s = s.slice(end + 1)
      } else {
        result.push({ text: s.slice(next) })
        break
      }
    }
  }
  return result
}

const CARD_NAME_CLASS = 'font-mono text-gray-900 dark:text-gray-100'
const SET_CODE_CLASS = 'font-mono text-blue-600 dark:text-blue-400'

function StyledValidationText(props: { text: string; class?: string }) {
  const parts = parseStyledParts(props.text)
  return (
    <span class={props.class}>
      {parts.map((p) =>
        p.role === 'card-name' ? (
          <span class={CARD_NAME_CLASS}>{p.text}</span>
        ) : p.role === 'set-code' ? (
          <span class={SET_CODE_CLASS}>{p.text}</span>
        ) : (
          <>{p.text}</>
        )
      )}
    </span>
  )
}

const VALIDATION_DEBOUNCE_MS = 150

const ALL_FORMATS: { id: DeckFormat; label: string }[] = [
  { id: 'arena', label: 'Arena' },
  { id: 'moxfield', label: 'Moxfield' },
  { id: 'archidekt', label: 'Archidekt' },
  { id: 'mtggoldfish', label: 'MTGGoldfish' },
  { id: 'melee', label: 'Melee.gg' },
  { id: 'tappedout', label: 'TappedOut' },
]

function draftKey(listId: string): string {
  return `frantic-search-draft:${listId}`
}

const FORMAT_KEY = 'frantic-search-deck-format'

function readDraftFromStorage(listId: string): string | null {
  try {
    const raw = localStorage.getItem(draftKey(listId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { text?: string }
    return typeof parsed.text === 'string' ? parsed.text : null
  } catch {
    return null
  }
}

function writeDraftToStorage(listId: string, text: string): void {
  try {
    localStorage.setItem(
      draftKey(listId),
      JSON.stringify({ text, timestamp: Date.now() })
    )
  } catch {
    // localStorage may be full or blocked
  }
}

function clearDraftFromStorage(listId: string): void {
  try {
    localStorage.removeItem(draftKey(listId))
  } catch {
    // ignore
  }
}

function readFormatFromStorage(): DeckFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY)
    if (v && ALL_FORMATS.some((f) => f.id === v)) return v as DeckFormat
  } catch {
    // ignore
  }
  return 'arena'
}

function writeFormatToStorage(format: DeckFormat): void {
  try {
    localStorage.setItem(FORMAT_KEY, format)
  } catch {
    // ignore
  }
}

function serialize(
  format: DeckFormat,
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  switch (format) {
    case 'moxfield':
      return serializeMoxfield(instances, display, printingDisplay)
    case 'archidekt':
      return serializeArchidekt(instances, display, printingDisplay)
    case 'mtggoldfish':
      return serializeMtggoldfish(instances, display, printingDisplay)
    case 'melee':
      return serializeMelee(instances, display)
    case 'tappedout':
      return serializeTappedOut(instances, display, printingDisplay)
    case 'arena':
    default:
      return serializeArena(instances, display)
  }
}

export default function DeckEditor(props: {
  listId: string
  instances: InstanceState[]
  metadata: ListMetadata | null
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  onApply: (draftText: string) => Promise<boolean>
  onSerializeRequest?: (instances: InstanceState[], format: DeckFormat) => Promise<string>
  onDraftActiveChange?: (active: boolean) => void
}) {
  const [draftText, setDraftText] = createSignal<string | null>(null)
  const [baselineText, setBaselineText] = createSignal<string | null>(null)
  const [selectedFormat, setSelectedFormat] = createSignal<DeckFormat>(readFormatFromStorage())
  const [applyInProgress, setApplyInProgress] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [quickFixApplying, setQuickFixApplying] = createSignal<{ lineIndex: number; fixIndex: number } | null>(null)

  // Debounced text for validation
  const [debouncedDraft, setDebouncedDraft] = createSignal<string>('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  let textareaRef: HTMLTextAreaElement | null = null

  // Restore draft from localStorage on mount
  onMount(() => {
    const cached = readDraftFromStorage(props.listId)
    if (cached !== null) {
      setDraftText(cached)
      setDebouncedDraft(cached)
    }
  })

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
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
      props.onSerializeRequest(ins, fmt).then((text) => setBaselineText(text))
    } else {
      setBaselineText(serialize(fmt, ins, props.display!, props.printingDisplay))
    }
  })

  // Cross-tab draft sync via storage events
  function handleStorageEvent(e: StorageEvent) {
    if (e.key !== draftKey(props.listId)) return
    if (e.newValue === null) {
      setDraftText(null)
      setDebouncedDraft('')
      setBaselineText(null)
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
  }

  onMount(() => {
    window.addEventListener('storage', handleStorageEvent)
  })
  onCleanup(() => {
    window.removeEventListener('storage', handleStorageEvent)
  })

  // Notify parent when draft active state changes
  createEffect(() => {
    props.onDraftActiveChange?.(draftText() !== null)
  })

  // Auto-grow textarea to fit content so it never scrolls (keeps overlay in sync)
  createEffect(() => {
    textareaValue()
    const el = textareaRef
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

  // Derived mode
  const hasInstances = () => props.instances.length > 0
  const mode = createMemo<EditorMode>(() => {
    if (draftText() !== null) return 'edit'
    if (hasInstances()) return 'display'
    return 'init'
  })

  // Serialized text for Display mode (async via worker when onSerializeRequest provided)
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

  // Validation for Edit mode (debounced)
  const validation = createMemo<ListValidationResult | null>(() => {
    const t = debouncedDraft()
    if (!t.trim()) return null
    return validateDeckList(t, props.display, props.printingDisplay)
  })

  const hasValidationErrors = createMemo(() => {
    const v = validation()
    if (!v) return true // no text = can't apply
    return v.lines.some((l) => l.kind === 'error')
  })

  // Validation errors for Status box (Edit mode with errors)
  const validationErrors = createMemo(() => {
    const v = validation()
    if (!v) return []
    return v.lines.filter((l) => l.kind === 'error')
  })

  // Has changes: draft differs from baseline (Spec 113)
  const hasChanges = createMemo(() => {
    const base = baselineText()
    const draft = draftText()
    return mode() === 'edit' && base !== null && draft !== null && draft !== base
  })

  // Diff summary for Status box (Edit mode, no errors) — uses debounced draft
  const editDiffSummary = createMemo<{ additions: number; removals: number } | null>(() => {
    if (mode() !== 'edit') return null
    const text = debouncedDraft()
    if (!text.trim() || !props.display || hasValidationErrors()) return null
    const result = importDeckList(text, props.display, props.printingDisplay)
    const diff = diffDeckList(result.candidates, props.instances)
    return { additions: diff.additions.length, removals: diff.removals.length }
  })

  // Detected format in Edit mode (falls back to selected format when undetectable)
  const detectedFormat = createMemo<DeckFormat | null>(() => {
    const d = draftText()
    if (d === null) return null
    return detectDeckFormat(lexDeckList(d))
  })

  const editFormatLabel = createMemo(() => {
    const fmt = detectedFormat() ?? selectedFormat()
    return ALL_FORMATS.find((f) => f.id === fmt)?.label ?? 'Unknown'
  })

  // The text shown in the textarea
  const textareaValue = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return serializedText()
    return ''
  })

  // The text used for syntax highlighting
  const highlightText = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return serializedText()
    return ''
  })

  // Validation passed to the highlight layer
  const highlightValidation = createMemo<ListValidationResult | null>(() => {
    if (mode() === 'edit') return validation()
    return null
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
    const text = serializedText()
    setBaselineText(text)
    setDraftText(text)
    setDebouncedDraft(text)
    writeDraftToStorage(props.listId, text)
  }

  function handleCancel() {
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
    if (!text) return
    setApplyInProgress(true)
    try {
      const success = await props.onApply(text)
      if (success) {
        const detected = detectedFormat()
        if (detected) {
          setSelectedFormat(detected)
          writeFormatToStorage(detected)
        }
        handleCancel()
      }
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

  return (
    <div class="flex flex-col gap-2">
      {/* Format chips */}
      <div class="flex flex-wrap gap-1.5">
        <For each={ALL_FORMATS}>
          {(fmt) => {
            const isSelected = () => mode() === 'display' && selectedFormat() === fmt.id
            const isDetected = () => mode() === 'edit' && detectedFormat() === fmt.id
            const isDisabled = () => mode() === 'init'
            const isNonInteractive = () => mode() === 'edit'

            return (
              <button
                type="button"
                onClick={() => handleFormatSelect(fmt.id)}
                disabled={isDisabled() || isNonInteractive()}
                class={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  isSelected()
                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                    : isDetected()
                      ? 'bg-transparent text-blue-600 dark:text-blue-400 border-blue-400 dark:border-blue-500'
                      : isDisabled() || isNonInteractive()
                        ? 'bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-default'
                        : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer'
                }`}
              >
                {fmt.label}
              </button>
            )
          }}
        </For>
      </div>

      {/* Toolbar — Edit, Copy only (Spec 113) */}
      <div class="flex items-center gap-1.5 min-h-[32px]">
        {/* Edit — enabled in Display mode; primary (blue) when enabled */}
        <button
          type="button"
          onClick={handleEdit}
          disabled={mode() !== 'display'}
          class={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
            mode() === 'display'
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
          }`}
          aria-label="Edit deck list"
        >
          <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
          Edit
        </button>

        {/* Copy — enabled in Display and Edit modes */}
        <button
          type="button"
          onClick={handleCopy}
          disabled={mode() === 'init'}
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent ml-auto"
        >
            <Show
              when={!copied()}
              fallback={
                <svg class="size-3.5 text-green-600 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              }
            >
              <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 0-1.125 1.125v3.375c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </Show>
            {copied() ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Status box — mode-appropriate info and actions (Spec 113) */}
      <div
        classList={{
          'px-3 py-2 rounded border text-sm min-h-[2.5rem] flex flex-col gap-2': true,
          'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200': mode() === 'edit' && validationErrors().length > 0,
          'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400': mode() !== 'edit' || validationErrors().length === 0,
        }}
      >
        <Show when={mode() === 'init'} fallback={null}>
          <p>List is empty. Paste a deck list or add cards from search results.</p>
        </Show>
        <Show when={mode() === 'display'} fallback={null}>
          <p>
            {props.instances.length} card{props.instances.length !== 1 ? 's' : ''}
          </p>
        </Show>
        <Show when={mode() === 'edit'} fallback={null}>
          <div class="flex flex-col gap-2">
            {/* Edit mode: buttons on top row */}
            <div class="flex flex-wrap items-center gap-2">
              <Show when={!hasChanges()} fallback={null}>
                <button
                  type="button"
                  onClick={handleCancel}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </Show>
              <Show when={hasChanges()} fallback={null}>
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={baselineText() === null}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                  Revert
                </button>
              </Show>
              <Show when={hasChanges() && !hasValidationErrors()} fallback={null}>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applyInProgress()}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {applyInProgress() ? 'Applying…' : 'Apply'}
                </button>
              </Show>
            </div>
            {/* Edit mode: status message on second row */}
            <div class="text-gray-500 dark:text-gray-400">
              <Show when={!hasChanges()} fallback={null}>
                Editing: No changes ({editFormatLabel()})
              </Show>
              <Show when={hasChanges() && validationErrors().length > 0} fallback={null}>
                <span class="text-red-800 dark:text-red-200">
                  Editing: {validationErrors().length} error{validationErrors().length !== 1 ? 's' : ''} ({editFormatLabel()})
                </span>
              </Show>
              <Show
                when={hasChanges() && validationErrors().length === 0 && editDiffSummary()}
                fallback={hasChanges() && validationErrors().length === 0 ? <span>Editing: changes pending ({editFormatLabel()})</span> : null}
              >
                {(summary) => (
                  <>
                    Editing: <span class="text-green-700 dark:text-green-400">+{summary().additions} card{summary().additions !== 1 ? 's' : ''}</span>
                    {' / '}
                    <span class="text-red-700 dark:text-red-400">−{summary().removals} card{summary().removals !== 1 ? 's' : ''}</span>
                    {' '}({editFormatLabel()})
                  </>
                )}
              </Show>
            </div>
            {/* Error table when validation fails */}
            <Show when={validationErrors().length > 0} fallback={null}>
              <div>
                <ul class="list-none space-y-2">
                  <For each={validationErrors()}>
                    {(err) => {
                      const lineText = draftText()?.slice(err.lineStart, err.lineEnd) ?? ''
                      const spanText =
                        err.span != null && draftText() != null
                          ? draftText()!.slice(err.span.start, err.span.end).replace(/\s+/g, ' ').trim()
                          : null
                      const displayMessage =
                        spanText != null && !(err.message ?? '').includes(spanText)
                          ? `Error: ${err.message ?? 'Validation error'} — "${spanText}"`
                          : `Error: ${err.message ?? 'Validation error'}`
                      const validationForLine =
                        err.span
                          ? {
                              lines: [
                                {
                                  kind: 'error' as const,
                                  lineIndex: 0,
                                  lineStart: 0,
                                  lineEnd: lineText.length,
                                  span: {
                                    start: err.span.start - err.lineStart,
                                    end: err.span.end - err.lineStart,
                                  },
                                },
                              ],
                            }
                          : null
                      return (
                        <li class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 py-1.5 border-b border-red-200 dark:border-red-900/50 last:border-b-0">
                          <span class="text-gray-500 dark:text-gray-400 text-xs font-mono row-span-3 self-start pt-0.5">
                            L{err.lineIndex + 1}:
                          </span>
                          <div class="min-w-0 bg-white dark:bg-gray-900 overflow-x-auto">
                            <ListHighlight
                              text={lineText}
                              validation={validationForLine}
                              class="text-sm leading-relaxed"
                            />
                          </div>
                          <span class="text-xs">
                            <StyledValidationText text={displayMessage} />
                          </span>
                          <Show when={err.quickFixes && err.quickFixes.length > 0}>
                            <div class="flex flex-wrap items-center gap-1.5">
                              <span class="text-xs text-gray-500 dark:text-gray-400">
                                {err.quickFixes!.length === 1 ? 'Fix:' : 'Fixes:'}
                              </span>
                              <For each={err.quickFixes}>
                                {(fix, fixIndex) => {
                                  const isApplying = () =>
                                    quickFixApplying()?.lineIndex === err.lineIndex &&
                                    quickFixApplying()?.fixIndex === fixIndex()
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => applyQuickFix(err, fix, fixIndex())}
                                      disabled={isApplying()}
                                      class="inline-flex items-center justify-center min-h-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-wait"
                                      aria-label={`Apply fix: ${fix.label}`}
                                    >
                                      {isApplying() ? 'Applying…' : <StyledValidationText text={fix.label} />}
                                    </button>
                                  )
                                }}
                              </For>
                            </div>
                          </Show>
                        </li>
                      )
                    }}
                  </For>
                </ul>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Textarea with syntax-highlighting overlay — auto-grows to avoid scroll (keeps overlay in sync) */}
      <div class="grid overflow-hidden relative rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 overscroll-contain">
        <div class="hl-layer overflow-hidden whitespace-pre-wrap break-words p-3 min-h-[200px]">
          <ListHighlight
            text={highlightText()}
            validation={highlightValidation()}
            class="text-sm leading-relaxed"
          />
        </div>
        <textarea
          ref={(el) => { textareaRef = el }}
          value={textareaValue()}
          onInput={handleInput}
          readOnly={mode() === 'display'}
          placeholder={mode() === 'init' ? 'Paste or type a deck list…\n\n1 Lightning Bolt\n4x Birds of Paradise\n1 Shock (M21) 159' : undefined}
          autocapitalize="none"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          rows={10}
          class={`hl-input w-full bg-transparent p-3 text-sm leading-relaxed font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none overflow-hidden overscroll-contain resize-none min-h-[200px] ${
            mode() === 'display' ? 'cursor-default' : ''
          }`}
        />
      </div>
    </div>
  )
}
