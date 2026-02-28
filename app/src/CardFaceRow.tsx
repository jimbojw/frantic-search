// SPDX-License-Identifier: Apache-2.0
import { Show } from 'solid-js'
import type { DisplayColumns } from '@frantic-search/shared'
import CopyButton from './CopyButton'
import { ManaCost, OracleText } from './card-symbols'
import { faceStat } from './app-utils'

export default function CardFaceRow(props: {
  d: DisplayColumns; fi: number; fullName?: string; showOracle: boolean; onCardClick?: () => void; setBadge?: string | null
}) {
  const copyText = () => props.fullName ?? props.d.names[props.fi]
  const stat = () => faceStat(props.d, props.fi)
  return (
    <div>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <Show when={props.fullName && props.onCardClick} fallback={
              <span class={`font-medium text-gray-700 dark:text-gray-200 min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}>
                {props.d.names[props.fi]}
              </span>
            }>
              <button
                type="button"
                onClick={() => props.onCardClick?.()}
                class={`font-medium hover:underline text-left min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}
              >
                {props.fullName}
              </button>
            </Show>
            <Show when={props.setBadge}>
              {(code) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{code()}</span>}
            </Show>
            <CopyButton text={copyText()} />
          </div>
          <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span class={`min-w-0 ${props.showOracle ? 'whitespace-normal break-words' : 'truncate'}`}>
              {props.d.type_lines[props.fi]}
            </span>
            <Show when={!props.showOracle && stat()}>
              <span class="shrink-0 whitespace-nowrap">
                {' · '}{stat()}
              </span>
            </Show>
          </div>
        </div>
        <ManaCost cost={props.d.mana_costs[props.fi]} />
      </div>
      <Show when={props.showOracle && props.d.oracle_texts[props.fi]}>
        <OracleText text={props.d.oracle_texts[props.fi]} />
      </Show>
      <Show when={props.showOracle && stat()}>
        <p class="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-1">{stat()}</p>
      </Show>
    </div>
  )
}
