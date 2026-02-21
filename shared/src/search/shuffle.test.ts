// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { seededShuffle } from "./shuffle";

describe("seededShuffle", () => {
  const numbers = () => Array.from({ length: 100 }, (_, i) => i);

  test("same seed produces identical permutation", () => {
    const a = seededShuffle(numbers(), "t:creature");
    const b = seededShuffle(numbers(), "t:creature");
    expect(a).toEqual(b);
  });

  test("different seeds produce different permutations", () => {
    const a = seededShuffle(numbers(), "t:creature");
    const b = seededShuffle(numbers(), "t:instant");
    expect(a).not.toEqual(b);
  });

  test("output contains exactly the same elements as input", () => {
    const input = numbers();
    const shuffled = seededShuffle([...input], "some-seed");
    expect(shuffled.sort((a, b) => a - b)).toEqual(input);
  });

  test("empty array returns empty", () => {
    expect(seededShuffle([], "seed")).toEqual([]);
  });

  test("single element returns unchanged", () => {
    expect(seededShuffle([42], "seed")).toEqual([42]);
  });

  test("two elements can swap", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const arr = seededShuffle([0, 1], `seed-${i}`);
      results.add(arr.join(","));
    }
    expect(results.size).toBe(2);
  });

  test("first element varies across seeds (basic uniformity)", () => {
    const firstElements = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const arr = seededShuffle(numbers(), `query-${i}`);
      firstElements.add(arr[0]);
    }
    expect(firstElements.size).toBeGreaterThan(50);
  });

  test("shuffles in place and returns the same array reference", () => {
    const arr = numbers();
    const result = seededShuffle(arr, "seed");
    expect(result).toBe(arr);
  });
});
