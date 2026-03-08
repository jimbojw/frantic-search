// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from '@frantic-search/shared'
import { parse, resolveForField } from '@frantic-search/shared'
import type { ViewMode } from './view-mode'
import { VIEW_MODES } from './view-mode'

const VALID_VIEW_VALUES = new Set<string>(VIEW_MODES)

/** Scryfall display: values map to view modes (Spec 107). */
const DISPLAY_TO_VIEW: Record<string, string> = {
  checklist: 'slim',
  text: 'detail',
  grid: 'images',
  full: 'full',
}

export function isValidViewValue(value: string): boolean {
  return VALID_VIEW_VALUES.has(value.toLowerCase())
}

/**
 * Map display: value to view value. Returns the view value or the original if not a display value.
 */
function displayToView(value: string): string {
  return DISPLAY_TO_VIEW[value.toLowerCase()] ?? value
}

/**
 * Walk the AST and collect view:/v:/display: FIELD node values in document order.
 * For display:, values are mapped to view equivalents (Spec 107).
 */
function collectViewValues(node: ASTNode): string[] {
  const values: string[] = []
  function walk(n: ASTNode) {
    if (n.type === 'FIELD') {
      const f = n.field.toLowerCase()
      const v = n.value.toLowerCase()
      if (f === 'view' || f === 'v') values.push(v)
      else if (f === 'display') values.push(displayToView(v))
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
