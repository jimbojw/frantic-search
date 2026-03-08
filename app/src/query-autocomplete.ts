// SPDX-License-Identifier: Apache-2.0
import { lex, TokenType, FIELD_ALIASES, IS_KEYWORDS, RARITY_NAMES, FORMAT_NAMES, COLOR_NAMES } from '@frantic-search/shared'
import type { Token } from '@frantic-search/shared'
import type { DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'

export type CompletionContext =
  | { type: 'field'; prefix: string; tokenStart: number; tokenEnd: number; fieldName?: undefined }
  | { type: 'value'; prefix: string; tokenStart: number; tokenEnd: number; fieldName: string }
  | { type: 'exact-name'; prefix: string; tokenStart: number; tokenEnd: number; fieldName?: undefined }
  | { type: 'bare'; prefix: string; tokenStart: number; tokenEnd: number; fieldName?: undefined }

export type AutocompleteData = {
  fieldAliases: Record<string, string>
  names: string[]
  typeLines: string[]
  setCodes: string[]
  rarityNames: Record<string, number>
  formatNames: Record<string, number>
  colorNames: Record<string, number>
  isKeywords: string[]
  oracleTagLabels: string[]
  illustrationTagLabels: string[]
  keywordLabels: string[]
}

const OPERATORS = new Set<string>([
  TokenType.COLON,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.GT,
  TokenType.LTE,
  TokenType.GTE,
])

const EXTRA_KNOWN_FIELDS = new Set(['unique', 'include', 'view', 'v', 'sort'])

function isOperator(t: Token): boolean {
  return OPERATORS.has(t.type)
}

function isKnownField(val: string): boolean {
  const lower = val.toLowerCase()
  return lower in FIELD_ALIASES || EXTRA_KNOWN_FIELDS.has(lower)
}

function getCanonicalField(fieldToken: string): string | undefined {
  const lower = fieldToken.toLowerCase()
  return FIELD_ALIASES[lower] ?? (EXTRA_KNOWN_FIELDS.has(lower) ? lower : undefined)
}

/** Get token index containing cursorOffset, or the one immediately before if at boundary. */
function tokenIndexAt(tokens: Token[], cursorOffset: number): number {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === TokenType.EOF) return -1
    if (cursorOffset >= t.start && cursorOffset <= t.end) return i
    if (cursorOffset < t.start) return i - 1
  }
  return tokens.length - 1
}

export function getCompletionContext(query: string, cursorOffset: number): CompletionContext | null {
  if (!query || cursorOffset < 0 || cursorOffset > query.length) return null
  const tokens = lex(query)
  const i = tokenIndexAt(tokens, cursorOffset)
  if (i < 0) return null
  const tok = tokens[i]
  const prev = i > 0 ? tokens[i - 1] : undefined
  const next = i + 1 < tokens.length ? tokens[i + 1] : undefined

  if ((tok.type === TokenType.COLON || isOperator(tok)) && prev?.type === TokenType.WORD && isKnownField(prev.value)) {
    return { type: 'field', prefix: prev.value, tokenStart: prev.start, tokenEnd: prev.end }
  }

  if (tok.type === TokenType.WORD) {
    if (prev && prev.type === TokenType.COLON) {
      const fieldTok = i >= 2 ? tokens[i - 2] : undefined
      const fieldName = fieldTok?.type === TokenType.WORD ? getCanonicalField(fieldTok.value) : undefined
      if (fieldName) {
        return { type: 'value', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end, fieldName }
      }
    }
    if (next && (next.type === TokenType.COLON || isOperator(next))) {
      return { type: 'field', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end }
    }
    // Spec 097: value context when prev is any operator (not just COLON) and field 2 back is known
    if (prev && isOperator(prev)) {
      const fieldTok = i >= 2 ? tokens[i - 2] : undefined
      const fieldName = fieldTok?.type === TokenType.WORD ? getCanonicalField(fieldTok.value) : undefined
      if (fieldName) {
        return { type: 'value', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end, fieldName }
      }
    }
    const prefix = query.slice(tok.start, cursorOffset)
    if (prefix) {
      const p = prefix.toLowerCase()
      for (const k of Object.keys(FIELD_ALIASES)) {
        if (k.startsWith(p) || k === p) {
          return { type: 'field', prefix, tokenStart: tok.start, tokenEnd: tok.end }
        }
      }
      for (const v of new Set(Object.values(FIELD_ALIASES))) {
        if (v.startsWith(p) || v === p) {
          return { type: 'field', prefix, tokenStart: tok.start, tokenEnd: tok.end }
        }
      }
    }
    if (prev && isOperator(prev) && prev.type !== TokenType.COLON) {
      return null
    }
    if (prev && prev.type === TokenType.COLON) {
      const fieldTok = i >= 2 ? tokens[i - 2] : undefined
      const fieldName = fieldTok?.type === TokenType.WORD ? getCanonicalField(fieldTok.value) : undefined
      if (fieldName) {
        return { type: 'value', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end, fieldName }
      }
    }
    if (prev && prev.type === TokenType.BANG) {
      return { type: 'exact-name', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end }
    }
    if (!prev || (!isOperator(prev) && prev.type !== TokenType.COLON)) {
      if (!next || (!isOperator(next) && next.type !== TokenType.COLON)) {
        return { type: 'bare', prefix: query.slice(tok.start, cursorOffset), tokenStart: tok.start, tokenEnd: tok.end }
      }
    }
  }

  if (tok.type === TokenType.QUOTED) {
    if (prev && prev.type === TokenType.BANG) {
      const prefix = query.slice(tok.start + 1, cursorOffset)
      return { type: 'exact-name', prefix, tokenStart: tok.start, tokenEnd: tok.end }
    }
    if (prev && isOperator(prev)) {
      const fieldTok = i >= 2 ? tokens[i - 2] : undefined
      const fieldName = fieldTok?.type === TokenType.WORD ? getCanonicalField(fieldTok.value) : undefined
      if (fieldName) {
        const prefix = query.slice(tok.start + 1, Math.min(cursorOffset, tok.end - 1))
        return { type: 'value', prefix, tokenStart: tok.start, tokenEnd: tok.end, fieldName }
      }
    }
  }

  return null
}

function firstMatchByPrefix(candidates: string[], prefix: string, caseInsensitive = true): string | null {
  const p = caseInsensitive ? prefix.toLowerCase() : prefix
  for (const c of candidates) {
    const key = caseInsensitive ? c.toLowerCase() : c
    if (key.startsWith(p)) return c
  }
  return null
}

function firstMatchSubstring(candidates: string[], prefix: string): string | null {
  const p = prefix.toLowerCase()
  const prefixMatches: string[] = []
  const substringMatches: string[] = []
  for (const c of candidates) {
    const key = c.toLowerCase()
    if (key.startsWith(p)) prefixMatches.push(c)
    else if (key.includes(p)) substringMatches.push(c)
  }
  return prefixMatches[0] ?? substringMatches[0] ?? null
}

export function computeSuggestion(ctx: CompletionContext, data: AutocompleteData): string | null {
  const prefix = ctx.prefix
  if (!prefix && ctx.type !== 'field') return null

  switch (ctx.type) {
    case 'field': {
      const keys = Object.keys(data.fieldAliases)
      const canonicals = [...new Set(Object.values(data.fieldAliases))]
      const all = [...keys, ...canonicals]
      const match = firstMatchByPrefix(all, prefix)
      if (!match) return null
      const canonical = data.fieldAliases[match.toLowerCase()] ?? match
      return canonical
    }
    case 'value': {
      const fn = ctx.fieldName
      if (fn === 'set' || fn === 's' || fn === 'e' || fn === 'edition') {
        if (!data.setCodes?.length) return null
        const match = firstMatchByPrefix(data.setCodes, prefix)
        return match
      }
      if (fn === 'type' || fn === 't') {
        const typeWords = new Set<string>()
        for (const tl of data.typeLines) {
          for (const part of tl.split(/\s+[-—]\s+/)) {
            const word = part.trim().split(/\s+/)[0]
            if (word) typeWords.add(word.toLowerCase())
          }
        }
        const match = firstMatchByPrefix([...typeWords], prefix)
        return match
      }
      if (fn === 'rarity' || fn === 'r') {
        const match = firstMatchByPrefix(Object.keys(data.rarityNames), prefix)
        return match
      }
      if (fn === 'legal' || fn === 'f' || fn === 'format') {
        const match = firstMatchByPrefix(Object.keys(data.formatNames), prefix)
        return match
      }
      if (fn === 'color' || fn === 'c' || fn === 'identity' || fn === 'id' || fn === 'ci' || fn === 'commander' || fn === 'cmd') {
        const match = firstMatchByPrefix(Object.keys(data.colorNames), prefix)
        return match
      }
      if (fn === 'is') {
        const match = firstMatchByPrefix(data.isKeywords, prefix)
        return match
      }
      if (fn === 'otag') {
        if (!data.oracleTagLabels.length) return null
        const match = firstMatchByPrefix(data.oracleTagLabels, prefix)
        return match
      }
      if (fn === 'atag' || fn === 'art') {
        if (!data.illustrationTagLabels.length) return null
        const match = firstMatchByPrefix(data.illustrationTagLabels, prefix)
        return match
      }
      if (fn === 'kw' || fn === 'keyword') {
        if (!data.keywordLabels.length) return null
        const match = firstMatchByPrefix(data.keywordLabels, prefix)
        return match
      }
      if (fn === 'name' || fn === 'n') {
        if (!data.names?.length) return null
        const match = firstMatchByPrefix(data.names, prefix)
        if (!match) return null
        // Stop at first whitespace so "Mine Security" → "Mine" (avoids bare word "Security")
        const spaceIdx = match.indexOf(' ')
        if (spaceIdx >= 0) return match.slice(0, spaceIdx)
        return match
      }
      return null
    }
    case 'exact-name': {
      const match = firstMatchByPrefix(data.names, prefix)
      return match ? `"${match}"` : null
    }
    case 'bare': {
      const match = firstMatchSubstring(data.names, prefix)
      if (!match) return null
      const matchLower = match.toLowerCase()
      const pLower = prefix.toLowerCase()
      const matchStart = matchLower.indexOf(pLower)
      if (matchStart < 0) return null
      const afterPrefix = matchStart + prefix.length
      const spaceIdx = match.indexOf(' ', afterPrefix)
      if (spaceIdx >= 0) return match.slice(matchStart, spaceIdx)
      return match.slice(matchStart)
    }
  }
}

export function buildAutocompleteData(
  display: DisplayColumns | null,
  printingDisplay: PrintingDisplayColumns | null,
  tagLabels?: { oracle?: string[]; illustration?: string[]; keyword?: string[] }
): AutocompleteData | null {
  if (!display) return null
  const setCodes = printingDisplay?.set_codes
    ? [...new Set(printingDisplay.set_codes.map((c) => c.toLowerCase()))]
    : []
  return {
    fieldAliases: FIELD_ALIASES,
    names: display.names,
    typeLines: display.type_lines,
    setCodes,
    rarityNames: RARITY_NAMES,
    formatNames: FORMAT_NAMES,
    colorNames: COLOR_NAMES,
    isKeywords: IS_KEYWORDS,
    oracleTagLabels: tagLabels?.oracle ?? [],
    illustrationTagLabels: tagLabels?.illustration ?? [],
    keywordLabels: tagLabels?.keyword ?? [],
  }
}

export function applyCompletion(
  query: string,
  cursorOffset: number,
  suggestion: string,
  ctx: CompletionContext
): { newQuery: string; newCursor: number } {
  const before = query.slice(0, ctx.tokenStart)
  const after = query.slice(cursorOffset)
  const inserted = suggestion
  const newQuery = before + inserted + after
  const newCursor = ctx.tokenStart + inserted.length
  return { newQuery, newCursor }
}
