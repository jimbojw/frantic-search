// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import { IconChevronRight, IconPin, IconXMark } from './Icons'
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

function childKeyword(child: BreakdownNode): string {
  if (child.type === 'AND' || child.type === 'OR') return child.type
  const label = child.label
  if (child.type === 'NOT') {
    const inner = label.startsWith('-') ? label.slice(1) : label
    const m = inner.match(/^[^:=!<>]+/)
    return '-' + (m ? m[0] : inner)
  }
  if (child.type === 'FIELD' || child.type === 'REGEX_FIELD') {
    const m = label.match(/^[^:=!<>]+/)
    return m ? m[0] : label
  }
  return label
}

const MAX_PREVIEW_KEYWORDS = 3

/** Format count for chip display: abbreviate ≥1000 as "30.6k", full number otherwise. */
export function formatDualCount(cards: number, prints?: number): string {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString())
  if (prints !== undefined) return `${fmt(cards)} cards (${fmt(prints)} prints)`
  return `${fmt(cards)} cards`
}

function chipLabel(node: BreakdownNode): string {
  if (node.type === 'AND' || node.type === 'OR') {
    const kids = (node.children ?? []).filter(c => c.type !== 'NOP')
    const preview = kids.slice(0, MAX_PREVIEW_KEYWORDS).map(childKeyword)
    if (kids.length > MAX_PREVIEW_KEYWORDS) preview.push('\u2026')
    return `${node.type} (${preview.join(', ')})`
  }
  return node.label
}

// ---------------------------------------------------------------------------
// BreakdownChip — universal chip for all breakdown nodes (Spec 054, 082)
// ---------------------------------------------------------------------------

export function BreakdownChip(props: {
  label: string
  /** Primary count; used when dual counts absent. */
  count: number
  /** Card count; when present with printCount, shows dual format. */
  cardCount?: number
  /** Print count; when present with cardCount, shows dual format. */
  printCount?: number
  error?: string
  pinned: boolean
  nop?: boolean
  /** When set, only this substring gets syntax highlighting; the rest (e.g. " (3)") renders as plain text. */
  labelHighlightOnly?: string
  /** Spec 181: presentation-only; not part of label or remove handler. */
  prefixBranchHint?: string
  onClick?: () => void
  onRemove?: () => void
}) {
  const isError = () => !!props.error
  const isNop = () => props.nop ?? false
  const cardCount = () => props.cardCount ?? props.count
  const printCount = () => props.printCount
  const zeroMatch = () => !isError() && !isNop() && cardCount() === 0
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
  const countDisplay = () => formatDualCount(cardCount(), printCount())
  const countTitle = () => {
    const p = printCount()
    return `${cardCount().toLocaleString()} cards${p !== undefined ? ` (${p.toLocaleString()} prints)` : ''}`
  }

  return (
    <span
      class={`inline-flex flex-col min-w-0 rounded text-xs font-mono transition-colors ${chipClasses()} ${hoverClass()} ${props.onRemove ? 'pr-0.5' : 'pr-2'}`}
      onClick={props.onClick}
    >
      <div class="flex justify-between items-center gap-1.5 pl-2 pt-1 pb-0.5">
        <Show when={!isNop()} fallback={<span class="shrink-0 w-3" />}>
          <IconPin pinned={props.pinned} />
        </Show>
        <span class="truncate min-w-0 flex-1 flex items-baseline gap-1 flex-wrap">
          <span class="min-w-0 truncate">
            <Show when={useHighlight()} fallback={props.label}>
              <Show when={props.labelHighlightOnly !== undefined} fallback={
                <HighlightedLabel label={props.label} />
              }>
                <>
                  <HighlightedLabel label={props.labelHighlightOnly!} />
                  <span class="opacity-60">{props.label.slice(props.labelHighlightOnly!.length)}</span>
                </>
              </Show>
            </Show>
          </span>
          <Show when={props.prefixBranchHint}>
            <span class="shrink-0 text-[10px] opacity-50 text-gray-500 dark:text-gray-400 font-mono">
              {props.prefixBranchHint}
            </span>
          </Show>
        </span>
        <Show when={props.onRemove}>
          <button
            onClick={(e) => { e.stopPropagation(); props.onRemove!() }}
            class="size-5 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label={`Remove ${props.label}`}
          >
            <IconXMark class="size-3" />
          </button>
        </Show>
      </div>
      <div class="flex justify-center items-center px-1.5 pt-0.5 pb-1">
        <span
          class={`text-[10px] tabular-nums ${isError() ? '' : isNop() ? '' : zeroMatch() ? 'font-medium' : 'opacity-60'}`}
          title={isError() ? props.error : countTitle()}
        >
          {isError() ? '!!' : isNop() ? '--' : countDisplay()}
        </span>
      </div>
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
          cardCount={props.node.matchCountCards}
          printCount={props.node.matchCountPrints}
          error={props.node.error}
          pinned={props.pinned}
          nop={isNop()}
          labelHighlightOnly={isAndOr() ? props.node.type : undefined}
          prefixBranchHint={props.node.prefixBranchHint}
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
      class={`flex items-center justify-between gap-4 min-h-11 md:min-h-0 px-3 py-2 md:py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${props.expanded ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
    >
      <span class="font-mono text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <IconChevronRight class={`size-2.5 transition-transform ${props.expanded ? '-rotate-90' : ''}`} />
        {props.label}
        <Show when={(props.errorCount ?? 0) > 0}>
          <span class="text-red-500 dark:text-red-400">{`\u00b7 ${props.errorCount} ignored`}</span>
        </Show>
      </span>
      <span class="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {props.cardCount.toLocaleString()} cards
        <Show when={props.printingCount !== undefined}>
          {' '}({props.printingCount!.toLocaleString()} prints)
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
                      cardCount={child.matchCountCards}
                      printCount={child.matchCountPrints}
                      error={child.error}
                      pinned={false}
                      prefixBranchHint={child.prefixBranchHint}
                      onClick={() => props.onPin(reconstructQuery(child))}
                      onRemove={() => props.onNodeRemove(reconstructWithout(props.breakdown, child))}
                    />
                  )}
                </For>
              }>
                <BreakdownChip
                  label={props.breakdown.label}
                  count={props.breakdown.matchCount}
                  cardCount={props.breakdown.matchCountCards}
                  printCount={props.breakdown.matchCountPrints}
                  error={props.breakdown.error}
                  pinned={false}
                  prefixBranchHint={props.breakdown.prefixBranchHint}
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
