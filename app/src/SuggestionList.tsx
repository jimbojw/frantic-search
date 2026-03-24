// SPDX-License-Identifier: Apache-2.0
import type { Accessor } from 'solid-js'
import { For, Show, createMemo } from 'solid-js'
import type { Suggestion } from '@frantic-search/shared'
import { captureSuggestionApplied } from './analytics'
import { ChipButton } from './ChipButton'
import { HighlightedLabel } from './InlineBreakdown'

const EMPTY_STATE_IDS = [
  'empty-list',
  'include-extras',
  'bare-term-upgrade',
  'oracle',
  'wrong-field',
  'nonexistent-field',
  'stray-comma',
  'relaxed',
  'card-type',
  'keyword',
  'artist-atag',
  'near-miss',
  'example-query',
] as const

const RIDER_ORDER: Suggestion['id'][] = ['empty-list', 'nonexistent-field', 'unique-prints', 'include-extras']

/** Outline on sky panel: neutral chips read as distinct controls. */
const NEUTRAL_SUGGESTION_CHIP =
  'border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
/** Empty-list amber chips: border matches warning palette. */
const AMBER_SUGGESTION_CHIP =
  'border border-amber-400/90 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-600'

function getDescription(s: Suggestion, props: { hiddenCardCount?: number; hiddenPrintingCount?: number; navigateToDocs?: (doc?: string) => void; formatDualCount: (c: number, p?: number) => string }): { text: string; link?: { label: string; href?: () => void } } {
  if (s.id === 'empty-list') {
    const variant = s.emptyListVariant ?? 'my'
    return {
      text: variant === 'tag'
        ? 'This term requires a list with tags.'
        : 'This term requires an imported deck list.',
    }
  }
  if (s.id === 'include-extras' && props.hiddenCardCount !== undefined && props.hiddenCardCount > 0) {
    const n = props.hiddenCardCount
    const p = props.hiddenPrintingCount
    let t = `${n} ${n === 1 ? 'card' : 'cards'}`
    if (p !== undefined && p > 0) t += ` (${p} ${p === 1 ? 'printing' : 'printings'})`
    return { text: `${t} not shown.`, link: s.docRef && props.navigateToDocs ? { label: 'Learn more', href: () => props.navigateToDocs?.(s.docRef) } : undefined }
  }
  if (s.explain) {
    return {
      text: s.explain,
      link: s.docRef && props.navigateToDocs ? { label: 'Learn more', href: () => props.navigateToDocs?.(s.docRef) } : undefined,
    }
  }
  // Fallback for oracle, etc.
  if (s.id === 'oracle') return { text: 'Did you mean to search oracle text?', link: s.docRef && props.navigateToDocs ? { label: 'Learn more', href: () => props.navigateToDocs?.(s.docRef) } : undefined }
  return { text: 'Try again with this refinement.', link: s.docRef && props.navigateToDocs ? { label: 'Learn more', href: () => props.navigateToDocs?.(s.docRef) } : undefined }
}

export function SuggestionList(props: {
  /** Suggestions accessor for reactive updates. */
  suggestions: Accessor<Suggestion[]>
  mode: 'empty' | 'rider'
  onApplyQuery: (q: string) => void
  onCta?: (action: 'navigateToLists' | 'pasteList') => void
  formatDualCount: (cards: number, prints?: number) => string
  navigateToDocs?: (docParam?: string) => void
  /** For rider include-extras: hidden card count to show in "N not shown" */
  hiddenCardCount?: number
  /** For rider include-extras: hidden printing count when applicable */
  hiddenPrintingCount?: number
  /** When true, omit sky top border (nothing above this panel in the results card). Spec 155 empty `q`. */
  suppressTopBorder?: boolean
  /** Spec 155: empty effective query — starter chips, not refinements of a failed search. */
  exampleSearchPanel?: boolean
}) {
  const filtered = createMemo(() => {
    const list = props.suggestions() ?? []
    if (props.mode === 'empty') {
      return [...list]
        .filter((s) => (EMPTY_STATE_IDS as readonly string[]).includes(s.id))
        .sort((a, b) => a.priority - b.priority)
    }
    return RIDER_ORDER.flatMap((id) => list.filter((s) => s.id === id))
  })

  return (
    <Show when={filtered().length > 0}>
      <div
        class="px-4 py-4 bg-sky-50/90 dark:bg-sky-950/25"
        classList={{
          'border-t border-sky-200 dark:border-sky-800': !props.suppressTopBorder,
        }}
        role="region"
        aria-label={
          props.exampleSearchPanel ? 'Example search suggestions' : 'Query refinement suggestions'
        }
      >
        <h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {props.exampleSearchPanel ? 'Try an example search?' : 'Try a query refinement?'}
        </h3>
        <div class="flex flex-col gap-2 text-base text-gray-700 dark:text-gray-300">
          <For each={filtered()}>
          {(s) => {
            const desc = () => getDescription(s, props)
            const isEmptyList = s.id === 'empty-list'
            const descLinkForEmptyList = isEmptyList && props.onCta
              ? { label: 'Import one now?', onClick: () => props.onCta?.('navigateToLists') }
              : null

            return (
              <div class="flex flex-row gap-3">
                <div class="shrink-0 self-start">
                  {s.variant === 'cta' ? (
                    <ChipButton
                      state="neutral"
                      layout="col"
                      class={
                        isEmptyList
                          ? `bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 ${AMBER_SUGGESTION_CHIP}`
                          : NEUTRAL_SUGGESTION_CHIP
                      }
                      onClick={() => {
                        captureSuggestionApplied({
                          suggestion_id: s.id,
                          suggestion_label: s.label,
                          variant: 'cta',
                          cta_action: s.ctaAction,
                          mode: props.mode,
                        })
                        props.onCta?.(s.ctaAction!)
                      }}
                    >
                      <span class={isEmptyList ? 'text-amber-700 dark:text-amber-300 font-mono' : ''}>
                        {s.label}
                      </span>
                      {isEmptyList && (
                        <span class="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {props.formatDualCount(0, 0)}
                        </span>
                      )}
                    </ChipButton>
                  ) : (
                    <ChipButton
                      state="neutral"
                      layout={s.count !== undefined || s.printingCount !== undefined ? 'col' : 'row'}
                      class={NEUTRAL_SUGGESTION_CHIP}
                      onClick={() => {
                        if (s.query) {
                          captureSuggestionApplied({
                            suggestion_id: s.id,
                            suggestion_label: s.label,
                            variant: 'rewrite',
                            applied_query: s.query,
                            mode: props.mode,
                          })
                          props.onApplyQuery(s.query)
                        }
                      }}
                    >
                      <span class="min-w-0 text-left">
                        <HighlightedLabel label={s.label} />
                      </span>
                      {(s.count !== undefined || s.printingCount !== undefined) && (
                        <span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {props.formatDualCount(s.count ?? 0, s.printingCount)}
                        </span>
                      )}
                    </ChipButton>
                  )}
                </div>
                <div class="flex-1 min-w-0 text-base self-center">
                  {desc().text}
                  {descLinkForEmptyList ? (
                    <button
                      type="button"
                      onClick={descLinkForEmptyList.onClick}
                      class="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                    >
                      {descLinkForEmptyList.label}
                    </button>
                  ) : desc().link ? (
                    <button
                      type="button"
                      onClick={desc().link!.href}
                      class="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                    >
                      {desc().link!.label}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          }}
        </For>
      </div>
    </div>
    </Show>
  )
}
