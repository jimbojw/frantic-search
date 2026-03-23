// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import { useSearchContext } from './SearchContext'
import { IconBug } from './Icons'
import { Outlink } from './Outlink'

/** Spec 152: Shared three-link column (Try on Scryfall, Syntax help, Report a problem). */
export default function ResultsActionsColumn() {
  const ctx = useSearchContext()
  return (
    <div class="flex flex-col gap-1 shrink-0 items-end">
      <Outlink
        href={ctx.scryfallUrl()}
        class="whitespace-nowrap text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors text-sm"
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
