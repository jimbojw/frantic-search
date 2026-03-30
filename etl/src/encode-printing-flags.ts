// SPDX-License-Identifier: Apache-2.0
import { PrintingFlag } from "@frantic-search/shared";

/** Subset of Scryfall default-cards fields read by `encodePrintingFlags`. */
export interface EncodePrintingFlagsInput {
  full_art?: boolean;
  textless?: boolean;
  reprint?: boolean;
  promo?: boolean;
  digital?: boolean;
  highres_image?: boolean;
  border_color?: string;
  frame_effects?: string[];
  set?: string;
  oversized?: boolean;
  story_spotlight?: boolean;
  booster?: boolean;
  /** When `funny`, sets `PrintingFlag.Unset` for Scryfall `is:unset` parity (Spec 171). */
  set_type?: string;
}

// Sets with non-standard card backs that are not tournament-legal.
// 30th Anniversary Edition has black front borders but a gold card back.
const NON_TOURNAMENT_BACK_SETS = new Set(["30a"]);

export function encodePrintingFlags(card: EncodePrintingFlagsInput): number {
  let flags = 0;
  if (card.full_art) flags |= PrintingFlag.FullArt;
  if (card.textless) flags |= PrintingFlag.Textless;
  if (card.reprint) flags |= PrintingFlag.Reprint;
  if (card.promo) flags |= PrintingFlag.Promo;
  if (card.digital) flags |= PrintingFlag.Digital;
  if (card.highres_image) flags |= PrintingFlag.HighresImage;
  if (card.border_color === "borderless") flags |= PrintingFlag.Borderless;
  if (card.frame_effects?.includes("extendedart")) flags |= PrintingFlag.ExtendedArt;
  if (card.border_color === "gold" || NON_TOURNAMENT_BACK_SETS.has(card.set ?? "")) {
    flags |= PrintingFlag.GoldBorder;
  }
  if (card.oversized) flags |= PrintingFlag.Oversized;
  if (card.story_spotlight) flags |= PrintingFlag.Spotlight;
  if (card.booster) flags |= PrintingFlag.Booster;
  if (card.frame_effects?.includes("masterpiece")) flags |= PrintingFlag.Masterpiece;
  if (card.frame_effects?.includes("colorshifted")) flags |= PrintingFlag.Colorshifted;
  if (card.frame_effects?.includes("showcase")) flags |= PrintingFlag.Showcase;
  if (card.frame_effects?.includes("inverted")) flags |= PrintingFlag.Inverted;
  if (card.frame_effects?.includes("nyxtouched")) flags |= PrintingFlag.Nyxtouched;
  if ((card.set_type ?? "").toLowerCase() === "funny") flags |= PrintingFlag.Unset;
  return flags;
}
