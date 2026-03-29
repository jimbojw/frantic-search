// SPDX-License-Identifier: Apache-2.0

/**
 * Canonical mana value histogram / MenuDrawer mana value chip literals (Spec 168).
 * Single source of truth for `mv` / `cmc` / `manavalue` equality and `mv>=7`.
 */

import { isFieldLabel } from './query-edit-core'

/** Mutable `string[]` for `findFieldNode` / `toggleSimple` call sites. */
export const MV_FIELDS: string[] = ['mv', 'cmc', 'manavalue']

/** Short labels for histogram rows and compact drawer chips */
export const MV_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const

/** Query terms appended by UI (always `mv:` form) */
export const MV_TERMS = [
  'mv=0',
  'mv=1',
  'mv=2',
  'mv=3',
  'mv=4',
  'mv=5',
  'mv=6',
  'mv>=7',
] as const

export const MV_OPS = ['=', '=', '=', '=', '=', '=', '=', '>='] as const

export const MV_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7'] as const

/** Matches breakdown labels cleared by the mana value MenuDrawer section (histogram family). */
export function isManaValueHistogramLabel(label: string): boolean {
  return isFieldLabel(label, MV_FIELDS, ['=', '>='])
}
