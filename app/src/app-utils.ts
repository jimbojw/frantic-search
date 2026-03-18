// SPDX-License-Identifier: Apache-2.0
import type { DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'
import { Rarity, Finish, getSortByFromQuery } from '@frantic-search/shared'
import { extractViewMode } from './view-query'

/** Scryfall order= param for each sortable field (Spec 059). */
const SCRYFALL_ORDER: Record<string, string> = {
  name: 'name',
  mv: 'cmc',
  color: 'color',
  identity: 'color',
  power: 'power',
  toughness: 'toughness',
  usd: '$',
  date: 'released',
  rarity: 'rarity',
  edhrec: 'edhrec',
}

/** Frantic view mode → Scryfall as= param (Spec 107). Omit when slim (Scryfall default). */
const VIEW_TO_AS: Record<string, string> = {
  slim: 'checklist',
  detail: 'text',
  images: 'grid',
  full: 'full',
}

/** Build Scryfall search URL with order/dir and as= when active. */
export function buildScryfallSearchUrl(canonicalQuery: string, effectiveQuery: string): string {
  const q = canonicalQuery || '*'
  let url = `https://scryfall.com/search?q=${encodeURIComponent(q)}`
  const viewMode = extractViewMode(effectiveQuery)
  if (viewMode !== 'slim') {
    const as = VIEW_TO_AS[viewMode]
    if (as) url += `&as=${as}`
  }
  const sortBy = getSortByFromQuery(effectiveQuery)
  if (sortBy) {
    const order = SCRYFALL_ORDER[sortBy.field]
    if (order) url += `&order=${order}&dir=${sortBy.direction}`
  }
  return url
}

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

export function buildPrintingScryfallIndex(pd: PrintingDisplayColumns): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < pd.scryfall_ids.length; i++) {
    const sid = pd.scryfall_ids[i]
    if (!map.has(sid)) map.set(sid, i)
  }
  return map
}

export function buildPrintingScryfallGroupIndex(pd: PrintingDisplayColumns): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (let i = 0; i < pd.scryfall_ids.length; i++) {
    const sid = pd.scryfall_ids[i]
    let group = map.get(sid)
    if (!group) {
      group = []
      map.set(sid, group)
    }
    group.push(i)
  }
  return map
}

export const RARITY_LABELS: Record<number, string> = {
  [Rarity.Common]: 'Common',
  [Rarity.Uncommon]: 'Uncommon',
  [Rarity.Rare]: 'Rare',
  [Rarity.Mythic]: 'Mythic',
  [Rarity.Special]: 'Special',
  [Rarity.Bonus]: 'Bonus',
}

export const FINISH_LABELS: Record<number, string> = {
  [Finish.Nonfoil]: 'Nonfoil',
  [Finish.Foil]: 'Foil',
  [Finish.Etched]: 'Etched',
}

/** Maps numeric finish (0=nonfoil, 1=foil, 2=etched) to InstanceState.finish string. */
export const FINISH_TO_STRING = ['nonfoil', 'foil', 'etched'] as const

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

export type View = 'search' | 'help' | 'card' | 'report' | 'lists' | 'docs'

export function parseView(params: URLSearchParams): View {
  if (params.has('doc') || params.has('docs') || params.has('help')) return 'docs'
  if (params.has('card')) return 'card'
  if (params.has('report')) return 'report'
  if (params.has('list')) return 'lists'
  return 'search'
}

/** Returns doc param value (e.g., "reference/syntax") or null for hub. Treats ?help as ?doc=reference/syntax. Accepts ?docs as alias for ?doc. */
export function parseDocParam(params: URLSearchParams): string | null {
  const doc = params.get('doc') ?? params.get('docs')
  if (doc !== null && doc !== undefined) return doc || null
  if (params.has('help')) return 'reference/syntax'
  return null
}

/** List tab when view is 'lists'. 'default' or 'trash'. */
export function parseListTab(params: URLSearchParams): 'default' | 'trash' {
  return params.get('list') === 'trash' ? 'trash' : 'default'
}

/** Dual Wield mode is active when q2 param is present (Spec 086). */
export function isDualWield(params: URLSearchParams): boolean {
  return params.has('q2')
}

/** Get left and right pane queries from URL. When not in Dual Wield, left uses q. */
export function getPaneQueries(params: URLSearchParams): { left: string; right: string } {
  if (!isDualWield(params)) {
    const q = params.get('q') ?? ''
    return { left: q, right: '' }
  }
  const left = params.get('q1') ?? params.get('q') ?? ''
  const right = params.get('q2') ?? ''
  return { left, right }
}
