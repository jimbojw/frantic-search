// SPDX-License-Identifier: Apache-2.0
import { createSignal, Show, For } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'

declare const __APP_VERSION__: string
declare const __BUGS_URL__: string

function serializeBreakdown(node: BreakdownNode, indent = 0): string {
  const prefix = '  '.repeat(indent)
  const line = `${prefix}${node.label}  ${node.matchCount.toLocaleString()}`
  if (!node.children) return line
  return [line, ...node.children.map(c => serializeBreakdown(c, indent + 1))].join('\n')
}

function buildReportBody(
  query: string,
  expected: string,
  resultCount: number,
  breakdown: BreakdownNode | null,
  scryfallDiffers: boolean,
): string {
  const scryfallUrl = `https://scryfall.com/search?q=${encodeURIComponent(query)}`
  const sections = [
    `## Query\n\n\`${query}\``,
    `## Expected\n\n${expected || '(not provided)'}`,
    `## Actual\n\n${resultCount.toLocaleString()} results`,
  ]

  if (breakdown) {
    sections.push(`## Breakdown\n\n\`\`\`\n${serializeBreakdown(breakdown)}\n\`\`\``)
  }

  sections.push(
    `## Scryfall Comparison\n\n${scryfallDiffers ? `Scryfall returns different results: [link](${scryfallUrl})` : 'Not checked'}`,
  )

  sections.push(
    `## Environment\n\n- App version: ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}\n- User agent: ${navigator.userAgent}\n- Date: ${new Date().toISOString()}`,
  )

  return sections.join('\n\n')
}

function buildGitHubUrl(query: string, body: string): string {
  const title = `Query bug: ${query.length > 80 ? query.slice(0, 77) + '…' : query}`
  const params = new URLSearchParams({ title, body, labels: 'bug' })
  const base = __BUGS_URL__.replace(/\/$/, '')
  return `${base}/new?${params}`
}

function BreakdownPreview(props: { node: BreakdownNode; depth?: number }) {
  const depth = () => props.depth ?? 0
  return (
    <>
      <div
        class="flex items-baseline justify-between gap-4 py-0.5"
        style={depth() ? { "padding-left": `${depth() * 1.25}rem` } : undefined}
      >
        <span class={`font-mono text-xs truncate ${props.node.matchCount === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
          {props.node.label}
        </span>
        <span class={`font-mono text-xs tabular-nums shrink-0 ${props.node.matchCount === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
          {props.node.matchCount.toLocaleString()}
        </span>
      </div>
      <Show when={props.node.children}>
        <For each={props.node.children}>
          {(child) => <BreakdownPreview node={child} depth={depth() + 1} />}
        </For>
      </Show>
    </>
  )
}

export default function BugReport(props: {
  query: string
  breakdown: BreakdownNode | null
  resultCount: number
}) {
  const [expected, setExpected] = createSignal('')
  const [scryfallDiffers, setScryfallDiffers] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  function getReportBody() {
    return buildReportBody(
      props.query,
      expected(),
      props.resultCount,
      props.breakdown,
      scryfallDiffers(),
    )
  }

  function handleReviewOnGitHub() {
    const url = buildGitHubUrl(props.query, getReportBody())
    window.open(url, '_blank', 'noopener,noreferrer')
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
          <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 class="text-lg font-bold tracking-tight">Report a Problem</h1>
      </div>

      {/* Auto-captured context */}
      <section class="mb-6">
        <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Query</h2>
        <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
          <code class="font-mono text-sm text-gray-900 dark:text-gray-100 break-all">{props.query}</code>
        </div>
      </section>

      <Show when={props.breakdown}>
        {(bd) => (
          <section class="mb-6">
            <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Breakdown</h2>
            <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
              <BreakdownPreview node={bd()} />
            </div>
          </section>
        )}
      </Show>

      <section class="mb-6">
        <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Result count</h2>
        <p class="text-sm text-gray-700 dark:text-gray-300">{props.resultCount.toLocaleString()} results</p>
      </section>

      {/* User input */}
      <section class="mb-6">
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2" for="bug-expected">
          What did you expect?
        </label>
        <textarea
          id="bug-expected"
          value={expected()}
          onInput={(e) => setExpected(e.currentTarget.value)}
          placeholder="Which cards should this query find? (e.g., 'Lightning Bolt should match')"
          rows={3}
          class="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all resize-y"
        />
      </section>

      <section class="mb-8">
        <label class="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300">
          <span class="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={scryfallDiffers()}
              onChange={(e) => setScryfallDiffers(e.currentTarget.checked)}
              class="peer sr-only"
            />
            <span class="block h-5 w-9 rounded-full bg-gray-300 dark:bg-gray-700 peer-checked:bg-blue-500 transition-colors" />
            <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
          </span>
          Scryfall returns different results for this query
        </label>
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
    </div>
  )
}
