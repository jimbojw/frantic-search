// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, BreakdownNode, CardIndex, PrintingIndex, NodeCache, Suggestion } from '@frantic-search/shared'
import {
  parse,
  FIELD_ALIASES,
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
  isUnknownKeywordIsNotError,
  parseIsNotInnerLabel,
  getIsNotKeywordWrongFieldAlternatives,
  buildFieldOperatorGapCleanup,
} from '@frantic-search/shared'
import { hasListSyntaxInQuery, collectListOffendingTerms, appendTerm, spliceQuery, collectFieldNodes } from './query-edit'
import {
  spliceBareToOracle,
  spliceBareToOracleSingle,
  getOracleLabel,
  getOracleLabelSingleUpgrade,
  trailingOracleRegexEligible,
  type OracleSpliceVariant,
} from './oracle-hint-edit'
import { evaluateAlternative } from './worker-alternative-eval'
import { buildNameTypoSuggestion } from './name-typo-suggestion'
import { liveQueryForSuggestionApply } from './suggestion-live-apply'

/** Spec 151: `otag:` / `atag:` bare-term-upgrade chips sort after oracle (20). */
function bareTermUpgradePriority(label: string): 16 | 21 {
  const lower = label.toLowerCase()
  if (lower.startsWith('otag:') || lower.startsWith('atag:')) return 21
  return 16
}

/** Spec 131 / 151: tag bare-term chips do not suppress the oracle trailing-node hint. */
function isTagBareTermLabel(label: string): boolean {
  const lower = label.toLowerCase()
  return lower.startsWith('otag:') || lower.startsWith('atag:')
}

/** Spec 153: evaluated breakdown carries `unknown keyword` on is:/not: leaves. */
function breakdownHasUnknownIsNotKeyword(bd: BreakdownNode | null): boolean {
  if (!bd) return false
  let found = false
  function walk(n: BreakdownNode) {
    if (found) return
    if (
      (n.type === 'FIELD' || (n.type === 'NOT' && !n.children)) &&
      isUnknownKeywordIsNotError(n.error)
    ) {
      const inner = n.type === 'NOT' && n.label.startsWith('-') ? n.label.slice(1) : n.label
      const parsed = parseIsNotInnerLabel(inner)
      if (parsed) found = true
    }
    if (n.children) for (const c of n.children) walk(c)
  }
  walk(bd)
  return found
}

function collectIsNotUnknownKeywordNodes(bd: BreakdownNode): BreakdownNode[] {
  const out: BreakdownNode[] = []
  function walk(n: BreakdownNode) {
    if (
      (n.type === 'FIELD' || (n.type === 'NOT' && !n.children)) &&
      isUnknownKeywordIsNotError(n.error)
    ) {
      const inner = n.type === 'NOT' && n.label.startsWith('-') ? n.label.slice(1) : n.label
      if (parseIsNotInnerLabel(inner)) out.push(n)
    }
    if (n.children) for (const c of n.children) walk(c)
  }
  walk(bd)
  return out
}

/**
 * Evaluator breakdown spans for FIELD terms inside AND can be wrong (Issue: overlapping starts).
 * Use parser spans for is:/not: splice coordinates (Spec 153 kw/t wrong-field).
 */
function spanForIsNotWrongFieldQuery(
  query: string,
  outerNot: boolean,
  canonicalField: 'is' | 'not',
  rawValue: string,
): { start: number; end: number } | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  const ast = parse(trimmed)

  function matchesField(n: ASTNode): n is ASTNode & { type: 'FIELD'; span: { start: number; end: number } } {
    if (n.type !== 'FIELD' || !n.span) return false
    const cf = FIELD_ALIASES[n.field.toLowerCase()]
    if (cf !== 'is' && cf !== 'not') return false
    return n.operator === ':' && n.value === rawValue && cf === canonicalField
  }

  function walk(n: ASTNode): { start: number; end: number } | undefined {
    if (n.type === 'NOT' && n.child) {
      if (outerNot && n.span && matchesField(n.child)) {
        return n.span
      }
      const inner = walk(n.child)
      if (inner) return inner
    }
    if (!outerNot && matchesField(n)) {
      return n.span
    }
    if (n.type === 'AND' || n.type === 'OR') {
      for (const c of n.children) {
        const s = walk(c)
        if (s) return s
      }
    }
    return undefined
  }

  return walk(ast)
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
  /** Evaluated effective query breakdown (per-node errors, match counts). Spec 153 wrong-field walks this tree. */
  evalEffectiveBreakdown: BreakdownNode
  /** Live query breakdown; may be null for empty or invalid query. */
  liveBd: BreakdownNode | null
  totalCards: number
  pinnedIndicesCount: number | undefined
  includeExtras: boolean
  indicesBeforeDefaultFilter: number | undefined
  printingIndicesBeforeDefaultFilter: number | undefined
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
    evalEffectiveBreakdown,
    liveBd,
    totalCards,
    pinnedIndicesCount,
    includeExtras,
    indicesBeforeDefaultFilter,
    printingIndicesBeforeDefaultFilter,
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

  const pinnedTrim = hasPinned ? msg.pinnedQuery!.trim() : ''
  const toLiveApply = (newEffective: string) =>
    liveQueryForSuggestionApply(newEffective, hasPinned, pinnedTrim, sealQuery)

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
  if (indicesBeforeDefaultFilter !== undefined && totalCards === 0) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      explain: 'Include promos and non-tournament-legal printings.',
      count: indicesBeforeDefaultFilter,
      printingCount: printingIndicesBeforeDefaultFilter,
      docRef: 'reference/modifiers/include-extras',
      priority: 90,
      variant: 'rewrite',
    })
  }

  // Spec 158: Nonexistent field names (e.g. subtype:, supertype:) → t: — no totalCards gate
  const trimmedEffective = effectiveQuery.trim()
  if (trimmedEffective) {
    for (const r of collectNonexistentFieldRewrites(trimmedEffective)) {
      const newEff = spliceQuery(trimmedEffective, r.span, r.label)
      const query = toLiveApply(newEff)
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

  // Spec 177: FIELD(empty) + BARE gap — omit space between operator and value (#240 UX)
  if (
    totalCards === 0 &&
    hasLive &&
    !(hasPinned && pinnedIndicesCount === 0) &&
    effectiveQuery.trim() !== ''
  ) {
    const gap = buildFieldOperatorGapCleanup(effectiveQuery, parse(effectiveQuery))
    if (gap && gap.cleanedQuery !== effectiveQuery) {
      const queryApply = toLiveApply(gap.cleanedQuery)
      const dupRewrite = suggestions.some(
        (s) => s.variant === 'rewrite' && s.query === queryApply,
      )
      if (!dupRewrite) {
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery: gap.cleanedQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (cardCount > 0) {
          suggestions.push({
            id: 'field-value-gap',
            query: queryApply,
            label: gap.label,
            explain:
              'Omit space between operator and value.',
            docRef: 'reference/syntax',
            count: cardCount,
            printingCount,
            priority: 15,
            variant: 'rewrite',
          })
        }
      }
    }
  }

  // include:extras - rider (totalCards > 0 and hidden default-filtered results)
  const hiddenCards = indicesBeforeDefaultFilter !== undefined ? indicesBeforeDefaultFilter - totalCards : 0
  const hiddenPrintings =
    printingIndicesBeforeDefaultFilter !== undefined && printingIndices != null
      ? printingIndicesBeforeDefaultFilter - printingIndices.length
      : 0
  if (totalCards > 0 && (hiddenCards > 0 || hiddenPrintings > 0)) {
    const query = appendTerm(msg.query, 'include:extras', liveBd)
    const count = indicesBeforeDefaultFilter ?? totalCards
    suggestions.push({
      id: 'include-extras',
      query,
      label: 'include:extras',
      explain: 'Include promos and non-tournament-legal printings.',
      count,
      printingCount: printingIndicesBeforeDefaultFilter,
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

  // Spec 154 + 131: Bare-term field upgrade — before oracle. Only non-tag upgrades
  // add to oracleSuppressedBareValues so otag/atag (Spec 159) do not block oracle.
  const oracleSuppressedBareValues = new Set<string>()
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
          query: modifiedLive,
          label: alt.label,
          explain: alt.explain,
          ...(cardCount > 0 ? { count: cardCount, printingCount } : {}),
          docRef: alt.docRef,
          priority: bareTermUpgradePriority(alt.label),
          variant: 'rewrite',
        })
      }
      for (const i of winIndices) consumedIndices.add(i)
      if (alts.some((a) => !isTagBareTermLabel(a.label))) {
        for (const i of winIndices) oracleSuppressedBareValues.add(bareNodes[i].value.toLowerCase())
      }
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
          query: modifiedLive,
          label: alt.label,
          explain: alt.explain,
          ...(cardCount > 0 ? { count: cardCount, printingCount } : {}),
          docRef: alt.docRef,
          priority: bareTermUpgradePriority(alt.label),
          variant: 'rewrite',
        })
        if (!isTagBareTermLabel(alt.label)) {
          oracleSuppressedBareValues.add(node.value.toLowerCase())
        }
      }
    }
  }

  // Spec 163: Name-token spellcheck (after bare-term-upgrade, before oracle)
  if (totalCards === 0 && hasLive && !(hasPinned && pinnedIndicesCount === 0)) {
    const nameTypo = buildNameTypoSuggestion({
      ast,
      liveQuery: msg.query,
      index,
      cache,
      printingIndex,
      hasPinned,
      pinnedQueryTrim: hasPinned ? msg.pinnedQuery!.trim() : '',
      pinnedIndicesCount,
      hasLive,
      totalCards,
      includeExtras,
      viewMode,
      sealQuery,
    })
    if (nameTypo) {
      const dup = suggestions.some((s) => s.variant === 'rewrite' && s.query === nameTypo.query)
      if (!dup) suggestions.push(nameTypo)
    }
  }

  // Spec 131: Oracle "Did you mean?" hint - empty state only (skip trailing tokens that got non-tag bare-term-upgrade)
  let oracleSuggestion: Suggestion | null = null
  if (totalCards === 0 && hasLive && !(hasPinned && pinnedIndicesCount === 0)) {
    const root = ast.type === 'AND' || ast.type === 'BARE'
    if (root) {
      const rawTrailing = getTrailingBareNodes(ast)
      const trailing = rawTrailing?.filter(
        (n) => !oracleSuppressedBareValues.has(n.value.toLowerCase()),
      )
      if (trailing && trailing.length > 0) {
        const quotedPhraseOnly = trailing.length === 1 && trailing[0].quoted

        const evalLiveOracleAlt = (altLiveQuery: string) => {
          const altCombinedQuery = hasPinned
            ? sealQuery(pinnedTrim) + ' ' + sealQuery(altLiveQuery)
            : altLiveQuery
          return evaluateAlternative({
            altQuery: altCombinedQuery,
            cache,
            index,
            printingIndex,
            includeExtras,
            viewMode,
          })
        }

        const packBest = (
          variant: OracleSpliceVariant,
          altLiveQuery: string,
          cardCount: number,
          printingCount: number | undefined,
        ) => ({
          query: altLiveQuery,
          label: getOracleLabel(trailing, variant),
          count: cardCount,
          printingCount,
        })

        let best: { query: string; label: string; count: number; printingCount?: number } | null = null

        const phraseLive = spliceBareToOracle(msg.query, trailing, 'phrase')
        const phraseEval = evalLiveOracleAlt(phraseLive)
        if (phraseEval.cardCount > 0) {
          best = packBest('phrase', phraseLive, phraseEval.cardCount, phraseEval.printingCount)
        } else {
          const perWordLive = quotedPhraseOnly
            ? null
            : spliceBareToOracle(msg.query, trailing, 'per-word')
          const perWordEval = perWordLive
            ? evalLiveOracleAlt(perWordLive)
            : { cardCount: 0, printingCount: undefined as number | undefined }
          const regexEligible = trailingOracleRegexEligible(trailing)
          const regexLive = regexEligible
            ? spliceBareToOracle(msg.query, trailing, 'regex')
            : null
          const regexEval = regexLive
            ? evalLiveOracleAlt(regexLive)
            : { cardCount: 0, printingCount: undefined as number | undefined }

          const r = regexEval.cardCount
          const p = perWordEval.cardCount
          if (r > 0 && r < p && regexLive) {
            best = packBest('regex', regexLive, r, regexEval.printingCount)
          } else if (p > 0 && perWordLive) {
            best = packBest('per-word', perWordLive, p, perWordEval.printingCount)
          } else if (r > 0 && regexLive) {
            best = packBest('regex', regexLive, r, regexEval.printingCount)
          }
        }

        // Spec 131: single-token hybrid when no primary variant matched
        if (
          !best &&
          trailing.length >= 2 &&
          !quotedPhraseOnly
        ) {
          let hybridWinner: {
            query: string
            label: string
            count: number
            printingCount?: number
            spanStart: number
          } | null = null
          for (let i = 0; i < trailing.length; i++) {
            const node = trailing[i]!
            if (!node.span) continue
            const altLive = spliceBareToOracleSingle(msg.query, trailing, i)
            const ev = evalLiveOracleAlt(altLive)
            if (ev.cardCount <= 0) continue
            const spanStart = node.span.start
            if (
              !hybridWinner ||
              ev.cardCount > hybridWinner.count ||
              (ev.cardCount === hybridWinner.count && spanStart > hybridWinner.spanStart)
            ) {
              hybridWinner = {
                query: altLive,
                label: getOracleLabelSingleUpgrade(node),
                count: ev.cardCount,
                printingCount: ev.printingCount,
                spanStart,
              }
            }
          }
          if (hybridWinner) {
            best = {
              query: hybridWinner.query,
              label: hybridWinner.label,
              count: hybridWinner.count,
              printingCount: hybridWinner.printingCount,
            }
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

  // Spec 153: Wrong-field suggestions — color, format/is, is/not→kw/t, artist-atag domains
  const openWrongField =
    (totalCards === 0 || breakdownHasUnknownIsNotKeyword(evalEffectiveBreakdown)) &&
    !(hasPinned && pinnedIndicesCount === 0)

  if (openWrongField) {
    const suggestionBd = evalEffectiveBreakdown
    const wrongFieldEmittedQueries = new Set<string>()

    // Color value in is:/in:/type: → suggest ci:/c:/produces:
    const offendingNodes = collectFieldNodes(suggestionBd, COLOR_TRIGGER_FIELDS, ':', {
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
        if (cardCount > 0 && !wrongFieldEmittedQueries.has(altQuery)) {
          wrongFieldEmittedQueries.add(altQuery)
          suggestions.push({
            id: 'wrong-field',
            query: toLiveApply(altQuery),
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
    const formatIsNodes = collectFieldNodes(suggestionBd, FORMAT_IS_TRIGGER_FIELDS, ':', {
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
        if (cardCount > 0 && !wrongFieldEmittedQueries.has(altQuery)) {
          wrongFieldEmittedQueries.add(altQuery)
          suggestions.push({
            id: 'wrong-field',
            query: toLiveApply(altQuery),
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

    // is:/not: + unknown keyword → kw:/t: (Spec 153 / parity with Spec 154 value sets)
    const keywordLowerSet = keywordLabels?.length
      ? new Set(keywordLabels.map((l) => l.toLowerCase()))
      : undefined
    const isNotCtx = { keywordLowerSet, typeLineWords: index.typeLineWords }
    for (const node of collectIsNotUnknownKeywordNodes(suggestionBd)) {
      if (!node.span) continue
      const outerNot = node.type === 'NOT'
      const inner = outerNot && node.label.startsWith('-') ? node.label.slice(1) : node.label
      const parsed = parseIsNotInnerLabel(inner)
      if (!parsed) continue
      const alts = getIsNotKeywordWrongFieldAlternatives(
        parsed.field,
        outerNot,
        parsed.value,
        isNotCtx,
      )
      for (const alt of alts) {
        const replacementTerm = alt.label
        const span =
          spanForIsNotWrongFieldQuery(effectiveQuery, outerNot, parsed.field, parsed.value) ??
          node.span
        if (!span) continue
        const altQuery = spliceQuery(effectiveQuery, span, replacementTerm)
        if (wrongFieldEmittedQueries.has(altQuery)) continue
        const { cardCount, printingCount } = evaluateAlternative({
          altQuery,
          cache,
          index,
          printingIndex,
          includeExtras,
          viewMode,
        })
        if (alt.requirePositiveCount && cardCount <= 0) continue
        wrongFieldEmittedQueries.add(altQuery)
        suggestions.push({
          id: 'wrong-field',
          query: toLiveApply(altQuery),
          label: alt.label,
          explain: alt.explain,
          ...(cardCount > 0 ? { count: cardCount, printingCount } : {}),
          docRef: alt.docRef,
          priority: 22,
          variant: 'rewrite',
        })
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
            query: toLiveApply(cleanedStray),
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
    const colorEqNodes = collectFieldNodes(suggestionBd, COLOR_EQUALS_RELAX_FIELDS, '=', relaxFieldOpts)
    const identityEqNodes = collectFieldNodes(suggestionBd, IDENTITY_EQUALS_RELAX_FIELDS, '=', relaxFieldOpts)
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
            query: toLiveApply(altQuery),
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
    const artistNodes = collectFieldNodes(suggestionBd, ARTIST_TRIGGER_FIELDS, ':')
    const atagNodes = collectFieldNodes(suggestionBd, ATAG_TRIGGER_FIELDS, ':')
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
            query: toLiveApply(altQuery),
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
