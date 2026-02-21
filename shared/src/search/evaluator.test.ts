// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evaluate } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, Format } from "../bits";
import type { ColumnarData } from "../data";

// ---------------------------------------------------------------------------
// Synthetic card pool (8 cards = 9 face rows)
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
//
// Ayara is a transform DFC: rows 7+8 share canonical_face=7.

const powerDict = ["", "0", "*", "2", "3", "4"];
const toughnessDict = ["", "1", "1+*", "3", "4"];

const TEST_DATA: ColumnarData = {
  names:          ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm", "Ayara, Furnace Queen"],
  mana_costs:     ["{G}", "{R}", "{U}{U}", "{1}", "{1}{G}", "{W}{U}", "{1}{W}", "{1}{B}{B}", ""],
  oracle_texts:   [
    "Flying\n{T}: Add one mana of any color.",
    "Lightning Bolt deals 3 damage to any target.",
    "Counter target spell.",
    "{T}: Add {C}{C}.",
    "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "Choose one —",
    "First strike\nNoncreature spells cost {1} more to cast.",
    "{T}, Sacrifice another creature or artifact: Ayara deals X damage to target opponent.",
    "At the beginning of combat on your turn, return up to one target artifact or creature card from your graveyard to the battlefield.",
  ],
  colors:         [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black, Color.Black | Color.Red],
  color_identity: [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black | Color.Red, Color.Black | Color.Red],
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
  ],
  powers:         [1, 0, 0, 0, 2, 0, 3, 4, 5],   // indices into powerDict
  toughnesses:    [1, 0, 0, 0, 2, 0, 3, 3, 4],   // indices into toughnessDict
  loyalties:      [0, 0, 0, 0, 0, 0, 0, 0, 0],
  defenses:       [0, 0, 0, 0, 0, 0, 0, 0, 0],
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
  ],
  legalities_banned: [
    0, 0, 0,
    Format.Legacy,    // #3 Sol Ring
    0, 0, 0, 0, 0,
  ],
  legalities_restricted: [
    0, 0, 0,
    Format.Vintage,   // #3 Sol Ring
    0, 0, 0, 0, 0,
  ],
  card_index:     [0, 1, 2, 3, 4, 5, 6, 7, 7],
  canonical_face: [0, 1, 2, 3, 4, 5, 6, 7, 7],
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
    expect(matchCount("o:damage")).toBe(2);            // Bolt + Ayara front ("deals X damage")
    expect(matchCount("o:target")).toBe(4);            // Bolt + Counterspell + Ayara front + Ayara back
  });

  test("color field with : (superset)", () => {
    expect(matchCount("c:g")).toBe(2);                 // Birds + Tarmogoyf
    expect(matchCount("c:r")).toBe(2);                 // Bolt + Ayara back (BR)
    expect(matchCount("c:wu")).toBe(1);                // Azorius Charm
    expect(matchCount("c:w")).toBe(2);                 // Azorius Charm + Thalia
  });

  test("color field with = (exact)", () => {
    expect(matchCount("c=wu")).toBe(1);                // Azorius Charm only
    expect(matchCount("c=w")).toBe(1);                 // Thalia only
    expect(matchCount("c=g")).toBe(2);                 // Birds + Tarmogoyf
  });

  test("type field matches card types", () => {
    expect(matchCount("t:creature")).toBe(5);          // Birds + Tarmogoyf + Thalia + Ayara front + Ayara back
    expect(matchCount("t:instant")).toBe(3);           // Bolt + Counterspell + Azorius Charm
    expect(matchCount("t:artifact")).toBe(1);          // Sol Ring
  });

  test("type field matches supertypes", () => {
    expect(matchCount("t:legendary")).toBe(3);         // Thalia + Ayara front + Ayara back
  });

  test("type field matches subtypes", () => {
    expect(matchCount("t:elf")).toBe(3);               // Birds + Ayara front + Ayara back
    expect(matchCount("t:human")).toBe(1);             // Thalia
  });

  test("type field matches partial words", () => {
    expect(matchCount("t:legend")).toBe(3);            // Thalia + Ayara front + Ayara back
  });

  test("type field with quoted multi-word matches type_line substring", () => {
    expect(matchCount('t:"legendary creature"')).toBe(3); // Thalia + Ayara front + Ayara back
  });

  test("power field numeric comparison", () => {
    expect(matchCount("pow=0")).toBe(1);               // Birds (power "0")
    expect(matchCount("pow=2")).toBe(1);               // Thalia (power "2")
    expect(matchCount("pow>=2")).toBe(3);              // Thalia + Ayara front (3) + Ayara back (4)
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
    expect(matchCount("c:r OR c:u")).toBe(4);          // Bolt + Counterspell + Azorius Charm + Ayara back (BR)
  });

  test("negation with -", () => {
    expect(matchCount("-t:creature")).toBe(4);          // Bolt + Counterspell + Sol Ring + Azorius Charm
    expect(matchCount("t:creature -c:w")).toBe(4);     // Birds + Tarmogoyf + Ayara front (B) + Ayara back (BR)
  });

  test("parenthesized group", () => {
    expect(matchCount("(c:r OR c:u) t:instant")).toBe(3); // Bolt + Counterspell + Azorius Charm
  });

  test("unknown field matches zero cards", () => {
    expect(matchCount("rarity:common")).toBe(0);
  });

  test("empty value matches all face rows", () => {
    expect(matchCount("c:")).toBe(9);
  });

  test("empty input matches all face rows", () => {
    expect(matchCount("")).toBe(9);
  });

  test("result tree has children with matchCounts", () => {
    const { result } = evaluate(parse("c:g t:creature"), index);
    expect(result.matchCount).toBe(2);
    expect(result.children).toHaveLength(2);
    expect(result.children![0].matchCount).toBe(2);   // c:g -> Birds + Tarmogoyf
    expect(result.children![1].matchCount).toBe(5);   // t:creature -> Birds + Tarmogoyf + Thalia + Ayara front + back
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

  test("legal:commander matches all face rows legal in commander", () => {
    expect(matchCount("legal:commander")).toBe(9);
  });

  test("legal:legacy matches face rows legal in legacy", () => {
    expect(matchCount("legal:legacy")).toBe(7);        // Birds, Bolt, Counterspell, Tarmogoyf, Thalia, Ayara front, Ayara back
  });

  test("f: alias works for legal:", () => {
    expect(matchCount("f:modern")).toBe(5);            // Bolt, Tarmogoyf, Thalia, Ayara front, Ayara back
  });

  test("banned:legacy matches cards banned in legacy", () => {
    expect(matchCount("banned:legacy")).toBe(1);       // Sol Ring
  });

  test("restricted:vintage matches cards restricted in vintage", () => {
    expect(matchCount("restricted:vintage")).toBe(1);  // Sol Ring
  });

  test("legal + type combo", () => {
    expect(matchCount("legal:legacy t:creature")).toBe(5); // Birds, Tarmogoyf, Thalia, Ayara front, Ayara back
  });

  test("unknown format matches zero", () => {
    expect(matchCount("legal:fakefmt")).toBe(0);
  });

  test("regex on oracle text", () => {
    expect(matchCount("o:/damage/")).toBe(2);          // Bolt + Ayara front
    expect(matchCount("o:/target/")).toBe(4);          // Bolt + Counterspell + Ayara front + Ayara back
  });

  test("regex on type line", () => {
    expect(matchCount("t:/legendary.*elf/")).toBe(2);  // Ayara front + Ayara back
    expect(matchCount("t:/legendary.*human/")).toBe(1); // Thalia
    expect(matchCount("t:/creature/")).toBe(5);
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

  // -------------------------------------------------------------------------
  // Multi-face card (DFC) tests
  // -------------------------------------------------------------------------

  test("query matching only back face returns a face-level match", () => {
    expect(matchCount("t:phyrexian")).toBe(1);          // Ayara back face only
  });

  test("back face match appears in matchingIndices", () => {
    const { matchingIndices } = evaluate(parse("t:phyrexian"), index);
    expect(matchingIndices).toEqual([8]);               // back face row index
  });

  test("deduplicateMatches collapses back face to canonical (front) face", () => {
    const { matchingIndices } = evaluate(parse("t:phyrexian"), index);
    const deduped = index.deduplicateMatches(matchingIndices);
    expect(deduped).toEqual([7]);                       // canonical face = Ayara front
  });

  test("query matching both faces deduplicates to one result", () => {
    const { matchingIndices } = evaluate(parse("t:elf t:legendary"), index);
    expect(matchingIndices).toEqual([7, 8]);            // both Ayara faces match
    const deduped = index.deduplicateMatches(matchingIndices);
    expect(deduped).toEqual([7]);                       // single card result
  });

  test("cross-face condition produces no match (per-face semantics)", () => {
    expect(matchCount("pow>=4 tou<=2")).toBe(0);        // Ayara back has pow=4 but tou=4, front has pow=3 tou=3
  });

  test("DFC face-specific color match", () => {
    expect(matchCount("c:r t:elf")).toBe(1);            // Ayara back face is BR + Elf
    const { matchingIndices } = evaluate(parse("c:r t:elf"), index);
    expect(matchingIndices).toEqual([8]);               // back face only
  });

  test("identity is card-level and matches on both faces", () => {
    expect(matchCount("id:br t:elf")).toBe(2);          // both Ayara faces have identity BR and type Elf
  });
});
