// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parseManaSymbols, manaContains } from "./mana";

describe("parseManaSymbols", () => {
  test("empty string produces empty map", () => {
    expect(parseManaSymbols("")).toEqual({});
  });

  test("single bare letter", () => {
    expect(parseManaSymbols("r")).toEqual({ r: 1 });
  });

  test("single braced letter", () => {
    expect(parseManaSymbols("{r}")).toEqual({ r: 1 });
    expect(parseManaSymbols("{R}")).toEqual({ r: 1 });
  });

  test("multiple bare letters", () => {
    expect(parseManaSymbols("rr")).toEqual({ r: 2 });
  });

  test("multiple braced letters", () => {
    expect(parseManaSymbols("{R}{R}")).toEqual({ r: 2 });
  });

  test("mixed bare and braced", () => {
    expect(parseManaSymbols("r{r}")).toEqual({ r: 2 });
    expect(parseManaSymbols("{r}r")).toEqual({ r: 2 });
    expect(parseManaSymbols("r{r}r")).toEqual({ r: 3 });
    expect(parseManaSymbols("{r}r{r}")).toEqual({ r: 3 });
  });

  test("braced integer adds numeric value to generic", () => {
    expect(parseManaSymbols("{1}")).toEqual({ generic: 1 });
    expect(parseManaSymbols("{2}")).toEqual({ generic: 2 });
    expect(parseManaSymbols("{10}")).toEqual({ generic: 10 });
  });

  test("bare digits add numeric value to generic", () => {
    expect(parseManaSymbols("2")).toEqual({ generic: 2 });
    expect(parseManaSymbols("12")).toEqual({ generic: 12 });
  });

  test("bare digits combined with bare letters", () => {
    expect(parseManaSymbols("2rr")).toEqual({ generic: 2, r: 2 });
    expect(parseManaSymbols("12rr")).toEqual({ generic: 12, r: 2 });
  });

  test("full card mana cost strings", () => {
    expect(parseManaSymbols("{2}{R}{R}")).toEqual({ generic: 2, r: 2 });
    expect(parseManaSymbols("{1}{G}")).toEqual({ generic: 1, g: 1 });
    expect(parseManaSymbols("{W}{U}")).toEqual({ w: 1, u: 1 });
  });

  test("multiple distinct colors", () => {
    expect(parseManaSymbols("wu")).toEqual({ w: 1, u: 1 });
    expect(parseManaSymbols("{W}{U}{B}")).toEqual({ w: 1, u: 1, b: 1 });
  });

  test("hybrid symbols are atomic", () => {
    expect(parseManaSymbols("{2/W}")).toEqual({ "2/w": 1 });
    expect(parseManaSymbols("{2/W}{2/W}")).toEqual({ "2/w": 2 });
  });

  test("phyrexian symbols are atomic", () => {
    expect(parseManaSymbols("{B/P}")).toEqual({ "b/p": 1 });
    expect(parseManaSymbols("{1}{B/P}{B/P}")).toEqual({ generic: 1, "b/p": 2 });
  });

  test("X is a regular symbol", () => {
    expect(parseManaSymbols("{X}")).toEqual({ x: 1 });
    expect(parseManaSymbols("{X}{X}{R}")).toEqual({ x: 2, r: 1 });
  });

  test("colorless (C) and snow (S) are regular symbols", () => {
    expect(parseManaSymbols("{C}")).toEqual({ c: 1 });
    expect(parseManaSymbols("{S}{S}")).toEqual({ s: 2 });
  });

  test("case-insensitive: uppercase input lowercased in output", () => {
    expect(parseManaSymbols("{R}")).toEqual({ r: 1 });
    expect(parseManaSymbols("R")).toEqual({ r: 1 });
    expect(parseManaSymbols("{B/P}")).toEqual({ "b/p": 1 });
  });

  test("unclosed brace treats remaining as bare", () => {
    expect(parseManaSymbols("{r")).toEqual({ r: 1 });
  });

  test("{0} contributes zero generic (empty map)", () => {
    expect(parseManaSymbols("{0}")).toEqual({});
  });
});

describe("manaContains", () => {
  test("empty query matches any card", () => {
    expect(manaContains({ r: 1 }, {})).toBe(true);
    expect(manaContains({}, {})).toBe(true);
  });

  test("non-empty query does not match empty card", () => {
    expect(manaContains({}, { r: 1 })).toBe(false);
  });

  test("exact match", () => {
    expect(manaContains({ r: 2 }, { r: 2 })).toBe(true);
  });

  test("card has more than query (superset)", () => {
    expect(manaContains({ generic: 2, r: 2 }, { r: 2 })).toBe(true);
    expect(manaContains({ generic: 2, r: 2 }, { generic: 1, r: 2 })).toBe(true);
  });

  test("card has less than query (not enough)", () => {
    expect(manaContains({ generic: 2, r: 2 }, { generic: 3, r: 2 })).toBe(false);
    expect(manaContains({ r: 2 }, { r: 3 })).toBe(false);
  });

  test("query symbol absent from card", () => {
    expect(manaContains({ generic: 1, "b/p": 2 }, { b: 1 })).toBe(false);
  });

  test("hybrid/phyrexian key matches only itself", () => {
    expect(manaContains({ generic: 1, "b/p": 2 }, { "b/p": 1 })).toBe(true);
    expect(manaContains({ generic: 1, "b/p": 2 }, { "b/p": 3 })).toBe(false);
  });
});
