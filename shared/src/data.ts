// SPDX-License-Identifier: Apache-2.0

export interface ColumnarData {
  names: string[];
  mana_costs: string[];
  oracle_texts: string[];
  colors: number[];
  color_identity: number[];
  types: number[];
  supertypes: number[];
  subtypes: string[];
  powers: number[];
  toughnesses: number[];
  loyalties: number[];
  defenses: number[];
  power_lookup: string[];
  toughness_lookup: string[];
  loyalty_lookup: string[];
  defense_lookup: string[];
}
