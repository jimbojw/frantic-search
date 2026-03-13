// SPDX-License-Identifier: Apache-2.0
import { createSignal, Show, For } from 'solid-js'
import type { DeckReportContext } from './deck-editor/DeckEditorContext'
import { IconChevronLeft } from './Icons'
import { openOutlink } from './Outlink'

declare const __APP_VERSION__: string
declare const __BUGS_URL__: string

const LIST_TRUNCATE_LINES = 200

function buildDeckReportBody(
  context: DeckReportContext,
  description: string,
  omitList: boolean,
): string {
  const sections: string[] = []

  sections.push(`## Description\n\n${description || '(not provided)'}`)

  const contextLines = [
    `- Format: ${context.format}`,
    `- Mode: ${context.mode}`,
    `- List: ${context.listName} (${context.listId})`,
  ]
  if (context.instanceCount !== undefined) {
    contextLines.push(`- Instance count: ${context.instanceCount.toLocaleString()}`)
  }
  sections.push(`## Context\n\n${contextLines.join('\n')}`)

  const validationSection =
    context.validationErrors.length === 0
      ? 'None'
      : context.validationErrors
          .map(
            (e) =>
              `L${e.lineIndex + 1}: ${e.message ?? '(no message)'}`,
          )
          .join('\n')
  sections.push(`## Validation Errors\n\n${validationSection}`)

  sections.push(
    `## Environment\n\n- App version: ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}\n- User agent: ${navigator.userAgent}\n- Date: ${new Date().toISOString()}`,
  )

  if (!omitList) {
    sections.push(`## Deck List\n\n\`\`\`\n${context.listContent}\n\`\`\``)
  }

  return sections.join('\n\n')
}

function buildDeckReportTitle(description: string, format: string): string {
  const prefix = 'Deck bug: '
  const maxLen = 80
  const raw =
    description.trim().length > 0
      ? description.trim().split('\n')[0] ?? ''
      : format
  const suffix = raw.length > maxLen - prefix.length ? raw.slice(0, maxLen - prefix.length - 1) + '…' : raw
  return prefix + suffix
}

function buildDeckReportGitHubUrl(body: string, title: string): string {
  const params = new URLSearchParams({ title, body, labels: 'bug' })
  const base = __BUGS_URL__.replace(/\/$/, '')
  return `${base}/new?${params}`
}

export default function DeckBugReport(props: {
  context: DeckReportContext | null
}) {
  const [description, setDescription] = createSignal('')
  const [omitList, setOmitList] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  function getReportBody() {
    const ctx = props.context
    if (!ctx) return ''
    return buildDeckReportBody(ctx, description(), omitList())
  }

  function getReportTitle() {
    const ctx = props.context
    if (!ctx) return 'Deck bug'
    return buildDeckReportTitle(description(), ctx.format)
  }

  function handleReviewOnGitHub() {
    openOutlink(buildDeckReportGitHubUrl(getReportBody(), getReportTitle()))
  }

  function handleCopy() {
    navigator.clipboard.writeText(getReportBody()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div class="mx-auto max-w-2xl px-4 py-6">
      <div class="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => history.back()}
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 -ml-1"
          aria-label="Back"
        >
          <IconChevronLeft class="size-5" />
        </button>
        <h1 class="text-lg font-bold tracking-tight">Report a Deck Problem</h1>
      </div>

      <Show
        when={props.context}
        fallback={
          <p class="text-sm text-gray-700 dark:text-gray-300">
            No deck context. Go to My List and use the Bug button to report a deck problem.
          </p>
        }
      >
        {(ctx) => (
          <>
            {/* Format & Mode */}
            <section class="mb-6">
              <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Format & mode
              </h2>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                <strong>Format:</strong> {ctx().format} · <strong>Mode:</strong>{' '}
                {ctx().mode === 'display' ? 'Display' : 'Editing'} ·{' '}
                <strong>List:</strong> {ctx().listName} ({ctx().listId})
              </p>
            </section>

            {/* Validation Errors */}
            <Show when={ctx().validationErrors.length > 0}>
              <section class="mb-6">
                <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Validation errors
                </h2>
                <p class="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  {ctx().validationErrors.length} error
                  {ctx().validationErrors.length !== 1 ? 's' : ''}
                </p>
                <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                  <For each={ctx().validationErrors}>
                    {(err) => (
                      <li>
                        L{err.lineIndex + 1}: {err.message ?? '(no message)'}
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>

            {/* Instance Count (Display mode only) */}
            <Show when={ctx().instanceCount !== undefined}>
              <section class="mb-6">
                <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Instance count
                </h2>
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  {ctx().instanceCount!.toLocaleString()} card
                  {ctx().instanceCount !== 1 ? 's' : ''}
                </p>
              </section>
            </Show>

            {/* User input */}
            <section class="mb-6">
              <label
                class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2"
                for="deck-bug-description"
              >
                What went wrong?
              </label>
              <textarea
                id="deck-bug-description"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                placeholder="Describe the problem (e.g. 'Pasted from Moxfield but tags were lost', 'Export to Arena had wrong sideboard format', 'Card X resolved to wrong printing')"
                rows={3}
                class="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all resize-y"
              />
            </section>

            {/* Submit buttons */}
            <div class="flex gap-3">
              <button
                type="button"
                onClick={handleReviewOnGitHub}
                class="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                Review on GitHub
              </button>
              <button
                type="button"
                onClick={handleCopy}
                class="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-[7rem]"
              >
                {copied() ? 'Copied!' : 'Copy Report'}
              </button>
            </div>

            {/* List Content */}
            <section class="mt-8 mb-6">
              <div class="flex items-start justify-between gap-4 mb-2">
                <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  List content
                </h2>
                <label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={omitList()}
                    onInput={(e) => setOmitList(e.currentTarget.checked)}
                    class="rounded border-gray-300 dark:border-gray-600"
                  />
                  Omit deck list from bug report
                </label>
              </div>
              <Show
                when={!omitList()}
                fallback={
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    Deck list omitted per user request
                  </p>
                }
              >
                <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 overflow-x-auto">
                  <pre class="font-mono text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {(() => {
                      const lines = ctx().listContent.split(/\r?\n/)
                      const truncated = lines.length > LIST_TRUNCATE_LINES
                      const display = truncated
                        ? lines.slice(0, LIST_TRUNCATE_LINES).join('\n')
                        : ctx().listContent
                      return (
                        <>
                          {display}
                          {truncated ? '\n… (truncated, full content included in report body)' : ''}
                        </>
                      )
                    })()}
                  </pre>
                </div>
              </Show>
            </section>
          </>
        )}
      </Show>
    </div>
  )
}
