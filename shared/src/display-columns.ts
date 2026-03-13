// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData, PrintingColumnarData } from "./data";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";
import { buildNormalizedAlternateIndex } from "./normalize";

export function extractDisplayColumns(data: ColumnarData): DisplayColumns {
  const len = data.names.length;
  return {
    names: data.names,
    mana_costs: data.mana_costs,
    type_lines: data.type_lines,
    oracle_texts: data.oracle_texts,
    powers: data.powers,
    toughnesses: data.toughnesses,
    loyalties: data.loyalties,
    defenses: data.defenses,
    color_identity: data.color_identity,
    scryfall_ids: data.scryfall_ids,
    art_crop_thumb_hashes: data.art_crop_thumb_hashes ?? new Array<string>(len).fill(""),
    card_thumb_hashes: data.card_thumb_hashes ?? new Array<string>(len).fill(""),
    layouts: data.layouts,
    legalities_legal: data.legalities_legal,
    legalities_banned: data.legalities_banned,
    legalities_restricted: data.legalities_restricted,
    power_lookup: data.power_lookup,
    toughness_lookup: data.toughness_lookup,
    loyalty_lookup: data.loyalty_lookup,
    defense_lookup: data.defense_lookup,
    canonical_face: data.canonical_face,
    oracle_ids: data.oracle_ids ?? new Array<string>(len).fill(""),
    edhrec_rank: data.edhrec_ranks,
    edhrec_salt: data.edhrec_salts,
    alternate_name_to_canonical_face: buildNormalizedAlternateIndex(
      data.alternate_names_index ?? {},
    ),
  };
}

export function extractPrintingDisplayColumns(
  data: PrintingColumnarData,
): PrintingDisplayColumns {
  const result: PrintingDisplayColumns = {
    scryfall_ids: data.scryfall_ids,
    collector_numbers: data.collector_numbers,
    set_codes: data.set_indices.map((idx) => data.set_lookup[idx]?.code ?? ""),
    set_names: data.set_indices.map((idx) => data.set_lookup[idx]?.name ?? ""),
    rarity: data.rarity,
    finish: data.finish,
    price_usd: data.price_usd,
    canonical_face_ref: data.canonical_face_ref,
    illustration_id_index: data.illustration_id_index,
    printing_flags: data.printing_flags,
    promo_types_flags_0: data.promo_types_flags_0,
    promo_types_flags_1: data.promo_types_flags_1,
    alternate_name_to_printing_indices: buildNormalizedAlternateIndex(
      data.alternate_names_index ?? {},
    ),
  };

  if (data.tcgplayer_set_indices && data.tcgplayer_number_indices) {
    const setLookup = data.tcgplayer_set_lookup ?? [];
    const numberLookup = data.tcgplayer_number_lookup ?? [];
    result.tcgplayer_set_codes = data.tcgplayer_set_indices.map(
      (idx) => (idx > 0 ? setLookup[idx] ?? "" : ""),
    );
    result.tcgplayer_collector_numbers = data.tcgplayer_number_indices.map(
      (idx) => (idx > 0 ? numberLookup[idx] ?? "" : ""),
    );
  }

  return result;
}
