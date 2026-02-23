// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { computeLensOrderings, type CardLensEntry } from "./lenses";

function entry(
  canonicalFace: number,
  name: string,
  overrides: Partial<Omit<CardLensEntry, "canonicalFace" | "name">> = {},
): CardLensEntry {
  return {
    canonicalFace,
    name,
    releasedAt: overrides.releasedAt ?? "2020-01-01",
    cmc: overrides.cmc ?? 0,
    manaCostLength: overrides.manaCostLength ?? 0,
    complexity: overrides.complexity ?? 0,
    colorIdentity: overrides.colorIdentity ?? 0,
    typeIdentity: overrides.typeIdentity ?? 0,
  };
}

describe("computeLensOrderings", () => {
  test("returns empty arrays for empty input", () => {
    const result = computeLensOrderings([]);
    expect(result.lens_name).toEqual([]);
    expect(result.lens_chronology).toEqual([]);
    expect(result.lens_mana_curve).toEqual([]);
    expect(result.lens_complexity).toEqual([]);
    expect(result.lens_color_identity).toEqual([]);
    expect(result.lens_type_map).toEqual([]);
    expect(result.lens_color_type).toEqual([]);
  });

  test("single entry returns that entry for all lenses", () => {
    const entries = [entry(5, "Lightning Bolt")];
    const result = computeLensOrderings(entries);
    expect(result.lens_name).toEqual([5]);
    expect(result.lens_chronology).toEqual([5]);
    expect(result.lens_mana_curve).toEqual([5]);
    expect(result.lens_complexity).toEqual([5]);
    expect(result.lens_color_identity).toEqual([5]);
    expect(result.lens_type_map).toEqual([5]);
    expect(result.lens_color_type).toEqual([5]);
  });

  describe("lens_name (alphabetical)", () => {
    test("sorts by name case-insensitively", () => {
      const entries = [
        entry(0, "Zombie Token"),
        entry(1, "alpha Strike"),
        entry(2, "Beta Surge"),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_name).toEqual([1, 2, 0]);
    });

    test("handles accent-insensitive comparison", () => {
      const entries = [
        entry(0, "Bösium Strip"),
        entry(1, "Bosium Strip"),
        entry(2, "Abandon Hope"),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_name[0]).toBe(2);
    });
  });

  describe("lens_chronology", () => {
    test("sorts by release date earliest first", () => {
      const entries = [
        entry(0, "Card C", { releasedAt: "2023-06-15" }),
        entry(1, "Card A", { releasedAt: "1993-08-05" }),
        entry(2, "Card B", { releasedAt: "2010-01-01" }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_chronology).toEqual([1, 2, 0]);
    });

    test("uses name as tiebreaker for same date", () => {
      const entries = [
        entry(0, "Zebra", { releasedAt: "2020-01-01" }),
        entry(1, "Alpha", { releasedAt: "2020-01-01" }),
        entry(2, "Middle", { releasedAt: "2020-01-01" }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_chronology).toEqual([1, 2, 0]);
    });

    test("missing date sorts to the beginning", () => {
      const entries = [
        entry(0, "Card B", { releasedAt: "2020-01-01" }),
        entry(1, "Card A", { releasedAt: "" }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_chronology).toEqual([1, 0]);
    });
  });

  describe("lens_mana_curve", () => {
    test("sorts by cmc lowest first", () => {
      const entries = [
        entry(0, "Expensive", { cmc: 7 }),
        entry(1, "Cheap", { cmc: 1 }),
        entry(2, "Medium", { cmc: 3 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_mana_curve).toEqual([1, 2, 0]);
    });

    test("uses Gray code rank of color identity as first tiebreaker within same cmc", () => {
      // W=1 → gray(1)=1, U=2 → gray(2)=3, so W sorts before U
      const W = 1, U = 2;
      const entries = [
        entry(0, "Blue Card", { cmc: 2, colorIdentity: U }),
        entry(1, "White Card", { cmc: 2, colorIdentity: W }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_mana_curve).toEqual([1, 0]);
    });

    test("uses manaCostLength as second tiebreaker within same cmc and identity", () => {
      const entries = [
        entry(0, "Alpha", { cmc: 2, manaCostLength: 6 }),
        entry(1, "Zebra", { cmc: 2, manaCostLength: 3 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_mana_curve).toEqual([1, 0]);
    });

    test("uses name as final tiebreaker when cmc, identity, and manaCostLength are equal", () => {
      const entries = [
        entry(0, "Zebra Bolt", { cmc: 3, manaCostLength: 6 }),
        entry(1, "Alpha Strike", { cmc: 3, manaCostLength: 6 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_mana_curve).toEqual([1, 0]);
    });

    test("handles fractional cmc", () => {
      const entries = [
        entry(0, "Card A", { cmc: 1.5 }),
        entry(1, "Card B", { cmc: 1 }),
        entry(2, "Card C", { cmc: 2 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_mana_curve).toEqual([1, 0, 2]);
    });
  });

  describe("lens_complexity", () => {
    test("sorts by complexity lowest first", () => {
      const entries = [
        entry(0, "Complex", { complexity: 200 }),
        entry(1, "Simple", { complexity: 10 }),
        entry(2, "Medium", { complexity: 50 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_complexity).toEqual([1, 2, 0]);
    });

    test("uses name as tiebreaker for same complexity", () => {
      const entries = [
        entry(0, "Zebra", { complexity: 50 }),
        entry(1, "Alpha", { complexity: 50 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_complexity).toEqual([1, 0]);
    });

    test("zero complexity cards come first", () => {
      const entries = [
        entry(0, "Vanilla Bear", { complexity: 0 }),
        entry(1, "Complex Spell", { complexity: 300 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_complexity).toEqual([0, 1]);
    });
  });

  describe("lens_color_identity", () => {
    // WUBRG bits: W=1, U=2, B=4, R=8, G=16
    // Gray code: v ^ (v >> 1)
    // Colorless (0) → gray 0, W (1) → gray 1, WU (3) → gray 2, U (2) → gray 3, ...
    test("sorts by Gray code rank of color identity", () => {
      const W = 1, U = 2, B = 4;
      const entries = [
        entry(0, "Blue Card", { colorIdentity: U }),     // gray(2) = 3
        entry(1, "Colorless", { colorIdentity: 0 }),     // gray(0) = 0
        entry(2, "White Card", { colorIdentity: W }),     // gray(1) = 1
        entry(3, "Azorius Card", { colorIdentity: W | U }), // gray(3) = 2
      ];
      const result = computeLensOrderings(entries);
      // Order: colorless(0), white(1), azorius(2), blue(3)
      expect(result.lens_color_identity).toEqual([1, 2, 3, 0]);
    });

    test("uses cmc as first tiebreaker within same identity", () => {
      const R = 8;
      const entries = [
        entry(0, "Expensive Red", { colorIdentity: R, cmc: 5 }),
        entry(1, "Cheap Red", { colorIdentity: R, cmc: 1 }),
        entry(2, "Mid Red", { colorIdentity: R, cmc: 3 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_color_identity).toEqual([1, 2, 0]);
    });

    test("uses name as second tiebreaker", () => {
      const G = 16;
      const entries = [
        entry(0, "Zebra Centaur", { colorIdentity: G, cmc: 3 }),
        entry(1, "Alpha Elf", { colorIdentity: G, cmc: 3 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_color_identity).toEqual([1, 0]);
    });

    test("adjacent Gray code ranks differ by one bit", () => {
      const gray = (v: number) => v ^ (v >> 1);
      const ranks = Array.from({ length: 32 }, (_, i) => gray(i));
      for (let i = 1; i < 32; i++) {
        const diff = ranks[i] ^ ranks[i - 1];
        const popcount = diff.toString(2).split("1").length - 1;
        expect(popcount).toBe(1);
      }
    });
  });

  describe("lens_type_map", () => {
    // CardType bits: Creature=1, Enchantment=2, Artifact=4, Land=8,
    // Planeswalker=16, Instant=32, Sorcery=64, Legendary=128
    // gray(1)=1, gray(32)=48, gray(64)=96 — Creature sorts earliest
    const CREATURE = 1, INSTANT = 32, SORCERY = 64;

    test("sorts by Gray code rank of type identity", () => {
      const entries = [
        entry(0, "A Sorcery", { typeIdentity: SORCERY }),
        entry(1, "A Creature", { typeIdentity: CREATURE }),
        entry(2, "An Instant", { typeIdentity: INSTANT }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_type_map).toEqual([1, 2, 0]);
    });

    test("uses Gray color identity as first tiebreaker within same type", () => {
      const W = 1, U = 2;
      const entries = [
        entry(0, "Blue Creature", { typeIdentity: CREATURE, colorIdentity: U }),
        entry(1, "White Creature", { typeIdentity: CREATURE, colorIdentity: W }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_type_map).toEqual([1, 0]);
    });

    test("uses cmc as second tiebreaker", () => {
      const entries = [
        entry(0, "Expensive", { typeIdentity: CREATURE, cmc: 5 }),
        entry(1, "Cheap", { typeIdentity: CREATURE, cmc: 1 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_type_map).toEqual([1, 0]);
    });
  });

  describe("lens_color_type", () => {
    const CREATURE = 1, INSTANT = 32;
    const W = 1, U = 2;

    test("sorts by Gray color identity first", () => {
      const entries = [
        entry(0, "Blue Card", { colorIdentity: U }),
        entry(1, "White Card", { colorIdentity: W }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_color_type).toEqual([1, 0]);
    });

    test("uses Gray type identity as first tiebreaker within same color", () => {
      const entries = [
        entry(0, "Red Instant", { colorIdentity: W, typeIdentity: INSTANT }),
        entry(1, "Red Creature", { colorIdentity: W, typeIdentity: CREATURE }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_color_type).toEqual([1, 0]);
    });

    test("uses cmc as second tiebreaker", () => {
      const entries = [
        entry(0, "Expensive", { colorIdentity: W, typeIdentity: CREATURE, cmc: 5 }),
        entry(1, "Cheap", { colorIdentity: W, typeIdentity: CREATURE, cmc: 1 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_color_type).toEqual([1, 0]);
    });
  });

  describe("independence of lenses", () => {
    test("each lens produces a different ordering", () => {
      const entries = [
        entry(0, "Zebra Wurm", { releasedAt: "1993-01-01", cmc: 7, complexity: 10 }),
        entry(1, "Alpha Strike", { releasedAt: "2023-01-01", cmc: 1, complexity: 200 }),
        entry(2, "Middle Ground", { releasedAt: "2010-01-01", cmc: 3, complexity: 50 }),
      ];
      const result = computeLensOrderings(entries);
      expect(result.lens_name).toEqual([1, 2, 0]);
      expect(result.lens_chronology).toEqual([0, 2, 1]);
      expect(result.lens_mana_curve).toEqual([1, 2, 0]);
      expect(result.lens_complexity).toEqual([0, 2, 1]);
    });
  });

  test("all lens arrays have the same length as input", () => {
    const entries = [
      entry(10, "Card A"),
      entry(20, "Card B"),
      entry(30, "Card C"),
    ];
    const result = computeLensOrderings(entries);
    expect(result.lens_name).toHaveLength(3);
    expect(result.lens_chronology).toHaveLength(3);
    expect(result.lens_mana_curve).toHaveLength(3);
    expect(result.lens_complexity).toHaveLength(3);
    expect(result.lens_color_identity).toHaveLength(3);
    expect(result.lens_type_map).toHaveLength(3);
    expect(result.lens_color_type).toHaveLength(3);
  });

  test("output contains only canonical face indices from input", () => {
    const entries = [
      entry(42, "Bravo"),
      entry(7, "Alpha"),
      entry(99, "Charlie"),
    ];
    const result = computeLensOrderings(entries);
    const numSort = (a: number, b: number) => a - b;
    expect([...result.lens_name].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_chronology].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_mana_curve].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_complexity].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_color_identity].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_type_map].sort(numSort)).toEqual([7, 42, 99]);
    expect([...result.lens_color_type].sort(numSort)).toEqual([7, 42, 99]);
  });
});
