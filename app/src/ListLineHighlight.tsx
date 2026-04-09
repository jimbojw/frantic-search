// SPDX-License-Identifier: Apache-2.0
import { createMemo, For } from 'solid-js'
import { buildListSpans } from '@frantic-search/shared'
import { LIST_ROLE_CLASSES } from './ListHighlight'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function contrastColorForHex(hex: string): '#000000' | '#ffffff' {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

/** Read-only single-line (or wrapped) deck list highlighting; same roles as `ListHighlight` display mode. */
export default function ListLineHighlight(props: { text: string; class?: string }) {
  const spans = createMemo(() => buildListSpans(props.text))

  return (
    <div class={`font-mono whitespace-pre-wrap break-words ${props.class ?? ''}`}>
      <For each={spans()}>
        {(span) =>
          span.role ? (
            span.role === 'collection-status-color' && HEX_RE.test(span.text) ? (
              <span
                class="px-1.5 py-0.5 rounded"
                style={{
                  'background-color': span.text,
                  color: contrastColorForHex(span.text),
                }}
              >
                {span.text}
              </span>
            ) : (
              <span class={LIST_ROLE_CLASSES[span.role] ?? ''}>{span.text}</span>
            )
          ) : (
            <>{span.text}</>
          )
        }
      </For>
    </div>
  )
}
