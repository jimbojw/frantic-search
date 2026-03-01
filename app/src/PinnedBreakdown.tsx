// SPDX-License-Identifier: Apache-2.0
import { For, Show } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import {
  getBreakdownCase,
  countErrors,
  reconstructQuery,
  reconstructWithout,
  BreakdownChip,
  BreakdownLip,
  ChipTreeNode,
} from './InlineBreakdown'

export default function PinnedBreakdown(props: {
  breakdown: BreakdownNode
  cardCount: number
  printingCount?: number
  expanded: boolean
  onToggle: () => void
  onUnpin: (nodeLabel: string) => void
  onRemove: (newQuery: string) => void
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
                pinned={true}
                onChipClick={(label) => props.onUnpin(label)}
                onRemove={(q) => props.onRemove(q)}
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
                      pinned={true}
                      onClick={() => props.onUnpin(reconstructQuery(child))}
                      onRemove={() => props.onRemove(reconstructWithout(props.breakdown, child))}
                    />
                  )}
                </For>
              }>
                <BreakdownChip
                  label={props.breakdown.label}
                  count={props.breakdown.matchCount}
                  error={props.breakdown.error}
                  pinned={true}
                  onClick={() => props.onUnpin(reconstructQuery(props.breakdown))}
                  onRemove={() => props.onRemove('')}
                />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <BreakdownLip
        label="PINNED"
        cardCount={props.cardCount}
        printingCount={props.printingCount}
        expanded={props.expanded}
        errorCount={errorCount()}
        onToggle={props.onToggle}
      />
    </div>
  )
}
