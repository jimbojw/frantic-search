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
}) {
  return (
    <div class="relative px-3 pt-2 pb-2">
      <button
        type="button"
        onClick={() => props.onHelpClick()}
        class="absolute right-0 top-2 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
        aria-label="Syntax help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
          <defs>
            <mask id="terms-drawer-help-mask">
              <circle cx="12" cy="12" r="12" fill="white" />
              <text x="12" y="16" text-anchor="middle" fill="black" font-size="12" font-weight="600" font-family="system-ui, sans-serif">?</text>
            </mask>
          </defs>
          <circle cx="12" cy="12" r="12" fill="currentColor" mask="url(#terms-drawer-help-mask)" />
        </svg>
      </button>
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
