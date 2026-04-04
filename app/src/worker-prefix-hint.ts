// SPDX-License-Identifier: Apache-2.0
import type { FieldNode, KeywordDataRef, PrintingIndex, QueryNodeResult, TagDataRef } from '@frantic-search/shared'
import {
  FIELD_ALIASES,
  FORMAT_NAMES,
  FRAME_NAMES,
  GAME_NAMES,
  RARITY_NAMES,
  buildPrefixBranchHint,
  collectIsNotPrefixHintNormalizedCandidates,
  collectInPrefixHintNormalizedCandidates,
  normalizeForResolution,
} from '@frantic-search/shared'

const PREFIX_HINT_CANONICAL = new Set([
  'keyword',
  'otag',
  'atag',
  'is',
  'not',
  'set',
  'set_type',
  'frame',
  'collectornumber',
  'game',
  'rarity',
  'in',
  'legal',
  'banned',
  'restricted',
])

let isNotHintNormCache: string[] | null = null
function getIsNotHintNorms(): string[] {
  return (isNotHintNormCache ??= collectIsNotPrefixHintNormalizedCandidates())
}

function distinctSetNorms(p: PrintingIndex): string[] {
  const s = new Set<string>()
  for (let i = 0; i < p.printingCount; i++) {
    const v = p.setCodesNormResolved[i]!
    if (v.length > 0) s.add(v)
  }
  return [...s]
}

function distinctSetTypeNorms(p: PrintingIndex): string[] {
  const s = new Set<string>()
  for (let i = 0; i < p.printingCount; i++) {
    const v = p.setTypesNormResolved[i]!
    if (v.length > 0) s.add(v)
  }
  return [...s]
}

function distinctCnNorms(p: PrintingIndex): string[] {
  const s = new Set<string>()
  for (let i = 0; i < p.printingCount; i++) {
    const v = p.collectorNumbersNormResolved[i]!
    if (v.length > 0) s.add(v)
  }
  return [...s]
}

function normsFromObjectKeys(obj: Record<string, number>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of Object.keys(obj)) {
    const n = normalizeForResolution(key)
    if (n.length === 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export type PrefixHintContext = {
  printingIndex: PrintingIndex | null
  keywordDataRef: KeywordDataRef | null
  tagData: TagDataRef | null
  setNorms: string[] | null
  setTypeNorms: string[] | null
  cnNorms: string[] | null
  inNorms: string[] | null
}

export function buildPrefixHintContext(
  printingIndex: PrintingIndex | null,
  keywordDataRef: KeywordDataRef | null,
  tagData: TagDataRef | null,
): PrefixHintContext {
  let setNorms: string[] | null = null
  let setTypeNorms: string[] | null = null
  let cnNorms: string[] | null = null
  let inNorms: string[] | null = null
  if (printingIndex) {
    setNorms = distinctSetNorms(printingIndex)
    setTypeNorms = distinctSetTypeNorms(printingIndex)
    cnNorms = distinctCnNorms(printingIndex)
    inNorms = collectInPrefixHintNormalizedCandidates(printingIndex)
  }
  return { printingIndex, keywordDataRef, tagData, setNorms, setTypeNorms, cnNorms, inNorms }
}

function getNormalizedCandidates(canonical: string, ctx: PrefixHintContext): string[] | null {
  switch (canonical) {
    case 'keyword': {
      const rows = ctx.keywordDataRef?.keywordEvalIndex
      if (!rows || rows.length === 0) return null
      const seen = new Set<string>()
      const out: string[] = []
      for (let i = 0; i < rows.length; i++) {
        const k = rows[i]!.normKey
        if (k.length === 0 || seen.has(k)) continue
        seen.add(k)
        out.push(k)
      }
      return out
    }
    case 'otag': {
      const rows = ctx.tagData?.oracleEvalIndex
      if (!rows || rows.length === 0) return null
      const seen = new Set<string>()
      const out: string[] = []
      for (let i = 0; i < rows.length; i++) {
        const k = rows[i]!.normKey
        if (k.length === 0 || seen.has(k)) continue
        seen.add(k)
        out.push(k)
      }
      return out
    }
    case 'atag': {
      const rows = ctx.tagData?.illustrationEvalIndex
      if (!rows || rows.length === 0) return null
      const seen = new Set<string>()
      const out: string[] = []
      for (let i = 0; i < rows.length; i++) {
        const k = rows[i]!.normKey
        if (k.length === 0 || seen.has(k)) continue
        seen.add(k)
        out.push(k)
      }
      return out
    }
    case 'is':
    case 'not':
      return getIsNotHintNorms()
    case 'set':
      return ctx.setNorms
    case 'set_type':
      return ctx.setTypeNorms
    case 'collectornumber':
      return ctx.cnNorms
    case 'frame':
      return normsFromObjectKeys(FRAME_NAMES)
    case 'game':
      return normsFromObjectKeys(GAME_NAMES)
    case 'rarity':
      return normsFromObjectKeys(RARITY_NAMES)
    case 'in':
      return ctx.inNorms
    case 'legal':
    case 'banned':
    case 'restricted':
      return normsFromObjectKeys(FORMAT_NAMES)
    default:
      return null
  }
}

export function computePrefixBranchHintForLeaf(
  fieldNode: FieldNode,
  leafResult: QueryNodeResult,
  ctx: PrefixHintContext,
): string | undefined {
  if (leafResult.error) return undefined
  if (fieldNode.operator !== ':') return undefined
  const canonical = FIELD_ALIASES[fieldNode.field.toLowerCase()]
  if (!canonical || !PREFIX_HINT_CANONICAL.has(canonical)) return undefined

  const candidates = getNormalizedCandidates(canonical, ctx)
  if (candidates === null || candidates.length === 0) return undefined

  const hint = buildPrefixBranchHint(fieldNode.value, candidates)
  return hint ?? undefined
}
