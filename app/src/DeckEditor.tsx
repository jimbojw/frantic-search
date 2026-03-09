// SPDX-License-Identifier: Apache-2.0
import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For } from 'solid-js'
import {
  validateDeckList,
  lexDeckList,
  detectDeckFormat,
  serializeArena,
  serializeMoxfield,
} from '@frantic-search/shared'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  InstanceState,
  ListMetadata,
  DeckFormat,
  ListValidationResult,
} from '@frantic-search/shared'
import ListHighlight from './ListHighlight'

export type EditorMode = 'init' | 'display' | 'edit'

const VALIDATION_DEBOUNCE_MS = 150

const ALL_FORMATS: { id: DeckFormat; label: string }[] = [
  { id: 'arena', label: 'Arena' },
  { id: 'moxfield', label: 'Moxfield' },
  { id: 'archidekt', label: 'Archidekt' },
  { id: 'mtggoldfish', label: 'MTGGoldfish' },
  { id: 'melee', label: 'Melee.gg' },
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
  onDraftActiveChange?: (active: boolean) => void
}) {
  const [draftText, setDraftText] = createSignal<string | null>(null)
  const [selectedFormat, setSelectedFormat] = createSignal<DeckFormat>(readFormatFromStorage())
  const [showApplyPopover, setShowApplyPopover] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  // Debounced text for validation
  const [debouncedDraft, setDebouncedDraft] = createSignal<string>('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  let hlRef: HTMLDivElement | null = null

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

  // Cross-tab draft sync via storage events
  function handleStorageEvent(e: StorageEvent) {
    if (e.key !== draftKey(props.listId)) return
    if (e.newValue === null) {
      setDraftText(null)
      setDebouncedDraft('')
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

  // Derived mode
  const hasInstances = () => props.instances.length > 0
  const mode = createMemo<EditorMode>(() => {
    if (draftText() !== null) return 'edit'
    if (hasInstances()) return 'display'
    return 'init'
  })

  // Rendered text for Display mode
  const renderedText = createMemo(() => {
    if (!props.display || !hasInstances()) return ''
    return serialize(selectedFormat(), props.instances, props.display, props.printingDisplay)
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

  // Detected format in Edit mode
  const detectedFormat = createMemo<DeckFormat | null>(() => {
    const d = draftText()
    if (d === null) return null
    return detectDeckFormat(lexDeckList(d))
  })

  // The text shown in the textarea
  const textareaValue = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return renderedText()
    return ''
  })

  // The text used for syntax highlighting
  const highlightText = createMemo(() => {
    const m = mode()
    if (m === 'edit') return draftText()!
    if (m === 'display') return renderedText()
    return ''
  })

  // Validation passed to the highlight layer
  const highlightValidation = createMemo<ListValidationResult | null>(() => {
    if (mode() === 'edit') return validation()
    return null
  })

  function syncScroll(el: HTMLTextAreaElement) {
    if (hlRef) {
      hlRef.scrollTop = el.scrollTop
      hlRef.scrollLeft = el.scrollLeft
    }
  }

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
    syncScroll(el)
  }

  function handleScroll(e: Event) {
    syncScroll(e.currentTarget as HTMLTextAreaElement)
  }

  function handleEdit() {
    const text = renderedText()
    setDraftText(text)
    setDebouncedDraft(text)
    writeDraftToStorage(props.listId, text)
  }

  function handleRevert() {
    setDraftText(null)
    setDebouncedDraft('')
    clearDraftFromStorage(props.listId)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
  }

  function handleApply() {
    setShowApplyPopover(true)
  }

  function handleApplyOk() {
    setShowApplyPopover(false)
    const detected = detectedFormat()
    if (detected) {
      setSelectedFormat(detected)
      writeFormatToStorage(detected)
    }
    handleRevert()
  }

  async function handleCopy() {
    const text = mode() === 'edit' ? draftText()! : renderedText()
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

      {/* Toolbar */}
      <div class="flex items-center gap-1.5 min-h-[32px]">
        {/* Edit button (Display mode only) */}
        <Show when={mode() === 'display'}>
          <button
            type="button"
            onClick={handleEdit}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Edit deck list"
          >
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
            </svg>
            Edit
          </button>
        </Show>

        {/* Apply button (Edit mode only) */}
        <Show when={mode() === 'edit'}>
          <div class="relative">
            <button
              type="button"
              onClick={handleApply}
              disabled={hasValidationErrors()}
              class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600"
            >
              <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Apply
            </button>

            {/* Placeholder popover */}
            <Show when={showApplyPopover()}>
              <div class="absolute left-0 top-full mt-2 z-50 w-64 p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
                <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  Apply is not yet supported.
                </p>
                <button
                  type="button"
                  onClick={handleApplyOk}
                  class="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </Show>
          </div>
        </Show>

        {/* Revert button (Edit mode only) */}
        <Show when={mode() === 'edit'}>
          <button
            type="button"
            onClick={handleRevert}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Revert
          </button>
        </Show>

        {/* Copy button (Display and Edit modes) */}
        <Show when={mode() === 'display' || mode() === 'edit'}>
          <button
            type="button"
            onClick={handleCopy}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-auto"
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
        </Show>
      </div>

      {/* Textarea with syntax-highlighting overlay */}
      <div class="grid overflow-hidden relative rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900">
        <div
          ref={(el) => { hlRef = el }}
          class="hl-layer overflow-auto whitespace-pre-wrap break-words p-3 min-h-[200px]"
        >
          <ListHighlight
            text={highlightText()}
            validation={highlightValidation()}
            class="text-sm leading-relaxed"
          />
        </div>
        <textarea
          value={textareaValue()}
          onInput={handleInput}
          onScroll={handleScroll}
          readOnly={mode() === 'display'}
          placeholder={mode() === 'init' ? 'Paste or type a deck list…\n\n1 Lightning Bolt\n4x Birds of Paradise\n1 Shock (M21) 159' : undefined}
          autocapitalize="none"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          rows={10}
          class={`hl-input w-full bg-transparent p-3 text-sm leading-relaxed font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none resize-y min-h-[200px] ${
            mode() === 'display' ? 'cursor-default' : ''
          }`}
        />
      </div>
    </div>
  )
}
