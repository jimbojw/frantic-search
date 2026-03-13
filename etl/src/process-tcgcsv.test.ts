// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { buildProductMapFromData } from "./process-tcgcsv";

describe("buildProductMapFromData", () => {
  test("extracts productId → setAbbrev+number from products with Number in extendedData", () => {
    const groupIds = [123, 456];
    const groupAbbrevs: Record<string, string> = {
      "123": "LTC",
      "456": "LTR",
    };
    const productsByGroup: Record<number, { results?: Array<{ productId?: number; extendedData?: Array<{ name?: string; value?: string }> }> }> = {
      123: {
        results: [
          {
            productId: 1001,
            extendedData: [
              { name: "Number", value: "47" },
              { name: "Rarity", value: "Common" },
            ],
          },
          {
            productId: 1002,
            extendedData: [{ name: "Number", value: "450" }],
          },
        ],
      },
      456: {
        results: [
          {
            productId: 2001,
            extendedData: [{ name: "Number", value: "1" }],
          },
        ],
      },
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result).toEqual({
      "1001": { setAbbrev: "LTC", number: "47", name: "" },
      "1002": { setAbbrev: "LTC", number: "450", name: "" },
      "2001": { setAbbrev: "LTR", number: "1", name: "" },
    });
  });

  test("skips groups with empty abbreviation", () => {
    const groupIds = [19, 64];
    const groupAbbrevs: Record<string, string> = {
      "19": "",
      "64": "",
    };
    const productsByGroup: Record<number, { results?: Array<{ productId?: number; extendedData?: Array<{ name?: string; value?: string }> }> }> = {
      19: { results: [{ productId: 999, extendedData: [{ name: "Number", value: "1" }] }] },
      64: { results: [{ productId: 998, extendedData: [{ name: "Number", value: "2" }] }] },
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result).toEqual({});
  });

  test("includes products without Number with empty number", () => {
    const groupIds = [123];
    const groupAbbrevs = { "123": "LTC" };
    const productsByGroup = {
      123: {
        results: [
          { productId: 1001, extendedData: [{ name: "Rarity", value: "Common" }] },
          { productId: 1002, extendedData: [{ name: "Number", value: "" }] },
          { productId: 1003, extendedData: [] },
        ],
      },
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result).toEqual({
      "1001": { setAbbrev: "LTC", number: "", name: "" },
      "1002": { setAbbrev: "LTC", number: "", name: "" },
      "1003": { setAbbrev: "LTC", number: "", name: "" },
    });
  });

  test("last-wins for duplicate productId across groups", () => {
    const groupIds = [123, 456];
    const groupAbbrevs = { "123": "LTC", "456": "LTR" };
    const productsByGroup = {
      123: {
        results: [{ productId: 1001, extendedData: [{ name: "Number", value: "47" }] }],
      },
      456: {
        results: [{ productId: 1001, extendedData: [{ name: "Number", value: "99" }] }],
      },
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result["1001"]).toEqual({ setAbbrev: "LTR", number: "99", name: "" });
  });

  test("skips groups with no products file", () => {
    const groupIds = [123, 456];
    const groupAbbrevs = { "123": "LTC", "456": "LTR" };
    const productsByGroup = {
      123: { results: [{ productId: 1001, extendedData: [{ name: "Number", value: "1" }] }] },
      // 456 missing
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result).toEqual({ "1001": { setAbbrev: "LTC", number: "1", name: "" } });
  });

  test("includes product name for variant resolution", () => {
    const groupIds = [123];
    const groupAbbrevs = { "123": "LTC" };
    const productsByGroup = {
      123: {
        results: [
          {
            productId: 1002,
            name: "Banquet Guests (Showcase Scrolls)",
            extendedData: [{ name: "Number", value: "450" }],
          },
        ],
      },
    };

    const result = buildProductMapFromData(groupIds, groupAbbrevs, productsByGroup);

    expect(result["1002"]).toEqual({
      setAbbrev: "LTC",
      number: "450",
      name: "Banquet Guests (Showcase Scrolls)",
    });
  });

  test("returns empty map for empty inputs", () => {
    const result = buildProductMapFromData([], {}, {});
    expect(result).toEqual({});
  });
});
