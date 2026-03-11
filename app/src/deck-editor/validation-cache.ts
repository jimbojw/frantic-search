// SPDX-License-Identifier: Apache-2.0
import { lexDeckList, ListTokenType } from '@frantic-search/shared'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  LineValidation,
  ParsedEntry,
  QuickFix,
  ValidationResult,
} from '@frantic-search/shared'

export type CachedError = {
  kind: 'error' | 'warning'
  message?: string
  quickFixes?: QuickFix[]
  spanRel?: { start: number; end: number }
}

export type ResolvedCacheEntry = ParsedEntry | { oracleIndex: number; scryfallIndex: number }

/** Spec 116: convert indices to ParsedEntry; finish/variant from line lexing */
export function indicesToParsedEntry(
  oracleIndex: number,
  scryfallIndex: number,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  line: string
): ParsedEntry {
  const tokens = lexDeckList(line)
  const quantityTok = tokens.find((t) => t.type === ListTokenType.QUANTITY)
  const qtyStr = quantityTok?.value.replace(/x$/i, '') ?? '1'
  const quantity = parseInt(qtyStr, 10) || 1
  let finish: 'foil' | 'etched' | null = null
  if (tokens.some((t) => t.type === ListTokenType.ETCHED_MARKER || t.type === ListTokenType.ETCHED_PAREN)) {
    finish = 'etched'
  } else if (tokens.some((t) => t.type === ListTokenType.FOIL_MARKER || t.type === ListTokenType.FOIL_PAREN || t.type === ListTokenType.FOIL_PRERELEASE_MARKER)) {
    finish = 'foil'
  }
  const variantTok = tokens.find((t) => t.type === ListTokenType.VARIANT)
  const variant = variantTok?.value ?? (tokens.some((t) => t.type === ListTokenType.FOIL_PRERELEASE_MARKER) ? 'prerelease' : undefined)
  const oracle_id = oracleIndex >= 0 && display ? (display.oracle_ids[oracleIndex] ?? '') : ''
  const scryfall_id = scryfallIndex >= 0 && printingDisplay ? (printingDisplay.scryfall_ids[scryfallIndex] ?? null) : null
  return { oracle_id, scryfall_id, quantity, finish: finish ?? undefined, variant }
}

/** Build ValidationResult from draft + line cache (Spec 115 § 8, Spec 116 index conversion) */
export function buildValidationResultFromCache(
  text: string,
  lineCache: Map<string, 'valid' | CachedError>,
  resolvedCache: Map<string, ResolvedCacheEntry>,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): ValidationResult {
  const lines: LineValidation[] = []
  const resolved: ParsedEntry[] = []
  const lineStrings = text.split(/\r?\n/)
  let offset = 0
  for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex++) {
    const line = lineStrings[lineIndex]!
    const trimmed = line.trim()
    const lineStart = offset
    const lineEnd = offset + line.length
    const cached = lineCache.get(trimmed)
    if (cached === 'valid') {
      lines.push({ lineIndex, lineStart, lineEnd, kind: 'ok' })
      const entry = resolvedCache.get(trimmed)
      if (entry) {
        const pe = 'oracleIndex' in entry ? indicesToParsedEntry(entry.oracleIndex, entry.scryfallIndex, display, printingDisplay, line) : entry
        resolved.push(pe)
      }
    } else if (cached && (cached.kind === 'error' || cached.kind === 'warning')) {
      const trimmedStartInLine = line.match(/^\s*/)?.[0].length ?? 0
      const lineVal: LineValidation = {
        lineIndex,
        lineStart,
        lineEnd,
        kind: cached.kind,
        message: cached.message,
        quickFixes: cached.quickFixes,
      }
      if (cached.spanRel) {
        lineVal.span = {
          start: lineStart + trimmedStartInLine + cached.spanRel.start,
          end: lineStart + trimmedStartInLine + cached.spanRel.end,
        }
      }
      lines.push(lineVal)
    } else {
      lines.push({ lineIndex, lineStart, lineEnd, kind: 'ok' })
      const entry = resolvedCache.get(trimmed)
      if (entry) {
        const pe = 'oracleIndex' in entry ? indicesToParsedEntry(entry.oracleIndex, entry.scryfallIndex, display, printingDisplay, line) : entry
        resolved.push(pe)
      }
    }
    offset = lineEnd + (lineIndex < lineStrings.length - 1 ? (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1) : 0)
  }
  return { lines, resolved }
}
