// SPDX-License-Identifier: Apache-2.0
import type { DisplayColumns } from '@frantic-search/shared'
import { Rarity, Finish } from '@frantic-search/shared'

export function buildFacesOf(canonicalFace: number[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (let i = 0; i < canonicalFace.length; i++) {
    const cf = canonicalFace[i]
    let faces = map.get(cf)
    if (!faces) {
      faces = []
      map.set(cf, faces)
    }
    faces.push(i)
  }
  return map
}

export function buildScryfallIndex(scryfallIds: string[], canonicalFace: number[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < scryfallIds.length; i++) {
    const cf = canonicalFace[i]
    if (cf === i) map.set(scryfallIds[i], i)
  }
  return map
}

export const RARITY_LABELS: Record<number, string> = {
  [Rarity.Common]: 'Common',
  [Rarity.Uncommon]: 'Uncommon',
  [Rarity.Rare]: 'Rare',
  [Rarity.Mythic]: 'Mythic',
}

export const FINISH_LABELS: Record<number, string> = {
  [Finish.Nonfoil]: 'Nonfoil',
  [Finish.Foil]: 'Foil',
  [Finish.Etched]: 'Etched',
}

export function formatPrice(cents: number): string {
  if (cents === 0) return '\u2014'
  return `$${(cents / 100).toFixed(2)}`
}

export function faceStat(d: DisplayColumns, fi: number): string | null {
  const pow = d.power_lookup[d.powers[fi]]
  const tou = d.toughness_lookup[d.toughnesses[fi]]
  if (pow && tou) return `${pow}/${tou}`
  const loy = d.loyalty_lookup[d.loyalties[fi]]
  if (loy) return `Loyalty: ${loy}`
  const def = d.defense_lookup[d.defenses[fi]]
  if (def) return `Defense: ${def}`
  return null
}

export function fullCardName(d: DisplayColumns, faceIndices: number[]): string {
  return faceIndices.map(fi => d.names[fi]).join(' // ')
}

export type View = 'search' | 'help' | 'card' | 'report'

export function parseView(params: URLSearchParams): View {
  if (params.has('card')) return 'card'
  if (params.has('report')) return 'report'
  if (params.has('help')) return 'help'
  return 'search'
}
