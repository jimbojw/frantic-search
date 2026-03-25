// SPDX-License-Identifier: Apache-2.0
import { PROMO_TYPE_FLAGS } from "@frantic-search/shared";

/** Minimal Scryfall printing fields needed for promo type bitmask encoding (Spec 046). */
export interface PromoTypesFlagInput {
  promo_types?: string[];
  set_type?: string;
}

function orPromoBit(
  flags0: number,
  flags1: number,
  entry: { column: 0 | 1; bit: number },
): { flags0: number; flags1: number } {
  const bit = 1 << entry.bit;
  if (entry.column === 0) return { flags0: flags0 | bit, flags1 };
  return { flags0, flags1: flags1 | bit };
}

/**
 * Maps Scryfall `promo_types` (and derived `alchemy` from `set_type`) to
 * `promo_types_flags_0` / `promo_types_flags_1` columns. See Spec 046: bit 0
 * (`alchemy`) is also set when `set_type === "alchemy"` for Scryfall `is:alchemy` parity.
 */
export function encodePromoTypesFlags(card: PromoTypesFlagInput): { flags0: number; flags1: number } {
  let flags0 = 0;
  let flags1 = 0;
  const types = card.promo_types ?? [];
  for (const t of types) {
    const entry = PROMO_TYPE_FLAGS[t.toLowerCase()];
    if (entry) {
      const next = orPromoBit(flags0, flags1, entry);
      flags0 = next.flags0;
      flags1 = next.flags1;
    }
  }
  if ((card.set_type ?? "").toLowerCase() === "alchemy") {
    const next = orPromoBit(flags0, flags1, PROMO_TYPE_FLAGS.alchemy);
    flags0 = next.flags0;
    flags1 = next.flags1;
  }
  return { flags0, flags1 };
}
