// SPDX-License-Identifier: Apache-2.0
import { Show, For } from 'solid-js'
import ListHighlight from '../ListHighlight'
import { StyledValidationText } from './StyledValidationText'
import { useDeckEditorContext } from './DeckEditorContext'

export default function DeckEditorStatus() {
  const ctx = useDeckEditorContext()

  return (
    <div
      classList={{
        'px-3 py-2 border-b border-gray-200 dark:border-gray-600 text-sm min-h-[2.5rem] flex flex-col gap-2': true,
        'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200': ctx.mode() === 'edit' && ctx.validationErrors().length > 0,
        'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400': ctx.mode() !== 'edit' || ctx.validationErrors().length === 0,
      }}
    >
      <Show when={ctx.mode() === 'init'} fallback={null}>
        <p>List is empty. Paste a deck list or add cards from search results.</p>
      </Show>
      <Show when={ctx.mode() === 'display'} fallback={null}>
        <p>
          {ctx.instances().length} card{ctx.instances().length !== 1 ? 's' : ''}
        </p>
      </Show>
      <Show when={ctx.mode() === 'edit'} fallback={null}>
        <div class="flex flex-col gap-2">
          <div class="text-gray-500 dark:text-gray-400">
            <Show when={ctx.workerStatus() === 'error' && ctx.draftText()?.trim()} fallback={null}>
              Validation unavailable
            </Show>
            <Show when={ctx.workerStatus() === 'loading' && ctx.draftText()?.trim()} fallback={null}>
              Loading…
            </Show>
            <Show when={ctx.workerStatus() === 'ready' && ctx.isValidating()} fallback={null}>
              Validating…
            </Show>
            <Show when={ctx.workerStatus() === 'ready' && !ctx.isValidating() && !ctx.hasChanges()} fallback={null}>
              Editing: No changes ({ctx.editFormatLabel()})
            </Show>
            <Show when={ctx.workerStatus() === 'ready' && !ctx.isValidating() && ctx.hasChanges() && ctx.validationErrors().length > 0} fallback={null}>
              <span class="text-red-800 dark:text-red-200">
                Editing: {ctx.validationErrors().length} error{ctx.validationErrors().length !== 1 ? 's' : ''} ({ctx.editFormatLabel()})
              </span>
            </Show>
            <Show
              when={ctx.workerStatus() === 'ready' && !ctx.isValidating() && ctx.hasChanges() && ctx.validationErrors().length === 0 && ctx.editDiffSummary()}
              fallback={ctx.workerStatus() === 'ready' && !ctx.isValidating() && ctx.hasChanges() && ctx.validationErrors().length === 0 ? <span>Editing: changes pending ({ctx.editFormatLabel()})</span> : null}
            >
              {(summary) => (
                <>
                  Editing: <span class="text-green-700 dark:text-green-400">+{summary().additions} card{summary().additions !== 1 ? 's' : ''}</span>
                  {' / '}
                  <span class="text-red-700 dark:text-red-400">−{summary().removals} card{summary().removals !== 1 ? 's' : ''}</span>
                  {' '}({ctx.editFormatLabel()})
                </>
              )}
            </Show>
          </div>
          <Show when={ctx.validationErrors().length > 0} fallback={null}>
            <div>
              <ul class="list-none space-y-2">
                <For each={ctx.validationErrors()}>
                  {(err) => {
                    const lineText = ctx.draftText()?.slice(err.lineStart, err.lineEnd) ?? ''
                    const spanText =
                      err.span != null && ctx.draftText() != null
                        ? ctx.draftText()!.slice(err.span.start, err.span.end).replace(/\s+/g, ' ').trim()
                        : null
                    const displayMessage =
                      spanText != null && !(err.message ?? '').includes(spanText)
                        ? `Error: ${err.message ?? 'Validation error'} — "${spanText}"`
                        : `Error: ${err.message ?? 'Validation error'}`
                    const validationForLine =
                      err.span
                        ? {
                            lines: [
                              {
                                kind: 'error' as const,
                                lineIndex: 0,
                                lineStart: 0,
                                lineEnd: lineText.length,
                                span: {
                                  start: err.span.start - err.lineStart,
                                  end: err.span.end - err.lineStart,
                                },
                              },
                            ],
                          }
                        : null
                    return (
                      <li class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 py-1.5 border-b border-red-200 dark:border-red-900/50 last:border-b-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs font-mono row-span-3 self-start pt-0.5">
                          L{err.lineIndex + 1}:
                        </span>
                        <div class="min-w-0 bg-white dark:bg-gray-900 overflow-x-auto">
                          <ListHighlight
                            text={lineText}
                            validation={validationForLine}
                            class="text-sm leading-relaxed"
                          />
                        </div>
                        <span class="text-xs">
                          <StyledValidationText text={displayMessage} />
                        </span>
                        <Show when={err.quickFixes && err.quickFixes.length > 0}>
                          <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-xs text-gray-500 dark:text-gray-400">
                              {err.quickFixes!.length === 1 ? 'Fix:' : 'Fixes:'}
                            </span>
                            <For each={err.quickFixes}>
                              {(fix, fixIndex) => {
                                const isApplying = () =>
                                  ctx.quickFixApplying()?.lineIndex === err.lineIndex &&
                                  ctx.quickFixApplying()?.fixIndex === fixIndex()
                                return (
                                  <button
                                    type="button"
                                    onClick={() => ctx.applyQuickFix(err, fix, fixIndex())}
                                    disabled={isApplying()}
                                    class="inline-flex items-center justify-center min-h-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-wait"
                                    aria-label={`Apply fix: ${fix.label}`}
                                  >
                                    {isApplying() ? 'Applying…' : <StyledValidationText text={fix.label} />}
                                  </button>
                                )
                              }}
                            </For>
                          </div>
                        </Show>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
