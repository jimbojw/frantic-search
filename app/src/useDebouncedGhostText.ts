// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { getCompletionContext, computeSuggestion } from './query-autocomplete'
import type { AutocompleteData } from './query-autocomplete'

const DEBOUNCE_MS = 100

/** Pure checks before debounced ghost computation (Spec 089: caret at end of query). Exported for tests. */
export function ghostCompletionPreconditionsMet(
  q: string,
  cursor: number,
  selectionEnd: number,
  isComposing: boolean,
  data: AutocompleteData | null,
  isFocused?: boolean,
): boolean {
  if (isFocused !== undefined && !isFocused) return false
  if (isComposing || !data) return false
  if (cursor !== selectionEnd) return false
  if (cursor !== q.length) return false
  return true
}

export function useDebouncedGhostText(
  query: Accessor<string>,
  cursorOffset: Accessor<number>,
  selectionEnd: Accessor<number>,
  isComposing: Accessor<boolean>,
  autocompleteData: Accessor<AutocompleteData | null>,
  isFocused?: Accessor<boolean>,
): Accessor<string | null> {
  const [ghostText, setGhostText] = createSignal<string | null>(null)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  createEffect(() => {
    const clearTimer = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    }

    const q = query()
    const cursor = cursorOffset()
    if (
      !ghostCompletionPreconditionsMet(
        q,
        cursor,
        selectionEnd(),
        isComposing(),
        autocompleteData(),
        isFocused?.(),
      )
    ) {
      clearTimer()
      setGhostText(null)
      return
    }
    const ctx = getCompletionContext(q, cursor)
    if (!ctx || cursor < ctx.tokenEnd) {
      clearTimer()
      setGhostText(null)
      return
    }

    clearTimer()
    setGhostText(null)

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const data = autocompleteData()
      if (!data) return
      const suggestion = computeSuggestion(ctx, data)
      if (!suggestion) {
        setGhostText(null)
        return
      }
      setGhostText(suggestion.slice(cursor - ctx.tokenStart))
    }, DEBOUNCE_MS)

    onCleanup(clearTimer)
  })

  return ghostText
}
