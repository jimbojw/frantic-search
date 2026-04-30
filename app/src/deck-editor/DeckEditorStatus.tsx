// SPDX-License-Identifier: Apache-2.0
import { Show, For } from 'solid-js'
import { IconChevronRight } from '../Icons'
import ListHighlight from '../ListHighlight'
import { StyledValidationText } from './StyledValidationText'
import { useDeckEditorContext } from './DeckEditorContext'

export default function DeckEditorStatus() {
  const ctx = useDeckEditorContext()

  const errorsWithFixes = () =>
    ctx.validationErrors().filter((e) => e.quickFixes && e.quickFixes.length > 0)

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
        <div class="flex flex-col gap-2">
          <p>
            {ctx.instances().length} card{ctx.instances().length !== 1 ? 's' : ''}
          </p>
          <Show when={ctx.instances().length > 0} fallback={null}>
            <Show
              when={ctx.deckScores()}
              fallback={
                <p class="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
                  Scoring deck…
                </p>
              }
            >
              {(scores) => (
                <dl class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <div class="min-w-0">
                    <dt class="sr-only">Salt</dt>
                    <dd class="m-0">
                      <span class="font-medium text-gray-800 dark:text-gray-200">Salt</span>{' '}
                      <span
                        class="tabular-nums font-semibold text-gray-900 dark:text-gray-100"
                        title={`EDHREC salt aggregate (higher = saltier). Coverage: ${scores().saltCoverage.scoredCopies} of ${scores().saltCoverage.totalCopies} cards scored.`}
                      >
                        {scores().salt}
                      </span>
                    </dd>
                  </div>
                  <div class="min-w-0">
                    <dt class="sr-only">Conformity</dt>
                    <dd class="m-0">
                      <span class="font-medium text-gray-800 dark:text-gray-200">Conformity</span>{' '}
                      <span
                        class="tabular-nums font-semibold text-gray-900 dark:text-gray-100"
                        title={`EDHREC popularity aggregate (higher = more staple-heavy). Coverage: ${scores().conformityCoverage.scoredCopies} of ${scores().conformityCoverage.totalCopies} cards scored.`}
                      >
                        {scores().conformity}
                      </span>
                    </dd>
                  </div>
                  <div class="min-w-0">
                    <dt class="sr-only">Bling</dt>
                    <dd class="m-0">
                      <span class="font-medium text-gray-800 dark:text-gray-200">Bling</span>{' '}
                      <span
                        class="tabular-nums font-semibold text-gray-900 dark:text-gray-100"
                        title={`Printing price aggregate (higher = pricier). Coverage: ${scores().blingCoverage.scoredCopies} of ${scores().blingCoverage.totalCopies} cards scored.`}
                      >
                        {scores().bling}
                      </span>
                    </dd>
                  </div>
                </dl>
              )}
            </Show>
          </Show>
        </div>
      </Show>
      <Show when={(ctx.mode() === 'edit' || ctx.mode() === 'review') && ctx.instances().length > 0} fallback={null}>
        <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2">
          <span class="shrink-0">Preserve when merging:</span>
          <div class="flex flex-wrap gap-2">
          {(() => {
            const counts = ctx.preserveCounts()
            const preserveChip = (
              label: string,
              count: number,
              active: boolean,
              disabled: boolean,
              tooltip: string,
              onClick: () => void
            ) => (
              <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                title={disabled ? tooltip : undefined}
                classList={{
                  'inline-flex items-center justify-center min-h-7 px-2 py-1 rounded text-xs font-medium transition-colors': true,
                  'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 text-blue-800 dark:text-blue-200':
                    active && !disabled,
                  'bg-gray-100 dark:bg-gray-800 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300':
                    !active && !disabled,
                  'opacity-50 cursor-not-allowed pointer-events-none': disabled,
                }}
                aria-pressed={active}
                aria-label={`${label} (${count})`}
              >
                {label} ({count})
              </button>
            )
            return (
              <>
                {preserveChip(
                  'Tags',
                  counts.tagsCount,
                  ctx.preserveTags(),
                  counts.tagsCount === 0,
                  'No tags in this list to preserve',
                  () => ctx.togglePreserveTags()
                )}
                {preserveChip(
                  'Collection',
                  counts.collectionCount,
                  ctx.preserveCollectionStatus(),
                  counts.collectionCount === 0,
                  'No collection status in this list to preserve',
                  () => ctx.togglePreserveCollectionStatus()
                )}
                {preserveChip(
                  'Variants',
                  counts.variantsCount,
                  ctx.preserveVariants(),
                  counts.variantsCount === 0,
                  'No variants in this list to preserve',
                  () => ctx.togglePreserveVariants()
                )}
              </>
            )
          })()}
          </div>
        </div>
      </Show>
      <Show when={ctx.mode() === 'review'} fallback={null}>
        <Show
          when={
            (() => {
              const diff = ctx.reviewDiff()
              const n = diff?.additions.length ?? 0
              const m = diff?.removals.length ?? 0
              return n > 0 || m > 0
            })()
          }
          fallback={<p>No changes to review</p>}
        >
          <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2">
            <span class="shrink-0">Reviewing list edits:</span>
            <div class="flex flex-wrap gap-2">
            {(() => {
              const diff = ctx.reviewDiff()
              const matched = ctx.reviewMatchedInstances()
              const n = diff?.additions.length ?? 0
              const m = diff?.removals.length ?? 0
              const k = matched.length
            const chip = (
              label: string,
              count: number,
              active: boolean,
              disabled: boolean,
              onClick: () => void
            ) => (
              <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                classList={{
                  'inline-flex items-center justify-center min-h-8 px-2 py-1.5 rounded text-xs font-medium transition-colors': true,
                  'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-800 dark:text-green-200':
                    label === 'Added' && active && !disabled,
                  'bg-red-100 dark:bg-red-900/30 border-2 border-red-500 text-red-800 dark:text-red-200':
                    label === 'Removed' && active && !disabled,
                  'bg-gray-100 dark:bg-gray-800 border-2 border-gray-400 text-gray-700 dark:text-gray-300':
                    label === 'Unchanged' && active && !disabled,
                  'bg-gray-100 dark:bg-gray-800 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300':
                    !active && !disabled,
                  'opacity-50 cursor-not-allowed pointer-events-none': disabled,
                }}
                aria-pressed={active}
                aria-label={`${label} (${count})`}
              >
                {label} ({count})
              </button>
            )
            return (
              <>
                {chip('Added', n, ctx.reviewFilterAdded(), n === 0, () => ctx.toggleReviewFilterAdded())}
                {chip('Removed', m, ctx.reviewFilterRemoved(), m === 0, () => ctx.toggleReviewFilterRemoved())}
                {chip('Unchanged', k, ctx.reviewFilterUnchanged(), k === 0, () => ctx.toggleReviewFilterUnchanged())}
              </>
            )
          })()}
            </div>
          </div>
        </Show>
      </Show>
      <Show when={ctx.mode() === 'edit'} fallback={null}>
        <div class="flex flex-col gap-2">
          <Show when={ctx.validationErrors().length === 0} fallback={null}>
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
            <Show
              when={
                ctx.workerStatus() === 'ready' &&
                !ctx.isValidating() &&
                (!ctx.hasChanges() ||
                  (ctx.editDiffSummary() &&
                    ctx.editDiffSummary()!.additions === 0 &&
                    ctx.editDiffSummary()!.removals === 0))
              }
              fallback={null}
            >
              Editing: No changes{(ctx.editFormatLabel() ?? '').trim() ? ` (${ctx.editFormatLabel()})` : ''}
            </Show>
            <Show
              when={(() => {
                const s = ctx.editDiffSummary()
                if (
                  ctx.workerStatus() !== 'ready' ||
                  ctx.isValidating() ||
                  !ctx.hasChanges() ||
                  ctx.validationErrors().length > 0 ||
                  !s ||
                  (s.additions === 0 && s.removals === 0)
                )
                  return false
                return s
              })()}
              fallback={(() => {
                const s = ctx.editDiffSummary()
                const ready =
                  ctx.workerStatus() === 'ready' &&
                  !ctx.isValidating() &&
                  ctx.hasChanges() &&
                  ctx.validationErrors().length === 0
                if (!ready) return null
                if (s && s.additions === 0 && s.removals === 0) return null
                return (
                  <span>
                    Editing: changes pending{(ctx.editFormatLabel() ?? '').trim() ? ` (${ctx.editFormatLabel()})` : ''}
                  </span>
                )
              })()}
            >
              {(summary) => (
                <>
                  Editing: <span class="text-green-700 dark:text-green-400">+{summary().additions} card{summary().additions !== 1 ? 's' : ''}</span>
                  {' / '}
                  <span class="text-red-700 dark:text-red-400">−{summary().removals} card{summary().removals !== 1 ? 's' : ''}</span>
                  {(ctx.editFormatLabel() ?? '').trim() ? ` (${ctx.editFormatLabel()})` : ''}
                </>
              )}
            </Show>
            </div>
          </Show>
          <Show when={ctx.validationErrors().length > 0} fallback={null}>
            <div class="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => ctx.toggleValidationErrorsExpanded()}
                class="flex items-center justify-between gap-2 w-full text-left min-h-[2rem] -mx-1 px-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                aria-expanded={ctx.validationErrorsExpanded()}
                aria-label={ctx.validationErrorsExpanded() ? 'Collapse errors' : 'Expand errors'}
              >
                <span class="flex items-center gap-1.5 shrink-0">
                  <IconChevronRight
                    class={`size-2.5 transition-transform text-red-800 dark:text-red-200 ${ctx.validationErrorsExpanded() ? 'rotate-90' : ''}`}
                  />
                  <span class="text-red-800 dark:text-red-200">
                    Editing: {ctx.validationErrors().length} error{ctx.validationErrors().length !== 1 ? 's' : ''}{(ctx.editFormatLabel() ?? '').trim() ? ` (${ctx.editFormatLabel()})` : ''}
                  </span>
                </span>
                <span class="flex items-center shrink-0">
                  <Show when={errorsWithFixes().length > 0} fallback={null}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        ctx.applyAllQuickFixes()
                      }}
                      disabled={ctx.quickFixApplying() !== null}
                      class="inline-flex items-center justify-center min-h-8 px-2 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors bg-white dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-800/60 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-70 disabled:cursor-wait"
                      aria-label="Apply all quick fixes"
                    >
                      {ctx.quickFixApplying() !== null
                        ? 'Applying…'
                        : errorsWithFixes().length === 1
                          ? 'Apply quick fix'
                          : `Apply ${errorsWithFixes().length} quick fixes`}
                    </button>
                  </Show>
                  <Show when={errorsWithFixes().length === 0} fallback={null}>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      No quick fixes available
                    </span>
                  </Show>
                </span>
              </button>
              <Show when={ctx.validationErrorsExpanded()} fallback={null}>
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
                                      class="inline-flex items-center justify-center min-h-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors bg-white dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-800/60 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-70 disabled:cursor-wait"
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
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
