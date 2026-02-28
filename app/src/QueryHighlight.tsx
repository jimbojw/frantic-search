// SPDX-License-Identifier: Apache-2.0
import { createMemo, For } from 'solid-js'
import { lex, TokenType, FIELD_ALIASES } from '@frantic-search/shared'
import type { Token } from '@frantic-search/shared'

type HighlightRole =
  | 'field'
  | 'field-unknown'
  | 'operator'
  | 'value'
  | 'bare'
  | 'quoted'
  | 'regex'
  | 'not'
  | 'paren'
  | 'keyword'

// Fields the evaluator handles directly, outside FIELD_ALIASES
const EXTRA_KNOWN_FIELDS = new Set(['unique'])

const OPERATORS = new Set<string>([
  TokenType.COLON,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.GT,
  TokenType.LTE,
  TokenType.GTE,
])

export const ROLE_CLASSES: Record<HighlightRole, string> = {
  field:            'text-blue-600 dark:text-blue-400',
  'field-unknown':  'text-red-600 dark:text-red-400 underline decoration-wavy decoration-red-400 dark:decoration-red-500',
  operator:         'text-blue-600 dark:text-blue-400',
  value:            'text-gray-900 dark:text-gray-100',
  bare:             'text-gray-900 dark:text-gray-100',
  quoted:           'text-emerald-700 dark:text-emerald-400',
  regex:            'text-violet-700 dark:text-violet-400',
  not:              'text-red-600 dark:text-red-400',
  paren:            'text-amber-600 dark:text-amber-400',
  keyword:          'text-blue-600 dark:text-blue-400 font-semibold',
}

interface HighlightSpan {
  text: string
  role: HighlightRole | null
}

function classifyToken(token: Token, prev: Token | undefined, next: Token | undefined): HighlightRole {
  switch (token.type) {
    case TokenType.DASH:
    case TokenType.BANG:
      return 'not'
    case TokenType.LPAREN:
    case TokenType.RPAREN:
      return 'paren'
    case TokenType.OR:
      return 'keyword'
    case TokenType.QUOTED:
      return 'quoted'
    case TokenType.REGEX:
      return 'regex'
    case TokenType.COLON:
    case TokenType.EQ:
    case TokenType.NEQ:
    case TokenType.LT:
    case TokenType.GT:
    case TokenType.LTE:
    case TokenType.GTE:
      return 'operator'
    case TokenType.WORD:
      if (prev && OPERATORS.has(prev.type)) return 'value'
      if (next && OPERATORS.has(next.type)) {
        const lower = token.value.toLowerCase()
        return (lower in FIELD_ALIASES || EXTRA_KNOWN_FIELDS.has(lower)) ? 'field' : 'field-unknown'
      }
      return 'bare'
    default:
      return 'bare'
  }
}

export { type HighlightSpan }

export function buildSpans(query: string): HighlightSpan[] {
  if (!query) return []
  const tokens = lex(query)
  const spans: HighlightSpan[] = []
  let cursor = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === TokenType.EOF) break

    if (tok.start > cursor) {
      spans.push({ text: query.slice(cursor, tok.start), role: null })
    }

    const prev = i > 0 ? tokens[i - 1] : undefined
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined
    const role = classifyToken(tok, prev, next)
    spans.push({ text: query.slice(tok.start, tok.end), role })
    cursor = tok.end
  }

  if (cursor < query.length) {
    spans.push({ text: query.slice(cursor), role: null })
  }

  return spans
}

export default function QueryHighlight(props: { query: string; class?: string }) {
  const spans = createMemo(() => buildSpans(props.query))

  return (
    <pre
      aria-hidden="true"
      class={`pointer-events-none font-sans ${props.class ?? ''}`}
    >
      <For each={spans()}>
        {(span) =>
          span.role
            ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
            : <>{span.text}</>
        }
      </For>
    </pre>
  )
}
