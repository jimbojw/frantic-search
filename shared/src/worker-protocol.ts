// SPDX-License-Identifier: Apache-2.0

export type ToWorker = {
  type: 'search'
  queryId: number
  query: string
}

export type CardFace = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
}

export type CardResult = {
  scryfallId: string
  colorIdentity: number
  thumbHash: string
  layout: string
  faces: CardFace[]
  legalities?: { legal: number; banned: number; restricted: number }
}

export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  children?: BreakdownNode[]
}

export type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string }
  | { type: 'result'; queryId: number; cards: CardResult[]; totalMatches: number; breakdown: BreakdownNode }
