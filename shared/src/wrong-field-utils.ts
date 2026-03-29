// SPDX-License-Identifier: Apache-2.0
import { COLOR_NAMES, COLOR_FROM_LETTER, FORMAT_NAMES } from './bits'
import { FIELD_ALIASES } from './search/eval-leaves'
import { IS_KEYWORDS } from './search/eval-is'
import type { BreakdownNode } from './worker-protocol'

/** All field keys (incl. aliases) that resolve to the given canonicals. */
function fieldKeysForCanonicals(canonicals: readonly string[]): string[] {
  const set = new Set(canonicals)
  return Object.entries(FIELD_ALIASES)
    .filter(([, canonical]) => set.has(canonical))
    .map(([key]) => key)
}

/** Color domain: is, in, type — any alias (e.g. t:) is matched. */
export const COLOR_TRIGGER_FIELDS = fieldKeysForCanonicals(['is', 'in', 'type'])

/** Format/is domain: type, in — any alias (e.g. t:) is matched. */
export const FORMAT_IS_TRIGGER_FIELDS = fieldKeysForCanonicals(['type', 'in'])

/** Artist/atag domain: a, artist and atag, art (Spec 153 reflexive). */
export const ARTIST_TRIGGER_FIELDS = fieldKeysForCanonicals(['artist'])
export const ATAG_TRIGGER_FIELDS = fieldKeysForCanonicals(['atag'])

/** Face color field aliases (Spec 156 `=` → `:` relaxation). */
export const COLOR_EQUALS_RELAX_FIELDS = fieldKeysForCanonicals(['color'])

/** Color identity field aliases (Spec 156 `=` → `:` / `>=`). */
export const IDENTITY_EQUALS_RELAX_FIELDS = fieldKeysForCanonicals(['identity'])

const TRIGGER_FIELDS = COLOR_TRIGGER_FIELDS

const SINGLE_COLOR_TO_LETTER: Record<string, string> = {
  white: 'w',
  blue: 'u',
  black: 'b',
  red: 'r',
  green: 'g',
}

const ALTERNATIVES: Array<{ field: string; explain: string; docRef: string }> = [
  { field: 'ci', explain: 'Use ci: for color identity.', docRef: 'reference/fields/face/identity' },
  { field: 'c', explain: 'Use c: for card color.', docRef: 'reference/fields/face/color' },
  { field: 'produces', explain: 'Use produces: for mana the card can produce.', docRef: 'reference/fields/face/produces' },
]

/**
 * Returns true if the value is a known color value: a key in COLOR_NAMES or
 * a non-empty WUBRG letter sequence (w/u/b/r/g case-insensitive).
 */
export function isKnownColorValue(value: string): boolean {
  if (!value || value.length === 0) return false
  const lower = value.toLowerCase()
  if (lower in COLOR_NAMES) return true
  const upper = value.toUpperCase()
  for (const ch of upper) {
    if (ch === 'C') {
      // C alone is colorless (in COLOR_NAMES); C in a sequence is handled by COLOR_FROM_LETTER
      if (upper.length === 1) return true
      return false
    }
    if (!(ch in COLOR_FROM_LETTER)) return false
  }
  return true
}

function extractValueFromLabel(label: string): string {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const opIdx = raw.indexOf(':')
  return opIdx >= 0 ? raw.slice(opIdx + 1) : ''
}

function normalizeForDisplay(value: string): string {
  const lower = value.toLowerCase()
  const letter = SINGLE_COLOR_TO_LETTER[lower]
  return letter ?? value
}

export type ColorAlternative = {
  field: string
  label: string
  value: string
  explain: string
  docRef: string
}

/**
 * Build replacement alternatives for a FIELD or NOT node whose label matches
 * a trigger field (is:, in:, type:) with a known color value.
 */
export type OperatorRelaxAlternative = {
  label: string
  explain: string
  docRef: string
}

const EXPLAIN_RELAX_ID_SUBSET =
  'Identity fits within these colors (subset)—typical for deck legality. = matches identity exactly.'
const EXPLAIN_RELAX_ID_SUPER = 'Identity includes at least these colors (superset).'
const EXPLAIN_RELAX_COLOR =
  'Face includes at least these colors. = is an exact color match; : treats the value as a superset.'

/**
 * Spec 156: replacement clauses when relaxing `=` on color / identity for known non-count values.
 * Returns [] for digit-only or unknown color values.
 */
export function getOperatorRelaxAlternatives(
  canonical: 'color' | 'identity',
  userFieldToken: string,
  rawValue: string,
): OperatorRelaxAlternative[] {
  if (!rawValue || /^\d+$/.test(rawValue) || !isKnownColorValue(rawValue)) return []
  const normalized = normalizeForDisplay(rawValue)
  const docRef =
    canonical === 'identity' ? 'reference/fields/face/identity' : 'reference/fields/face/color'
  if (canonical === 'color') {
    return [
      {
        label: `${userFieldToken}:${normalized}`,
        explain: EXPLAIN_RELAX_COLOR,
        docRef,
      },
    ]
  }
  return [
    {
      label: `${userFieldToken}:${normalized}`,
      explain: EXPLAIN_RELAX_ID_SUBSET,
      docRef,
    },
    {
      label: `${userFieldToken}>=${normalized}`,
      explain: EXPLAIN_RELAX_ID_SUPER,
      docRef,
    },
  ]
}

export function getColorAlternatives(node: BreakdownNode): ColorAlternative[] {
  const rawValue = extractValueFromLabel(node.label)
  const normalized = normalizeForDisplay(rawValue)
  return ALTERNATIVES.map(({ field, explain, docRef }) => ({
    field,
    label: `${field}:${normalized}`,
    value: normalized,
    explain,
    docRef,
  }))
}

export function isTriggerField(label: string): boolean {
  const raw = label.startsWith('-') ? label.slice(1) : label
  const opIdx = raw.indexOf(':')
  if (opIdx < 0) return false
  const field = raw.slice(0, opIdx).toLowerCase()
  return (TRIGGER_FIELDS as readonly string[]).includes(field)
}

/**
 * Returns true if the value is a known format name (FORMAT_NAMES) or
 * is: keyword (IS_KEYWORDS), case-insensitive.
 */
export function isFormatOrIsValue(value: string): boolean {
  if (!value || value.length === 0) return false
  const lower = value.toLowerCase()
  if (lower in FORMAT_NAMES) return true
  return IS_KEYWORDS.includes(lower)
}

export type FormatOrIsAlternative = {
  field: string
  label: string
  value: string
  explain: string
  docRef: string
}

/**
 * Build replacement alternatives for a FIELD or NOT node whose label matches
 * type: or in: with a format or is: value. Returns f: and/or is: alternatives
 * depending on what the value matches; f: first when both apply.
 */
export function getFormatOrIsAlternatives(node: BreakdownNode): FormatOrIsAlternative[] {
  const rawValue = extractValueFromLabel(node.label)
  const lower = rawValue.toLowerCase()
  const isFormat = lower in FORMAT_NAMES
  const isIsKeyword = IS_KEYWORDS.includes(lower)
  const result: FormatOrIsAlternative[] = []
  if (isFormat) {
    result.push({
      field: 'f',
      label: `f:${rawValue}`,
      value: rawValue,
      explain: 'Use f: for format legality.',
      docRef: 'reference/fields/face/legal',
    })
  }
  if (isIsKeyword) {
    result.push({
      field: 'is',
      label: `is:${rawValue}`,
      value: rawValue,
      explain: 'Use is: for card properties.',
      docRef: 'reference/fields/face/is',
    })
  }
  return result
}

export type ArtistAtagAlternative = {
  field: string
  label: string
  explain: string
  docRef: string
}

/**
 * Build the single replacement alternative for a FIELD or NOT node in the
 * artist/atag reflexive domain. When fromField is 'artist', suggests atag:;
 * when 'atag', suggests a:.
 */
export function getArtistAtagAlternative(
  node: BreakdownNode,
  fromField: 'artist' | 'atag',
): ArtistAtagAlternative | null {
  const value = extractValueFromLabel(node.label)
  if (!value) return null
  if (fromField === 'artist') {
    return {
      field: 'atag',
      label: `atag:${value}`,
      explain: 'Use atag: for illustration tags.',
      docRef: 'reference/fields/face/atag',
    }
  }
  return {
    field: 'a',
    label: `a:${value}`,
    explain: 'Use a: for artist name.',
    docRef: 'reference/fields/face/artist',
  }
}

// ---------------------------------------------------------------------------
// Spec 153: is:/not: + unknown keyword → kw: / t: (parity with Spec 154 value sets)
// ---------------------------------------------------------------------------

const KW_EXPLAIN = 'Use kw: for keyword abilities.'
const KW_DOC = 'reference/fields/face/kw'
const T_EXPLAIN = 'Use t: for type line.'
const T_DOC = 'reference/fields/face/type'

/** Substring match for evaluator `unknown keyword "…"` on is:/not:. */
export function isUnknownKeywordIsNotError(error?: string): boolean {
  return !!error && error.includes('unknown keyword')
}

/**
 * Parse `is:value` or `not:value` from a breakdown label (no leading `-`).
 * Only field tokens `is` and `not` are accepted.
 */
export function parseIsNotInnerLabel(innerLabel: string): { field: 'is' | 'not'; value: string } | null {
  const opIdx = innerLabel.indexOf(':')
  if (opIdx <= 0) return null
  const field = innerLabel.slice(0, opIdx).toLowerCase()
  if (field !== 'is' && field !== 'not') return null
  const value = innerLabel.slice(opIdx + 1)
  if (!value) return null
  return { field: field as 'is' | 'not', value }
}

/**
 * Build replacement clause for kw: or t: given is/not semantics and outer NOT.
 * See Spec 153 negation table.
 */
export function buildIsNotKwTReplacement(
  field: 'is' | 'not',
  outerNot: boolean,
  kind: 'kw' | 't',
  rawValue: string,
): string {
  const core = `${kind}:${rawValue}`
  const negations = (field === 'not' ? 1 : 0) + (outerNot ? 1 : 0)
  return negations % 2 === 1 ? `-${core}` : core
}

export type IsNotKeywordWrongFieldContext = {
  keywordLowerSet?: Set<string>
  typeLineWords?: Set<string>
}

export type IsNotKwTWrongFieldAlternative = {
  label: string
  explain: string
  docRef: string
  /** When false, emit the chip even if evaluateAlternative returns 0 cards. */
  requirePositiveCount: boolean
}

/**
 * Ordered kw: then t: alternatives when value is not a color literal and matches
 * keyword / type-line sets (same idea as bare-term-upgrade-utils).
 */
export function getIsNotKeywordWrongFieldAlternatives(
  field: 'is' | 'not',
  outerNot: boolean,
  rawValue: string,
  ctx: IsNotKeywordWrongFieldContext,
): IsNotKwTWrongFieldAlternative[] {
  if (!rawValue || isKnownColorValue(rawValue)) return []
  const lower = rawValue.toLowerCase()
  const out: IsNotKwTWrongFieldAlternative[] = []
  if (ctx.keywordLowerSet?.has(lower)) {
    out.push({
      label: buildIsNotKwTReplacement(field, outerNot, 'kw', rawValue),
      explain: KW_EXPLAIN,
      docRef: KW_DOC,
      requirePositiveCount: false,
    })
  }
  if (ctx.typeLineWords?.has(lower)) {
    out.push({
      label: buildIsNotKwTReplacement(field, outerNot, 't', rawValue),
      explain: T_EXPLAIN,
      docRef: T_DOC,
      requirePositiveCount: true,
    })
  }
  return out
}
