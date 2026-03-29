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
  collectFieldNodes,
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
  CI_FIELDS,
  findFirstCiWubrgNode,
  isWubrgColorActive,
  getIdentityColorChipState,
  toggleIdentityColorChip,
  toggleIdentityColorlessChip,
  cycleCiNumericChip,
} from './query-edit-color'
export type { IdentityColorChipState } from './query-edit-color'

export {
  toggleSimple,
  cycleChip,
  cyclePercentileChip,
  popularityClearPredicate,
  saltClearPredicate,
  manaCostGenericClearPredicate,
  getMetadataTagChipState,
  cycleMetadataTagChip,
  mvMenuClearPredicate,
  cycleManaValueMenuChip,
  getManaValueMenuActiveIndex,
} from './query-edit-chips'

export {
  toggleUniquePrints,
  hasUniquePrints,
  hasMyInQuery,
  hasHashInQuery,
  hasListSyntaxInQuery,
  collectListOffendingTerms,
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
