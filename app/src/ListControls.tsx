// SPDX-License-Identifier: Apache-2.0
import { IconMinus, IconPlus } from './Icons'

export default function ListControls(props: {
  count: number
  onAdd: () => void
  onRemove: () => void
  addLabel: string
  removeLabel: string
}) {
  return (
    <span class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-800/80 px-1.5 py-0.5">
      <button
        type="button"
        onClick={props.onRemove}
        disabled={props.count === 0}
        class="shrink-0 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-600 dark:disabled:hover:text-gray-300 transition-colors p-0.5"
        aria-label={props.removeLabel}
      >
        <IconMinus class="size-4" />
      </button>
      <span class="min-w-[1.5rem] text-center text-sm font-medium tabular-nums text-gray-700 dark:text-gray-200">{props.count}</span>
      <button
        type="button"
        onClick={props.onAdd}
        class="shrink-0 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-0.5"
        aria-label={props.addLabel}
      >
        <IconPlus class="size-4" />
      </button>
    </span>
  )
}
