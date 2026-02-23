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
    complexity: overrides.complexity ?? 0,
  };
}

describe("computeLensOrderings", () => {
  test("returns empty arrays for empty input", () => {
    const result = computeLensOrderings([]);
    expect(result.lens_name).toEqual([]);
    expect(result.lens_chronology).toEqual([]);
    expect(result.lens_mana_curve).toEqual([]);
    expect(result.lens_complexity).toEqual([]);
  });

  test("single entry returns that entry for all lenses", () => {
    const entries = [entry(5, "Lightning Bolt")];
    const result = computeLensOrderings(entries);
    expect(result.lens_name).toEqual([5]);
    expect(result.lens_chronology).toEqual([5]);
    expect(result.lens_mana_curve).toEqual([5]);
    expect(result.lens_complexity).toEqual([5]);
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

    test("uses name as tiebreaker for same cmc", () => {
      const entries = [
        entry(0, "Zebra Bolt", { cmc: 3 }),
        entry(1, "Alpha Strike", { cmc: 3 }),
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
  });
});
