// SPDX-License-Identifier: Apache-2.0
import { createMemo, For } from 'solid-js'
import { lex, TokenType, FIELD_ALIASES } from '@frantic-search/shared'
import type { Token } from '@frantic-search/shared'
import type { BreakdownNode } from '@frantic-search/shared'
import { reconstructQuery } from './InlineBreakdown'

type HighlightRole =
  | 'field'
  | 'field-unknown'
  | 'operator'
  | 'value'
  | 'bare'
  | 'quoted'
  | 'regex'
  | 'metadata'
  | 'not'
  | 'paren'
  | 'keyword'
  | 'value-error'
  | 'value-zero'
  | 'ghost'

// Fields the evaluator handles directly, outside FIELD_ALIASES (Spec 107: display, order)
const EXTRA_KNOWN_FIELDS = new Set(['unique', 'include', 'view', 'v', 'display', 'sort', 'order'])

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
  metadata:         'text-violet-700 dark:text-violet-400',
  not:              'text-red-600 dark:text-red-400',
  paren:            'text-amber-600 dark:text-amber-400',
  keyword:          'text-blue-600 dark:text-blue-400 font-semibold',
  'value-error':   'text-red-600 dark:text-red-400 underline decoration-wavy decoration-red-400 dark:decoration-red-500',
  'value-zero':    'text-amber-600 dark:text-amber-400 underline decoration-wavy decoration-amber-400 dark:decoration-amber-500',
  ghost:           'text-gray-400 dark:text-gray-500',
}

interface ProblemRegion {
  start: number
  end: number
  kind: 'error' | 'zero'
}

function collectProblemLeaves(node: BreakdownNode, queryLen: number): ProblemRegion[] {
  const regions: ProblemRegion[] = []
  const len = Number(queryLen)
  function walk(n: BreakdownNode) {
    const hasChildren = n.children && n.children.length > 0
    const isNotLeaf = n.type === 'NOT' && n.children?.length === 1 && !n.children[0].children?.length
    if (!hasChildren || isNotLeaf) {
      if (!n.span || n.span.end > len) return
      if (n.error) {
        const span = n.valueSpan && n.valueSpan.end <= len ? n.valueSpan : n.span
        regions.push({ start: span.start, end: span.end, kind: 'error' })
      } else if (n.type !== 'NOP' && n.matchCount === 0) {
        regions.push({ start: n.span.start, end: n.span.end, kind: 'zero' })
      }
      return
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return regions
}

function roleOverlap(spanStart: number, spanEnd: number, regions: ProblemRegion[]): HighlightRole | null {
  let hasError = false
  let hasZero = false
  for (const r of regions) {
    if (spanStart < r.end && spanEnd > r.start) {
      if (r.kind === 'error') hasError = true
      else hasZero = true
    }
  }
  if (hasError) return 'value-error'
  if (hasZero) return 'value-zero'
  return null
}

interface HighlightSpan {
  text: string
  role: HighlightRole | null
  start: number
  end: number
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
      if (token.value.startsWith('#')) return 'metadata'
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

export function buildSpans(query: string, breakdown?: BreakdownNode | null): HighlightSpan[] {
  if (!query) return []
  const tokens = lex(query)
  const spans: HighlightSpan[] = []
  let cursor = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === TokenType.EOF) break

    if (tok.start > cursor) {
      spans.push({ text: query.slice(cursor, tok.start), role: null, start: cursor, end: tok.start })
    }

    const prev = i > 0 ? tokens[i - 1] : undefined
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined
    let role = classifyToken(tok, prev, next)
    spans.push({ text: query.slice(tok.start, tok.end), role, start: tok.start, end: tok.end })
    cursor = tok.end
  }

  if (cursor < query.length) {
    spans.push({ text: query.slice(cursor), role: null, start: cursor, end: query.length })
  }

  if (breakdown != null && reconstructQuery(breakdown).trim() === query.trim()) {
    const regions = collectProblemLeaves(breakdown, query.length)
    for (const s of spans) {
      const override = roleOverlap(s.start, s.end, regions)
      if (override) s.role = override
    }
  }

  return spans
}

function insertGhostSpan(spans: HighlightSpan[], cursorOffset: number, ghostText: string): HighlightSpan[] {
  if (!ghostText) return spans
  const out: HighlightSpan[] = []
  let inserted = false
  for (const s of spans) {
    if (inserted) {
      out.push(s)
      continue
    }
    if (s.end <= cursorOffset) {
      out.push(s)
    } else if (s.start >= cursorOffset) {
      out.push({ text: ghostText, role: 'ghost', start: cursorOffset, end: cursorOffset })
      out.push(s)
      inserted = true
    } else {
      const before = { text: s.text.slice(0, cursorOffset - s.start), role: s.role, start: s.start, end: cursorOffset }
      const after = { text: s.text.slice(cursorOffset - s.start), role: s.role, start: cursorOffset, end: s.end }
      if (before.text) out.push(before)
      out.push({ text: ghostText, role: 'ghost', start: cursorOffset, end: cursorOffset })
      if (after.text) out.push(after)
      inserted = true
    }
  }
  if (!inserted) {
    out.push({ text: ghostText, role: 'ghost', start: cursorOffset, end: cursorOffset })
  }
  return out
}

export default function QueryHighlight(props: {
  query: string
  breakdown?: BreakdownNode | null
  cursorOffset?: number
  ghostText?: string | null
  class?: string
}) {
  const spans = createMemo(() => {
    const base = buildSpans(props.query, props.breakdown)
    if (props.cursorOffset != null && props.ghostText) {
      return insertGhostSpan(base, props.cursorOffset, props.ghostText)
    }
    return base
  })

  return (
    <pre
      aria-hidden="true"
      class={`pointer-events-none font-mono ${props.class ?? ''}`}
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
