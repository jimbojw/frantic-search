// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import type { ColumnarData } from "../data";
import { CardIndex } from "./card-index";

function makeData(overrides: Partial<ColumnarData> = {}): ColumnarData {
  const merged = {
    names: [],
    mana_costs: [],
    oracle_texts: [],
    art_crop_thumb_hashes: [],
    card_thumb_hashes: [],
    colors: [],
    color_identity: [],
    type_lines: [],
    powers: [],
    toughnesses: [],
    loyalties: [],
    defenses: [],
    legalities_legal: [],
    legalities_banned: [],
    legalities_restricted: [],
    card_index: [],
    canonical_face: [],
    scryfall_ids: [],
    oracle_ids: [],
    layouts: [],
    flags: [],
    edhrec_ranks: [] as (number | null)[],
    edhrec_salts: [] as (number | null)[],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
    keywords_index: {},
    produces: {},
    ...overrides,
  };
  const len = merged.names.length;
  if (merged.edhrec_ranks.length !== len) {
    merged.edhrec_ranks = Array.from({ length: len }, () => null);
  }
  if (merged.edhrec_salts.length !== len) {
    merged.edhrec_salts = Array.from({ length: len }, () => null);
  }
  return merged;
}

describe("CardIndex.facesOf", () => {
  it("returns a single-element array for a single-faced card", () => {
    const data = makeData({
      names: ["Lightning Bolt"],
      mana_costs: ["{R}"],
      oracle_texts: ["Deal 3 damage."],
      colors: [0],
      color_identity: [0],
      type_lines: ["Instant"],
      powers: [0],
      toughnesses: [0],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [0],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
    });

    const index = new CardIndex(data);
    expect(index.facesOf(0)).toEqual([0]);
  });

  it("returns all face indices for a multi-faced card", () => {
    const data = makeData({
      names: ["Beck", "Call"],
      mana_costs: ["{G}{U}", "{4}{W}{U}"],
      oracle_texts: ["Draw a card.", "Create tokens."],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Instant", "Instant"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 0],
      canonical_face: [0, 0],
    });

    const index = new CardIndex(data);
    expect(index.facesOf(0)).toEqual([0, 1]);
  });

  it("keeps cards separate when multiple cards are present", () => {
    const data = makeData({
      names: ["Beck", "Call", "Lightning Bolt"],
      mana_costs: ["{G}{U}", "{4}{W}{U}", "{R}"],
      oracle_texts: ["Draw.", "Tokens.", "Damage."],
      colors: [0, 0, 0],
      color_identity: [0, 0, 0],
      type_lines: ["Instant", "Instant", "Instant"],
      powers: [0, 0, 0],
      toughnesses: [0, 0, 0],
      loyalties: [0, 0, 0],
      defenses: [0, 0, 0],
      legalities_legal: [0, 0, 0],
      legalities_banned: [0, 0, 0],
      legalities_restricted: [0, 0, 0],
      card_index: [0, 0, 1],
      canonical_face: [0, 0, 2],
    });

    const index = new CardIndex(data);
    expect(index.facesOf(0)).toEqual([0, 1]);
    expect(index.facesOf(2)).toEqual([2]);
  });

  it("single-face card: combinedNamesLower equals namesLower", () => {
    const data = makeData({
      names: ["Lightning Bolt"],
      mana_costs: ["{R}"],
      oracle_texts: [""],
      colors: [0],
      color_identity: [0],
      type_lines: ["Instant"],
      powers: [0],
      toughnesses: [0],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [0],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
    });
    const index = new CardIndex(data);
    expect(index.combinedNamesLower[0]).toBe(index.namesLower[0]);
  });

  it("multi-face card: combinedNamesLower is the combined name for all faces", () => {
    const data = makeData({
      names: ["Beck", "Call"],
      mana_costs: ["{G}{U}", "{4}{W}{U}"],
      oracle_texts: ["Draw.", "Tokens."],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Instant", "Instant"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 0],
      canonical_face: [0, 0],
    });
    const index = new CardIndex(data);
    expect(index.combinedNamesLower[0]).toBe("beck // call");
    expect(index.combinedNamesLower[1]).toBe("beck // call");
  });

  it("combinedNamesNormalized strips non-alphanumeric characters", () => {
    const data = makeData({
      names: ["Beck", "Call"],
      mana_costs: ["{G}{U}", "{4}{W}{U}"],
      oracle_texts: ["Draw.", "Tokens."],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Instant", "Instant"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 0],
      canonical_face: [0, 0],
    });
    const index = new CardIndex(data);
    expect(index.combinedNamesNormalized[0]).toBe("beckcall");
    expect(index.combinedNamesNormalized[1]).toBe("beckcall");
  });

  it("returns an empty array for a non-canonical face index", () => {
    const data = makeData({
      names: ["Beck", "Call"],
      mana_costs: ["{G}{U}", "{4}{W}{U}"],
      oracle_texts: ["Draw.", "Tokens."],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Instant", "Instant"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 0],
      canonical_face: [0, 0],
    });

    const index = new CardIndex(data);
    expect(index.facesOf(1)).toEqual([]);
  });
});

describe("CardIndex.edhrecSalt", () => {
  it("populates edhrecSalt and sortedSaltIndices when edhrec_salts is provided", () => {
    const data = makeData({
      names: ["A", "B", "C"],
      mana_costs: ["{1}", "{2}", "{3}"],
      oracle_texts: ["", "", ""],
      colors: [0, 0, 0],
      color_identity: [0, 0, 0],
      type_lines: ["Creature", "Creature", "Creature"],
      powers: [0, 0, 0],
      toughnesses: [0, 0, 0],
      loyalties: [0, 0, 0],
      defenses: [0, 0, 0],
      legalities_legal: [0, 0, 0],
      legalities_banned: [0, 0, 0],
      legalities_restricted: [0, 0, 0],
      card_index: [0, 1, 2],
      canonical_face: [0, 1, 2],
      edhrec_salts: [10, 50, 30],
    });
    const index = new CardIndex(data);
    expect(index.edhrecSalt).toEqual([10, 50, 30]);
    expect(index.sortedSaltCount).toBe(3);
    // Ascending: face 0 (10), face 2 (30), face 1 (50)
    expect(Array.from(index.sortedSaltIndices)).toEqual([0, 2, 1]);
  });

  it("handles all-null edhrec_salts with sortedSaltCount 0", () => {
    const data = makeData({
      names: ["A", "B"],
      mana_costs: ["{1}", "{2}"],
      oracle_texts: ["", ""],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Creature", "Creature"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 1],
      canonical_face: [0, 1],
      edhrec_salts: [null, null],
    });
    const index = new CardIndex(data);
    expect(index.edhrecSalt).toEqual([null, null]);
    expect(index.sortedSaltCount).toBe(0);
    expect(index.sortedSaltIndices.length).toBe(0);
  });
});

describe("CardIndex.producesData and producesMasks", () => {
  it("materializes producesData and producesMasks from inverted index", () => {
    const data = makeData({
      names: ["Beck", "Call", "Lightning Bolt"],
      mana_costs: ["{G}{U}", "{4}{W}{U}", "{R}"],
      oracle_texts: ["Draw.", "Tokens.", "Damage."],
      colors: [0, 0, 0],
      color_identity: [0, 0, 0],
      type_lines: ["Instant", "Instant", "Instant"],
      powers: [0, 0, 0],
      toughnesses: [0, 0, 0],
      loyalties: [0, 0, 0],
      defenses: [0, 0, 0],
      legalities_legal: [0, 0, 0],
      legalities_banned: [0, 0, 0],
      legalities_restricted: [0, 0, 0],
      card_index: [0, 0, 1],
      canonical_face: [0, 0, 2],
      produces: { W: [0], U: [2] },
    });
    const index = new CardIndex(data);
    expect(index.producesMasks).toEqual({ U: 1, W: 2 });
    expect(index.producesData[0]).toBe(2);
    expect(index.producesData[1]).toBe(2);
    expect(index.producesData[2]).toBe(1);
  });

  it("fans out multi-face cards: both faces get the produces bit", () => {
    const data = makeData({
      names: ["Beck", "Call"],
      mana_costs: ["{G}{U}", "{4}{W}{U}"],
      oracle_texts: ["Draw.", "Tokens."],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Instant", "Instant"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 0],
      canonical_face: [0, 0],
      produces: { W: [0] },
    });
    const index = new CardIndex(data);
    expect(index.producesMasks).toEqual({ W: 1 });
    expect(index.producesData[0]).toBe(1);
    expect(index.producesData[1]).toBe(1);
  });

  it("handles empty produces with zeroed producesData", () => {
    const data = makeData({
      names: ["A"],
      mana_costs: ["{1}"],
      oracle_texts: [""],
      colors: [0],
      color_identity: [0],
      type_lines: ["Creature"],
      powers: [0],
      toughnesses: [0],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [0],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
      produces: {},
    });
    const index = new CardIndex(data);
    expect(index.producesMasks).toEqual({});
    expect(index.producesData[0]).toBe(0);
  });
});

describe("CardIndex.typeLineWords", () => {
  it("collects unique words from type lines, lowercased", () => {
    const data = makeData({
      names: ["Elf Noble", "Goblin"],
      mana_costs: ["{G}", "{R}"],
      oracle_texts: ["", ""],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["Legendary Creature — Elf Noble", "Creature — Goblin Warrior"],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 1],
      canonical_face: [0, 1],
    });
    const index = new CardIndex(data);
    expect(index.typeLineWords.has("elf")).toBe(true);
    expect(index.typeLineWords.has("creature")).toBe(true);
    expect(index.typeLineWords.has("noble")).toBe(true);
    expect(index.typeLineWords.has("goblin")).toBe(true);
    expect(index.typeLineWords.has("warrior")).toBe(true);
    expect(index.typeLineWords.has("legendary")).toBe(true);
  });
});
