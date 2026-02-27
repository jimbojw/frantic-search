// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, CardFlag } from "../bits";
import type { ColumnarData } from "../data";
import { index } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Extended card pool for is: operator (Spec 032 / 040)
// ---------------------------------------------------------------------------
//
// Row #0  Birds of Paradise       | G  | Creature — Elf                          | pow=0  | normal
// Row #1  Lightning Bolt          | R  | Instant                                 | -      | normal
// Row #2  Counterspell            | U  | Instant                                 | -      | normal
// Row #3  Sol Ring                | -  | Artifact                                | -      | normal
// Row #4  Tarmogoyf               | G  | Creature — Lhurgoyf                     | pow=*  | normal
// Row #5  Azorius Charm           | WU | Instant                                 | -      | normal
// Row #6  Thalia, Guardian        | W  | Legendary Creature — Human Soldier      | pow=2  | normal
// Row #7  Ayara, Widow (front)    | B  | Legendary Creature — Elf Noble          | pow=3  | transform
// Row #8  Ayara, Furnace (back)   | BR | Legendary Creature — Phyrexian Elf Noble| pow=4  | transform
// Row #9  Dismember               | B  | Instant                                 | -      | normal
// --- new rows ---
// Row #10 Grizzly Bears           | G  | Creature — Bear                         | pow=2 tou=2 cmc=2 | normal
// Row #11 Runeclaw Bear           | G  | Creature — Bear                         | pow=2 tou=2 cmc=2 | normal  (vanilla)
// Row #12 Slippery Bogle          | GU | Creature — Beast                        | pow=1 tou=1 cmc=1 | normal  (french vanilla: hexproof)
// Row #13 Rograkh (front)         | R  | Legendary Creature — Kobold Warrior     | pow=0 tou=1 cmc=0 | normal  (partner)
// Row #14 Halana and Alena        | RG | Legendary Creature — Human Ranger       | pow=2 tou=3 cmc=4 | normal  (companion-like text: "can be your commander")
// Row #15 Lurrus (companion)      | WB | Legendary Creature — Cat Nightmare      | pow=3 tou=2 cmc=3 | normal  (companion)
// Row #16 Murderous Rider (front) | B  | Creature — Zombie Knight                | pow=2 tou=3 cmc=3 | adventure
// Row #17 Swift End (back)        | B  | Instant — Adventure                     | -      cmc=3      | adventure
// Row #18 Nicol Bolas (front)     | UBR| Legendary Planeswalker — Bolas          | -      cmc=4      | modal_dfc
// Row #19 Nicol Bolas (back)      | UBR| Legendary Creature — Elder Dragon       | -      cmc=7      | modal_dfc
// Row #20 Urza's Saga             | -  | Enchantment — Urza's Saga               | -      cmc=0      | saga
// Row #21 Delver of Secrets (f)   | U  | Creature — Human Wizard                 | pow=1 tou=1 cmc=1 | transform
// Row #22 Insectile Aberration (b)| U  | Creature — Human Insect                 | pow=3 tou=2 cmc=0 | transform
// Row #23 Gisela (meld front)     | W  | Legendary Creature — Angel Horror       | pow=4 tou=3 cmc=4 | meld
// Row #24 Stoneforge Mystic       | W  | Creature — Kor Artificer                | pow=1 tou=2 cmc=2 | normal  (french vanilla: NO — has non-keyword text)
// Row #25 Akroma, Angel of Wrath  | W  | Legendary Creature — Angel              | pow=6 tou=6 cmc=8 | normal  (french vanilla: flying, first strike, vigilance, trample, haste, protection from black and from red)
// Row #26 Incubation // Incongruity| GU | Sorcery // Instant                     | -      cmc=1      | split
// --- flags + land cycle rows ---
// Row #27 Underground Sea          | -  | Land — Island Swamp                     | -      cmc=0      | normal  flags=Reserved
// Row #28 Steamflogger Boss        | R  | Creature — Goblin Rigger                | pow=3 tou=3 cmc=4 | normal  flags=Funny
// Row #29 Gandalf the Grey         | -  | Legendary Creature — Avatar Wizard      | pow=3 tou=4 cmc=5 | normal  flags=UniversesBeyond
// Row #30 Steam Vents              | -  | Land — Island Mountain                  | -      cmc=0      | normal  (shockland)
// Row #31 Scalding Tarn            | -  | Land                                    | -      cmc=0      | normal  (fetchland)
// --- Spec 040: extended is: keywords ---
// Row #32 Temple of Triumph        | -  | Land                                    | -      cmc=0      | normal  (scryland)
// Row #33 Irrigated Farmland       | -  | Land — Plains Island                    | -      cmc=0      | normal  (bikeland)
// Row #34 Indatha Triome           | -  | Land — Plains Swamp Forest              | -      cmc=0      | normal  (triome)
// Row #35 Hybrid-Phyrexian Test    | GW | Creature — Elf                          | pow=2 tou=2 cmc=2 | normal  (mana: {1}{G/W/P})
// Row #36 Blinding Souleater       | -  | Artifact Creature — Cleric              | pow=1 tou=3 cmc=3 | normal  (oracle has {W/P} — Phyrexian in text only)
// Row #37 Oracle Hybrid Test       | -  | Creature — Elf                          | pow=1 tou=1 cmc=1 | normal  (oracle has {G/U} — hybrid in text only)

const isExtPowerDict = ["", "0", "*", "2", "3", "4", "1", "6"];
const isExtToughnessDict = ["", "1", "1+*", "3", "4", "2", "6"];

const IS_TEST_DATA: ColumnarData = {
  names: [
    "Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf",
    "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm", "Ayara, Furnace Queen", "Dismember",
    "Grizzly Bears", "Runeclaw Bear", "Slippery Bogle", "Rograkh, Son of Rohgahh",
    "Halana and Alena, Partners", "Lurrus of the Dream-Den",
    "Murderous Rider", "Swift End",
    "Nicol Bolas, Dragon-God", "Nicol Bolas, the Arisen",
    "Urza's Saga",
    "Delver of Secrets", "Insectile Aberration",
    "Gisela, the Broken Blade",
    "Stoneforge Mystic",
    "Akroma, Angel of Wrath",
    "Incubation // Incongruity",
    "Underground Sea", "Steamflogger Boss", "Gandalf the Grey",
    "Steam Vents", "Scalding Tarn",
    "Temple of Triumph", "Irrigated Farmland", "Indatha Triome", "Hybrid-Phyrexian Test",
    "Blinding Souleater", "Oracle Hybrid Test",
  ],
  combined_names: [
    "Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf",
    "Azorius Charm", "Thalia, Guardian of Thraben",
    "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Ayara, Widow of the Realm // Ayara, Furnace Queen",
    "Dismember",
    "Grizzly Bears", "Runeclaw Bear", "Slippery Bogle", "Rograkh, Son of Rohgahh",
    "Halana and Alena, Partners", "Lurrus of the Dream-Den",
    "Murderous Rider // Swift End", "Murderous Rider // Swift End",
    "Nicol Bolas, Dragon-God // Nicol Bolas, the Arisen", "Nicol Bolas, Dragon-God // Nicol Bolas, the Arisen",
    "Urza's Saga",
    "Delver of Secrets // Insectile Aberration", "Delver of Secrets // Insectile Aberration",
    "Gisela, the Broken Blade",
    "Stoneforge Mystic",
    "Akroma, Angel of Wrath",
    "Incubation // Incongruity",
    "Underground Sea", "Steamflogger Boss", "Gandalf the Grey",
    "Steam Vents", "Scalding Tarn",
    "Temple of Triumph", "Irrigated Farmland", "Indatha Triome", "Hybrid-Phyrexian Test",
    "Blinding Souleater", "Oracle Hybrid Test",
  ],
  mana_costs: [
    "{G}", "{R}", "{U}{U}", "{1}", "{1}{G}",
    "{W}{U}", "{1}{W}", "{1}{B}{B}", "", "{1}{B/P}{B/P}",
    "{1}{G}", "{1}{G}", "{G}{U}", "{0}",
    "{2}{R}{G}", "{1}{W}{B}",
    "{1}{B}{B}", "{2}{B}",
    "{1}{U}{B}{R}", "{4}{U}{B}{R}",
    "",
    "{U}", "",
    "{2}{W}{W}",
    "{1}{W}",
    "{5}{W}{W}{W}",
    "{G/U}",
    "", "{2}{R}{R}", "{3}{U}{U}",
    "", "",
    "", "", "", "{1}{G/W/P}",
    "{3}", "{G}",
  ],
  oracle_texts: [
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
    "Grizzly Bears can't block alone.",
    "",
    "Hexproof (This creature can't be the target of spells or abilities your opponents control.)",
    "First strike, trample\nPartner",
    "Halana and Alena, Partners can be your commander.",
    "Companion — Each permanent card in your starting deck has mana value 2 or less.\nLifelink",
    "Lifelink",
    "Destroy target creature or planeswalker. You lose 2 life.",
    "+1: You draw a card. Target opponent discards a card.",
    "",
    "{T}: Add {C}.",
    "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
    "Flying",
    "Flying, first strike, lifelink",
    "When Stoneforge Mystic enters the battlefield, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{W}, {T}: You may put an Equipment card from your hand onto the battlefield.",
    "Flying, first strike, vigilance, trample, haste, protection from black and from red",
    "Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.",
    "{T}: Add {U} or {B}.",
    "Steamflogger Boss gets +1/+0 for each other Rigger you control.\nOther Rigger creatures you control have haste.\nIf a Rigger you control would assemble a Contraption, it assembles two Contraptions instead.",
    "Gandalf the Grey enters with three loyalty counters.",
    "As Steam Vents enters the battlefield, you may pay 2 life. If you don't, it enters the battlefield tapped.\n{T}: Add {U} or {R}.",
    "{T}, Pay 1 life, Sacrifice Scalding Tarn: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle.",
    "{T}: Add {R} or {W}.",
    "Cycling {2}\n{T}: Add {W} or {U}.",
    "Cycling {3}\n{T}: Add {W}, {B}, or {G}.",
    "",
    "{W/P}, {T}: Tap target creature.",
    "{G/U}: This creature gets +1/+1 until end of turn.",
  ],
  oracle_texts_tilde: [
    "Flying (~ can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "~ deals 3 damage to any target.",
    "", "", "",
    "", "", "", "", "",
    "~ can't block alone.",
    "",
    "Hexproof (~ can't be the target of spells or abilities your opponents control.)",
    "",
    "~ can be your commander.",
    "",
    "", "", "", "", "",
    "", "",
    "",
    "",
    "",
    "",
    "", "", "",
    "", "",
    "{T}: Add {R} or {W}.",
    "Cycling {2}",
    "{T}: Add {W}, {B}, or {G}.",
    "",
    "", "",
  ],
  colors: [
    Color.Green, Color.Red, Color.Blue, 0, Color.Green,
    Color.White | Color.Blue, Color.White, Color.Black, Color.Black | Color.Red, Color.Black,
    Color.Green, Color.Green, Color.Green | Color.Blue, Color.Red,
    Color.Red | Color.Green, Color.White | Color.Black,
    Color.Black, Color.Black,
    Color.Blue | Color.Black | Color.Red, Color.Blue | Color.Black | Color.Red,
    0,
    Color.Blue, Color.Blue,
    Color.White,
    Color.White,
    Color.White,
    Color.Green | Color.Blue,
    0, Color.Red, 0,
    0, 0,
    0, 0, 0, Color.Green | Color.White,
    0, Color.Green,
  ],
  color_identity: [
    Color.Green, Color.Red, Color.Blue, 0, Color.Green,
    Color.White | Color.Blue, Color.White, Color.Black | Color.Red, Color.Black | Color.Red, Color.Black,
    Color.Green, Color.Green, Color.Green | Color.Blue, Color.Red,
    Color.Red | Color.Green, Color.White | Color.Black,
    Color.Black, Color.Black,
    Color.Blue | Color.Black | Color.Red, Color.Blue | Color.Black | Color.Red,
    0,
    Color.Blue, Color.Blue,
    Color.White,
    Color.White,
    Color.White,
    Color.Green | Color.Blue,
    0, Color.Red, 0,
    0, 0,
    0, 0, 0, Color.Green | Color.White,
    0, Color.Green,
  ],
  type_lines: [
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
    "Creature — Bear",
    "Creature — Bear",
    "Creature — Beast",
    "Legendary Creature — Kobold Warrior",
    "Legendary Creature — Human Ranger",
    "Legendary Creature — Cat Nightmare",
    "Creature — Zombie Knight",
    "Instant — Adventure",
    "Legendary Planeswalker — Bolas",
    "Legendary Creature — Elder Dragon",
    "Enchantment — Urza's Saga",
    "Creature — Human Wizard",
    "Creature — Human Insect",
    "Legendary Creature — Angel Horror",
    "Creature — Kor Artificer",
    "Legendary Creature — Angel",
    "Sorcery",
    "Land — Island Swamp",
    "Creature — Goblin Rigger",
    "Legendary Creature — Avatar Wizard",
    "Land — Island Mountain",
    "Land",
    "Land",
    "Land — Plains Island",
    "Land — Plains Swamp Forest",
    "Creature — Elf",
    "Artifact Creature — Cleric",
    "Creature — Elf",
  ],
  //                              0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37
  powers:      /* dict idx */   [ 1, 0, 0, 0, 2, 0, 3, 4, 5, 0, 3, 3, 6, 1, 3, 4, 3, 0, 0, 0, 0, 6, 4, 5, 6, 7, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 6, 6],
  toughnesses: /* dict idx */   [ 1, 0, 0, 0, 2, 0, 1, 3, 4, 0, 5, 5, 1, 1, 3, 5, 3, 0, 0, 0, 0, 1, 5, 3, 5, 6, 0, 0, 3, 4, 0, 0, 0, 0, 0, 5, 3, 1],
  loyalties:                    [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  defenses:                     [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_legal:             [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_banned:            [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_restricted:        [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  card_index:     [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  canonical_face: [0, 1, 2, 3, 4, 5, 6, 7, 7, 9, 10, 11, 12, 13, 14, 15, 16, 16, 18, 18, 20, 21, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
  scryfall_ids:          Array(38).fill(""),
  art_crop_thumb_hashes: Array(38).fill(""),
  card_thumb_hashes:     Array(38).fill(""),
  layouts: [
    "normal", "normal", "normal", "normal", "normal",
    "normal", "normal", "transform", "transform", "normal",
    "normal", "normal", "normal", "normal",
    "normal", "normal",
    "adventure", "adventure",
    "modal_dfc", "modal_dfc",
    "saga",
    "transform", "transform",
    "meld",
    "normal",
    "normal",
    "split",
    "normal", "normal", "normal",
    "normal", "normal",
    "normal", "normal", "normal", "normal",
    "normal", "normal",
  ],
  flags: [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0,
    0, 0,
    0, 0,
    0,
    0, 0,
    0,
    0,
    0,
    0,
    CardFlag.Reserved, CardFlag.Funny, CardFlag.UniversesBeyond,
    0, 0,
    0, 0, 0, 0,
    0, 0,
  ],
  power_lookup: isExtPowerDict,
  toughness_lookup: isExtToughnessDict,
  loyalty_lookup: [""],
  defense_lookup: [""],
};

const isIndex = new CardIndex(IS_TEST_DATA);

function isMatchCount(query: string): number {
  const cache = new NodeCache(isIndex);
  return cache.evaluate(parse(query)).result.matchCount;
}

function isMatchIndices(query: string): number[] {
  const cache = new NodeCache(isIndex);
  return Array.from(cache.evaluate(parse(query)).indices);
}

describe("is: operator", () => {
  // --- Type/supertype checks ---

  test("is:permanent matches creatures, artifacts, enchantments, planeswalkers, lands", () => {
    const indices = isMatchIndices("is:permanent");
    expect(indices).not.toContain(1);  // Lightning Bolt (Instant)
    expect(indices).not.toContain(2);  // Counterspell (Instant)
    expect(indices).not.toContain(5);  // Azorius Charm (Instant)
    expect(indices).not.toContain(9);  // Dismember (Instant)
    expect(indices).not.toContain(26); // Incubation (Sorcery)
    expect(indices).toContain(0);  // Birds (Creature)
    expect(indices).toContain(3);  // Sol Ring (Artifact)
    expect(indices).toContain(16); // Murderous Rider (Creature face of adventure card — card is permanent)
    expect(indices).toContain(18); // Nicol Bolas (Planeswalker)
    expect(indices).toContain(20); // Urza's Saga (Enchantment)
    expect(indices).toContain(27); // Underground Sea (Land)
    expect(indices).toContain(30); // Steam Vents (Land)
  });

  test("is:spell matches non-land cards", () => {
    expect(isMatchCount("is:spell")).toBe(28);
  });

  test("is:historic matches artifacts, legendaries, and sagas", () => {
    const indices = isMatchIndices("is:historic");
    expect(indices).toContain(3);  // Sol Ring (Artifact)
    expect(indices).toContain(6);  // Thalia (Legendary)
    expect(indices).toContain(7);  // Ayara (Legendary)
    expect(indices).toContain(18); // Nicol Bolas (Legendary)
    expect(indices).toContain(20); // Urza's Saga
    expect(indices).toContain(23); // Gisela (Legendary)
    expect(indices).toContain(25); // Akroma (Legendary)
    expect(indices).not.toContain(1);  // Lightning Bolt
    expect(indices).not.toContain(10); // Grizzly Bears
  });

  test("is:party matches cleric, rogue, warrior, wizard subtypes", () => {
    const indices = isMatchIndices("is:party");
    expect(indices).toContain(13); // Rograkh (Warrior)
    expect(indices).toContain(21); // Delver (Wizard)
    expect(indices).not.toContain(0);  // Birds (Elf)
    expect(indices).not.toContain(10); // Grizzly Bears (Bear)
  });

  test("is:outlaw matches assassin, mercenary, pirate, rogue, warlock subtypes", () => {
    expect(isMatchCount("is:outlaw")).toBe(0);
  });

  // --- Layout checks ---

  test("is:transform matches transform layout", () => {
    const indices = isMatchIndices("is:transform");
    expect(indices).toContain(7);  // Ayara
    expect(indices).toContain(21); // Delver
    expect(indices).not.toContain(18); // Nicol Bolas (modal_dfc)
    expect(isMatchCount("is:transform")).toBe(2);
  });

  test("is:modal and is:mdfc match modal_dfc layout", () => {
    expect(isMatchCount("is:modal")).toBe(1);   // Nicol Bolas
    expect(isMatchCount("is:mdfc")).toBe(1);
    expect(isMatchIndices("is:modal")).toEqual(isMatchIndices("is:mdfc"));
  });

  test("is:dfc matches transform, modal_dfc, and meld", () => {
    const indices = isMatchIndices("is:dfc");
    expect(indices).toContain(7);  // Ayara (transform)
    expect(indices).toContain(21); // Delver (transform)
    expect(indices).toContain(18); // Nicol Bolas (modal_dfc)
    expect(indices).toContain(23); // Gisela (meld)
    expect(indices).not.toContain(16); // Murderous Rider (adventure)
    expect(indices).not.toContain(26); // Incubation (split)
  });

  test("is:meld matches meld layout", () => {
    const indices = isMatchIndices("is:meld");
    expect(indices).toEqual([23]); // Gisela
  });

  test("is:adventure matches adventure layout", () => {
    const indices = isMatchIndices("is:adventure");
    expect(indices).toContain(16); // Murderous Rider (canonical face)
    expect(isMatchCount("is:adventure")).toBe(1);
  });

  test("is:split matches split layout", () => {
    const indices = isMatchIndices("is:split");
    expect(indices).toEqual([26]); // Incubation // Incongruity
  });

  test("is:leveler matches leveler layout (none in pool)", () => {
    expect(isMatchCount("is:leveler")).toBe(0);
  });

  test("is:flip matches flip layout (none in pool)", () => {
    expect(isMatchCount("is:flip")).toBe(0);
  });

  // --- Oracle text checks ---

  test("is:vanilla matches cards with empty oracle text", () => {
    const indices = isMatchIndices("is:vanilla");
    expect(indices).toContain(11);
    expect(indices).toContain(18);
    expect(indices).not.toContain(10); // Grizzly Bears has non-empty text
  });

  test("is:commander matches legendary creatures and planeswalkers", () => {
    const indices = isMatchIndices("is:commander");
    expect(indices).toContain(6);  // Thalia (Legendary Creature)
    expect(indices).toContain(7);  // Ayara (Legendary Creature)
    expect(indices).toContain(13); // Rograkh (Legendary Creature)
    expect(indices).toContain(14); // Halana and Alena — has "can be your commander"
    expect(indices).toContain(15); // Lurrus (Legendary Creature)
    expect(indices).toContain(18); // Nicol Bolas (Legendary Planeswalker / Legendary Creature)
    expect(indices).toContain(23); // Gisela (Legendary Creature)
    expect(indices).toContain(25); // Akroma (Legendary Creature)
    expect(indices).not.toContain(0);  // Birds (non-legendary creature)
    expect(indices).not.toContain(3);  // Sol Ring (Artifact, not legendary creature)
  });

  test("is:brawler is an alias for is:commander", () => {
    expect(isMatchIndices("is:brawler")).toEqual(isMatchIndices("is:commander"));
  });

  test("is:companion matches cards with Companion keyword", () => {
    const indices = isMatchIndices("is:companion");
    expect(indices).toContain(15); // Lurrus
    expect(indices).not.toContain(6);  // Thalia
    expect(isMatchCount("is:companion")).toBe(1);
  });

  test("is:partner matches cards with Partner keyword", () => {
    const indices = isMatchIndices("is:partner");
    expect(indices).toContain(13); // Rograkh (has "Partner" as keyword line)
    expect(indices).not.toContain(14); // Halana — name contains "Partners" but no Partner keyword
    expect(isMatchCount("is:partner")).toBe(1);
  });

  // --- Stat checks ---

  test("is:bear matches 2/2 creatures with cmc 2", () => {
    const indices = isMatchIndices("is:bear");
    expect(indices).toContain(10); // Grizzly Bears: Creature, pow=2, tou=2, cmc=2
    expect(indices).toContain(11); // Runeclaw Bear: Creature, pow=2, tou=2, cmc=2
    expect(indices).toContain(35); // Hybrid-Phyrexian Test: Creature, pow=2, tou=2, cmc=2
    expect(indices).not.toContain(6);  // Thalia: pow=2, tou=1 (not 2/2)
    expect(indices).not.toContain(24); // Stoneforge: pow=1, tou=2 (not 2/2)
    expect(isMatchCount("is:bear")).toBe(3);
  });

  // --- French vanilla ---

  test("is:frenchvanilla matches creatures with only keyword abilities", () => {
    const indices = isMatchIndices("is:frenchvanilla");
    expect(indices).toContain(12); // Slippery Bogle: "Hexproof" (after reminder strip)
    expect(indices).toContain(16); // Murderous Rider: "Lifelink"
    expect(indices).toContain(21); // Delver (via Insectile Aberration back face: "Flying")
    expect(indices).toContain(23); // Gisela: "Flying, first strike, lifelink"
    expect(indices).toContain(25); // Akroma: "Flying, first strike, vigilance, trample, haste, protection from black and from red"
    expect(indices).not.toContain(11); // Runeclaw Bear: empty text (that's vanilla, not french vanilla)
    expect(indices).not.toContain(24); // Stoneforge: has non-keyword text
    expect(indices).not.toContain(6);  // Thalia: "First strike\nNoncreature spells cost {1} more to cast." — second line is not a keyword
  });

  test("is:frenchvanilla does not match non-creatures", () => {
    const indices = isMatchIndices("is:frenchvanilla");
    expect(indices).not.toContain(3);  // Sol Ring (Artifact)
    expect(indices).not.toContain(1);  // Lightning Bolt (Instant)
  });

  // --- Edge cases ---

  test("unknown is: value produces error", () => {
    const cache = new NodeCache(index);
    const nonsense = cache.evaluate(parse("is:nonsense")).result;
    expect(nonsense.error).toBe('unknown keyword "nonsense"');
    expect(nonsense.matchCount).toBe(-1);

    const cache2 = new NodeCache(index);
    const foil = cache2.evaluate(parse("is:foil")).result;
    expect(foil.error).toBe("printing data not loaded");
    expect(foil.matchCount).toBe(-1);
  });

  test("is: with comparison operators matches zero cards", () => {
    expect(isMatchCount("is>spell")).toBe(0);
    expect(isMatchCount("is<commander")).toBe(0);
    expect(isMatchCount("is>=vanilla")).toBe(0);
    expect(isMatchCount("is!=bear")).toBe(0);
  });

  test("is= works same as is:", () => {
    expect(isMatchCount("is=spell")).toBe(isMatchCount("is:spell"));
    expect(isMatchCount("is=commander")).toBe(isMatchCount("is:commander"));
  });

  test("negation -is:spell works", () => {
    expect(isMatchCount("-is:spell")).toBe(6);
  });

  test("negation -is:permanent excludes permanents", () => {
    const indices = isMatchIndices("-is:permanent");
    expect(indices).toContain(1);  // Lightning Bolt
    expect(indices).toContain(2);  // Counterspell
    expect(indices).toContain(26); // Incubation (Sorcery)
    expect(indices).not.toContain(0);  // Birds (Creature)
    expect(indices).not.toContain(3);  // Sol Ring (Artifact)
  });

  test("is:commander combined with color filter", () => {
    const indices = isMatchIndices("is:commander c:w");
    expect(indices).toContain(6);  // Thalia
    expect(indices).toContain(23); // Gisela
    expect(indices).toContain(25); // Akroma
    expect(indices).not.toContain(7); // Ayara (black, not white)
  });

  test("is:bear combined with color filter", () => {
    expect(isMatchCount("is:bear c:g")).toBe(3); // Grizzly Bears, Runeclaw Bear, Hybrid-Phyrexian Test
    expect(isMatchCount("is:bear c:r")).toBe(0);
  });

  test("is: is case-insensitive on the value", () => {
    expect(isMatchCount("is:Spell")).toBe(isMatchCount("is:spell"));
    expect(isMatchCount("is:COMMANDER")).toBe(isMatchCount("is:commander"));
    expect(isMatchCount("is:Transform")).toBe(isMatchCount("is:transform"));
  });

  test("layout keywords produce one result per DFC card", () => {
    const indices = isMatchIndices("is:transform");
    expect(indices).toContain(7);  // Ayara (canonical face)
    expect(indices).toContain(21); // Delver (canonical face)
    expect(indices).not.toContain(8);  // back face never in results
    expect(indices).not.toContain(22); // back face never in results
  });

  // --- Flag checks ---

  test("is:reserved matches cards with Reserved flag", () => {
    const indices = isMatchIndices("is:reserved");
    expect(indices).toEqual([27]); // Underground Sea
  });

  test("is:funny matches cards with Funny flag", () => {
    const indices = isMatchIndices("is:funny");
    expect(indices).toEqual([28]); // Steamflogger Boss
  });

  test("is:universesbeyond matches cards with UniversesBeyond flag", () => {
    const indices = isMatchIndices("is:universesbeyond");
    expect(indices).toEqual([29]); // Gandalf the Grey
  });

  test("-is:funny excludes funny cards", () => {
    const indices = isMatchIndices("-is:funny");
    expect(indices).not.toContain(28);
    expect(indices).toContain(0); // Birds
    expect(indices.length).toBe(33); // 34 total cards - 1 funny
  });

  // --- Land cycle checks ---

  test("is:shockland matches Steam Vents", () => {
    const indices = isMatchIndices("is:shockland");
    expect(indices).toEqual([30]); // Steam Vents
  });

  test("is:fetchland matches Scalding Tarn", () => {
    const indices = isMatchIndices("is:fetchland");
    expect(indices).toEqual([31]); // Scalding Tarn
  });

  test("is:dual matches Underground Sea", () => {
    const indices = isMatchIndices("is:dual");
    expect(indices).toEqual([27]); // Underground Sea
  });

  test("is:checkland matches nothing in pool (no checklands present)", () => {
    expect(isMatchCount("is:checkland")).toBe(0);
  });

  test("is:fastland matches nothing in pool", () => {
    expect(isMatchCount("is:fastland")).toBe(0);
  });

  test("is:painland matches nothing in pool", () => {
    expect(isMatchCount("is:painland")).toBe(0);
  });

  test("is:slowland matches nothing in pool", () => {
    expect(isMatchCount("is:slowland")).toBe(0);
  });

  test("is:bounceland matches nothing in pool", () => {
    expect(isMatchCount("is:bounceland")).toBe(0);
  });

  test("land cycle combined with is:reserved", () => {
    expect(isMatchCount("is:dual is:reserved")).toBe(1);
  });

  // --- Extended land cycles (Spec 040) ---

  test("is:scryland matches Temple of Triumph", () => {
    expect(isMatchIndices("is:scryland")).toEqual([32]);
  });

  test("is:bikeland matches Irrigated Farmland", () => {
    expect(isMatchIndices("is:bikeland")).toEqual([33]);
  });

  test("is:cycleland is an alias for is:bikeland", () => {
    expect(isMatchIndices("is:cycleland")).toEqual(isMatchIndices("is:bikeland"));
  });

  test("is:bicycleland is an alias for is:bikeland", () => {
    expect(isMatchIndices("is:bicycleland")).toEqual(isMatchIndices("is:bikeland"));
  });

  test("is:triome matches Indatha Triome", () => {
    expect(isMatchIndices("is:triome")).toEqual([34]);
  });

  test("is:tricycleland is an alias for is:triome", () => {
    expect(isMatchIndices("is:tricycleland")).toEqual(isMatchIndices("is:triome"));
  });

  test("is:trikeland is an alias for is:triome", () => {
    expect(isMatchIndices("is:trikeland")).toEqual(isMatchIndices("is:triome"));
  });

  test("is:karoo is an alias for is:bounceland", () => {
    expect(isMatchCount("is:karoo")).toBe(isMatchCount("is:bounceland"));
  });

  // --- is:hybrid and is:phyrexian (Spec 040) ---

  test("is:hybrid checks mana cost only, not oracle text", () => {
    const indices = isMatchIndices("is:hybrid");
    expect(indices).toContain(26); // Incubation {G/U} in mana cost
    expect(indices).toContain(35); // Hybrid-Phyrexian Test {1}{G/W/P} in mana cost
    expect(indices).not.toContain(37); // Oracle Hybrid Test — {G/U} in oracle text only (not matched)
    expect(indices).not.toContain(9);  // Dismember {1}{B/P}{B/P} — Phyrexian only
    expect(indices).not.toContain(36); // Blinding Souleater — Phyrexian only in oracle
    expect(indices).not.toContain(1);  // Lightning Bolt {R} — no hybrid
  });

  test("is:phyrexian matches cards with Phyrexian mana in cost or oracle text", () => {
    const indices = isMatchIndices("is:phyrexian");
    expect(indices).toContain(9);  // Dismember {1}{B/P}{B/P} in mana cost
    expect(indices).toContain(35); // Hybrid-Phyrexian Test {1}{G/W/P} in mana cost
    expect(indices).toContain(36); // Blinding Souleater — {W/P} in oracle text only
    expect(indices).not.toContain(26); // Incubation {G/U} — hybrid only
    expect(indices).not.toContain(37); // Oracle Hybrid Test — hybrid only in oracle
    expect(indices).not.toContain(1);  // Lightning Bolt {R} — no Phyrexian
  });

  test("hybrid-phyrexian card matches both is:hybrid and is:phyrexian", () => {
    const hybridIndices = isMatchIndices("is:hybrid");
    const phyrexianIndices = isMatchIndices("is:phyrexian");
    expect(hybridIndices).toContain(35);
    expect(phyrexianIndices).toContain(35);
  });

  test("-is:hybrid excludes hybrid cards", () => {
    const indices = isMatchIndices("-is:hybrid");
    expect(indices).not.toContain(26);
    expect(indices).not.toContain(35);
    expect(indices).toContain(37); // Oracle-only hybrid is NOT excluded (not matched by is:hybrid)
    expect(indices).toContain(1);
  });
});
