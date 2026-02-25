// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'

const FORMAT_TERMS = [
  'f:standard',
  'f:pioneer',
  'f:modern',
  'f:commander',
  'f:pauper',
  'f:legacy',
]

const TYPE_TERMS = [
  't:creature',
  't:instant',
  't:sorcery',
  't:artifact',
  't:enchantment',
  't:land',
  't:planeswalker',
]

export default function TermsDrawer(props: {
  onChipClick: (term: string) => void
  onHelpClick: () => void
  onClose: () => void
}) {
  return (
    <div class="relative px-3 pt-2 pb-2">
      <div class="absolute right-2 top-2 bottom-2 flex flex-col justify-between">
        <button
          type="button"
          onClick={() => props.onClose()}
          class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
          aria-label="Close filters"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => props.onHelpClick()}
          class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
          aria-label="Syntax help"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
            <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="2" fill="none" />
            <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
            <rect x="10.5" y="11" width="3" height="7" rx="0.5" fill="currentColor" />
            <rect x="9" y="11" width="3" height="1.5" rx="0.5" fill="currentColor" />
            <rect x="9" y="16.5" width="6" height="1.5" rx="0.5" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div class="grid grid-cols-2 items-start gap-4 pr-8">
        <div class="flex flex-wrap gap-1.5">
          <For each={FORMAT_TERMS}>
            {(term) => (
              <button
                type="button"
                onClick={() => props.onChipClick(term)}
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                {term}
              </button>
            )}
          </For>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <For each={TYPE_TERMS}>
            {(term) => (
              <button
                type="button"
                onClick={() => props.onChipClick(term)}
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                {term}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
