// SPDX-License-Identifier: Apache-2.0

export interface ColumnarData {
  names: string[];
  mana_costs: string[];
  oracle_texts: string[];
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
  power_lookup: string[];
  toughness_lookup: string[];
  loyalty_lookup: string[];
  defense_lookup: string[];
}
