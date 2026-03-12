// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import {
  IconArrowPath,
  IconArrowRight,
  IconBug,
  IconCheck,
  IconClipboardDocument,
  IconEye,
  IconList,
  IconXMark,
} from '../Icons'
import { useDeckEditorContext } from './DeckEditorContext'

export default function DeckEditorToolbar() {
  const ctx = useDeckEditorContext()

  return (
    <div class="flex items-stretch border-b border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-900">
      <div class="flex">
        <Show when={ctx.mode() === 'display'} fallback={null}>
          <button
            type="button"
            onClick={ctx.handleViewInSearch}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            aria-label="View list in search"
          >
            <IconEye class="size-3.5" />
            View
          </button>
          <button
            type="button"
            onClick={ctx.handleEdit}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Edit deck list"
          >
            <IconList class="size-3.5" />
            Edit
          </button>
        </Show>
        <Show when={ctx.mode() === 'edit' && !ctx.hasChanges()} fallback={null}>
          <button
            type="button"
            onClick={ctx.handleCancel}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            aria-label="Cancel editing"
          >
            <IconXMark class="size-3.5" />
            Cancel
          </button>
        </Show>
        <Show when={ctx.mode() === 'edit' && ctx.hasChanges()} fallback={null}>
          <button
            type="button"
            onClick={ctx.handleRevert}
            disabled={ctx.baselineText() === null}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
            aria-label="Revert changes"
          >
            <IconArrowPath class="size-3.5" />
            Revert
          </button>
        </Show>
        <Show when={ctx.mode() === 'review'} fallback={null}>
          <button
            type="button"
            onClick={ctx.handleBackToEdit}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Edit deck list"
          >
            <IconArrowPath class="size-3.5" />
            Edit
          </button>
        </Show>
      </div>
      <div class="flex-1" aria-hidden="true" />
      <div class="flex">
        <Show
          when={
            ctx.mode() === 'edit' &&
            ctx.hasChanges() &&
            !ctx.hasValidationErrors() &&
            (() => {
              const s = ctx.editDiffSummary()
              return s !== null && (s.additions > 0 || s.removals > 0)
            })()
          }
          fallback={null}
        >
          <button
            type="button"
            onClick={ctx.handleReview}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 border-l border-gray-200 dark:border-gray-600"
            aria-label="Review changes"
          >
            <IconArrowRight class="size-3.5" />
            Review
          </button>
        </Show>
        <Show when={ctx.mode() === 'review'} fallback={null}>
          <button
            type="button"
            onClick={ctx.handleSave}
            disabled={ctx.saveInProgress()}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 dark:disabled:hover:bg-blue-500 border-l border-gray-200 dark:border-gray-600"
            aria-label="Save changes"
          >
            <IconCheck class="size-3.5" />
            {ctx.saveInProgress() ? 'Saving…' : 'Save'}
          </button>
        </Show>
        <button
          type="button"
          onClick={ctx.handleDeckReport}
          disabled={ctx.mode() === 'init'}
          class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent border-l border-gray-200 dark:border-gray-600"
          aria-label="Report deck problem"
        >
          <IconBug class="size-3.5" />
          Bug
        </button>
        <button
          type="button"
          onClick={ctx.handleCopy}
          disabled={ctx.mode() === 'init'}
          class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent border-l border-gray-200 dark:border-gray-600"
          aria-label="Copy to clipboard"
        >
          <Show
            when={!ctx.copied()}
            fallback={<IconCheck class="size-3.5 text-green-600 dark:text-green-500" />}
          >
            <IconClipboardDocument class="size-3.5" />
          </Show>
          {ctx.copied() ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
