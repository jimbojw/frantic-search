// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parseStatValue } from "./stats";

describe("parseStatValue", () => {
  // Standard numeric values
  test.each([
    ["0", 0],
    ["1", 1],
    ["13", 13],
    ["99", 99],
    ["20", 20],
  ])("integer %s → %d", (input, expected) => {
    expect(parseStatValue(input)).toBe(expected);
  });

  test("negative: '-1' → -1", () => {
    expect(parseStatValue("-1")).toBe(-1);
  });

  test("negative zero: '-0' compares equal to 0", () => {
    expect(parseStatValue("-0") === 0).toBe(true);
  });

  test.each([
    ["+0", 0],
    ["+1", 1],
    ["+2", 2],
    ["+3", 3],
    ["+4", 4],
  ])("leading plus %s → %d", (input, expected) => {
    expect(parseStatValue(input)).toBe(expected);
  });

  test("leading zeros: '001' → 1", () => {
    expect(parseStatValue("001")).toBe(1);
  });

  test.each([
    [".5", 0.5],
    ["1.5", 1.5],
    ["2.5", 2.5],
    ["3.5", 3.5],
  ])("decimal %s → %d", (input, expected) => {
    expect(parseStatValue(input)).toBe(expected);
  });

  // Wildcard and special single-character values
  test.each([
    ["*", 0],
    ["?", 0],
    ["x", 0],
    ["X", 0],
    ["y", 0],
    ["Y", 0],
  ])("special value %s → 0", (input) => {
    expect(parseStatValue(input)).toBe(0);
  });

  test("infinity: '∞' → Infinity", () => {
    expect(parseStatValue("∞")).toBe(Infinity);
  });

  // Arithmetic expressions with wildcards
  test.each([
    ["1+*", 1],
    ["2+*", 2],
    ["*+1", 1],
    ["*+*", 0],
    ["7-*", 7],
  ])("wildcard arithmetic %s → %d", (input, expected) => {
    expect(parseStatValue(input)).toBe(expected);
  });

  test("wildcard squared: '*²' → 0", () => {
    expect(parseStatValue("*²")).toBe(0);
  });

  // Dice notation
  test("dice: '1d4+1' → 2", () => {
    expect(parseStatValue("1d4+1")).toBe(2);
  });

  test("dice: '2d6' → 2 (synthetic)", () => {
    expect(parseStatValue("2d6")).toBe(2);
  });

  // Empty / missing → NaN
  test("empty string → NaN", () => {
    expect(parseStatValue("")).toBeNaN();
  });

  // Garbage → NaN
  test.each([
    ["abc"],
    ["hello"],
    ["foo+bar"],
  ])("garbage %s → NaN", (input) => {
    expect(parseStatValue(input)).toBeNaN();
  });

  // Never throws
  test("never throws on any input", () => {
    const inputs = [
      "", "0", "*", "1+*", "*²", "∞", "?", "x", "Y", "1d4+1",
      "abc", "null", "undefined", "NaN", "  ", "---", "++1",
    ];
    for (const input of inputs) {
      expect(() => parseStatValue(input)).not.toThrow();
    }
  });
});
