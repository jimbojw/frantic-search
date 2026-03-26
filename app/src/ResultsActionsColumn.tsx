// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import { captureScryfallOutlinkClicked } from './analytics'
import { useSearchContext } from './SearchContext'
import type { SearchContextValue } from './SearchContext'
import { IconBug } from './Icons'
import { Outlink } from './Outlink'

/** Same cardinality as `search_executed.results_count` (Spec 085, App.tsx worker handler). */
function resultsCountForSearchAnalytics(ctx: SearchContextValue): number {
  const printingLen = ctx.totalPrintingItems()
  const vm = ctx.viewMode()
  if (printingLen > 0 && (vm === 'images' || vm === 'full')) {
    return printingLen
  }
  return ctx.totalCards()
}

/** Spec 152: Shared three-link column (Try on Scryfall, Syntax help, Report a problem). */
export default function ResultsActionsColumn() {
  const ctx = useSearchContext()
  return (
    <div class="flex flex-col gap-1 shrink-0 items-end">
      <Outlink
        href={ctx.scryfallUrl()}
        class="whitespace-nowrap text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors text-sm"
        onClick={() => {
          captureScryfallOutlinkClicked({
            query: ctx.effectiveQuery().trim(),
            used_extension: ctx.usedExtension(),
            results_count: resultsCountForSearchAnalytics(ctx),
            ...(ctx.paneId != null ? { pane_id: ctx.paneId } : {}),
          })
        }}
      >
        Try on Scryfall ↗
      </Outlink>
      <Show when={ctx.navigateToDocs}>
        <button
          type="button"
          onClick={() => ctx.navigateToDocs!('reference/syntax')}
          class="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Syntax help
        </button>
      </Show>
      <button
        type="button"
        onClick={() => ctx.navigateToReport()}
        class="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <IconBug class="size-3 shrink-0" />
        Report a problem
      </button>
    </div>
  )
}
