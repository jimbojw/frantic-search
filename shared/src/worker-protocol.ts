// SPDX-License-Identifier: Apache-2.0

export type ToWorker = {
  type: 'search'
  queryId: number
  query: string
  pinnedQuery?: string
}

export type DisplayColumns = {
  names: string[]
  mana_costs: string[]
  type_lines: string[]
  oracle_texts: string[]
  powers: number[]
  toughnesses: number[]
  loyalties: number[]
  defenses: number[]
  color_identity: number[]
  scryfall_ids: string[]
  art_crop_thumb_hashes: string[]
  card_thumb_hashes: string[]
  layouts: string[]
  legalities_legal: number[]
  legalities_banned: number[]
  legalities_restricted: number[]
  power_lookup: string[]
  toughness_lookup: string[]
  loyalty_lookup: string[]
  defense_lookup: string[]
  canonical_face: number[]
}

export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'NOP' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  error?: string
  children?: BreakdownNode[]
  span?: { start: number; end: number }
  valueSpan?: { start: number; end: number }
}

export type Histograms = {
  colorIdentity: number[]  // [C, W, U, B, R, G, M] — length 7
  manaValue: number[]      // [0, 1, 2, ..., 6, 7+] — length 8
  cardType: number[]       // [Lgn, Cre, Ins, Sor, Art, Enc, Plw, Lnd] — length 8
}

export type PrintingDisplayColumns = {
  scryfall_ids: string[]
  collector_numbers: string[]
  set_codes: string[]
  set_names: string[]
  rarity: number[]
  finish: number[]
  price_usd: number[]
  canonical_face_ref: number[]
}

export type FromWorker =
  | { type: 'status'; status: 'loading' }
  | { type: 'status'; status: 'progress'; fraction: number }
  | { type: 'status'; status: 'ready'; display: DisplayColumns }
  | { type: 'status'; status: 'printings-ready'; printingDisplay: PrintingDisplayColumns }
  | { type: 'status'; status: 'error'; error: string; cause: 'stale' | 'network' | 'unknown' }
  | { type: 'result'; queryId: number; indices: Uint32Array; breakdown: BreakdownNode; pinnedBreakdown?: BreakdownNode; histograms: Histograms; printingIndices?: Uint32Array; hasPrintingConditions: boolean; uniquePrints: boolean }
