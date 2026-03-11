// SPDX-License-Identifier: Apache-2.0
import { Show, For } from 'solid-js'
import { useDeckEditorContext } from './DeckEditorContext'
import { ALL_FORMATS } from './serialization'

export default function DeckEditorFormatChips() {
  const ctx = useDeckEditorContext()

  return (
    <Show when={ctx.mode() === 'display'} fallback={null}>
      <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm min-w-0">
        <div class="flex flex-col shrink-0 self-center">
          <span class="text-gray-600 dark:text-gray-400 font-medium">
            Compatible with:
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            (for export to)
          </span>
        </div>
        <div class="flex flex-wrap gap-2 min-w-0">
          <For each={ALL_FORMATS}>
            {(fmt) => {
              const isSelected = () => ctx.selectedFormat() === fmt.id
              return (
                <button
                  type="button"
                  onClick={() => ctx.handleFormatSelect(fmt.id)}
                  class={`inline-flex items-center justify-center min-h-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
                    isSelected()
                      ? 'bg-gray-100 dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-500 text-blue-700 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'bg-gray-100 dark:bg-gray-800 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {fmt.label}
                </button>
              )
            }}
          </For>
        </div>
      </div>
    </Show>
  )
}
