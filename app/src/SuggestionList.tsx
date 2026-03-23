// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'
import type { Suggestion } from '@frantic-search/shared'
import { ChipButton } from './ChipButton'
import { HighlightedLabel } from './InlineBreakdown'

const EMPTY_STATE_IDS = [
  'empty-list',
  'include-extras',
  'oracle',
  'card-type',
  'keyword',
  'artist-atag',
  'near-miss',
  'example-query',
] as const

const RIDER_ORDER: Suggestion['id'][] = ['unique-prints', 'include-extras']

function getWrapperCopy(id: Suggestion['id'], mode: 'empty' | 'rider'): string {
  if (mode === 'rider') {
    if (id === 'unique-prints') return 'Additional printings not shown. Try again with '
    if (id === 'include-extras') return '' // Will use dynamic "N not shown"
    return 'Try again with '
  }
  if (id === 'oracle') return 'Did you mean to search oracle text? Try '
  if (id === 'include-extras') return 'Try again with '
  return 'Try '
}

export function SuggestionList(props: {
  suggestions: Suggestion[]
  mode: 'empty' | 'rider'
  onApplyQuery: (q: string) => void
  onCta?: (action: 'navigateToLists' | 'pasteList') => void
  formatDualCount: (cards: number, prints?: number) => string
  navigateToDocs?: (docParam?: string) => void
  /** For rider include-extras: hidden card count to show in "N not shown" */
  hiddenCardCount?: number
  /** For rider include-extras: hidden printing count when applicable */
  hiddenPrintingCount?: number
}) {
  const filtered = () => {
    if (props.mode === 'empty') {
      return [...props.suggestions]
        .filter((s) => (EMPTY_STATE_IDS as readonly string[]).includes(s.id))
        .sort((a, b) => a.priority - b.priority)
    }
    return RIDER_ORDER.flatMap((id) =>
      props.suggestions.filter((s) => s.id === id)
    )
  }

  return (
    <For each={filtered()}>
      {(s) => {
        const prefix = () => {
          if (props.mode === 'rider' && s.id === 'include-extras') {
            const n = props.hiddenCardCount ?? 0
            const p = props.hiddenPrintingCount
            if (n === 0) return ''
            let t = `${n} ${n === 1 ? 'card' : 'cards'}`
            if (p !== undefined && p > 0) {
              t += ` (${p} ${p === 1 ? 'printing' : 'printings'})`
            }
            return `${t} not shown. Try again with `
          }
          return getWrapperCopy(s.id, props.mode)
        }
        return (
          <p class="mt-1 flex flex-wrap items-center gap-x-1">
            {prefix()}
            {s.variant === 'cta' ? (
              <ChipButton
                state="neutral"
                onClick={() => props.onCta?.(s.ctaAction!)}
              >
                {s.label}
              </ChipButton>
            ) : (
              <ChipButton
                state="neutral"
                layout={s.count !== undefined || s.printingCount !== undefined ? 'col' : 'row'}
                onClick={() => s.query && props.onApplyQuery(s.query)}
              >
                <span class="flex items-center gap-1">
                  <HighlightedLabel label={s.label} />
                </span>
                {(s.count !== undefined || s.printingCount !== undefined) && (
                  <span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {props.formatDualCount(s.count ?? 0, s.printingCount)}
                  </span>
                )}
              </ChipButton>
            )}
            ?
            {s.docRef && props.navigateToDocs && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => props.navigateToDocs?.(s.docRef)}
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Learn more
                </button>
              </>
            )}
          </p>
        )
      }}
    </For>
  )
}
