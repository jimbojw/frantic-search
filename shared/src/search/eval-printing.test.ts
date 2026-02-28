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
    expect(evalField("date", ":", "2021").error).toBe('invalid date "2021" (expected YYYY-MM-DD, "now", or a set code)');
    expect(evalField("date", ":", "not-a-date").error).toBe('invalid date "not-a-date" (expected YYYY-MM-DD, "now", or a set code)');
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
