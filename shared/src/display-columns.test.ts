// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { Color, Format } from "./bits";
import type { ColumnarData } from "./data";
import { extractDisplayColumns, buildKeywordsForFace } from "./display-columns";

describe("buildKeywordsForFace", () => {
  it("inverts keywords_index to per-face sorted lists by canonical row", () => {
    const data: ColumnarData = {
      names: ["A", "B"],
      mana_costs: ["", ""],
      oracle_texts: ["", ""],
      colors: [0, 0],
      color_identity: [0, 0],
      type_lines: ["", ""],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      card_index: [0, 1],
      canonical_face: [0, 1],
      scryfall_ids: ["", ""],
      layouts: ["normal", "normal"],
      flags: [0, 0],
      edhrec_ranks: [null, null],
      edhrec_salts: [null, null],
      power_lookup: [""],
      toughness_lookup: [""],
      loyalty_lookup: [""],
      defense_lookup: [""],
      keywords_index: {
        flying: [0],
        haste: [0, 1],
      },
      produces: {},
    };
    const kw = buildKeywordsForFace(data);
    expect(kw[0]).toEqual(["flying", "haste"]);
    expect(kw[1]).toEqual(["haste"]);
  });
});

describe("extractDisplayColumns", () => {
  it("includes colors and keywords_for_face", () => {
    const data: ColumnarData = {
      names: ["X"],
      mana_costs: [""],
      oracle_texts: [""],
      colors: [Color.Red],
      color_identity: [Color.Red],
      type_lines: ["Instant"],
      powers: [0],
      toughnesses: [0],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [Format.Commander],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
      scryfall_ids: [""],
      layouts: ["normal"],
      flags: [0],
      edhrec_ranks: [null],
      edhrec_salts: [null],
      power_lookup: [""],
      toughness_lookup: [""],
      loyalty_lookup: [""],
      defense_lookup: [""],
      keywords_index: { flying: [0] },
      produces: {},
    };
    const d = extractDisplayColumns(data);
    expect(d.colors[0]).toBe(Color.Red);
    expect(d.keywords_for_face[0]).toEqual(["flying"]);
    expect(d.is_commander[0]).toBe(false);
  });

  it("sets is_commander true for legendary creature face", () => {
    const data: ColumnarData = {
      names: ["Z"],
      mana_costs: [""],
      oracle_texts: [""],
      colors: [0],
      color_identity: [0],
      type_lines: ["Legendary Creature — Elf"],
      powers: [1],
      toughnesses: [1],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [0],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
      scryfall_ids: [""],
      layouts: ["normal"],
      flags: [0],
      edhrec_ranks: [null],
      edhrec_salts: [null],
      loyalty_lookup: [""],
      defense_lookup: [""],
      power_lookup: ["", "1"],
      toughness_lookup: ["", "1"],
      keywords_index: {},
      produces: {},
    };
    const d = extractDisplayColumns(data);
    expect(d.is_commander[0]).toBe(true);
  });
});
