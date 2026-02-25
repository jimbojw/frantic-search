// SPDX-License-Identifier: Apache-2.0
import { lex, TokenType } from '@frantic-search/shared'

/**
 * Close any unclosed syntactic constructs (quotes, regex, parentheses) so that
 * appending a new term to the query produces the expected tokenization rather
 * than being swallowed by an open delimiter.
 */
export function sealQuery(query: string): string {
  if (!query) return query

  const tokens = lex(query)
  let result = query

  // The last non-EOF token is the one that may be unclosed — an unclosed
  // delimiter consumes to EOF, so it is always the final real token.
  const last = tokens.length >= 2 ? tokens[tokens.length - 2] : null
  if (last) {
    const source = query.slice(last.start, last.end)
    if (last.type === TokenType.QUOTED) {
      const openChar = query[last.start]
      if (source.length === 1 || source[source.length - 1] !== openChar) {
        result += openChar
      }
    } else if (last.type === TokenType.REGEX) {
      if (source.length === 1 || source[source.length - 1] !== '/') {
        result += '/'
      }
    }
  }

  let parenDepth = 0
  for (const tok of tokens) {
    if (tok.type === TokenType.LPAREN) parenDepth++
    else if (tok.type === TokenType.RPAREN) parenDepth--
  }
  if (parenDepth > 0) {
    result += ')'.repeat(parenDepth)
  }

  return result
}
