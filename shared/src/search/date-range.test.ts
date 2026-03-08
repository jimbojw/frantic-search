// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parseDateRange } from "./date-range";
import { PrintingIndex } from "./printing-index";
import { Rarity, Finish, Frame, PrintingFlag } from "../bits";
import type { PrintingColumnarData } from "../data";

const MINIMAL_PRINTING_DATA: PrintingColumnarData = {
  canonical_face_ref: [0],
  scryfall_ids: [""],
  collector_numbers: [""],
  set_indices: [0],
  rarity: [Rarity.Common],
  printing_flags: [0],
  finish: [Finish.Nonfoil],
  frame: [Frame.Y2015],
  price_usd: [0],
  released_at: [20180316],
  set_lookup: [{ code: "A25", name: "Masters 25", released_at: 20180316 }],
};

const pIdx = new PrintingIndex(MINIMAL_PRINTING_DATA);

function toYMD(n: number): string {
  const y = Math.floor(n / 10000);
  const m = Math.floor((n % 10000) / 100);
  const d = n % 100;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

describe("parseDateRange", () => {
  describe("complete year", () => {
    test("2025 -> [2025-01-01, 2026-01-01)", () => {
      const r = parseDateRange("2025");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2025-01-01");
      expect(toYMD(r!.hi)).toBe("2026-01-01");
    });

    test("2000 -> [2000-01-01, 2001-01-01)", () => {
      const r = parseDateRange("2000");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2000-01-01");
      expect(toYMD(r!.hi)).toBe("2001-01-01");
    });
  });

  describe("complete month", () => {
    test("2025-02 -> [2025-02-01, 2025-03-01)", () => {
      const r = parseDateRange("2025-02");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2025-02-01");
      expect(toYMD(r!.hi)).toBe("2025-03-01");
    });

    test("2021-06 -> [2021-06-01, 2021-07-01)", () => {
      const r = parseDateRange("2021-06");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2021-06-01");
      expect(toYMD(r!.hi)).toBe("2021-07-01");
    });
  });

  describe("complete day", () => {
    test("2025-02-15 -> [2025-02-15, 2025-02-16)", () => {
      const r = parseDateRange("2025-02-15");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2025-02-15");
      expect(toYMD(r!.hi)).toBe("2025-02-16");
    });
  });

  describe("partial year", () => {
    test("202 -> [2020-01-01, 2030-01-01)", () => {
      const r = parseDateRange("202");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2020-01-01");
      expect(toYMD(r!.hi)).toBe("2030-01-01");
    });

    test("202 returns floorNext 2021-01-01 for > and <=", () => {
      const r = parseDateRange("202");
      expect(r).not.toBeNull();
      expect(r!.floorNext).toBe(20210101);
    });

    test("2025 returns floorNext same as hi (complete year)", () => {
      const r = parseDateRange("2025");
      expect(r).not.toBeNull();
      expect(r!.floorNext).toBe(r!.hi);
      expect(toYMD(r!.floorNext)).toBe("2026-01-01");
    });

    test("20 -> [2000-01-01, 2100-01-01)", () => {
      const r = parseDateRange("20");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2000-01-01");
      expect(toYMD(r!.hi)).toBe("2100-01-01");
    });

    test("2 -> [2000-01-01, 3000-01-01)", () => {
      const r = parseDateRange("2");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2000-01-01");
      expect(toYMD(r!.hi)).toBe("3000-01-01");
    });
  });

  describe("partial month", () => {
    test("2025-0 -> [2025-01-01, 2025-10-01)", () => {
      const r = parseDateRange("2025-0");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2025-01-01");
      expect(toYMD(r!.hi)).toBe("2025-10-01");
    });

    test("2018-1 -> [2018-10-01, 2019-01-01)", () => {
      const r = parseDateRange("2018-1");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2018-10-01");
      expect(toYMD(r!.hi)).toBe("2019-01-01");
    });
  });

  describe("partial day", () => {
    test("2025-02-1 -> [2025-02-10, 2025-02-20)", () => {
      const r = parseDateRange("2025-02-1");
      expect(r).not.toBeNull();
      expect(toYMD(r!.lo)).toBe("2025-02-10");
      expect(toYMD(r!.hi)).toBe("2025-02-20");
    });
  });

  describe("special values", () => {
    test("now returns single-day range", () => {
      const r = parseDateRange("now");
      expect(r).not.toBeNull();
      const today = new Date();
      const expected = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      expect(r!.lo).toBe(expected);
      expect(r!.hi).toBeGreaterThan(r!.lo);
    });

    test("today returns single-day range", () => {
      const r = parseDateRange("today");
      expect(r).not.toBeNull();
      const today = new Date();
      const expected = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      expect(r!.lo).toBe(expected);
      expect(r!.hi).toBeGreaterThan(r!.lo);
    });
  });

  describe("set codes", () => {
    test("a25 resolves to set released_at when pIdx provided", () => {
      const r = parseDateRange("a25", pIdx);
      expect(r).not.toBeNull();
      expect(r!.lo).toBe(20180316);
      expect(r!.hi).toBe(20180317);
    });

    test("unknown set returns null", () => {
      const r = parseDateRange("xxx", pIdx);
      expect(r).toBeNull();
    });

    test("set code without pIdx returns null", () => {
      const r = parseDateRange("a25");
      expect(r).toBeNull();
    });
  });

  describe("invalid input", () => {
    test("empty string returns null", () => {
      expect(parseDateRange("")).toBeNull();
    });

    test("non-numeric returns null when not special/set", () => {
      expect(parseDateRange("abc")).toBeNull();
    });

    test("dashless long numeric rejected", () => {
      expect(parseDateRange("20200801")).toBeNull();
    });
  });
});
