// SPDX-License-Identifier: Apache-2.0

export interface ColumnarData {
  names: string[];
  combined_names?: string[];
  mana_costs: string[];
  oracle_texts: string[];
  oracle_texts_tilde?: string[];
  colors: number[];
  color_identity: number[];
  type_lines: string[];
  powers: number[];
  toughnesses: number[];
  loyalties: number[];
  defenses: number[];
  legalities_legal: number[];
  legalities_banned: number[];
  legalities_restricted: number[];
  card_index: number[];
  canonical_face: number[];
  scryfall_ids: string[];
  oracle_ids?: string[];
  art_crop_thumb_hashes?: string[];
  card_thumb_hashes?: string[];
  layouts: string[];
  flags: number[];
  edhrec_ranks: (number | null)[];
  edhrec_salts: (number | null)[];
  power_lookup: string[];
  toughness_lookup: string[];
  loyalty_lookup: string[];
  defense_lookup: string[];
  /** Keyword inverted index: keyword (lowercase) → sorted canonical face indices. Spec 105. */
  keywords_index: Record<string, number[]>;
  /** Produced-symbol inverted index. Keys are uppercase letters (W, U, B, R, G, C, T, etc.) discovered from data. Spec 146. */
  produces: Record<string, number[]>;
  /** Alternate names (printed_name, flavor_name) → canonical face index. Spec 111. */
  alternate_names_index?: Record<string, number>;
}

export interface SetLookupEntry {
  code: string;
  name: string;
  released_at: number;
  /** Lowercase Scryfall `set_type` on the printing; optional in legacy `printings.json` (Spec 179). */
  set_type?: string;
}

export interface PrintingColumnarData {
  canonical_face_ref: number[];
  scryfall_ids: string[];
  collector_numbers: string[];
  set_indices: number[];
  rarity: number[];
  printing_flags: number[];
  finish: number[];
  frame: number[];
  price_usd: number[];
  released_at: number[];
  games?: number[];
  promo_types_flags_0?: number[];
  promo_types_flags_1?: number[];
  illustration_id_index?: number[];
  set_lookup: SetLookupEntry[];
  /** Alternate name → sorted printing row indices. Spec 111. */
  alternate_names_index?: Record<string, number[]>;
  /** Scryfall tcgplayer_id / tcgplayer_etched_id per printing row; 0 = none. Card-detail affiliate links. */
  tcgplayer_product_ids: number[];
  /** TCGPlayer Mass Entry resolution. Spec 128. Index 0 = "". */
  tcgplayer_set_lookup?: string[];
  tcgplayer_number_lookup?: string[];
  tcgplayer_name_lookup?: string[];
  tcgplayer_set_indices?: number[];
  tcgplayer_number_indices?: number[];
  tcgplayer_name_indices?: number[];
}

/** Oracle tag inverted index: tag label → sorted canonical face indices. */
export type OracleTagData = Record<string, number[]>;

/**
 * Illustration tag inverted index: tag label → strided (face, illust_idx) pairs.
 *
 * Each array has even length. Elements at even indices are canonical face indices;
 * elements at odd indices are the corresponding illustration_id_index values.
 * The worker resolves these to printing row indices at load time via PrintingIndex.
 */
export type IllustrationTagData = Record<string, number[]>;

/**
 * Flavor text inverted index: raw flavor text → strided (face, printing) pairs.
 * Same strided layout as atags.json (Spec 092): even indices = canonical_face_index,
 * odd indices = printing_row_index. Loaded from flavor-index.json. Spec 141.
 */
export type FlavorTagData = Record<string, number[]>;

/**
 * Artist index: raw artist name → strided (face, printing) pairs.
 * Same strided layout as FlavorTagData (Spec 141): even indices = face_index_within_card (0=front, 1=back),
 * odd indices = printing_row_index. Materialized at ETL; worker does direct lookup. Spec 148.
 */
export type ArtistIndexData = Record<string, number[]>;

/** Keyword inverted index: keyword (lowercase) → sorted canonical face indices. */
export type KeywordData = Record<string, number[]>;
