// SPDX-License-Identifier: Apache-2.0

export interface ColumnarData {
  names: string[];
  combined_names: string[];
  mana_costs: string[];
  oracle_texts: string[];
  oracle_texts_tilde: string[];
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
  art_crop_thumb_hashes?: string[];
  card_thumb_hashes?: string[];
  layouts: string[];
  flags: number[];
  power_lookup: string[];
  toughness_lookup: string[];
  loyalty_lookup: string[];
  defense_lookup: string[];
}

export interface SetLookupEntry {
  code: string;
  name: string;
  released_at: number;
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
  set_lookup: SetLookupEntry[];
}
