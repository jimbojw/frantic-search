// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { levenshteinDistance } from "./levenshtein";

describe("levenshteinDistance", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "abc")).toBe(0);
    expect(levenshteinDistance("37", "37")).toBe(0);
  });

  it("returns length when one string is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "37")).toBe(2);
  });

  it("returns 1 for single-character difference", () => {
    expect(levenshteinDistance("37", "37e")).toBe(1);
    expect(levenshteinDistance("37e", "37")).toBe(1);
    expect(levenshteinDistance("261", "262")).toBe(1);
    expect(levenshteinDistance("abc", "abd")).toBe(1);
  });

  it("returns correct distance for collector-number-like inputs", () => {
    expect(levenshteinDistance("26", "261")).toBe(1);
    expect(levenshteinDistance("26", "262")).toBe(1);
    expect(levenshteinDistance("999", "261")).toBe(3);
    expect(levenshteinDistance("261e", "261")).toBe(1);
  });

  it("caps at maxDistance + 1 when distance exceeds default (5)", () => {
    expect(levenshteinDistance("123456", "abcdef")).toBe(6); // exact 6, at cap
    expect(levenshteinDistance("1234567890", "abcdefghij")).toBe(6); // would be 10, capped
  });

  it("with maxDistance=2, caps at 3", () => {
    expect(levenshteinDistance("abc", "xyz", 2)).toBe(3);
    expect(levenshteinDistance("abc", "ab", 2)).toBe(1);
  });

  it("with maxDistance=Infinity, computes full distance", () => {
    expect(levenshteinDistance("1234567890", "abcdefghij", Infinity)).toBe(10);
    expect(levenshteinDistance("kitten", "sitting", Infinity)).toBe(3);
  });

  it("handles unicode and mixed content", () => {
    expect(levenshteinDistance("a", "b")).toBe(1);
    expect(levenshteinDistance("37p", "37")).toBe(1);
  });
});
