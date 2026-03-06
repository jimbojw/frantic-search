// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import {
  getBreakdownCase,
  countErrors,
  reconstructQuery,
  reconstructWithout,
  BreakdownChip,
  ChipTreeNode,
  PinIcon,
} from './InlineBreakdown'

// ---------------------------------------------------------------------------
// Chip section renderer — shared logic for pinned and live
// ---------------------------------------------------------------------------

function ChipSection(props: {
  breakdown: BreakdownNode
  pinned: boolean
  onChipClick: (nodeLabel: string) => void
  onRemove: (query: string) => void
}) {
  const displayCase = () => getBreakdownCase(props.breakdown)
  return (
    <Show when={displayCase() !== 'nested'} fallback={
      <div class="flex flex-col gap-1">
        <ChipTreeNode
          node={props.breakdown}
          root={props.breakdown}
          depth={0}
          pinned={props.pinned}
          onChipClick={props.onChipClick}
          onRemove={props.onRemove}
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
                pinned={props.pinned}
                onClick={() => props.onChipClick(reconstructQuery(child))}
                onRemove={() => props.onRemove(reconstructWithout(props.breakdown, child))}
              />
            )}
          </For>
        }>
          <BreakdownChip
            label={props.breakdown.label}
            count={props.breakdown.matchCount}
            error={props.breakdown.error}
            pinned={props.pinned}
            onClick={() => props.onChipClick(reconstructQuery(props.breakdown))}
            onRemove={() => props.onRemove('')}
          />
        </Show>
      </div>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// UnifiedBreakdown — single accordion for pinned + live (Spec 079)
// ---------------------------------------------------------------------------

export default function UnifiedBreakdown(props: {
  pinnedBreakdown: BreakdownNode | null
  pinnedCardCount: number
  pinnedPrintingCount?: number
  liveBreakdown: BreakdownNode | null
  liveCardCount: number
  livePrintingCount?: number
  expanded: boolean
  onToggle: () => void
  onPin: (nodeLabel: string) => void
  onUnpin: (nodeLabel: string) => void
  onPinnedRemove: (query: string) => void
  onLiveRemove: (query: string) => void
}) {
  const hasPinned = () => props.pinnedBreakdown !== null
  const hasLive = () => props.liveBreakdown !== null
  const pinnedErrorCount = () =>
    props.pinnedBreakdown ? countErrors(props.pinnedBreakdown) : 0
  const liveErrorCount = () =>
    props.liveBreakdown ? countErrors(props.liveBreakdown) : 0

  const formatCount = (cards: number, printings?: number) =>
    `${cards.toLocaleString()} cards` +
    (printings !== undefined ? ` (${printings.toLocaleString()} printings)` : '')

  return (
    <div class="border-t border-gray-200 dark:border-gray-700">
      <Show when={props.expanded}>
        <div class="px-3 pt-1.5 pb-1 flex flex-col gap-1.5">
          <Show when={props.pinnedBreakdown}>
            {(pbd) => (
              <div>
                <ChipSection
                  breakdown={pbd()}
                  pinned={true}
                  onChipClick={props.onUnpin}
                  onRemove={props.onPinnedRemove}
                />
              </div>
            )}
          </Show>
          <Show when={hasPinned() && hasLive()}>
            <hr class="border-gray-200 dark:border-gray-700" />
          </Show>
          <Show when={props.liveBreakdown}>
            {(bd) => (
              <div>
                <ChipSection
                  breakdown={bd()}
                  pinned={false}
                  onChipClick={props.onPin}
                  onRemove={props.onLiveRemove}
                />
              </div>
            )}
          </Show>
        </div>
      </Show>
      {/* Summary footer — chevron vertically centered relative to content */}
      <div
        onClick={() => props.onToggle()}
        class={`flex items-center gap-2 min-h-11 md:min-h-0 px-3 py-2 md:py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${props.expanded ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
      >
        <div class="flex items-center shrink-0">
          <svg
            class={`size-2.5 fill-current transition-transform ${props.expanded ? '-rotate-90' : ''}`}
            viewBox="0 0 24 24"
          >
            <path d="M8 5l8 7-8 7z" />
          </svg>
        </div>
        <div class="flex flex-col justify-center gap-0.5 min-w-0 flex-1">
          <Show when={hasPinned()}>
            <div class="flex items-center justify-between gap-4 font-mono text-xs text-gray-500 dark:text-gray-400">
              <span class="flex items-center gap-1.5">
                <PinIcon pinned={true} />
                PINNED
                <Show when={pinnedErrorCount() > 0}>
                  <span class="text-red-500 dark:text-red-400">
                    {`· ${pinnedErrorCount()} ignored`}
                  </span>
                </Show>
              </span>
              <span class="tabular-nums shrink-0">
                {formatCount(props.pinnedCardCount, props.pinnedPrintingCount)}
              </span>
            </div>
          </Show>
          <Show when={hasLive()}>
            <div class="flex items-center justify-between gap-4 font-mono text-xs text-gray-700 dark:text-gray-300 font-medium">
              <span class="flex items-center gap-1.5">
                MATCHES
                <Show when={liveErrorCount() > 0}>
                  <span class="text-red-500 dark:text-red-400">
                    {`· ${liveErrorCount()} ignored`}
                  </span>
                </Show>
              </span>
              <span class="tabular-nums shrink-0">
                {formatCount(props.liveCardCount, props.livePrintingCount)}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
