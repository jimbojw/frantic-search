// SPDX-License-Identifier: Apache-2.0
import { COLOR_NAMES, COLOR_FROM_LETTER } from './bits'
import type { BreakdownNode } from './worker-protocol'

const TRIGGER_FIELDS = ['is', 'in', 'type'] as const

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
