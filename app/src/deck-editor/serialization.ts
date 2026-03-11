// SPDX-License-Identifier: Apache-2.0
import {
  serializeArena,
  serializeMoxfield,
  serializeArchidekt,
  serializeMtggoldfish,
  serializeMelee,
  serializeTappedOut,
  serializeManapool,
} from '@frantic-search/shared'
import type {
  DisplayColumns,
  PrintingDisplayColumns,
  InstanceState,
  DeckFormat,
} from '@frantic-search/shared'

export const ALL_FORMATS: { id: DeckFormat; label: string }[] = [
  { id: 'archidekt', label: 'Archidekt' },
  { id: 'arena', label: 'Arena' },
  { id: 'manapool', label: 'Mana Pool' },
  { id: 'melee', label: 'Melee.gg' },
  { id: 'moxfield', label: 'Moxfield' },
  { id: 'mtggoldfish', label: 'MTGGoldfish' },
  { id: 'mtgsalvation', label: 'MTG Salvation' },
  { id: 'tappedout', label: 'TappedOut' },
  { id: 'tcgplayer', label: 'TCGPlayer' },
]

export function serialize(
  format: DeckFormat,
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  switch (format) {
    case 'moxfield':
      return serializeMoxfield(instances, display, printingDisplay)
    case 'archidekt':
      return serializeArchidekt(instances, display, printingDisplay)
    case 'mtggoldfish':
      return serializeMtggoldfish(instances, display, printingDisplay)
    case 'melee':
      return serializeMelee(instances, display)
    case 'tappedout':
      return serializeTappedOut(instances, display, printingDisplay)
    case 'manapool':
      return serializeManapool(instances, display, printingDisplay)
    case 'arena':
    default:
      return serializeArena(instances, display)
  }
}
