// SPDX-License-Identifier: Apache-2.0
import QueryExample from './QueryExample'

function getText(children: unknown): string {
  if (typeof children === 'string') return children.trim()
  if (Array.isArray(children) && children.length > 0 && typeof children[0] === 'string') {
    return String(children[0]).trim()
  }
  return ''
}

const Q_PREFIX = 'q='
const QUERY_PREFIX = 'query='

function stripQueryPrefix(text: string): string | null {
  if (text.startsWith(QUERY_PREFIX)) return text.slice(QUERY_PREFIX.length)
  if (text.startsWith(Q_PREFIX)) return text.slice(Q_PREFIX.length)
  return null
}

/**
 * MDX code component override. Renders `q=` or `query=`-prefixed content with
 * QueryExample (syntax highlighting); falls back to plain <code> for other content.
 * See Spec 132 "Query example syntax".
 */
export default function DocCode(props: { children?: unknown }) {
  const text = getText(props.children)
  const query = text ? stripQueryPrefix(text) : null
  if (query !== null) {
    return <QueryExample>{query}</QueryExample>
  }
  return [<code class="font-mono text-sm">{text}</code>]
}
