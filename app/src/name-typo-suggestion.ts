// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, CardIndex, NodeCache, PrintingIndex, Suggestion } from '@frantic-search/shared'
import { getBareNodes, levenshteinDistance } from '@frantic-search/shared'
import { evaluateAlternative, type ViewMode } from './worker-alternative-eval'
import { spliceQuery } from './query-edit'

export type BuildNameTypoSuggestionParams = {
  ast: ASTNode
  liveQuery: string
  index: CardIndex
  cache: NodeCache
  printingIndex: PrintingIndex | null
  hasPinned: boolean
  pinnedQueryTrim: string
  pinnedIndicesCount: number | undefined
  hasLive: boolean
  totalCards: number
  includeExtras: boolean
  viewMode: ViewMode
  sealQuery: (q: string) => string
}

type BestPick = {
  distance: number
  cardCount: number
  printingCount: number | undefined
  candidate: string
  spanStart: number
  modifiedLive: string
}

function beats(a: BestPick, b: BestPick): boolean {
  if (a.distance !== b.distance) return a.distance < b.distance
  if (a.cardCount !== b.cardCount) return a.cardCount > b.cardCount
  if (a.candidate !== b.candidate) return a.candidate < b.candidate
  return a.spanStart < b.spanStart
}

/**
 * Spec 163: single-token name spellcheck when the effective search returns zero cards.
 */
export function buildNameTypoSuggestion(p: BuildNameTypoSuggestionParams): Suggestion | null {
  if (p.totalCards !== 0 || !p.hasLive) return null
  if (p.hasPinned && p.pinnedIndicesCount === 0) return null

  const bare = getBareNodes(p.ast)
  let best: BestPick | null = null

  for (const node of bare) {
    if (!node.span) continue
    const raw = node.value
    if (/\s/.test(raw)) continue
    const token = raw.toLowerCase()
    if (token.length === 0) continue
    // Do not skip when token ∈ nameWords: e.g. `hearthfire hero` can fail while both
    // tokens appear on *different* cards; Levenshtein may still find a fix (Spec 163).

    const first = token[0]!
    const bucket = p.index.nameWordsByFirstChar.get(first)
    if (!bucket || bucket.length === 0) continue

    const maxDist = token.length >= 7 ? 2 : 1
    for (const candidate of bucket) {
      if (candidate === token) continue
      const d = levenshteinDistance(token, candidate, maxDist)
      if (d > maxDist) continue

      const modifiedLive = spliceQuery(p.liveQuery, node.span, candidate)
      const altEffective = p.hasPinned
        ? p.sealQuery(p.pinnedQueryTrim) + ' ' + p.sealQuery(modifiedLive)
        : modifiedLive
      const { cardCount, printingCount } = evaluateAlternative({
        altQuery: altEffective,
        cache: p.cache,
        index: p.index,
        printingIndex: p.printingIndex,
        includeExtras: p.includeExtras,
        viewMode: p.viewMode,
      })
      if (cardCount === 0) continue

      const spanStart = node.span.start
      const pick: BestPick = {
        distance: d,
        cardCount,
        printingCount,
        candidate,
        spanStart,
        modifiedLive,
      }
      if (!best || beats(pick, best)) best = pick
    }
  }

  if (!best) return null

  return {
    id: 'name-typo',
    query: best.modifiedLive,
    label: best.candidate,
    explain: 'Did you mean this spelling for a card name?',
    count: best.cardCount,
    printingCount: best.printingCount,
    priority: 17,
    variant: 'rewrite',
  }
}
