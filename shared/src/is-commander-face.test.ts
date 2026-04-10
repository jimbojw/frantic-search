// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { Format } from "./bits";
import { faceRowMatchesIsCommander, faceRowMatchesIsCommanderFields, COMMANDER_EXCEPTION_NAMES } from "./is-commander-face";
import type { ColumnarData } from "./data";

const emptyKeywordsProduces: ColumnarData["keywords_index"] = {};
const emptyProduces: ColumnarData["produces"] = {};

function minimalColumnar(overrides: Partial<ColumnarData> & Pick<ColumnarData, "names">): ColumnarData {
  const { names, ...restOverrides } = overrides;
  const len = names.length;
  const base: ColumnarData = {
    names,
    mana_costs: Array(len).fill(""),
    oracle_texts: Array(len).fill(""),
    colors: Array(len).fill(0),
    color_identity: Array(len).fill(0),
    type_lines: Array(len).fill(""),
    powers: Array(len).fill(0),
    toughnesses: Array(len).fill(0),
    loyalties: Array(len).fill(0),
    defenses: Array(len).fill(0),
    legalities_legal: Array(len).fill(0),
    legalities_banned: Array(len).fill(0),
    legalities_restricted: Array(len).fill(0),
    card_index: Array.from({ length: len }, (_, i) => i),
    canonical_face: Array.from({ length: len }, (_, i) => i),
    scryfall_ids: Array(len).fill(""),
    layouts: Array(len).fill("normal"),
    flags: Array(len).fill(0),
    edhrec_ranks: Array(len).fill(null),
    edhrec_salts: Array(len).fill(null),
    power_lookup: [""],
    toughness_lookup: [""],
    loyalty_lookup: [""],
    defense_lookup: [""],
    keywords_index: emptyKeywordsProduces,
    produces: emptyProduces,
    ...restOverrides,
  };
  return base;
}

describe("faceRowMatchesIsCommander", () => {
  test("legendary vehicle without printed P/T does not match", () => {
    const data = minimalColumnar({
      names: ["Skysovereign"],
      type_lines: ["Legendary Vehicle"],
      layouts: ["normal"],
      powers: [0],
      toughnesses: [0],
      power_lookup: [""],
      toughness_lookup: [""],
    });
    expect(faceRowMatchesIsCommander(data, 0)).toBe(false);
  });

  test("legendary vehicle with printed P/T matches", () => {
    const data = minimalColumnar({
      names: ["Smuggler's Copter"],
      type_lines: ["Legendary Vehicle"],
      powers: [1],
      toughnesses: [1],
      power_lookup: ["", "3"],
      toughness_lookup: ["", "3"],
    });
    expect(faceRowMatchesIsCommander(data, 0)).toBe(true);
  });

  test("commander-banned face does not match", () => {
    const data = minimalColumnar({
      names: ["Banned Legend"],
      type_lines: ["Legendary Creature — Human"],
      legalities_banned: [Format.Commander],
    });
    expect(faceRowMatchesIsCommander(data, 0)).toBe(false);
  });

  test("Grist exception name matches without legendary creature type line", () => {
    const data = minimalColumnar({
      names: ["Grist, the Hunger Tide"],
      type_lines: ["Legendary Planeswalker — Grist"],
      oracle_texts: ["As long as Grist is not on the battlefield, it is a 1/1 Insect creature."],
    });
    expect(faceRowMatchesIsCommander(data, 0)).toBe(true);
  });

  test("COMMANDER_EXCEPTION_NAMES contains Grist", () => {
    expect(COMMANDER_EXCEPTION_NAMES.has("grist, the hunger tide")).toBe(true);
  });
});

describe("faceRowMatchesIsCommanderFields", () => {
  test("matches when oracle has spell commander phrase", () => {
    expect(
      faceRowMatchesIsCommanderFields({
        layout: "normal",
        flags: 0,
        typeLineLower: "sorcery",
        oracleTextLower: "spell commander (this card can be your commander.)\nfoo",
        nameLower: "ransack",
        powerIndex: 0,
        toughnessIndex: 0,
        powerLookup: [""],
        toughnessLookup: [""],
        canonicalFaceForRow: 0,
        faceRowIndex: 0,
        legalitiesBannedAtCanonical: 0,
      }),
    ).toBe(true);
  });
});
