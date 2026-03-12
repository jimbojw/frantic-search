// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import { IconBug } from '../Icons'
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            View
          </button>
          <button
            type="button"
            onClick={ctx.handleEdit}
            class="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 text-xs font-medium transition-colors bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Edit deck list"
          >
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
            </svg>
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
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
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
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
            fallback={
              <svg class="size-3.5 text-green-600 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            }
          >
            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 0-1.125 1.125v3.375c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          </Show>
          {ctx.copied() ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
