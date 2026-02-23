// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'

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
  expanded: boolean
  onToggle: () => void
  onChipClick: (term: string) => void
  onHelpClick: () => void
}) {
  return (
    <div>
      <div
        onClick={() => props.onToggle()}
        class="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg class={`size-2.5 fill-current text-gray-500 dark:text-gray-400 transition-transform ${props.expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
          <path d="M8 5l8 7-8 7z" />
        </svg>
        <span class="font-mono text-xs text-gray-500 dark:text-gray-400 flex-1">TERMS</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); props.onHelpClick() }}
          class="font-mono text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Syntax help
        </button>
      </div>
      <Show when={props.expanded}>
        <div class="grid grid-cols-2 items-start gap-4 px-3 pb-2 border-t border-gray-200 dark:border-gray-700 pt-2">
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
      </Show>
    </div>
  )
}
