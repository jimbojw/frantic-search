// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { PrintingIndex } from "./printing-index";
import {
  evalPrintingField,
  isPrintingField,
  promotePrintingToFace,
  promoteFaceToPrinting,
} from "./eval-printing";
import type { PrintingColumnarData } from "../data";
import { Rarity, Finish, Frame } from "../bits";

// ---------------------------------------------------------------------------
// Synthetic printing data (5 rows, 2 canonical faces)
// ---------------------------------------------------------------------------
//
// Row #0  Lightning Bolt  | MH2  | rare     | nonfoil | $1.00 | 2015 | 2021-06-18
// Row #1  Lightning Bolt  | MH2  | rare     | foil    | $3.00 | 2015 | 2021-06-18
// Row #2  Lightning Bolt  | A25  | uncommon | nonfoil | $0.50 | 2015 | 2018-03-16
// Row #3  Sol Ring        | C21  | uncommon | nonfoil | $0.75 | 2015 | 2021-06-18
// Row #4  Sol Ring        | C21  | uncommon | foil    | $5.00 | 2015 | 2021-06-18
//
// canonical_face_ref maps: Bolt → face 1, Sol Ring → face 3

const PRINTING_DATA: PrintingColumnarData = {
  canonical_face_ref: [1, 1, 1, 3, 3],
  scryfall_ids: ["a", "b", "c", "d", "e"],
  collector_numbers: ["261", "261", "113", "280", "280"],
  set_indices: [0, 0, 1, 2, 2],
  rarity: [Rarity.Rare, Rarity.Rare, Rarity.Uncommon, Rarity.Uncommon, Rarity.Uncommon],
  printing_flags: [0, 0, 0, 0, 0],
  finish: [Finish.Nonfoil, Finish.Foil, Finish.Nonfoil, Finish.Nonfoil, Finish.Foil],
  frame: [Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015],
  price_usd: [100, 300, 50, 75, 500],
  released_at: [20210618, 20210618, 20180316, 20210618, 20210618],
  set_lookup: [
    { code: "MH2", name: "Modern Horizons 2", released_at: 20210618 },
    { code: "A25", name: "Masters 25", released_at: 20180316 },
    { code: "C21", name: "Commander 2021", released_at: 20210618 },
  ],
};

const pIdx = new PrintingIndex(PRINTING_DATA);

function evalField(canonical: string, op: string, val: string): { buf: Uint8Array; error: string | null } {
  const buf = new Uint8Array(pIdx.printingCount);
  const error = evalPrintingField(canonical, op, val, pIdx, buf);
  return { buf, error };
}

function marked(buf: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < buf.length; i++) if (buf[i]) out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// isPrintingField
// ---------------------------------------------------------------------------

describe("isPrintingField", () => {
  test("returns true for printing-domain fields", () => {
    for (const f of ["set", "rarity", "price", "collectornumber", "frame", "year", "date"]) {
      expect(isPrintingField(f)).toBe(true);
    }
  });

  test("returns false for face-domain fields", () => {
    for (const f of ["name", "type", "oracle", "color", "identity", "mana", "power"]) {
      expect(isPrintingField(f)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

describe("set field", () => {
  test("matches rows by set code (case-insensitive)", () => {
    expect(marked(evalField("set", ":", "mh2").buf)).toEqual([0, 1]);
    expect(marked(evalField("set", ":", "MH2").buf)).toEqual([0, 1]);
  });

  test("a25 matches row 2 only", () => {
    expect(marked(evalField("set", ":", "a25").buf)).toEqual([2]);
  });

  test("c21 matches rows 3,4", () => {
    expect(marked(evalField("set", ":", "c21").buf)).toEqual([3, 4]);
  });

  test("unknown set returns error", () => {
    const { error } = evalField("set", ":", "xxx");
    expect(error).toBe('unknown set "xxx"');
  });
});

// ---------------------------------------------------------------------------
// rarity
// ---------------------------------------------------------------------------

describe("rarity field", () => {
  test("exact match with :", () => {
    expect(marked(evalField("rarity", ":", "rare").buf)).toEqual([0, 1]);
    expect(marked(evalField("rarity", ":", "uncommon").buf)).toEqual([2, 3, 4]);
  });

  test("abbreviations work", () => {
    expect(marked(evalField("rarity", ":", "r").buf)).toEqual([0, 1]);
    expect(marked(evalField("rarity", ":", "u").buf)).toEqual([2, 3, 4]);
  });

  test(">= comparison includes higher rarities", () => {
    expect(marked(evalField("rarity", ">=", "rare").buf)).toEqual([0, 1]);
    expect(marked(evalField("rarity", ">=", "uncommon").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("> comparison is strictly greater", () => {
    expect(marked(evalField("rarity", ">", "uncommon").buf)).toEqual([0, 1]);
    expect(marked(evalField("rarity", ">", "rare").buf)).toEqual([]);
  });

  test("<= comparison includes lower rarities", () => {
    expect(marked(evalField("rarity", "<=", "uncommon").buf)).toEqual([2, 3, 4]);
    expect(marked(evalField("rarity", "<=", "rare").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("< comparison is strictly less", () => {
    expect(marked(evalField("rarity", "<", "rare").buf)).toEqual([2, 3, 4]);
    expect(marked(evalField("rarity", "<", "uncommon").buf)).toEqual([]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("rarity", "!=", "rare").buf)).toEqual([2, 3, 4]);
    expect(marked(evalField("rarity", "!=", "uncommon").buf)).toEqual([0, 1]);
  });

  test("mythic matches nothing in this dataset", () => {
    expect(marked(evalField("rarity", ":", "mythic").buf)).toEqual([]);
  });

  test(">=common matches everything", () => {
    expect(marked(evalField("rarity", ">=", "common").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("unknown rarity returns error", () => {
    const { error } = evalField("rarity", ":", "legendary");
    expect(error).toBe('unknown rarity "legendary"');
  });
});

// ---------------------------------------------------------------------------
// price
// ---------------------------------------------------------------------------

describe("price field", () => {
  test("exact match (dollars → cents)", () => {
    expect(marked(evalField("price", ":", "1").buf)).toEqual([0]);
    expect(marked(evalField("price", ":", "0.50").buf)).toEqual([2]);
  });

  test("> comparison", () => {
    expect(marked(evalField("price", ">", "2").buf)).toEqual([1, 4]);
  });

  test("< comparison", () => {
    expect(marked(evalField("price", "<", "1").buf)).toEqual([2, 3]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("price", ">=", "1").buf)).toEqual([0, 1, 4]);
  });

  test("<= comparison", () => {
    expect(marked(evalField("price", "<=", "0.75").buf)).toEqual([2, 3]);
  });

  test("!= comparison", () => {
    const result = marked(evalField("price", "!=", "1").buf);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  test("zero-price rows are excluded from all comparisons", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("price", ">=", "0", idx, buf);
    expect(marked(buf)).toEqual([0, 2, 3, 4]);
  });

  test("invalid price returns error", () => {
    expect(evalField("price", ":", "abc").error).toBe('invalid price "abc"');
  });
});

// ---------------------------------------------------------------------------
// collectornumber
// ---------------------------------------------------------------------------

describe("collectornumber field", () => {
  test("exact string match", () => {
    expect(marked(evalField("collectornumber", ":", "261").buf)).toEqual([0, 1]);
    expect(marked(evalField("collectornumber", ":", "113").buf)).toEqual([2]);
    expect(marked(evalField("collectornumber", ":", "280").buf)).toEqual([3, 4]);
  });

  test("no match returns empty", () => {
    expect(marked(evalField("collectornumber", ":", "999").buf)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------

describe("frame field", () => {
  test("2015 matches all rows", () => {
    expect(marked(evalField("frame", ":", "2015").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("future matches none in this dataset", () => {
    expect(marked(evalField("frame", ":", "future").buf)).toEqual([]);
  });

  test("unknown frame returns error", () => {
    expect(evalField("frame", ":", "retro").error).toBe('unknown frame "retro"');
  });

  test("frame works with mixed data", () => {
    const mixedData: PrintingColumnarData = {
      ...PRINTING_DATA,
      frame: [Frame.Y2015, Frame.Future, Frame.Y2003, Frame.Y2015, Frame.Y1993],
    };
    const idx = new PrintingIndex(mixedData);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("frame", ":", "future", idx, buf);
    expect(marked(buf)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// year
// ---------------------------------------------------------------------------

describe("year field", () => {
  test("exact year match", () => {
    expect(marked(evalField("year", ":", "2021").buf)).toEqual([0, 1, 3, 4]);
    expect(marked(evalField("year", ":", "2018").buf)).toEqual([2]);
  });

  test("= operator same as :", () => {
    expect(marked(evalField("year", "=", "2018").buf)).toEqual([2]);
  });

  test("> comparison", () => {
    expect(marked(evalField("year", ">", "2018").buf)).toEqual([0, 1, 3, 4]);
  });

  test("< comparison", () => {
    expect(marked(evalField("year", "<", "2020").buf)).toEqual([2]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("year", ">=", "2021").buf)).toEqual([0, 1, 3, 4]);
  });

  test("<= comparison", () => {
    expect(marked(evalField("year", "<=", "2018").buf)).toEqual([2]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("year", "!=", "2021").buf)).toEqual([2]);
  });

  test("rows with released_at=0 are excluded", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      released_at: [20210618, 0, 20180316, 20210618, 20210618],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("year", ":", "2021", idx, buf);
    expect(marked(buf)).toEqual([0, 3, 4]);
  });

  test("invalid year returns error", () => {
    expect(evalField("year", ":", "abc").error).toBe('invalid year "abc"');
  });
});

// ---------------------------------------------------------------------------
// date
// ---------------------------------------------------------------------------

describe("date field", () => {
  test("exact date match", () => {
    expect(marked(evalField("date", ":", "2021-06-18").buf)).toEqual([0, 1, 3, 4]);
    expect(marked(evalField("date", ":", "2018-03-16").buf)).toEqual([2]);
  });

  test("> comparison", () => {
    expect(marked(evalField("date", ">", "2020-01-01").buf)).toEqual([0, 1, 3, 4]);
  });

  test("< comparison", () => {
    expect(marked(evalField("date", "<", "2020-01-01").buf)).toEqual([2]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("date", ">=", "2018-03-16").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("<= comparison", () => {
    expect(marked(evalField("date", "<=", "2018-03-16").buf)).toEqual([2]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("date", "!=", "2021-06-18").buf)).toEqual([2]);
  });

  test("rows with released_at=0 are excluded", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      released_at: [0, 20210618, 20180316, 0, 20210618],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("date", ">", "2000-01-01", idx, buf);
    expect(marked(buf)).toEqual([1, 2, 4]);
  });

  test("invalid date format returns error", () => {
    expect(evalField("date", ":", "not-a-date").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "12345").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-123").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-01-123").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-01-01-05").error).toMatch(/invalid date/);
  });

  // -- Partial date completion (lowest-possible-value padding) ---------------

  test("year-only resolves to YYYY-01-01", () => {
    // 2021 → 20210101 — exact match against rows with 20210618 should miss
    const exact = evalField("date", ":", "2021");
    expect(exact.error).toBeNull();
    expect(marked(exact.buf)).toEqual([]);

    // 2021 → 20210101; rows at 20210618 are >=, row 2 (20180316) is not
    const gte = evalField("date", ">=", "2021");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 3, 4]);
  });

  test("year-month resolves to YYYY-MM-01", () => {
    // 2021-06 → 20210601; date >= 20210601 matches rows at 20210618
    const gte = evalField("date", ">=", "2021-06");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 3, 4]);

    // 2018-04 → 20180401; date < 20180401 matches row 2 (20180316)
    const lt = evalField("date", "<", "2018-04");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([2]);
  });

  test("partial year pads right with 0s", () => {
    // "202" → 2020 → 20200101; date > 20200101 matches 2021 rows
    const gt = evalField("date", ">", "202");
    expect(gt.error).toBeNull();
    expect(marked(gt.buf)).toEqual([0, 1, 3, 4]);

    // "2" → 2000 → 20000101; date >= 20000101 matches everything
    const gte = evalField("date", ">=", "2");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("partial month pads right with 0 and clamps to [1,12]", () => {
    // "2021-0" → month 00 clamped to 01 → 20210101; date > that matches all 2021 rows
    const gte = evalField("date", ">", "2021-0");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 3, 4]);

    // "2018-1" → month 10 → 20181001; date < that matches row 2 (20180316)
    const lt = evalField("date", "<", "2018-1");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([2]);
  });

  test("partial day pads right with 0 and clamps to [1,31]", () => {
    // "2021-06-1" → day 10 → 20210610; date > that matches rows at 20210618
    const gt = evalField("date", ">", "2021-06-1");
    expect(gt.error).toBeNull();
    expect(marked(gt.buf)).toEqual([0, 1, 3, 4]);
  });

  test("trailing dashes are tolerated", () => {
    // "2021-" → month empty → 01, day → 01 → 20210101
    const r1 = evalField("date", ">=", "2021-");
    expect(r1.error).toBeNull();
    expect(marked(r1.buf)).toEqual([0, 1, 3, 4]);

    // "2021-06-" → day empty → 01 → 20210601
    const r2 = evalField("date", ">=", "2021-06-");
    expect(r2.error).toBeNull();
    expect(marked(r2.buf)).toEqual([0, 1, 3, 4]);
  });

  test("out-of-range month is clamped", () => {
    // "2021-00" → month 0 clamped to 1 → 20210101
    const r1 = evalField("date", ">=", "2021-00");
    expect(r1.error).toBeNull();
    expect(marked(r1.buf)).toEqual([0, 1, 3, 4]);

    // "2021-99" → month 99 clamped to 12 → 20211201
    const r2 = evalField("date", ">", "2021-99");
    expect(r2.error).toBeNull();
    expect(marked(r2.buf)).toEqual([]);
  });

  test("out-of-range day is clamped", () => {
    // "2021-06-00" → day 0 clamped to 1 → 20210601
    const r1 = evalField("date", ">=", "2021-06-00");
    expect(r1.error).toBeNull();
    expect(marked(r1.buf)).toEqual([0, 1, 3, 4]);

    // "2021-06-99" → day 99 clamped to 31 → 20210631
    const r2 = evalField("date", ">=", "2021-06-99");
    expect(r2.error).toBeNull();
    expect(marked(r2.buf)).toEqual([]);
  });

  test("now resolves to the current date", () => {
    const { buf, error } = evalField("date", "<", "now");
    expect(error).toBeNull();
    expect(marked(buf).length).toBeGreaterThan(0);
  });

  test("today resolves to the current date", () => {
    const { buf, error } = evalField("date", "<", "today");
    expect(error).toBeNull();
    expect(marked(buf).length).toBeGreaterThan(0);
  });

  test("bare set code resolves to set released_at", () => {
    // A25 released 2018-03-16, MH2 released 2021-06-18
    // date>a25 means date > 20180316
    const { buf, error } = evalField("date", ">", "a25");
    expect(error).toBeNull();
    // Rows 0,1,3,4 are 2021-06-18 which is > 2018-03-16
    expect(marked(buf)).toEqual([0, 1, 3, 4]);
  });

  test("set code resolution is case-insensitive", () => {
    const { buf, error } = evalField("date", ">", "A25");
    expect(error).toBeNull();
    expect(marked(buf)).toEqual([0, 1, 3, 4]);
  });

  test("date=mh2 matches printings released on MH2's date", () => {
    // MH2 released 2021-06-18, rows 0,1,3,4 have that date
    const { buf, error } = evalField("date", ":", "mh2");
    expect(error).toBeNull();
    expect(marked(buf)).toEqual([0, 1, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// unknown field
// ---------------------------------------------------------------------------

describe("unknown field", () => {
  test("returns error for unrecognized canonical name", () => {
    expect(evalField("bogus", ":", "x").error).toBe('unknown printing field "bogus"');
  });
});

// ---------------------------------------------------------------------------
// promotePrintingToFace
// ---------------------------------------------------------------------------

describe("promotePrintingToFace", () => {
  test("maps printing matches to their canonical face indices", () => {
    const printingBuf = new Uint8Array([1, 1, 0, 0, 0]);
    const faceBuf = new Uint8Array(10);
    promotePrintingToFace(printingBuf, faceBuf, pIdx.canonicalFaceRef, pIdx.printingCount);
    expect(faceBuf[1]).toBe(1);
    expect(faceBuf[3]).toBe(0);
  });

  test("multiple printings of different faces set multiple face slots", () => {
    const printingBuf = new Uint8Array([1, 0, 0, 1, 0]);
    const faceBuf = new Uint8Array(10);
    promotePrintingToFace(printingBuf, faceBuf, pIdx.canonicalFaceRef, pIdx.printingCount);
    expect(faceBuf[1]).toBe(1);
    expect(faceBuf[3]).toBe(1);
  });

  test("empty printing buf produces empty face buf", () => {
    const printingBuf = new Uint8Array(5);
    const faceBuf = new Uint8Array(10);
    promotePrintingToFace(printingBuf, faceBuf, pIdx.canonicalFaceRef, pIdx.printingCount);
    expect(marked(faceBuf)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// promoteFaceToPrinting
// ---------------------------------------------------------------------------

describe("promoteFaceToPrinting", () => {
  test("expands a face match to all printings of that face", () => {
    const faceBuf = new Uint8Array(10);
    faceBuf[3] = 1;
    const printingBuf = new Uint8Array(pIdx.printingCount);
    promoteFaceToPrinting(faceBuf, printingBuf, pIdx);
    expect(marked(printingBuf)).toEqual([3, 4]);
  });

  test("expands face 1 to rows 0,1,2", () => {
    const faceBuf = new Uint8Array(10);
    faceBuf[1] = 1;
    const printingBuf = new Uint8Array(pIdx.printingCount);
    promoteFaceToPrinting(faceBuf, printingBuf, pIdx);
    expect(marked(printingBuf)).toEqual([0, 1, 2]);
  });

  test("empty face buf produces empty printing buf", () => {
    const faceBuf = new Uint8Array(10);
    const printingBuf = new Uint8Array(pIdx.printingCount);
    promoteFaceToPrinting(faceBuf, printingBuf, pIdx);
    expect(marked(printingBuf)).toEqual([]);
  });
});
