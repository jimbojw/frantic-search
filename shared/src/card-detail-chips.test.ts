// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import {
  tokenizeTypeLine,
  manaCostToCompactQuery,
  colorBitmaskToQueryLetters,
  colorIdentityMaskToManaCostString,
} from "./card-detail-chips";
import { parseManaSymbols, manaEquals } from "./search/mana";

describe("tokenizeTypeLine", () => {
  it("splits a simple type line into lowercase tokens", () => {
    expect(tokenizeTypeLine("Instant")).toEqual(["instant"]);
  });

  it("splits supertypes, types, and subtypes across em-dash", () => {
    expect(tokenizeTypeLine("Legendary Creature \u2014 Dwarf Noble")).toEqual([
      "legendary",
      "creature",
      "dwarf",
      "noble",
    ]);
  });

  it("handles multiple subtypes after the dash", () => {
    expect(tokenizeTypeLine("Artifact \u2014 Equipment")).toEqual([
      "artifact",
      "equipment",
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenizeTypeLine("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(tokenizeTypeLine("   ")).toEqual([]);
  });

  it("handles type line with no dash", () => {
    expect(tokenizeTypeLine("Sorcery")).toEqual(["sorcery"]);
  });

  it("handles multiple spaces and tabs", () => {
    expect(tokenizeTypeLine("Basic  Land \u2014  Forest")).toEqual([
      "basic",
      "land",
      "forest",
    ]);
  });

  it("does not emit the em-dash as a token", () => {
    const tokens = tokenizeTypeLine("Creature \u2014 Elf Warrior");
    expect(tokens).not.toContain("\u2014");
    expect(tokens).not.toContain("");
  });

  it("handles Token type line", () => {
    expect(tokenizeTypeLine("Token")).toEqual(["token"]);
  });

  it("handles Enchantment Creature — God", () => {
    expect(tokenizeTypeLine("Enchantment Creature \u2014 God")).toEqual([
      "enchantment",
      "creature",
      "god",
    ]);
  });
});

describe("manaCostToCompactQuery", () => {
  it("converts empty mana cost to null", () => {
    expect(manaCostToCompactQuery("")).toBe("null");
  });

  it("converts simple colored cost", () => {
    expect(manaCostToCompactQuery("{B}")).toBe("b");
  });

  it("converts generic + colored", () => {
    expect(manaCostToCompactQuery("{3}{R}{R}")).toBe("3rr");
  });

  it("converts {1}{R}", () => {
    expect(manaCostToCompactQuery("{1}{R}")).toBe("1r");
  });

  it("converts all five colors", () => {
    expect(manaCostToCompactQuery("{W}{U}{B}{R}{G}")).toBe("wubrg");
  });

  it("preserves braces for hybrid mana", () => {
    expect(manaCostToCompactQuery("{2/W}{2/W}")).toBe("{2/w}{2/w}");
  });

  it("preserves braces for color hybrid", () => {
    expect(manaCostToCompactQuery("{W/U}")).toBe("{w/u}");
  });

  it("preserves braces for Phyrexian mana", () => {
    expect(manaCostToCompactQuery("{W/P}")).toBe("{w/p}");
  });

  it("handles X costs", () => {
    expect(manaCostToCompactQuery("{X}{G}{G}")).toBe("xgg");
  });

  it("handles double-digit generic", () => {
    expect(manaCostToCompactQuery("{10}{U}{U}")).toBe("10uu");
  });

  it("handles zero generic cost", () => {
    expect(manaCostToCompactQuery("{0}")).toBe("0");
  });

  it("roundtrips through parseManaSymbols for exact match", () => {
    const costs = [
      "{3}{R}{R}",
      "{W}{U}{B}{R}{G}",
      "{X}{G}{G}",
      "{0}",
      "{B}",
    ];
    for (const cost of costs) {
      const original = parseManaSymbols(cost);
      const compact = manaCostToCompactQuery(cost);
      const roundtripped = parseManaSymbols(compact);
      expect(manaEquals(original, roundtripped)).toBe(true);
    }
  });
});

describe("colorBitmaskToQueryLetters", () => {
  it("returns 'c' for colorless (mask 0)", () => {
    expect(colorBitmaskToQueryLetters(0)).toBe("c");
  });

  it("returns 'w' for White (bit 0)", () => {
    expect(colorBitmaskToQueryLetters(1)).toBe("w");
  });

  it("returns 'u' for Blue (bit 1)", () => {
    expect(colorBitmaskToQueryLetters(2)).toBe("u");
  });

  it("returns 'b' for Black (bit 2)", () => {
    expect(colorBitmaskToQueryLetters(4)).toBe("b");
  });

  it("returns 'r' for Red (bit 3)", () => {
    expect(colorBitmaskToQueryLetters(8)).toBe("r");
  });

  it("returns 'g' for Green (bit 4)", () => {
    expect(colorBitmaskToQueryLetters(16)).toBe("g");
  });

  it("returns WUBRG order for multi-color", () => {
    // W|U = 3
    expect(colorBitmaskToQueryLetters(3)).toBe("wu");
    // W|U|B|R|G = 31
    expect(colorBitmaskToQueryLetters(31)).toBe("wubrg");
    // B|R = 12
    expect(colorBitmaskToQueryLetters(12)).toBe("br");
  });
});

describe("colorIdentityMaskToManaCostString", () => {
  it("returns {C} for colorless", () => {
    expect(colorIdentityMaskToManaCostString(0)).toBe("{C}");
  });

  it("returns single braced pip for one color", () => {
    expect(colorIdentityMaskToManaCostString(2)).toBe("{U}");
  });

  it("uses WUBRG order for multicolor", () => {
    expect(colorIdentityMaskToManaCostString(12)).toBe("{B}{R}");
    expect(colorIdentityMaskToManaCostString(3)).toBe("{W}{U}");
  });

  it("returns all five for full WUBRG", () => {
    expect(colorIdentityMaskToManaCostString(31)).toBe("{W}{U}{B}{R}{G}");
  });
});
