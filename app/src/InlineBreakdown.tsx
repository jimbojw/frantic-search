// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'

type BreakdownCase = 'single' | 'flat-and' | 'flat-or' | 'nested'

function getBreakdownCase(node: BreakdownNode): BreakdownCase {
  if (!node.children || node.children.length === 0) return 'single'
  const allLeaves = node.children.every(c => !c.children || c.children.length === 0)
  if (node.type === 'AND' && allLeaves) return 'flat-and'
  if (node.type === 'OR' && allLeaves) return 'flat-or'
  return 'nested'
}

function getSummaryLabel(node: BreakdownNode): string {
  const c = getBreakdownCase(node)
  if (c === 'single') return ''
  if (c === 'flat-and') return 'ALL'
  if (c === 'flat-or') return 'ANY'
  let hasAnd = false, hasOr = false
  function scan(n: BreakdownNode) {
    if (n.type === 'AND') hasAnd = true
    if (n.type === 'OR') hasOr = true
    n.children?.forEach(scan)
  }
  scan(node)
  if (hasAnd && hasOr) return 'FINAL'
  return hasAnd ? 'ALL' : 'ANY'
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

function BreakdownRow(props: { label: string; count: number; indent?: number; onClick?: () => void }) {
  return (
    <div
      class="flex items-baseline justify-between gap-4 py-0.5"
      style={props.indent ? { "padding-left": `${props.indent * 1.25}rem` } : undefined}
    >
      <span
        class={`font-mono text-xs truncate ${props.count === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''} ${props.onClick ? 'cursor-pointer hover:underline' : ''}`}
        onClick={props.onClick}
      >
        {props.label}
      </span>
      <span class={`font-mono text-xs tabular-nums shrink-0 ${props.count === 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
        {props.count.toLocaleString()}
      </span>
    </div>
  )
}

function BreakdownTreeNode(props: { node: BreakdownNode; depth: number; onNodeClick: (query: string) => void }) {
  return (
    <>
      <BreakdownRow label={props.node.label} count={props.node.matchCount} indent={props.depth} onClick={() => props.onNodeClick(reconstructQuery(props.node))} />
      <Show when={props.node.children}>
        <For each={props.node.children}>
          {(child) => <BreakdownTreeNode node={child} depth={props.depth + 1} onNodeClick={props.onNodeClick} />}
        </For>
      </Show>
    </>
  )
}

export default function InlineBreakdown(props: {
  breakdown: BreakdownNode
  cardCount: number
  faceCount: number
  expanded: boolean
  onToggle: () => void
  onNodeClick: (query: string) => void
}) {
  const displayCase = () => getBreakdownCase(props.breakdown)
  const label = () => getSummaryLabel(props.breakdown)

  return (
    <div class="border-t border-gray-200 dark:border-gray-700">
      <Show when={props.expanded}>
        <div class="px-3 pt-1.5 pb-0.5">
          <Show when={displayCase() !== 'nested'} fallback={
            <BreakdownTreeNode node={props.breakdown} depth={0} onNodeClick={props.onNodeClick} />
          }>
            <Show when={displayCase() === 'single'} fallback={
              <For each={props.breakdown.children!}>
                {(child) => <BreakdownRow label={child.label} count={child.matchCount} onClick={() => props.onNodeClick(reconstructQuery(child))} />}
              </For>
            }>
              <BreakdownRow label={props.breakdown.label} count={props.breakdown.matchCount} onClick={() => props.onNodeClick(reconstructQuery(props.breakdown))} />
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
        </span>
        <span class="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {props.cardCount.toLocaleString()} cards ({props.faceCount.toLocaleString()} faces)
        </span>
      </div>
    </div>
  )
}
