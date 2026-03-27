// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BreakdownNode, CardIndex, PrintingIndex, NodeCache, Suggestion } from '@frantic-search/shared'
import {
  getBareNodes,
  getTrailingBareNodes,
  getBareTermAlternatives,
  getBareTagPrefixAlternatives,
  getMultiWordAlternatives,
  getAdjacentBareWindows,
  isKnownColorValue,
  getColorAlternatives,
  isFormatOrIsValue,
  getFormatOrIsAlternatives,
  getArtistAtagAlternative,
  COLOR_TRIGGER_FIELDS,
  FORMAT_IS_TRIGGER_FIELDS,
  ARTIST_TRIGGER_FIELDS,
  ATAG_TRIGGER_FIELDS,
  COLOR_EQUALS_RELAX_FIELDS,
  IDENTITY_EQUALS_RELAX_FIELDS,
  getOperatorRelaxAlternatives,
  buildStrayCommaCleanup,
  collectNonexistentFieldRewrites,
} from '@frantic-search/shared'
import { hasListSyntaxInQuery, collectListOffendingTerms, appendTerm, spliceQuery, collectFieldNodes } from './query-edit'
import { spliceBareToOracle, getOracleLabel } from './oracle-hint-edit'
import { evaluateAlternative } from './worker-alternative-eval'

/** Spec 151: `otag:` / `atag:` bare-term-upgrade chips sort after oracle (20). */
function bareTermUpgradePriority(label: string): 16 | 21 {
  const lower = label.toLowerCase()
  if (lower.startsWith('otag:') || lower.startsWith('atag:')) return 21
  return 16
}

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
  /** Spec 154: domain labels for bare-term-upgrade. */
  keywordLabels?: string[]
  oracleTagLabels?: string[]
  illustrationTagLabels?: string[]
  artistLabels?: string[]
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
    keywordLabels,
    oracleTagLabels,
    illustrationTagLabels,
    artistLabels,
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
      priority: 90,
      variant: 'rewrite',
    })
  }

  // Spec 158: Nonexistent field names (e.g. subtype:, supertype:) → t: — no totalCards gate
  const trimmedEffective = effectiveQuery.trim()
  if (trimmedEffective) {
    for (const r of collectNonexistentFieldRewrites(trimmedEffective)) {
      const query = spliceQuery(trimmedEffective, r.span, r.label)
      const dupRewrite = suggestions.some((s) => s.variant === 'rewrite' && s.query === query)
      if (dupRewrite) continue
      suggestions.push({
        id: 'nonexistent-field',
        query,
        label: r.label,
        explain: r.explain,
        docRef: r.docRef,
        priority: 14,
        variant: 'rewrite',
      })
    }
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
      priority: 90,
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

  // Spec 154: Bare-term field upgrade — before oracle
  const bareTermUpgradedValues = new Set<string>()
  if (
    totalCards === 0 &&
    hasLive &&
    !(hasPinned && pinnedIndicesCount === 0) &&
    (ast.type === 'AND' || ast.type === 'BARE')
  ) {
    const bareNodes = getBareNodes(ast)
    const ctx = {
      keywordLabels,
      typeLineWords: index.typeLineWords,
      knownSetCodes: printingIndex?.knownSetCodes,
      oracleTagLabels,
      illustrationTagLabels,
      artistLabels,
    }

    // Multi-word sliding window: check pairs then triples of adjacent bare
    // nodes for multi-word keywords and artist names. Consumed nodes are
    // excluded from the subsequent single-node pass.
    const consumedIndices = new Set<number>()
    const windows = getAdjacentBareWindows(bareNodes, msg.query, 3)
    for (const winIndices of windows) {
      if (winIndices.some((i) => consumedIndices.has(i))) continue
      const phrase = winIndices.map((i) => bareNodes[i].value).join(' ')
      const segments = winIndices.map((i) => bareNodes[i].value)
      const alts = getMultiWordAlternatives(phrase, ctx, segments)
      if (alts.length === 0) continue
      const first = bareNodes[winIndices[0]]
      const last = bareNodes[winIndices[winIndices.length - 1]]
      if (!first.span || !last.span) continue
      const combinedSpan = { start: first.span.start, end: last.span.end }
      for (const alt of alts) {
        const modifiedLive = spliceQuery(msg.query, combinedSpan, alt.label)
        const altEffective = hasPinned
          ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(modifiedLive)
          : modifiedLive
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery: altEffective,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        suggestions.push({
          id: 'bare-term-upgrade',
          query: altEffective,
          label: alt.label,
          explain: alt.explain,
          ...(cardCount > 0 ? { count: cardCount, printingCount } : {}),
          docRef: alt.docRef,
          priority: bareTermUpgradePriority(alt.label),
          variant: 'rewrite',
        })
      }
      for (const i of winIndices) consumedIndices.add(i)
      for (const i of winIndices) bareTermUpgradedValues.add(bareNodes[i].value.toLowerCase())
    }

    // Single-node pass: skip nodes consumed by multi-word matches above.
    for (let ni = 0; ni < bareNodes.length; ni++) {
      if (consumedIndices.has(ni)) continue
      const node = bareNodes[ni]
      if (!node.span) continue
      const alts = getBareTermAlternatives(node.value, ctx)
      const exactTagLabels = new Set(
        alts
          .filter((a) => a.label.startsWith('otag:') || a.label.startsWith('atag:'))
          .map((a) => a.label.toLowerCase()),
      )
      const prefixAlts = getBareTagPrefixAlternatives(node.value, ctx).filter(
        (a) => !exactTagLabels.has(a.label.toLowerCase()),
      )
      for (const alt of [...alts, ...prefixAlts]) {
        const modifiedLive = spliceQuery(msg.query, node.span, alt.label)
        const altEffective = hasPinned
          ? sealQuery(msg.pinnedQuery!.trim()) + ' ' + sealQuery(modifiedLive)
          : modifiedLive
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery: altEffective,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        suggestions.push({
          id: 'bare-term-upgrade',
          query: altEffective,
          label: alt.label,
          explain: alt.explain,
          ...(cardCount > 0 ? { count: cardCount, printingCount } : {}),
          docRef: alt.docRef,
          priority: bareTermUpgradePriority(alt.label),
          variant: 'rewrite',
        })
        bareTermUpgradedValues.add(node.value.toLowerCase())
      }
    }
  }

  // Spec 131: Oracle "Did you mean?" hint - empty state only (skip terms that got bare-term-upgrade)
  let oracleSuggestion: Suggestion | null = null
  if (totalCards === 0 && hasLive && !(hasPinned && pinnedIndicesCount === 0)) {
    const root = ast.type === 'AND' || ast.type === 'BARE'
    if (root) {
      const rawTrailing = getTrailingBareNodes(ast)
      const trailing = rawTrailing?.filter(
        (n) => !bareTermUpgradedValues.has(n.value.toLowerCase()),
      )
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

    // Spec 157: Remove value-terminal commas (CSV-style separators) when cleaned query matches
    const strayCleanup = buildStrayCommaCleanup(effectiveQuery)
    if (strayCleanup) {
      const cleanedStray = strayCleanup.cleanedQuery
      const dupRewrite = suggestions.some(
        (s) => s.variant === 'rewrite' && s.query === cleanedStray,
      )
      if (!dupRewrite) {
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery: cleanedStray,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          suggestions.push({
            id: 'stray-comma',
            query: cleanedStray,
            label: strayCleanup.label,
            explain: 'Separate terms with spaces, not commas. Commas inside quoted oracle text stay as you typed.',
            docRef: 'reference/syntax',
            count: cardCount,
            printingCount,
            priority: 23,
            variant: 'rewrite',
          })
        }
      }
    }

    // Spec 156: Relax color / identity `=` to `:` / `>=` when exact match yields zero results
    const relaxValuePredicate = (value: string) => {
      const v = value.endsWith(',') ? value.slice(0, -1) : value
      return isKnownColorValue(v) && !/^\d+$/.test(v)
    }
    const relaxFieldOpts = { positive: true, negated: false, valuePredicate: relaxValuePredicate } as const
    const colorEqNodes = collectFieldNodes(effectiveBd, COLOR_EQUALS_RELAX_FIELDS, '=', relaxFieldOpts)
    const identityEqNodes = collectFieldNodes(effectiveBd, IDENTITY_EQUALS_RELAX_FIELDS, '=', relaxFieldOpts)
    const relaxedEmitted = new Set<string>()
    for (const node of [...colorEqNodes, ...identityEqNodes]) {
      if (!node.span || node.type !== 'FIELD') continue
      const eqIdx = node.label.indexOf('=')
      if (eqIdx < 0) continue
      const fieldToken = node.label.slice(0, eqIdx)
      let rawValue = node.label.slice(eqIdx + 1)
      if (rawValue.endsWith(',')) rawValue = rawValue.slice(0, -1)
      const fieldLower = fieldToken.toLowerCase()
      const canonical = (COLOR_EQUALS_RELAX_FIELDS as readonly string[]).some((f) => f.toLowerCase() === fieldLower)
        ? ('color' as const)
        : (IDENTITY_EQUALS_RELAX_FIELDS as readonly string[]).some((f) => f.toLowerCase() === fieldLower)
          ? ('identity' as const)
          : null
      if (!canonical) continue
      let span = node.span
      if (span.end < effectiveQuery.length && effectiveQuery[span.end] === ',') {
        span = { start: span.start, end: span.end + 1 }
      }
      for (const alt of getOperatorRelaxAlternatives(canonical, fieldToken, rawValue)) {
        const altQuery = spliceQuery(effectiveQuery, span, alt.label)
        if (relaxedEmitted.has(altQuery)) continue
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          relaxedEmitted.add(altQuery)
          suggestions.push({
            id: 'relaxed',
            query: altQuery,
            label: alt.label,
            explain: alt.explain,
            count: cardCount,
            printingCount,
            docRef: alt.docRef,
            priority: 24,
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
