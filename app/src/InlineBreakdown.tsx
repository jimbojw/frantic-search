// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'

type BreakdownCase = 'single' | 'flat-and' | 'flat-or' | 'nested'

function getBreakdownCase(node: BreakdownNode): BreakdownCase {
  if (!node.children || node.children.length === 0) return 'single'
  const allLeaves = node.children.every(c => !c.children || c.children.length === 0)
  if (node.type === 'AND' && allLeaves) return 'flat-and'
  if (node.type === 'OR' && allLeaves) return 'flat-or'
  return 'nested'
}

function getSummaryLabel(_node: BreakdownNode): string {
  return 'MATCHES'
}

function countErrors(node: BreakdownNode): number {
  if (node.error && (!node.children || node.children.length === 0)) return 1
  if (!node.children) return 0
  return node.children.reduce((sum, c) => sum + countErrors(c), 0)
}

function reconstructQuery(node: BreakdownNode): string {
  if (!node.children) return node.label
  if (node.type === 'OR')
    return node.children.map(c =>
      c.type === 'AND' ? `(${reconstructQuery(c)})` : reconstructQuery(c)
    ).join(' OR ')
  return node.children.map(c =>
    c.type === 'OR' ? `(${reconstructQuery(c)})` : reconstructQuery(c)
  ).join(' ')
}

function filterNode(node: BreakdownNode, exclude: BreakdownNode): BreakdownNode | null {
  if (node === exclude) return null
  if (!node.children) return node
  const filtered = node.children
    .map(c => filterNode(c, exclude))
    .filter((c): c is BreakdownNode => c !== null)
  if (filtered.length === 0) return null
  if (filtered.length === 1) return filtered[0]
  return { ...node, children: filtered }
}

function reconstructWithout(root: BreakdownNode, exclude: BreakdownNode): string {
  const filtered = filterNode(root, exclude)
  return filtered ? reconstructQuery(filtered) : ''
}

function HighlightedLabel(props: { label: string }) {
  const spans = () => buildSpans(props.label)
  return (
    <For each={spans()}>
      {(span) =>
        span.role
          ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
          : <>{span.text}</>
      }
    </For>
  )
}

function BreakdownRow(props: { label: string; count: number; error?: string; indent?: number; onClick?: () => void; onRemove?: () => void }) {
  const isError = () => !!props.error
  const isNop = () => !props.error && props.count < 0
  const useHighlight = () => !isError() && !isNop() && props.count !== 0
  return (
    <div
      class="flex items-baseline justify-between gap-4 py-0.5"
      style={props.indent ? { "padding-left": `${props.indent * 1.25}rem` } : undefined}
    >
      <span
        class={`font-mono text-xs truncate ${isError() ? 'text-red-500 dark:text-red-400' : isNop() ? 'text-gray-400 dark:text-gray-500 italic' : props.count === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''} ${props.onClick ? 'cursor-pointer hover:underline' : ''}`}
        onClick={props.onClick}
      >
        <Show when={useHighlight()} fallback={props.label}>
          <HighlightedLabel label={props.label} />
        </Show>
      </span>
      <span class="flex items-center gap-2 shrink-0">
        <span
          class={`font-mono text-xs tabular-nums ${isError() ? 'text-red-500 dark:text-red-400' : isNop() ? 'text-gray-400 dark:text-gray-500 italic' : props.count === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}
          title={props.error}
        >
          {isError() ? '!!' : isNop() ? '--' : props.count.toLocaleString()}
        </span>
        <Show when={props.onRemove}>
          <button
            onClick={(e) => { e.stopPropagation(); props.onRemove!() }}
            class="size-6 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label={`Remove ${props.label}`}
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </Show>
      </span>
    </div>
  )
}

function BreakdownTreeNode(props: { node: BreakdownNode; root: BreakdownNode; depth: number; onNodeClick: (query: string) => void; onNodeRemove: (query: string) => void }) {
  return (
    <>
      <BreakdownRow
        label={props.node.label}
        count={props.node.matchCount}
        error={props.node.error}
        indent={props.depth}
        onClick={() => props.onNodeClick(reconstructQuery(props.node))}
        onRemove={props.depth > 0 ? () => props.onNodeRemove(reconstructWithout(props.root, props.node)) : undefined}
      />
      <Show when={props.node.children}>
        <For each={props.node.children}>
          {(child) => <BreakdownTreeNode node={child} root={props.root} depth={props.depth + 1} onNodeClick={props.onNodeClick} onNodeRemove={props.onNodeRemove} />}
        </For>
      </Show>
    </>
  )
}

export default function InlineBreakdown(props: {
  breakdown: BreakdownNode
  cardCount: number
  printingCount?: number
  expanded: boolean
  onToggle: () => void
  onNodeClick: (query: string) => void
  onNodeRemove: (query: string) => void
}) {
  const displayCase = () => getBreakdownCase(props.breakdown)
  const label = () => getSummaryLabel(props.breakdown)
  const errorCount = () => countErrors(props.breakdown)

  return (
    <div class="border-t border-gray-200 dark:border-gray-700">
      <Show when={props.expanded}>
        <div class="px-3 pt-1.5 pb-0.5">
          <Show when={displayCase() !== 'nested'} fallback={
            <BreakdownTreeNode node={props.breakdown} root={props.breakdown} depth={0} onNodeClick={props.onNodeClick} onNodeRemove={props.onNodeRemove} />
          }>
            <Show when={displayCase() === 'single'} fallback={
              <For each={props.breakdown.children!.filter(c => c.type !== 'NOP')}>
                {(child) => <BreakdownRow label={child.label} count={child.matchCount} error={child.error} onClick={() => props.onNodeClick(reconstructQuery(child))} onRemove={() => props.onNodeRemove(reconstructWithout(props.breakdown, child))} />}
              </For>
            }>
              <BreakdownRow label={props.breakdown.label} count={props.breakdown.matchCount} error={props.breakdown.error} onClick={() => props.onNodeClick(reconstructQuery(props.breakdown))} onRemove={() => props.onNodeRemove('')} />
            </Show>
          </Show>
        </div>
      </Show>
      <div
        onClick={() => props.onToggle()}
        class={`flex items-center justify-between gap-4 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${props.expanded ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
      >
        <span class="font-mono text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <svg class={`size-2.5 fill-current transition-transform ${props.expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
            <path d="M8 5l8 7-8 7z" />
          </svg>
          <Show when={label()}>{label()}</Show>
          <Show when={errorCount() > 0}>
            <span class="text-red-500 dark:text-red-400">{`\u00b7 ${errorCount()} ignored`}</span>
          </Show>
        </span>
        <span class="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {props.cardCount.toLocaleString()} cards
          <Show when={props.printingCount !== undefined && props.printingCount > 0}>
            {' '}({props.printingCount!.toLocaleString()} printings)
          </Show>
        </span>
      </div>
    </div>
  )
}
