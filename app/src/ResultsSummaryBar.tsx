// SPDX-License-Identifier: Apache-2.0
import type { BreakdownNode } from '@frantic-search/shared'
import QueryHighlight from './QueryHighlight'
import ResultsActionsColumn from './ResultsActionsColumn'
import { formatDualCount } from './InlineBreakdown'

/** Spec 152: Uniform two-cell results footer with query echo and actions. */
export default function ResultsSummaryBar(props: {
  effectiveQuery: string
  effectiveBreakdown: BreakdownNode | null
  cardCount: number
  printingCount?: number
  zeroResult?: boolean
}) {
  const countText = () =>
    props.cardCount === 0
      ? 'zero cards'
      : formatDualCount(props.cardCount, props.printingCount)
  const pyClass = () => (props.zeroResult ? 'py-3' : 'py-2')
  return (
    <div
      class={`border-t border-gray-200 dark:border-gray-800 px-3 ${pyClass()} flex flex-row gap-4`}
    >
      <div class="flex-1 min-w-0 flex flex-col gap-1.5">
        <p class="text-base text-gray-600 dark:text-gray-400">
          Your query,
        </p>
        <p class="rounded px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-sm font-mono min-w-0">
          <QueryHighlight
            query={props.effectiveQuery}
            breakdown={props.effectiveBreakdown}
            class="inline whitespace-pre-wrap break-words"
          />
        </p>
        <p class="text-base text-gray-600 dark:text-gray-400">
          matched {countText()}.
        </p>
      </div>
      <ResultsActionsColumn />
    </div>
  )
}
