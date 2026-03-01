// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'

type BreakdownCase = 'single' | 'flat-and' | 'nested'

export function getBreakdownCase(node: BreakdownNode): BreakdownCase {
  if (!node.children || node.children.length === 0) return 'single'
  const allLeaves = node.children.every(c => !c.children || c.children.length === 0)
  if (node.type === 'AND' && allLeaves) return 'flat-and'
  return 'nested'
}

export function countErrors(node: BreakdownNode): number {
  if (node.error && (!node.children || node.children.length === 0)) return 1
  if (!node.children) return 0
  return node.children.reduce((sum, c) => sum + countErrors(c), 0)
}

export function reconstructQuery(node: BreakdownNode): string {
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

export function reconstructWithout(root: BreakdownNode, exclude: BreakdownNode): string {
  const filtered = filterNode(root, exclude)
  return filtered ? reconstructQuery(filtered) : ''
}

export function HighlightedLabel(props: { label: string }) {
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

function nonNopCount(node: BreakdownNode): number {
  return node.children?.filter(c => c.type !== 'NOP').length ?? 0
}

function chipLabel(node: BreakdownNode): string {
  if (node.type === 'AND' || node.type === 'OR') {
    return `${node.type} (${nonNopCount(node)})`
  }
  return node.label
}

// ---------------------------------------------------------------------------
// Pin icon SVG — always visible, filled (pinned) vs outlined (live)
// ---------------------------------------------------------------------------

function PinIcon(props: { pinned: boolean }) {
  return (
    <svg
      class={`size-3 shrink-0 ${props.pinned ? 'text-blue-500 dark:text-blue-400' : 'opacity-40'}`}
      viewBox="0 0 24 24"
      fill={props.pinned ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// BreakdownChip — universal chip for all breakdown nodes (Spec 054)
// ---------------------------------------------------------------------------

export function BreakdownChip(props: {
  label: string
  count: number
  error?: string
  pinned: boolean
  nop?: boolean
  onClick?: () => void
  onRemove?: () => void
}) {
  const isError = () => !!props.error
  const isNop = () => props.nop ?? false
  const zeroMatch = () => !isError() && !isNop() && props.count === 0
  const useHighlight = () => !isError() && !isNop() && !zeroMatch()
  const chipClasses = () =>
    isError()
      ? 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400'
      : isNop()
        ? 'bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 italic'
        : zeroMatch()
          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
  const hoverClass = () => props.onClick ? 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer' : ''

  return (
    <span
      class={`inline-flex items-center gap-1.5 pl-2 rounded text-xs font-mono transition-colors ${chipClasses()} ${hoverClass()} ${props.onRemove ? 'pr-0.5' : 'pr-2'}`}
      style={{ "line-height": "1.75rem" }}
      onClick={props.onClick}
    >
      <Show when={!isNop()}>
        <PinIcon pinned={props.pinned} />
      </Show>
      <span class="truncate">
        <Show when={useHighlight()} fallback={props.label}>
          <HighlightedLabel label={props.label} />
        </Show>
      </span>
      <span
        class={`text-[10px] tabular-nums shrink-0 ${isError() ? '' : isNop() ? '' : zeroMatch() ? 'font-medium' : 'opacity-60'}`}
        title={props.error}
      >
        {isError() ? '!!' : isNop() ? '--' : props.count.toLocaleString()}
      </span>
      <Show when={props.onRemove}>
        <button
          onClick={(e) => { e.stopPropagation(); props.onRemove!() }}
          class="size-5 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          aria-label={`Remove ${props.label}`}
        >
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </Show>
    </span>
  )
}

// ---------------------------------------------------------------------------
// ChipTreeNode — recursive chip renderer for nested breakdowns (Spec 054)
// ---------------------------------------------------------------------------

export function ChipTreeNode(props: {
  node: BreakdownNode
  root: BreakdownNode
  depth: number
  pinned: boolean
  onChipClick: (nodeLabel: string) => void
  onRemove: (query: string) => void
}) {
  const isNop = () => props.node.type === 'NOP'
  const isAndOr = () => props.node.type === 'AND' || props.node.type === 'OR'
  const isPinnable = () => {
    if (isNop()) return false
    if (props.node.type === 'OR' && nonNopCount(props.node) === 1) return false
    return true
  }
  const label = () => isAndOr() ? chipLabel(props.node) : props.node.label
  const removeHandler = () => {
    if (isNop()) return undefined
    if (props.node === props.root) return () => props.onRemove('')
    return () => props.onRemove(reconstructWithout(props.root, props.node))
  }

  return (
    <>
      <div style={{ "margin-left": `${props.depth * 1.25}rem` }}>
        <BreakdownChip
          label={label()}
          count={props.node.matchCount}
          error={props.node.error}
          pinned={props.pinned}
          nop={isNop()}
          onClick={isPinnable() ? () => props.onChipClick(reconstructQuery(props.node)) : undefined}
          onRemove={removeHandler()}
        />
      </div>
      <Show when={props.node.children}>
        <For each={props.node.children}>
          {(child) => (
            <ChipTreeNode
              node={child}
              root={props.root}
              depth={props.depth + 1}
              pinned={props.pinned}
              onChipClick={props.onChipClick}
              onRemove={props.onRemove}
            />
          )}
        </For>
      </Show>
    </>
  )
}

// ---------------------------------------------------------------------------
// Lip — shared summary lip for breakdown drawers
// ---------------------------------------------------------------------------

export function BreakdownLip(props: {
  label: string
  cardCount: number
  printingCount?: number
  expanded: boolean
  errorCount?: number
  onToggle: () => void
}) {
  return (
    <div
      onClick={() => props.onToggle()}
      class={`flex items-center justify-between gap-4 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${props.expanded ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
    >
      <span class="font-mono text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <svg class={`size-2.5 fill-current transition-transform ${props.expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
          <path d="M8 5l8 7-8 7z" />
        </svg>
        {props.label}
        <Show when={(props.errorCount ?? 0) > 0}>
          <span class="text-red-500 dark:text-red-400">{`\u00b7 ${props.errorCount} ignored`}</span>
        </Show>
      </span>
      <span class="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {props.cardCount.toLocaleString()} cards
        <Show when={props.printingCount !== undefined && props.printingCount > 0}>
          {' '}({props.printingCount!.toLocaleString()} printings)
        </Show>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineBreakdown (MATCHES drawer)
// ---------------------------------------------------------------------------

export default function InlineBreakdown(props: {
  breakdown: BreakdownNode
  cardCount: number
  printingCount?: number
  expanded: boolean
  onToggle: () => void
  onPin: (nodeLabel: string) => void
  onNodeRemove: (query: string) => void
}) {
  const displayCase = () => getBreakdownCase(props.breakdown)
  const errorCount = () => countErrors(props.breakdown)

  return (
    <div class="border-t border-gray-200 dark:border-gray-700">
      <Show when={props.expanded}>
        <div class="px-3 pt-1.5 pb-1">
          <Show when={displayCase() !== 'nested'} fallback={
            <div class="flex flex-col gap-1">
              <ChipTreeNode
                node={props.breakdown}
                root={props.breakdown}
                depth={0}
                pinned={false}
                onChipClick={(label) => props.onPin(label)}
                onRemove={(q) => props.onNodeRemove(q)}
              />
            </div>
          }>
            <div class="flex flex-wrap gap-1.5">
              <Show when={displayCase() === 'single'} fallback={
                <For each={props.breakdown.children!.filter(c => c.type !== 'NOP')}>
                  {(child) => (
                    <BreakdownChip
                      label={child.label}
                      count={child.matchCount}
                      error={child.error}
                      pinned={false}
                      onClick={() => props.onPin(reconstructQuery(child))}
                      onRemove={() => props.onNodeRemove(reconstructWithout(props.breakdown, child))}
                    />
                  )}
                </For>
              }>
                <BreakdownChip
                  label={props.breakdown.label}
                  count={props.breakdown.matchCount}
                  error={props.breakdown.error}
                  pinned={false}
                  onClick={() => props.onPin(reconstructQuery(props.breakdown))}
                  onRemove={() => props.onNodeRemove('')}
                />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <BreakdownLip
        label="MATCHES"
        cardCount={props.cardCount}
        printingCount={props.printingCount}
        expanded={props.expanded}
        errorCount={errorCount()}
        onToggle={props.onToggle}
      />
    </div>
  )
}
