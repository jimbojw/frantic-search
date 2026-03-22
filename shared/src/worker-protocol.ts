// SPDX-License-Identifier: Apache-2.0
import type { InstanceState } from './card-list'
import type { DeckFormat } from './list-format'
import type { LineValidationResult } from './list-lexer'

export type ViewMode = 'slim' | 'detail' | 'images' | 'full'

export type DualWieldSide = 'left' | 'right'

export type ToWorker =
  | { type: 'search'; queryId: number; query: string; pinnedQuery?: string; viewMode?: ViewMode; side?: DualWieldSide }
  | {
      type: "list-update";
      listId: string;
      printingIndices?: Uint32Array;
      /** Spec 123: pan-list metadata index for # queries. keys[i] → indexArrays[i]. */
      metadataIndex?: { keys: string[]; indexArrays: Uint32Array[] };
    }
  | { type: 'get-tags-for-card'; canonicalIndex: number; primaryPrintingIndex?: number }
  | { type: 'serialize-list'; requestId: number; instances: InstanceState[]; format: DeckFormat; listName?: string }
  | { type: 'validate-list'; requestId: number; lines: string[] }

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
  oracle_ids: string[]
  edhrec_rank: (number | null)[]
  edhrec_salt: (number | null)[]
  /** Alternate name (normalized) → canonical face index. Spec 111. */
  alternate_name_to_canonical_face?: Record<string, number>
}

export type BreakdownNode = {
  type: 'AND' | 'OR' | 'NOT' | 'NOP' | 'FIELD' | 'BARE' | 'EXACT' | 'REGEX_FIELD'
  label: string
  matchCount: number
  /** Card count; present when dual counts available. */
  matchCountCards?: number
  /** Print count; present when PrintingIndex is loaded and dual counts available. */
  matchCountPrints?: number
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

export type UniqueMode = "cards" | "prints" | "art";

export type PrintingDisplayColumns = {
  scryfall_ids: string[]
  collector_numbers: string[]
  set_codes: string[]
  set_names: string[]
  rarity: number[]
  finish: number[]
  price_usd: number[]
  canonical_face_ref: number[]
  illustration_id_index?: number[]
  /** Per-row printing flags for variant resolution (MTGGoldfish import). */
  printing_flags?: number[]
  /** Per-row promo type flags column 0. */
  promo_types_flags_0?: number[]
  /** Per-row promo type flags column 1. */
  promo_types_flags_1?: number[]
  /** Alternate name (normalized) → sorted printing row indices. Spec 111. */
  alternate_name_to_printing_indices?: Record<string, number[]>,
  /** TCGPlayer Mass Entry resolved set codes and collector numbers. Spec 128. */
  tcgplayer_set_codes?: string[]
  tcgplayer_collector_numbers?: string[]
  /** TCGPlayer Mass Entry resolved product names for variant resolution. Spec 128. */
  tcgplayer_names?: string[]
}

export type FromWorker =
  | { type: 'status'; status: 'loading' }
  | { type: 'status'; status: 'progress'; fraction: number }
  | { type: 'status'; status: 'ready'; display: DisplayColumns; keywordLabels?: string[]; facesLoadDurationMs?: number }
  | { type: 'status'; status: 'printings-ready'; printingDisplay: PrintingDisplayColumns; printingsLoadDurationMs?: number }
  | { type: 'status'; status: 'otags-ready'; tagLabels: string[] }
  | { type: 'status'; status: 'atags-ready'; tagLabels: string[] }
  | { type: 'status'; status: 'flavor-ready' }
  | { type: 'status'; status: 'artist-ready' }
  | { type: 'status'; status: 'error'; error: string; cause: 'stale' | 'network' | 'unknown' }
  | { type: 'card-tags'; otags: { label: string; cards: number }[]; atags: { label: string; prints: number }[] }
  | { type: 'result'; queryId: number; indices: Uint32Array; breakdown: BreakdownNode; pinnedBreakdown?: BreakdownNode; effectiveBreakdown?: BreakdownNode; pinnedIndicesCount?: number; pinnedPrintingCount?: number; histograms: Histograms; printingIndices?: Uint32Array; hasPrintingConditions: boolean; uniqueMode: UniqueMode; includeExtras?: boolean; flavorUnavailable?: boolean; indicesIncludingExtras?: number; printingIndicesIncludingExtras?: number; side?: DualWieldSide; oracleHint?: { query: string; label: string; count: number; printingCount?: number; variant: 'phrase' | 'per-word' } }
  | { type: 'serialize-result'; requestId: number; text: string }
  | { type: 'validate-result'; requestId: number; result: LineValidationResult[]; indices: Int32Array }