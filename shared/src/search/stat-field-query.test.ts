// SPDX-License-Identifier: Apache-2.0
/**
 * Spec 173: power / toughness / loyalty / defense query semantics.
 */
import { describe, test, expect } from "vitest";
import { Color, Format } from "../bits";
import type { ColumnarData } from "../data";
import { CardIndex } from "./card-index";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";

const powerLookup = ["", "1", "1+*", "*", "10", "X"];
const toughnessLookup = ["", "1", "1+*", "*", "10", "11"];
const loyaltyLookup = ["", "X"];
const defenseLookup = [""];

/** Six faces: see table in tests. canonical_face[i] === i. */
function stat173Fixture(): ColumnarData {
  return {
    names: ["F0", "F1", "F2", "F3", "F4", "F5"],
    mana_costs: ["{R}", "{R}", "{R}", "{R}", "{R}", "{R}"],
    oracle_texts: ["", "", "", "", "", ""],
    colors: [Color.Red, Color.Red, Color.Red, Color.Red, Color.Red, Color.Red],
    color_identity: [Color.Red, Color.Red, Color.Red, Color.Red, Color.Red, Color.Red],
    type_lines: ["Instant", "Creature", "Creature", "Creature", "Creature", "Planeswalker"],
    powers: [0, 1, 2, 3, 4, 5],
    toughnesses: [0, 1, 2, 3, 4, 5],
    loyalties: [0, 0, 0, 0, 0, 1],
    defenses: [0, 0, 0, 0, 0, 0],
    legalities_legal: [Format.Commander, Format.Commander, Format.Commander, Format.Commander, Format.Commander, Format.Commander],
    legalities_banned: [0, 0, 0, 0, 0, 0],
    legalities_restricted: [0, 0, 0, 0, 0, 0],
    card_index: [0, 1, 2, 3, 4, 5],
    canonical_face: [0, 1, 2, 3, 4, 5],
    scryfall_ids: ["", "", "", "", "", ""],
    layouts: ["normal", "normal", "normal", "normal", "normal", "normal"],
    flags: [0, 0, 0, 0, 0, 0],
    edhrec_ranks: [null, null, null, null, null, null],
    edhrec_salts: [null, null, null, null, null, null],
    power_lookup: powerLookup,
    toughness_lookup: toughnessLookup,
    loyalty_lookup: loyaltyLookup,
    defense_lookup: defenseLookup,
    keywords_index: {},
    produces: {},
  };
}

// Face 0: pow/tou ""
// Face 1: pow "1", tou "1"
// Face 2: pow "1+*", tou "1+*"
// Face 3: pow "*", tou "*"
// Face 4: pow "10", tou "10"
// Face 5: pow "X", tou "11", loyalty "X"

function matchCount(q: string): number {
  const cache = new NodeCache(new CardIndex(stat173Fixture()));
  return cache.evaluate(parse(q)).result.matchCount;
}

function evalError(q: string): string | null {
  const cache = new NodeCache(new CardIndex(stat173Fixture()));
  const { result } = cache.evaluate(parse(q));
  return result.error ?? null;
}

describe("Spec 173 stat field queries", () => {
  test("range: numeric comparison works; non-plain value is leaf error", () => {
    expect(matchCount("pow>=10")).toBe(1);
    expect(matchCount("pow>2")).toBe(1);
    expect(evalError("pow>1+*")).toMatch(/invalid power value for comparison/);
    expect(evalError("pow>*")).toMatch(/invalid power value for comparison/);
    expect(evalError("pow>n")).toMatch(/invalid power value for comparison/);
    expect(evalError("pow>x")).toMatch(/invalid power value for comparison/);
    expect(evalError("pow>null")).toMatch(/null cannot be used with comparison operators/);
  });

  test("null and equatable-null on stats", () => {
    expect(matchCount("pow=null")).toBe(1);
    expect(matchCount("pow=n")).toBe(1);
    expect(matchCount("pow!=null")).toBe(5);
  });

  test("quoted null bypasses equatable-null (exact string)", () => {
    expect(matchCount('pow="null"')).toBe(0);
  });

  test("plain numeric : and = are numeric equality (Spec 034)", () => {
    expect(matchCount("tou:1")).toBe(2);
    expect(matchCount("tou=1")).toBe(2);
    expect(matchCount("tou:10")).toBe(1);
  });

  test("colon substring vs lone *", () => {
    expect(matchCount("tou:+*")).toBe(1);
    expect(matchCount("tou:*")).toBe(2);
  });

  test("quoted colon substring", () => {
    expect(matchCount('tou:"1"')).toBe(4);
    expect(matchCount('tou:"*"')).toBe(2);
  });

  test("equals exact bare and quoted", () => {
    expect(matchCount("tou=1+*")).toBe(1);
    expect(matchCount('tou="1"')).toBe(1);
    expect(matchCount('tou="1+*"')).toBe(1);
  });

  test("!= follows = semantics (numeric vs NOT exact)", () => {
    expect(matchCount("tou!=1")).toBe(3);
    expect(matchCount("tou!=1+*")).toBe(4);
    expect(matchCount('tou!="1"')).toBe(4);
  });

  test("loyalty ASCII case-fold: loy=x matches oracle X", () => {
    expect(matchCount("loy=x")).toBe(1);
    expect(matchCount('loy="x"')).toBe(1);
  });

  test("pow=x exact vs pow=0 numeric", () => {
    expect(matchCount("pow=x")).toBe(1);
    expect(matchCount("pow=X")).toBe(1);
    expect(matchCount("pow=0")).toBe(2);
  });
});
