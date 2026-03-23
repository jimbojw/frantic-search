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
