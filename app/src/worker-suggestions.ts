// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BreakdownNode, CardIndex, PrintingIndex, NodeCache, Suggestion } from '@frantic-search/shared'
import { getTrailingBareNodes, isKnownColorValue, getColorAlternatives, isFormatOrIsValue, getFormatOrIsAlternatives, getArtistAtagAlternative, COLOR_TRIGGER_FIELDS, FORMAT_IS_TRIGGER_FIELDS, ARTIST_TRIGGER_FIELDS, ATAG_TRIGGER_FIELDS } from '@frantic-search/shared'
import { hasListSyntaxInQuery, collectListOffendingTerms, appendTerm, spliceQuery, collectFieldNodes } from './query-edit'
import { spliceBareToOracle, getOracleLabel } from './oracle-hint-edit'
import { evaluateAlternative } from './worker-alternative-eval'

export type BuildSuggestionsParams = {
  msg: { query: string; pinnedQuery?: string; viewMode?: 'slim' | 'detail' | 'images' | 'full' }
  ast: ASTNode
  cache: NodeCache
  index: CardIndex
  printingIndex: PrintingIndex | null
  hasPinned: boolean
  hasLive: boolean
  effectiveQuery: string
  effectiveBd: BreakdownNode | null
  /** Live query breakdown; may be null for empty or invalid query. */
  liveBd: BreakdownNode | null
  totalCards: number
  pinnedIndicesCount: number | undefined
  includeExtras: boolean
  indicesIncludingExtras: number | undefined
  printingIndicesIncludingExtras: number | undefined
  printingIndices: Uint32Array | null | undefined
  uniqueMode: 'cards' | 'prints' | 'art'
  totalPrintingItems: number
  totalDisplayItems: number
  defaultListEmpty: boolean
  sealQuery: (q: string) => string
}

/**
 * Build the unified suggestions array (Spec 151). Covers empty-list, include-extras,
 * unique-prints, oracle hint, and wrong-field/artist-atag (Spec 153).
 */
export function buildSuggestions(params: BuildSuggestionsParams): Suggestion[] {
  const {
    msg,
    ast,
    cache,
    index,
    printingIndex,
    hasPinned,
    hasLive,
    effectiveQuery,
    effectiveBd,
    liveBd,
    totalCards,
    pinnedIndicesCount,
    includeExtras,
    indicesIncludingExtras,
    printingIndicesIncludingExtras,
    printingIndices,
    uniqueMode,
    totalPrintingItems,
    totalDisplayItems,
    defaultListEmpty,
    sealQuery,
  } = params

  const suggestions: Suggestion[] = []
  const viewMode = msg.viewMode ?? 'slim'

  // Empty-list (Spec 126): one suggestion per offending term when list is empty
  if (defaultListEmpty && effectiveBd && hasListSyntaxInQuery(effectiveBd)) {
    for (const { label, variant } of collectListOffendingTerms(effectiveBd)) {
      suggestions.push({
        id: 'empty-list',
        label,
        variant: 'cta',
        ctaAction: 'navigateToLists',
        emptyListVariant: variant,
        priority: 0,
      })
    }
  }

  // include:extras - empty state
  if (indicesIncludingExtras !== undefined && totalCards === 0) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      explain: 'Include promos and non-tournament-legal printings.',
      count: indicesIncludingExtras,
      printingCount: printingIndicesIncludingExtras,
      docRef: 'reference/modifiers/include-extras',
      priority: 10,
      variant: 'rewrite',
    })
  }

  // include:extras - rider (totalCards > 0 and hidden playable-filtered results)
  const hiddenCards = indicesIncludingExtras !== undefined ? indicesIncludingExtras - totalCards : 0
  const hiddenPrintings =
    printingIndicesIncludingExtras !== undefined && printingIndices != null
      ? printingIndicesIncludingExtras - printingIndices.length
      : 0
  if (totalCards > 0 && (hiddenCards > 0 || hiddenPrintings > 0)) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    const count = indicesIncludingExtras ?? totalCards
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      explain: 'Include promos and non-tournament-legal printings.',
      count,
      printingCount: printingIndicesIncludingExtras,
      docRef: 'reference/modifiers/include-extras',
      priority: 10,
      variant: 'rewrite',
    })
  }

  // unique:prints - rider only
  if (
    uniqueMode !== 'prints' &&
    totalPrintingItems > 0 &&
    totalPrintingItems > totalDisplayItems
  ) {
    suggestions.push({
      id: 'unique-prints',
      query: appendTerm(msg.query, 'unique:prints', liveBd),
      label: 'unique:prints',
      explain: 'Shows one card per name; add to see all printings.',
      docRef: 'reference/modifiers/unique',
      priority: 30,
      variant: 'rewrite',
    })
  }

  // Spec 131: Oracle "Did you mean?" hint - empty state only
  let oracleSuggestion: Suggestion | null = null
  if (totalCards === 0 && hasLive && !(hasPinned && pinnedIndicesCount === 0)) {
    const root = ast.type === 'AND' || ast.type === 'BARE'
    if (root) {
      const trailing = getTrailingBareNodes(ast)
      if (trailing && trailing.length > 0) {
        const variants: Array<'phrase' | 'per-word'> =
          trailing.length === 1 && trailing[0].quoted ? ['phrase'] : ['phrase', 'per-word']
        let best: { query: string; label: string; count: number; printingCount?: number } | null = null
        for (const variant of variants) {
          const altLiveQuery = spliceBareToOracle(msg.query, trailing, variant)
          const altCombinedQuery = hasPinned
            ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(altLiveQuery)
            : altLiveQuery
          const { cardCount, printingCount } = evaluateAlternative({
            altQuery: altCombinedQuery,
            cache,
            index,
            printingIndex,
            includeExtras,
            viewMode,
          })
          if (cardCount > 0) {
            const fullQuery = hasPinned
              ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(altLiveQuery)
              : altLiveQuery
            best = {
              query: fullQuery,
              label: getOracleLabel(trailing, variant),
              count: cardCount,
              printingCount,
            }
            if (variant === 'phrase') break
          }
        }
        if (best) {
          oracleSuggestion = {
            id: 'oracle',
            query: best.query,
            label: best.label,
            count: best.count,
            printingCount: best.printingCount,
            docRef: 'reference/fields/face/oracle',
            priority: 20,
            variant: 'rewrite',
          }
        }
      }
    }
  }
  if (oracleSuggestion) {
    suggestions.push(oracleSuggestion)
  }

  // Spec 153: Wrong-field suggestions — color, format/is, artist-atag domains
  if (
    totalCards === 0 &&
    effectiveBd &&
    !(hasPinned && pinnedIndicesCount === 0)
  ) {
    // Color value in is:/in:/type: → suggest ci:/c:/produces:
    const offendingNodes = collectFieldNodes(effectiveBd, COLOR_TRIGGER_FIELDS, ':', {
      valuePredicate: isKnownColorValue,
    })
    for (const node of offendingNodes) {
      if (!node.span) continue
      const isNegated = node.type === 'NOT'
      const prefix = isNegated ? '-' : ''
      for (const alt of getColorAlternatives(node)) {
        const replacementTerm = prefix + alt.label
        const altQuery = spliceQuery(effectiveQuery, node.span, replacementTerm)
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          suggestions.push({
            id: 'wrong-field',
            query: altQuery,
            label: alt.label,
            explain: alt.explain,
            count: cardCount,
            printingCount,
            docRef: alt.docRef,
            priority: 22,
            variant: 'rewrite',
          })
        }
      }
    }

    // Format/is value in type:/in: → suggest f:/is:
    const formatIsNodes = collectFieldNodes(effectiveBd, FORMAT_IS_TRIGGER_FIELDS, ':', {
      valuePredicate: isFormatOrIsValue,
    })
    for (const node of formatIsNodes) {
      if (!node.span) continue
      const isNegated = node.type === 'NOT'
      const prefix = isNegated ? '-' : ''
      for (const alt of getFormatOrIsAlternatives(node)) {
        const replacementTerm = prefix + alt.label
        const altQuery = spliceQuery(effectiveQuery, node.span, replacementTerm)
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          suggestions.push({
            id: 'wrong-field',
            query: altQuery,
            label: alt.label,
            explain: alt.explain,
            count: cardCount,
            printingCount,
            docRef: alt.docRef,
            priority: 22,
            variant: 'rewrite',
          })
        }
      }
    }

    // Artist/atag reflexive — a:value ↔ atag:value
    const artistNodes = collectFieldNodes(effectiveBd, ARTIST_TRIGGER_FIELDS, ':')
    const atagNodes = collectFieldNodes(effectiveBd, ATAG_TRIGGER_FIELDS, ':')
    const artistAtagPairs: Array<{ nodes: BreakdownNode[]; fromField: 'artist' | 'atag' }> = [
      { nodes: artistNodes, fromField: 'artist' },
      { nodes: atagNodes, fromField: 'atag' },
    ]
    for (const { nodes, fromField } of artistAtagPairs) {
      for (const node of nodes) {
        if (!node.span) continue
        const alt = getArtistAtagAlternative(node, fromField)
        if (!alt) continue
        const isNegated = node.type === 'NOT'
        const prefix = isNegated ? '-' : ''
        const replacementTerm = prefix + alt.label
        const altQuery = spliceQuery(effectiveQuery, node.span, replacementTerm)
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          suggestions.push({
            id: 'artist-atag',
            query: altQuery,
            label: alt.label,
            explain: alt.explain,
            count: cardCount,
            printingCount,
            docRef: alt.docRef,
            priority: 25,
            variant: 'rewrite',
          })
        }
      }
    }
  }

  suggestions.sort((a, b) => a.priority - b.priority)
  return suggestions
}
