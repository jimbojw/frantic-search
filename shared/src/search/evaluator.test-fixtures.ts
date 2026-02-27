// SPDX-License-Identifier: Apache-2.0
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, Format } from "../bits";
import type { ColumnarData } from "../data";

// ---------------------------------------------------------------------------
// Synthetic card pool (9 cards = 10 face rows)
// ---------------------------------------------------------------------------
// Row #0  Birds of Paradise (front)  | G  | Creature — Elf               | pow=0
// Row #1  Lightning Bolt             | R  | Instant                      | -
// Row #2  Counterspell               | U  | Instant                      | -
// Row #3  Sol Ring                   | -  | Artifact                     | -
// Row #4  Tarmogoyf                  | G  | Creature — Lhurgoyf          | pow=*
// Row #5  Azorius Charm              | WU | Instant                      | -
// Row #6  Thalia, Guardian           | W  | Legendary Creature — Human   | pow=2
// Row #7  Ayara, Widow (front)       | B  | Legendary Creature — Elf Noble     | pow=3
// Row #8  Ayara, Furnace Queen (back)| BR | Legendary Creature — Phyrexian Elf | pow=4
// Row #9  Dismember                  | B  | Instant                      | -
//
// Ayara is a transform DFC: rows 7+8 share canonical_face=7.

const powerDict = ["", "0", "*", "2", "3", "4"];
const toughnessDict = ["", "1", "1+*", "3", "4"];

export const TEST_DATA: ColumnarData = {
  names:          ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm", "Ayara, Furnace Queen", "Dismember"],
  combined_names: ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Dismember"],
  mana_costs:     ["{G}", "{R}", "{U}{U}", "{1}", "{1}{G}", "{W}{U}", "{1}{W}", "{1}{B}{B}", "", "{1}{B/P}{B/P}"],
  oracle_texts:   [
    "Flying (This creature can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "Lightning Bolt deals 3 damage to any target.",
    "Counter target spell.",
    "{T}: Add {C}{C}.",
    "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "Choose one —",
    "First strike\nNoncreature spells cost {1} more to cast.",
    "{T}, Sacrifice another creature or artifact: Ayara deals X damage to target opponent.",
    "At the beginning of combat on your turn, return up to one target artifact or creature card from your graveyard to the battlefield.",
    "Target creature gets -5/-5 until end of turn.",
  ],
  oracle_texts_tilde: [
    "Flying (~ can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "~ deals 3 damage to any target.",
    "",
    "",
    "~'s power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "",
    "",
    "{T}, Sacrifice another creature or artifact: ~ deals X damage to target opponent.",
    "",
    "",
  ],
  colors:         [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black, Color.Black | Color.Red, Color.Black],
  color_identity: [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black | Color.Red, Color.Black | Color.Red, Color.Black],
  type_lines:     [
    "Creature — Elf",
    "Instant",
    "Instant",
    "Artifact",
    "Creature — Lhurgoyf",
    "Instant",
    "Legendary Creature — Human Soldier",
    "Legendary Creature — Elf Noble",
    "Legendary Creature — Phyrexian Elf Noble",
    "Instant",
  ],
  powers:         [1, 0, 0, 0, 2, 0, 3, 4, 5, 0],   // indices into powerDict
  toughnesses:    [1, 0, 0, 0, 2, 0, 3, 3, 4, 0],   // indices into toughnessDict
  loyalties:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  defenses:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_legal: [
    Format.Commander | Format.Legacy,                   // #0 Birds
    Format.Commander | Format.Legacy | Format.Modern,   // #1 Bolt
    Format.Commander | Format.Legacy,                   // #2 Counterspell
    Format.Commander | Format.Vintage,                  // #3 Sol Ring
    Format.Commander | Format.Legacy | Format.Modern,   // #4 Tarmogoyf
    Format.Commander | Format.Pioneer,                  // #5 Azorius Charm
    Format.Commander | Format.Legacy | Format.Modern,   // #6 Thalia
    Format.Commander | Format.Legacy | Format.Modern,   // #7 Ayara front (card-level, duplicated)
    Format.Commander | Format.Legacy | Format.Modern,   // #8 Ayara back  (card-level, duplicated)
    Format.Commander | Format.Legacy | Format.Modern,   // #9 Dismember
  ],
  legalities_banned: [
    0, 0, 0,
    Format.Legacy,    // #3 Sol Ring
    0, 0, 0, 0, 0, 0,
  ],
  legalities_restricted: [
    0, 0, 0,
    Format.Vintage,   // #3 Sol Ring
    0, 0, 0, 0, 0, 0,
  ],
  card_index:     [0, 1, 2, 3, 4, 5, 6, 7, 7, 8],
  canonical_face: [0, 1, 2, 3, 4, 5, 6, 7, 7, 9],
  scryfall_ids:           ["", "", "", "", "", "", "", "", "", ""],
  art_crop_thumb_hashes:  ["", "", "", "", "", "", "", "", "", ""],
  card_thumb_hashes:      ["", "", "", "", "", "", "", "", "", ""],
  layouts:        ["normal", "normal", "normal", "normal", "normal", "normal", "normal", "transform", "transform", "normal"],
  flags:          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  power_lookup:    powerDict,
  toughness_lookup: toughnessDict,
  loyalty_lookup:  [""],
  defense_lookup:  [""],
};

export const index = new CardIndex(TEST_DATA);

export function matchCount(query: string): number {
  const cache = new NodeCache(index);
  return cache.evaluate(parse(query)).result.matchCount;
}
