// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evaluate } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, Format } from "../bits";
import type { ColumnarData } from "../data";

// ---------------------------------------------------------------------------
// Synthetic card pool (7 cards)
// ---------------------------------------------------------------------------
// #0  Birds of Paradise  | G       | Creature          | pow=0 | "Flying, {T}: Add one mana of any color."
// #1  Lightning Bolt     | R       | Instant           | -     | "Lightning Bolt deals 3 damage to any target."
// #2  Counterspell       | U       | Instant           | -     | "Counter target spell."
// #3  Sol Ring           | (none)  | Artifact          | -     | "{T}: Add {C}{C}."
// #4  Tarmogoyf          | G       | Creature          | pow=* | "Tarmogoyf's power is equal to..."
// #5  Azorius Charm      | WU      | Instant           | -     | "Choose one —"
// #6  Thalia, Guardian   | W       | Legendary Creature| pow=2 | "First strike. Noncreature spells cost {1} more to cast."

const powerDict = ["", "0", "*", "2"];
const toughnessDict = ["", "1", "1+*", "3"];

const TEST_DATA: ColumnarData = {
  names:          ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben"],
  mana_costs:     ["{G}", "{R}", "{U}{U}", "{1}", "{1}{G}", "{W}{U}", "{1}{W}"],
  oracle_texts:   [
    "Flying\n{T}: Add one mana of any color.",
    "Lightning Bolt deals 3 damage to any target.",
    "Counter target spell.",
    "{T}: Add {C}{C}.",
    "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "Choose one —",
    "First strike\nNoncreature spells cost {1} more to cast.",
  ],
  colors:         [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White],
  color_identity: [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White],
  type_lines:     [
    "Creature — Elf",
    "Instant",
    "Instant",
    "Artifact",
    "Creature — Lhurgoyf",
    "Instant",
    "Legendary Creature — Human Soldier",
  ],
  powers:         [1, 0, 0, 0, 2, 0, 3],   // indices into powerDict
  toughnesses:    [1, 0, 0, 0, 2, 0, 3],   // indices into toughnessDict
  loyalties:      [0, 0, 0, 0, 0, 0, 0],
  defenses:       [0, 0, 0, 0, 0, 0, 0],
  legalities_legal: [
    Format.Commander | Format.Legacy,                   // #0 Birds: legal in commander + legacy
    Format.Commander | Format.Legacy | Format.Modern,   // #1 Bolt: legal in commander + legacy + modern
    Format.Commander | Format.Legacy,                   // #2 Counterspell: legal in commander + legacy
    Format.Commander | Format.Vintage,                  // #3 Sol Ring: legal in commander + vintage (banned in legacy, restricted in vintage handled below)
    Format.Commander | Format.Legacy | Format.Modern,   // #4 Tarmogoyf: legal in commander + legacy + modern
    Format.Commander | Format.Pioneer,                  // #5 Azorius Charm: legal in commander + pioneer
    Format.Commander | Format.Legacy | Format.Modern,   // #6 Thalia: legal in commander + legacy + modern
  ],
  legalities_banned: [
    0,                // #0
    0,                // #1
    0,                // #2
    Format.Legacy,    // #3 Sol Ring: banned in legacy
    0,                // #4
    0,                // #5
    0,                // #6
  ],
  legalities_restricted: [
    0,                // #0
    0,                // #1
    0,                // #2
    Format.Vintage,   // #3 Sol Ring: restricted in vintage
    0,                // #4
    0,                // #5
    0,                // #6
  ],
  power_lookup:    powerDict,
  toughness_lookup: toughnessDict,
  loyalty_lookup:  [""],
  defense_lookup:  [""],
};

const index = new CardIndex(TEST_DATA);

function matchCount(query: string): number {
  return evaluate(parse(query), index).result.matchCount;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluate", () => {
  test("bare word matches name substring", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("birds")).toBe(1);
    expect(matchCount("nonexistent")).toBe(0);
  });

  test("bare word is case-insensitive", () => {
    expect(matchCount("BOLT")).toBe(1);
    expect(matchCount("Birds")).toBe(1);
  });

  test("name field substring", () => {
    expect(matchCount("name:bolt")).toBe(1);
    expect(matchCount("n:thalia")).toBe(1);
  });

  test("oracle text field substring", () => {
    expect(matchCount("o:flying")).toBe(1);           // Birds
    expect(matchCount("o:damage")).toBe(1);            // Bolt
    expect(matchCount("o:target")).toBe(2);            // Bolt + Counterspell
  });

  test("color field with : (superset)", () => {
    expect(matchCount("c:g")).toBe(2);                 // Birds + Tarmogoyf
    expect(matchCount("c:r")).toBe(1);                 // Bolt
    expect(matchCount("c:wu")).toBe(1);                // Azorius Charm
    expect(matchCount("c:w")).toBe(2);                 // Azorius Charm + Thalia
  });

  test("color field with = (exact)", () => {
    expect(matchCount("c=wu")).toBe(1);                // Azorius Charm only
    expect(matchCount("c=w")).toBe(1);                 // Thalia only
    expect(matchCount("c=g")).toBe(2);                 // Birds + Tarmogoyf
  });

  test("type field matches card types", () => {
    expect(matchCount("t:creature")).toBe(3);          // Birds + Tarmogoyf + Thalia
    expect(matchCount("t:instant")).toBe(3);           // Bolt + Counterspell + Azorius Charm
    expect(matchCount("t:artifact")).toBe(1);          // Sol Ring
  });

  test("type field matches supertypes", () => {
    expect(matchCount("t:legendary")).toBe(1);         // Thalia
  });

  test("type field matches subtypes", () => {
    expect(matchCount("t:elf")).toBe(1);               // Birds
    expect(matchCount("t:human")).toBe(1);             // Thalia
  });

  test("type field matches partial words", () => {
    expect(matchCount("t:legend")).toBe(1);            // Thalia ("Legendary" contains "legend")
  });

  test("type field with quoted multi-word matches type_line substring", () => {
    expect(matchCount('t:"legendary creature"')).toBe(1); // Thalia
  });

  test("power field numeric comparison", () => {
    expect(matchCount("pow=0")).toBe(1);               // Birds (power "0")
    expect(matchCount("pow=2")).toBe(1);               // Thalia (power "2")
    expect(matchCount("pow>=2")).toBe(1);              // Thalia
    expect(matchCount("pow<2")).toBe(1);               // Birds
  });

  test("mana cost substring", () => {
    expect(matchCount("m:{G}")).toBe(2);               // Birds + Tarmogoyf
    expect(matchCount("m:{R}")).toBe(1);               // Bolt
  });

  test("exact name with !", () => {
    expect(matchCount('!"Lightning Bolt"')).toBe(1);
    expect(matchCount("!bolt")).toBe(0);               // "bolt" != "Lightning Bolt"
  });

  test("implicit AND", () => {
    expect(matchCount("c:g t:creature")).toBe(2);      // Birds + Tarmogoyf
    expect(matchCount("c:w t:creature")).toBe(1);      // Thalia only
  });

  test("explicit OR", () => {
    expect(matchCount("c:r OR c:u")).toBe(3);          // Bolt + Counterspell + Azorius Charm
  });

  test("negation with -", () => {
    expect(matchCount("-t:creature")).toBe(4);          // Bolt + Counterspell + Sol Ring + Azorius Charm
    expect(matchCount("t:creature -c:w")).toBe(2);     // Birds + Tarmogoyf
  });

  test("parenthesized group", () => {
    expect(matchCount("(c:r OR c:u) t:instant")).toBe(3); // Bolt + Counterspell + Azorius Charm
  });

  test("unknown field matches zero cards", () => {
    expect(matchCount("rarity:common")).toBe(0);
  });

  test("empty value matches all cards", () => {
    expect(matchCount("c:")).toBe(7);
  });

  test("empty input matches all cards", () => {
    expect(matchCount("")).toBe(7);
  });

  test("result tree has children with matchCounts", () => {
    const { result } = evaluate(parse("c:g t:creature"), index);
    expect(result.matchCount).toBe(2);
    expect(result.children).toHaveLength(2);
    expect(result.children![0].matchCount).toBe(2);   // c:g -> Birds + Tarmogoyf
    expect(result.children![1].matchCount).toBe(3);   // t:creature -> Birds + Tarmogoyf + Thalia
  });

  test("matchingIndices contains indices of matching cards", () => {
    const { matchingIndices } = evaluate(parse("c:g t:creature"), index);
    expect(matchingIndices).toEqual([0, 4]);           // Birds (#0) + Tarmogoyf (#4)
  });

  test("matchingIndices for single match", () => {
    const { matchingIndices } = evaluate(parse('!"Lightning Bolt"'), index);
    expect(matchingIndices).toEqual([1]);
  });

  test("matchingIndices empty when no matches", () => {
    const { matchingIndices } = evaluate(parse("rarity:common"), index);
    expect(matchingIndices).toEqual([]);
  });

  test("legal:commander matches all cards legal in commander", () => {
    expect(matchCount("legal:commander")).toBe(7);
  });

  test("legal:legacy matches cards legal in legacy", () => {
    expect(matchCount("legal:legacy")).toBe(5);        // Birds, Bolt, Counterspell, Tarmogoyf, Thalia
  });

  test("f: alias works for legal:", () => {
    expect(matchCount("f:modern")).toBe(3);            // Bolt, Tarmogoyf, Thalia
  });

  test("banned:legacy matches cards banned in legacy", () => {
    expect(matchCount("banned:legacy")).toBe(1);       // Sol Ring
  });

  test("restricted:vintage matches cards restricted in vintage", () => {
    expect(matchCount("restricted:vintage")).toBe(1);  // Sol Ring
  });

  test("legal + type combo", () => {
    expect(matchCount("legal:legacy t:creature")).toBe(3); // Birds, Tarmogoyf, Thalia
  });

  test("unknown format matches zero", () => {
    expect(matchCount("legal:fakefmt")).toBe(0);
  });

  test("regex on oracle text", () => {
    expect(matchCount("o:/damage/")).toBe(1);          // Bolt
    expect(matchCount("o:/target/")).toBe(2);          // Bolt + Counterspell
  });

  test("regex on type line", () => {
    expect(matchCount("t:/legendary.*elf/")).toBe(0);  // no legendary elves in pool
    expect(matchCount("t:/legendary.*human/")).toBe(1); // Thalia
    expect(matchCount("t:/creature/")).toBe(3);
  });

  test("regex on name", () => {
    expect(matchCount("name:/^birds/")).toBe(1);       // Birds of Paradise
    expect(matchCount("name:/bolt$/")).toBe(1);        // Lightning Bolt
  });

  test("regex with invalid pattern matches zero", () => {
    expect(matchCount("o:/[invalid/")).toBe(0);
  });

  test("regex on unsupported field matches zero", () => {
    expect(matchCount("pow:/3/")).toBe(0);
  });
});
