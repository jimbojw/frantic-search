// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import type { ColumnarData } from "../data";
import { CardIndex } from "./card-index";

function makeData(overrides: Partial<ColumnarData> = {}): ColumnarData {
  const defaults: ColumnarData = {
    names: [],
    mana_costs: [],
    oracle_texts: [],
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
    layouts: [],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
  };
  return { ...defaults, ...overrides };
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
