// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from '@frantic-search/shared'
import { parse, resolveForField } from '@frantic-search/shared'
import type { ViewMode } from './view-mode'
import { VIEW_MODES } from './view-mode'

const VALID_VIEW_VALUES = new Set<string>(VIEW_MODES)

export function isValidViewValue(value: string): boolean {
  return VALID_VIEW_VALUES.has(value.toLowerCase())
}

/**
 * Walk the AST and collect view:/v: FIELD node values in document order.
 * Returns the last valid value, or undefined if none found.
 */
function collectViewValues(node: ASTNode): string[] {
  const values: string[] = []
  function walk(n: ASTNode) {
    if (n.type === 'FIELD') {
      const f = n.field.toLowerCase()
      if (f === 'view' || f === 'v') values.push(n.value.toLowerCase())
    }
    if (n.type === 'NOT') walk(n.child)
    if (n.type === 'AND' || n.type === 'OR') {
      for (const c of n.children) walk(c)
    }
  }
  walk(node)
  return values
}

/**
 * Extract view mode from the effective query (pinned + live).
 * Last valid view: term wins. Invalid values are ignored.
 * Default is 'slim' when no valid view: term exists.
 */
export function extractViewMode(effectiveQuery: string): ViewMode {
  const trimmed = effectiveQuery.trim()
  if (!trimmed) return 'slim'

  const ast = parse(trimmed)
  const values = collectViewValues(ast)
  for (let i = values.length - 1; i >= 0; i--) {
    const resolved = resolveForField('view', values[i])
    if (isValidViewValue(resolved)) {
      return resolved as ViewMode
    }
  }
  return 'slim'
}
