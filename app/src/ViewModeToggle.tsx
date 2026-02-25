// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'
import type { ViewMode } from './view-mode'
import { VIEW_MODE_LABELS } from './view-mode'

export default function ViewModeToggle(props: {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  return (
    <div class="inline-flex rounded-full overflow-hidden text-xs font-medium select-none">
      <For each={VIEW_MODE_LABELS}>
        {({ mode, label }) => (
          <button
            type="button"
            onClick={() => props.onChange(mode)}
            class={`px-2.5 py-0.5 cursor-pointer transition-colors ${
              props.value === mode
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        )}
      </For>
    </div>
  )
}
