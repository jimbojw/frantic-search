// SPDX-License-Identifier: Apache-2.0
/**
 * Query edit utilities — barrel re-export.
 * Implementation split across:
 * - query-edit-core.ts   — seal, splice, parseBreakdown, findFieldNode, append/prepend, clearFieldTerms
 * - query-edit-color.ts  — color identity (toggleColorDrill, graduatedColorBar/X, colorlessBar/X, etc.)
 * - query-edit-chips.ts   — toggleSimple, cycleChip
 * - query-edit-modifiers.ts — unique, include, view, sort, my
 */

export {
  sealQuery,
  spliceQuery,
  extractValue,
  parseBreakdown,
  findFieldNode,
  removeNode,
  appendTerm,
  prependTerm,
  isFieldLabel,
  clearFieldTerms,
} from './query-edit-core'

export {
  toggleColorDrill,
  graduatedColorBar,
  graduatedColorX,
  colorlessBar,
  colorlessX,
  toggleColorExclude,
  isCILabel,
  clearColorIdentity,
} from './query-edit-color'

export {
  toggleSimple,
  cycleChip,
  cyclePercentileChip,
  popularityClearPredicate,
  saltClearPredicate,
  getMetadataTagChipState,
  cycleMetadataTagChip,
} from './query-edit-chips'

export {
  toggleUniquePrints,
  hasUniquePrints,
  hasMyInQuery,
  hasHashInQuery,
  getMyListIdFromBreakdown,
  clearUniqueTerms,
  setUniqueTerm,
  toggleIncludeExtras,
  hasIncludeExtras,
  clearViewTerms,
  setViewTerm,
  clearSortTerms,
  cycleSortChip,
} from './query-edit-modifiers'
