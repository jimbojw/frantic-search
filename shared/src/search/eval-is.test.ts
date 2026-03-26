// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Format } from "../bits";
import type { ColumnarData } from "../data";

function minimalData(overrides: Partial<ColumnarData> & Pick<ColumnarData, "names">): ColumnarData {
  const n = overrides.names.length;
  const z = () => Array.from({ length: n }, () => 0);
  return {
    names: overrides.names,
    mana_costs: overrides.mana_costs ?? Array(n).fill(""),
    oracle_texts: overrides.oracle_texts ?? Array(n).fill(""),
    colors: overrides.colors ?? z(),
    color_identity: overrides.color_identity ?? z(),
    type_lines: overrides.type_lines ?? Array(n).fill("Legendary Creature — Test"),
    powers: overrides.powers ?? z(),
    toughnesses: overrides.toughnesses ?? z(),
    loyalties: overrides.loyalties ?? z(),
    defenses: overrides.defenses ?? z(),
    legalities_legal: overrides.legalities_legal ?? z(),
    legalities_banned: overrides.legalities_banned ?? z(),
    legalities_restricted: overrides.legalities_restricted ?? z(),
    card_index: overrides.card_index ?? Array.from({ length: n }, (_, i) => i),
    canonical_face: overrides.canonical_face ?? Array.from({ length: n }, (_, i) => i),
    scryfall_ids: overrides.scryfall_ids ?? Array(n).fill(""),
    layouts: overrides.layouts ?? Array(n).fill("normal"),
    flags: overrides.flags ?? z(),
    edhrec_ranks: overrides.edhrec_ranks ?? Array(n).fill(null),
    edhrec_salts: overrides.edhrec_salts ?? Array(n).fill(null),
    power_lookup: overrides.power_lookup ?? [""],
    toughness_lookup: overrides.toughness_lookup ?? [""],
    loyalty_lookup: overrides.loyalty_lookup ?? [""],
    defense_lookup: overrides.defense_lookup ?? [""],
    keywords_index: overrides.keywords_index ?? {},
    produces: overrides.produces ?? {},
  };
}

function matchCount(data: ColumnarData, query: string): number {
  const cache = new NodeCache(new CardIndex(data));
  return cache.evaluate(parse(query)).result.matchCount;
}

describe("evalIsKeyword partner superset", () => {
  test("is:partner matches face in keywords_index partner", () => {
    const data = minimalData({
      names: ["Kw Partner"],
      keywords_index: { partner: [0] },
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });

  test("is:partner matches keywords_index partner with", () => {
    const data = minimalData({
      names: ["Partner With Front"],
      keywords_index: { "partner with x": [0] },
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });

  test("is:partner still matches commander-banned card with partner keyword", () => {
    const data = minimalData({
      names: ["Unfinity Partner"],
      keywords_index: { partner: [0] },
      legalities_banned: [Format.Commander],
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });

  test("is:partner does not match saga type line even with partner keyword", () => {
    const data = minimalData({
      names: ["Saga With Partner Kw"],
      type_lines: ["Enchantment — Saga"],
      keywords_index: { partner: [0] },
    });
    expect(matchCount(data, "is:partner")).toBe(0);
  });

  test("is:partner does not match non-legendary creature with partner keyword (Battlebond-style)", () => {
    const data = minimalData({
      names: ["Lore Weaver"],
      type_lines: ["Creature — Human Wizard"],
      keywords_index: { partner: [0], "partner with ley weaver": [0] },
    });
    expect(matchCount(data, "is:partner")).toBe(0);
  });

  test("is:partner matches Background type without Partner keyword", () => {
    const data = minimalData({
      names: ["Dungeon Delver"],
      type_lines: ["Legendary Enchantment — Background"],
      oracle_texts: ['Commander creatures you own have "rooms".'],
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });

  test("is:partner matches choose a background template", () => {
    const data = minimalData({
      names: ["Jaheira"],
      type_lines: ["Legendary Creature — Elf Druid"],
      oracle_texts: ["Tokens you have.\nChoose a Background (You can have a Background as a second commander.)"],
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });

  test("is:partner matches Time Lord Doctor without Partner in keywords", () => {
    const data = minimalData({
      names: ["The Eighth Doctor"],
      type_lines: ["Legendary Creature — Time Lord Doctor"],
      oracle_texts: ["When The Eighth Doctor enters, mill three."],
    });
    expect(matchCount(data, "is:partner")).toBe(1);
  });
});
