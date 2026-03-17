// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'
import { buildSpans, ROLE_CLASSES } from '../../QueryHighlight'

function getQuery(props: { query?: string; children?: unknown }): string {
  if (props.query != null && props.query !== '') return String(props.query)
  const c = props.children
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c) && c.length > 0 && typeof c[0] === 'string') return String(c[0]).trim()
  return ''
}

export default function QueryExample(props: { query?: string; children?: unknown }) {
  const query = () => getQuery(props)
  const spans = () => buildSpans(query())

  return (
    <code class="font-mono text-sm">
      <For each={spans()}>
        {(span) =>
          span.role ? (
            <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
          ) : (
            <>{span.text}</>
          )
        }
      </For>
    </code>
  )
}
