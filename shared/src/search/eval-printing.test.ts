// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { PrintingIndex } from "./printing-index";
import {
  evalPrintingField,
  evalFlavorRegex,
  isPrintingField,
  promotePrintingToFace,
  promoteFaceToPrinting,
} from "./eval-printing";
import type { PrintingColumnarData, FlavorTagData, ArtistIndexData } from "../data";
import { Rarity, Finish, Frame, Game } from "../bits";

// ---------------------------------------------------------------------------
// Synthetic printing data (7 rows, 2 canonical faces)
// ---------------------------------------------------------------------------
//
// Row #0  Lightning Bolt  | MH2  | rare     | nonfoil | $1.00 | 2015 | 2021-06-18
// Row #1  Lightning Bolt  | MH2  | rare     | foil    | $3.00 | 2015 | 2021-06-18
// Row #2  Lightning Bolt  | A25  | uncommon | nonfoil | $0.50 | 2015 | 2018-03-16
// Row #3  Sol Ring        | C21  | uncommon | nonfoil | $0.75 | 2015 | 2021-06-18
// Row #4  Sol Ring        | C21  | uncommon | foil    | $5.00 | 2015 | 2021-06-18
// Row #5  Lightning Bolt  | SLD  | special  | nonfoil | $2.00 | 2015 | 2020-11-06
// Row #6  Lightning Bolt  | SLB  | bonus    | nonfoil | $1.50 | 2015 | 2021-05-15
//
// canonical_face_ref maps: Bolt → face 1, Sol Ring → face 3

const PRINTING_DATA: PrintingColumnarData = {
  canonical_face_ref: [1, 1, 1, 3, 3, 1, 1],
  scryfall_ids: ["a", "b", "c", "d", "e", "f", "g"],
  collector_numbers: ["261", "261", "113", "280", "280", "1", "1b"],
  tcgplayer_product_ids: [0, 0, 0, 0, 0, 0, 0],
  set_indices: [0, 0, 1, 2, 2, 3, 4],
  rarity: [Rarity.Rare, Rarity.Rare, Rarity.Uncommon, Rarity.Uncommon, Rarity.Uncommon, Rarity.Special, Rarity.Bonus],
  printing_flags: [0, 0, 0, 0, 0, 0, 0],
  finish: [Finish.Nonfoil, Finish.Foil, Finish.Nonfoil, Finish.Nonfoil, Finish.Foil, Finish.Nonfoil, Finish.Nonfoil],
  frame: [Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015, Frame.Y2015],
  price_usd: [100, 300, 50, 75, 500, 200, 150],
  released_at: [20210618, 20210618, 20180316, 20210618, 20210618, 20201106, 20210515],
  games: [
    Game.Paper | Game.Arena,  // 0,1 MH2
    Game.Paper | Game.Arena,
    Game.Paper | Game.Arena,  // 2 A25
    Game.Paper | Game.Mtgo,   // 3,4 C21
    Game.Paper | Game.Mtgo,
    Game.Paper | Game.Arena,  // 5 SLD
    Game.Paper | Game.Arena,  // 6 SLB bonus
  ],
  set_lookup: [
    { code: "MH2", name: "Modern Horizons 2", released_at: 20210618, set_type: "expansion" },
    { code: "A25", name: "Masters 25", released_at: 20180316, set_type: "masters" },
    { code: "C21", name: "Commander 2021", released_at: 20210618, set_type: "commander" },
    { code: "SLD", name: "Secret Lair Drop Series", released_at: 20201106, set_type: "box" },
    { code: "SLB", name: "Secret Lair Bonus", released_at: 20210515, set_type: "memorabilia" },
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
    for (const f of [
      "set", "set_type", "rarity", "usd", "collectornumber", "frame", "year", "date", "game", "in",
      "atag", "flavor", "artist",
    ]) {
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

  test("prefix matching no code match yields unknown set error (Spec 047)", () => {
    const { buf, error } = evalField("set", ":", "xxx");
    expect(error).toBe('unknown set "xxx"');
    expect(marked(buf)).toEqual([]);
  });

  test("prefix sl matches SLD and SLB rows", () => {
    expect(marked(evalField("set", ":", "sl").buf)).toEqual([5, 6]);
  });

  test("empty set value matches all printings with non-empty normalized set code", () => {
    expect(marked(evalField("set", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("empty set= is neutral (all printings)", () => {
    expect(marked(evalField("set", "=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("set= exact match (not prefix)", () => {
    expect(marked(evalField("set", "=", "mh2").buf)).toEqual([0, 1]);
    const { error } = evalField("set", "=", "sl");
    expect(error).toBe('unknown set "sl"');
  });

  test("empty set value skips rows whose set code normalizes to empty", () => {
    const dataWithHole: PrintingColumnarData = {
      ...PRINTING_DATA,
      canonical_face_ref: [...PRINTING_DATA.canonical_face_ref, 1],
      scryfall_ids: [...PRINTING_DATA.scryfall_ids, "h"],
      collector_numbers: [...PRINTING_DATA.collector_numbers, "0"],
      tcgplayer_product_ids: [...PRINTING_DATA.tcgplayer_product_ids, 0],
      set_indices: [...PRINTING_DATA.set_indices, 0],
      rarity: [...PRINTING_DATA.rarity, Rarity.Rare],
      printing_flags: [...PRINTING_DATA.printing_flags, 0],
      finish: [...PRINTING_DATA.finish, Finish.Nonfoil],
      frame: [...PRINTING_DATA.frame, Frame.Y2015],
      price_usd: [...PRINTING_DATA.price_usd, 100],
      released_at: [...PRINTING_DATA.released_at, 20210618],
      games: [...(PRINTING_DATA.games ?? []), Game.Paper | Game.Arena],
      set_lookup: [
        ...PRINTING_DATA.set_lookup,
        { code: "", name: "Bad row", released_at: 20210618 },
      ],
    };
    // New row uses last set_lookup entry (empty code) via set_indices pointing to index 5
    dataWithHole.set_indices[dataWithHole.set_indices.length - 1] = 5;
    const pIdxHole = new PrintingIndex(dataWithHole);
    const buf = new Uint8Array(pIdxHole.printingCount);
    const err = evalPrintingField("set", ":", "", pIdxHole, buf);
    expect(err).toBeNull();
    expect(marked(buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("set does not support != operator", () => {
    const { error } = evalField("set", "!=", "mh2");
    expect(error).toBe('set: does not support operator "!="');
  });
});

// ---------------------------------------------------------------------------
// set_type (Spec 179)
// ---------------------------------------------------------------------------

describe("set_type field", () => {
  test("prefix matches masters and memorabilia (set_type:m)", () => {
    expect(marked(evalField("set_type", ":", "m").buf)).toEqual([2, 6]);
  });

  test("expansion prefix matches MH2 rows only", () => {
    expect(marked(evalField("set_type", ":", "exp").buf)).toEqual([0, 1]);
  });

  test("unknown prefix yields unknown set_type error (Spec 179)", () => {
    const { buf, error } = evalField("set_type", ":", "zzzunused");
    expect(error).toBe('unknown set_type "zzzunused"');
    expect(marked(buf)).toEqual([]);
  });

  test("empty value matches rows with non-empty normalized set type", () => {
    expect(marked(evalField("set_type", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("empty set_type= is neutral (all printings)", () => {
    expect(marked(evalField("set_type", "=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("set_type= exact match (not prefix)", () => {
    expect(marked(evalField("set_type", "=", "masters").buf)).toEqual([2]);
    const { error } = evalField("set_type", "=", "m");
    expect(error).toBe('unknown set_type "m"');
  });

  test("unsupported operator returns error", () => {
    const { error } = evalField("set_type", "!=", "masters");
    expect(error).toBe(`set_type: does not support operator "!="`);
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
    expect(marked(evalField("rarity", ">=", "rare").buf)).toEqual([0, 1, 5, 6]);
    expect(marked(evalField("rarity", ">=", "uncommon").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("> comparison is strictly greater", () => {
    expect(marked(evalField("rarity", ">", "uncommon").buf)).toEqual([0, 1, 5, 6]);
    expect(marked(evalField("rarity", ">", "rare").buf)).toEqual([5, 6]);
  });

  test("<= comparison includes lower rarities", () => {
    expect(marked(evalField("rarity", "<=", "uncommon").buf)).toEqual([2, 3, 4]);
    expect(marked(evalField("rarity", "<=", "rare").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("< comparison is strictly less", () => {
    expect(marked(evalField("rarity", "<", "rare").buf)).toEqual([2, 3, 4]);
    expect(marked(evalField("rarity", "<", "uncommon").buf)).toEqual([]);
  });

  test("< mythic includes special (special is between rare and mythic)", () => {
    expect(marked(evalField("rarity", "<", "mythic").buf)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("rarity", "!=", "rare").buf)).toEqual([2, 3, 4, 5, 6]);
    expect(marked(evalField("rarity", "!=", "uncommon").buf)).toEqual([0, 1, 5, 6]);
  });

  test("special matches special-rarity row", () => {
    expect(marked(evalField("rarity", ":", "special").buf)).toEqual([5]);
  });

  test("s abbreviation works for special", () => {
    expect(marked(evalField("rarity", ":", "s").buf)).toEqual([5]);
  });

  test("mythic matches nothing in this dataset", () => {
    expect(marked(evalField("rarity", ":", "mythic").buf)).toEqual([]);
  });

  test(">=common matches everything", () => {
    expect(marked(evalField("rarity", ">=", "common").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("rarity:bonus matches bonus-rarity row", () => {
    expect(marked(evalField("rarity", ":", "bonus").buf)).toEqual([6]);
  });

  test("r:bonus abbreviation works", () => {
    expect(marked(evalField("rarity", ":", "b").buf)).toEqual([6]);
  });

  test("rarity>mythic includes bonus", () => {
    expect(marked(evalField("rarity", ">", "mythic").buf)).toEqual([6]);
  });

  test("rarity<bonus excludes bonus", () => {
    expect(marked(evalField("rarity", "<", "bonus").buf)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("unknown rarity returns error", () => {
    const { error } = evalField("rarity", ":", "legendary");
    expect(error).toBe('unknown rarity "legendary"');
  });

  test("rarity:ra prefix matches rare (Spec 047 / 182)", () => {
    expect(marked(evalField("rarity", ":", "ra").buf)).toEqual([0, 1]);
  });

  test("rarity=r exact key r matches rare only", () => {
    expect(marked(evalField("rarity", "=", "r").buf)).toEqual([0, 1]);
  });

  test("rarity=rare exact matches rare", () => {
    expect(marked(evalField("rarity", "=", "rare").buf)).toEqual([0, 1]);
  });

  test("empty rarity: rarity= rarity!= neutral", () => {
    for (const op of [":", "=", "!="] as const) {
      expect(marked(evalField("rarity", op, "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });
});

// ---------------------------------------------------------------------------
// usd
// ---------------------------------------------------------------------------

describe("usd field", () => {
  test("exact match (dollars → cents)", () => {
    expect(marked(evalField("usd", ":", "1").buf)).toEqual([0]);
    expect(marked(evalField("usd", ":", "0.50").buf)).toEqual([2]);
  });

  test("> comparison", () => {
    expect(marked(evalField("usd", ">", "2").buf)).toEqual([1, 4]);
  });

  test("< comparison", () => {
    expect(marked(evalField("usd", "<", "1").buf)).toEqual([2, 3]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("usd", ">=", "1").buf)).toEqual([0, 1, 4, 5, 6]);
  });

  test("<= comparison", () => {
    expect(marked(evalField("usd", "<=", "0.75").buf)).toEqual([2, 3]);
  });

  test("!= comparison", () => {
    const result = marked(evalField("usd", "!=", "1").buf);
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("zero-price rows are excluded from all comparisons", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 150],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", ">=", "0", idx, buf);
    expect(marked(buf)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  test("invalid price returns error", () => {
    expect(evalField("usd", ":", "abc").error).toBe('invalid price "abc"');
  });

  test("usd=null matches printings with no price data (Spec 080)", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 150],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", "=", "null", idx, buf);
    expect(marked(buf)).toEqual([1]);
    const buf2 = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", ":", "null", idx, buf2);
    expect(marked(buf2)).toEqual([1]);
  });

  test("usd!=null matches printings with price data (Spec 080)", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 150],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", "!=", "null", idx, buf);
    expect(marked(buf)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  test("usd>null returns error (Spec 080)", () => {
    expect(evalField("usd", ">", "null").error).toBe("null cannot be used with comparison operators");
  });

  test("equatable-null prefix matches usd=null for = and != (Spec 172)", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 150],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", "=", "n", idx, buf);
    expect(marked(buf)).toEqual([1]);
    const bufNu = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", "!=", "nu", idx, bufNu);
    expect(marked(bufNu)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  test("usd>n on comparison op is invalid price not null error (Spec 172)", () => {
    expect(evalField("usd", ">", "n").error).toBe('invalid price "n"');
  });

  // -- Percentile (Spec 095) -------------------------------------------------

  test("usd>90% returns top 10% most expensive (Spec 095)", () => {
    // Prices: 50,75,100,200,300,500. Top 10% = 1 item = row 4 ($5)
    expect(marked(evalField("usd", ">", "90%").buf)).toEqual([4]);
  });

  test("usd<17% returns bottom 17% cheapest (Spec 095)", () => {
    // floor(6*0.17)=1 item = row 2 ($0.50)
    expect(marked(evalField("usd", "<", "17%").buf)).toEqual([2]);
  });

  test("usd=90% returns band 89.5-90.5% (Spec 095)", () => {
    // Band is 1 item at position 5
    expect(marked(evalField("usd", "=", "90%").buf)).toEqual([4]);
  });

  test("usd=0% returns bottom 0.5% band (edge clamp, Spec 095)", () => {
    // lo=0, hi=0.5; floor(6*0)=0 to ceil(6*0.005)=1 → index 0 = row 2 (cheapest)
    expect(marked(evalField("usd", "=", "0%").buf)).toEqual([2]);
  });

  test("usd=100% returns top 0.5% (edge clamp, Spec 095)", () => {
    // lo=99.5, hi=100; floor(5.97)=5 to floor(6)=6
    expect(marked(evalField("usd", "=", "100%").buf)).toEqual([4]);
  });

  test("usd percentile excludes null-price rows (Spec 095)", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 0],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("usd", ">", "80%", idx, buf);
    // 5 non-null: 50,75,100,200,500. Top 20% = 1 item = row 4 ($5)
    expect(marked(buf)).toEqual([4]);
  });

  test("invalid percentile returns error (Spec 095)", () => {
    expect(evalField("usd", ">", "150%").error).toBe('invalid percentile "150"');
    expect(evalField("usd", ">", "abc%").error).toBe('invalid percentile "abc"');
  });

  test("decimal percentiles work (Spec 095)", () => {
    expect(marked(evalField("usd", ">", "99.5%").buf)).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// collectornumber
// ---------------------------------------------------------------------------

describe("collectornumber field", () => {
  test("cn: prefix matches normalized collector strings (Spec 182)", () => {
    expect(marked(evalField("collectornumber", ":", "261").buf)).toEqual([0, 1]);
    expect(marked(evalField("collectornumber", ":", "113").buf)).toEqual([2]);
    expect(marked(evalField("collectornumber", ":", "280").buf)).toEqual([3, 4]);
    expect(marked(evalField("collectornumber", ":", "2").buf)).toEqual([0, 1, 3, 4]);
  });

  test("cn= exact only (Spec 182)", () => {
    expect(marked(evalField("collectornumber", "=", "261").buf)).toEqual([0, 1]);
    expect(evalField("collectornumber", "=", "2").error).toBe('unknown collector number "2"');
  });

  test("cn=1b matches bonus row only", () => {
    expect(marked(evalField("collectornumber", "=", "1b").buf)).toEqual([6]);
  });

  test("no match returns unknown collector number (Spec 182)", () => {
    const { buf, error } = evalField("collectornumber", ":", "999");
    expect(error).toBe('unknown collector number "999"');
    expect(marked(buf)).toEqual([]);
  });

  test("empty cn= and cn: are neutral (all printings)", () => {
    expect(marked(evalField("collectornumber", "=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("collectornumber", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("collectornumber", ":", "   ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("unsupported operator", () => {
    expect(evalField("collectornumber", "!=", "1").error).toContain("does not support operator");
  });
});

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------

describe("frame field", () => {
  test("2015 matches all rows", () => {
    expect(marked(evalField("frame", ":", "2015").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("prefix frame:2 ORs 1997, 2003, 2015 keys — all rows here are 2015", () => {
    expect(marked(evalField("frame", ":", "2").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("frame=2015 exact matches all rows", () => {
    expect(marked(evalField("frame", "=", "2015").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("frame=2 has no exact vocabulary key", () => {
    expect(evalField("frame", "=", "2").error).toBe('unknown frame "2"');
  });

  test("empty frame= is neutral (all printings)", () => {
    expect(marked(evalField("frame", "=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("frame", "=", "   ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("empty frame: is neutral like kw: (all printings)", () => {
    expect(marked(evalField("frame", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(evalField("frame", ":", "").error).toBe(null);
    expect(marked(evalField("frame", ":", "  ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("frame!= negates exact frame= only (all rows are 2015 → no row matches)", () => {
    expect(marked(evalField("frame", "!=", "2015").buf)).toEqual([]);
    expect(evalField("frame", "!=", "2015").error).toBe(null);
  });

  test("frame!=future excludes future rows on mixed data", () => {
    const mixedData: PrintingColumnarData = {
      ...PRINTING_DATA,
      frame: [Frame.Y2015, Frame.Future, Frame.Y2003, Frame.Y2015, Frame.Y1993, Frame.Y2015, Frame.Y2015],
    };
    const idx = new PrintingIndex(mixedData);
    const buf = new Uint8Array(idx.printingCount);
    expect(evalPrintingField("frame", "!=", "future", idx, buf)).toBe(null);
    expect(marked(buf)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  test("frame!=2 unknown (no exact vocabulary key)", () => {
    expect(evalField("frame", "!=", "2").error).toBe('unknown frame "2"');
  });

  test("empty frame!= is neutral", () => {
    expect(marked(evalField("frame", "!=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
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
      frame: [Frame.Y2015, Frame.Future, Frame.Y2003, Frame.Y2015, Frame.Y1993, Frame.Y2015, Frame.Y2015],
    };
    const idx = new PrintingIndex(mixedData);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("frame", ":", "future", idx, buf);
    expect(marked(buf)).toEqual([1]);
  });

  test("prefix frame:20 ORs 2003 and 2015 on mixed data", () => {
    const mixedData: PrintingColumnarData = {
      ...PRINTING_DATA,
      frame: [Frame.Y2015, Frame.Future, Frame.Y2003, Frame.Y2015, Frame.Y1993, Frame.Y2015, Frame.Y2015],
    };
    const idx = new PrintingIndex(mixedData);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("frame", ":", "20", idx, buf);
    expect(marked(buf)).toEqual([0, 2, 3, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// game
// ---------------------------------------------------------------------------

describe("game field", () => {
  test("game:arena matches rows with Arena availability", () => {
    expect(marked(evalField("game", ":", "arena").buf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("game:paper matches rows with paper availability", () => {
    expect(marked(evalField("game", ":", "paper").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("game:mtgo matches rows with MTGO availability", () => {
    expect(marked(evalField("game", ":", "mtgo").buf)).toEqual([3, 4]);
  });

  test("game:arena is case-insensitive", () => {
    expect(marked(evalField("game", ":", "ARENA").buf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("game!=arena matches rows without Arena", () => {
    expect(marked(evalField("game", "!=", "arena").buf)).toEqual([3, 4]);
  });

  test("game:a prefix ORs arena and astral (Spec 068 / 182)", () => {
    expect(marked(evalField("game", ":", "a").buf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("game=arena exact matches Arena rows only", () => {
    expect(marked(evalField("game", "=", "arena").buf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("game=a exact unknown — no vocabulary key a", () => {
    expect(evalField("game", "=", "a").error).toBe('unknown game "a"');
  });

  test("empty game: game= game!= neutral (all printings)", () => {
    for (const op of [":", "=", "!="] as const) {
      expect(marked(evalField("game", op, "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  test("unknown game returns error", () => {
    const { error } = evalField("game", ":", "xyz");
    expect(error).toBe('unknown game "xyz"');
  });

  test("unsupported operator returns error", () => {
    const { error } = evalField("game", ">", "arena");
    expect(error).toContain('does not support operator');
  });
});

// ---------------------------------------------------------------------------
// in (Spec 072)
// ---------------------------------------------------------------------------

describe("in field", () => {
  test("in:arena matches rows with Arena availability (game disambiguation)", () => {
    expect(marked(evalField("in", ":", "arena").buf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("in:mtgo matches rows with MTGO availability", () => {
    expect(marked(evalField("in", ":", "mtgo").buf)).toEqual([3, 4]);
  });

  test("in:mh2 matches rows in MH2 set (set disambiguation)", () => {
    expect(marked(evalField("in", ":", "mh2").buf)).toEqual([0, 1]);
  });

  test("in:a25 matches row 2 only", () => {
    expect(marked(evalField("in", ":", "a25").buf)).toEqual([2]);
  });

  test("in:rare matches rows with rare rarity (rarity disambiguation)", () => {
    expect(marked(evalField("in", ":", "rare").buf)).toEqual([0, 1]);
  });

  test("in:special matches row 5", () => {
    expect(marked(evalField("in", ":", "special").buf)).toEqual([5]);
  });

  test("in:bonus matches rows with bonus rarity", () => {
    expect(marked(evalField("in", ":", "bonus").buf)).toEqual([6]);
  });

  test("in:sl prefix-union ORs SLD and SLB set codes (Spec 182)", () => {
    expect(marked(evalField("in", ":", "sl").buf)).toEqual([5, 6]);
  });

  test("in= uses exact set / rarity disambiguation (Spec 182)", () => {
    expect(marked(evalField("in", "=", "mh2").buf)).toEqual([0, 1]);
    expect(marked(evalField("in", "=", "rare").buf)).toEqual([0, 1]);
    expect(evalField("in", "=", "sl").error).toBe('unknown in value "sl"');
  });

  test("in!=mh2 negates exact in=mh2 only (Spec 182)", () => {
    expect(marked(evalField("in", "!=", "mh2").buf)).toEqual([2, 3, 4, 5, 6]);
  });

  test("empty in:, in=, in!= are neutral (Spec 182 / ADR-022)", () => {
    expect(marked(evalField("in", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("in", "=", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("in", "!=", "  ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("in:ru returns unsupported (language out of scope)", () => {
    const { error } = evalField("in", ":", "ru");
    expect(error).toBe('unsupported in value "ru"');
  });

  test("in:japanese returns unsupported", () => {
    const { error } = evalField("in", ":", "japanese");
    expect(error).toBe('unsupported in value "japanese"');
  });

  test("in:foo returns unknown", () => {
    const { error } = evalField("in", ":", "foo");
    expect(error).toBe('unknown in value "foo"');
  });

  test("in: does not support comparison operators", () => {
    const { error } = evalField("in", ">", "rare");
    expect(error).toContain('does not support operator');
  });
});

// ---------------------------------------------------------------------------
// year
// ---------------------------------------------------------------------------

describe("year field", () => {
  test("exact year match", () => {
    expect(marked(evalField("year", ":", "2021").buf)).toEqual([0, 1, 3, 4, 6]);
    expect(marked(evalField("year", ":", "2018").buf)).toEqual([2]);
  });

  test("= operator same as :", () => {
    expect(marked(evalField("year", "=", "2018").buf)).toEqual([2]);
  });

  test("> comparison", () => {
    expect(marked(evalField("year", ">", "2018").buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("< comparison", () => {
    expect(marked(evalField("year", "<", "2020").buf)).toEqual([2]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("year", ">=", "2021").buf)).toEqual([0, 1, 3, 4, 6]);
  });

  test("<= comparison", () => {
    expect(marked(evalField("year", "<=", "2018").buf)).toEqual([2]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("year", "!=", "2021").buf)).toEqual([2, 5]);
  });

  test("rows with released_at=0 are excluded", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      released_at: [20210618, 0, 20180316, 20210618, 20210618, 20201106],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("year", ":", "2021", idx, buf);
    expect(marked(buf)).toEqual([0, 3, 4]);
  });

  test("invalid year returns error", () => {
    expect(evalField("year", ":", "abc").error).toBe('invalid year "abc"');
  });

  test("year=2025-02 produces error (year accepts only YYYY)", () => {
    expect(evalField("year", ":", "2025-02").error).toMatch(/invalid year/);
  });

  test("year=202 uses range semantics (2020s)", () => {
    expect(marked(evalField("year", ":", "202").buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("empty year: is neutral (all printings) — issue #259 / Spec 061", () => {
    expect(marked(evalField("year", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("year", "=", "  ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(evalField("year", ">=", "").error).toBeNull();
    expect(evalField("year", "!=", "").error).toBeNull();
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
    expect(marked(evalField("date", ">", "2020-01-01").buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("< comparison", () => {
    expect(marked(evalField("date", "<", "2020-01-01").buf)).toEqual([2]);
  });

  test(">= comparison", () => {
    expect(marked(evalField("date", ">=", "2018-03-16").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("<= comparison (date < hi for single-day range)", () => {
    expect(marked(evalField("date", "<=", "2018-03-16").buf)).toEqual([2]);
  });

  test("!= comparison", () => {
    expect(marked(evalField("date", "!=", "2021-06-18").buf)).toEqual([2, 5, 6]);
  });

  test("rows with released_at=0 are excluded", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      released_at: [0, 20210618, 20180316, 0, 20210618, 20201106],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("date", ">", "2000-01-01", idx, buf);
    expect(marked(buf)).toEqual([1, 2, 4, 5]);
  });

  test("invalid date format returns error", () => {
    expect(evalField("date", ":", "not-a-date").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "12345").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-123").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-01-123").error).toMatch(/invalid date/);
    expect(evalField("date", ":", "2020-01-01-05").error).toMatch(/invalid date/);
  });

  test("empty date: is neutral (all printings) — issue #259 / Spec 061", () => {
    expect(marked(evalField("date", ":", "").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(marked(evalField("date", ">", "  ").buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(evalField("date", "<=", "").error).toBeNull();
    expect(evalField("date", "!=", "").error).toBeNull();
  });

  // -- Range semantics (Spec 061) --------------------------------------------

  test("year-only date=2021 uses full year range", () => {
    const exact = evalField("date", ":", "2021");
    expect(exact.error).toBeNull();
    expect(marked(exact.buf)).toEqual([0, 1, 3, 4, 6]);
  });

  test("year-month date=2021-06 uses full month range", () => {
    const exact = evalField("date", ":", "2021-06");
    expect(exact.error).toBeNull();
    expect(marked(exact.buf)).toEqual([0, 1, 3, 4]);
  });

  test("date>=2021 matches rows in 2021", () => {
    const gte = evalField("date", ">=", "2021");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 3, 4, 6]);
  });

  test("year-month date<2018-04", () => {
    const lt = evalField("date", "<", "2018-04");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([2]);
  });

  test("partial year date>202 means date >= 2021 (floor semantics)", () => {
    const gt = evalField("date", ">", "202");
    expect(gt.error).toBeNull();
    expect(marked(gt.buf)).toEqual([0, 1, 3, 4, 6]);
  });

  test("partial year date>=202 means date >= 2020", () => {
    const gte = evalField("date", ">=", "202");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("partial year date=202 means 2020s range", () => {
    const eq = evalField("date", ":", "202");
    expect(eq.error).toBeNull();
    expect(marked(eq.buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("partial year date<202 means before 2020", () => {
    const lt = evalField("date", "<", "202");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([2]);
  });

  // -- Percentile (Spec 095) -------------------------------------------------

  test("date>90% returns newest 10% (Spec 095)", () => {
    // Dates: 2018-03-16, 2020-11-06, 2021-06-18×4. Newest 10% = 1 item
    const result = marked(evalField("date", ">", "90%").buf);
    expect(result.length).toBe(1);
    expect(pIdx.releasedAt[result[0]]).toBe(20210618);
  });

  test("date<17% returns oldest 17% (Spec 095)", () => {
    // floor(7*0.17)=1 item = oldest = row 2 (2018-03-16)
    expect(marked(evalField("date", "<", "17%").buf)).toEqual([2]);
  });

  test("date percentile excludes null-date rows (Spec 095)", () => {
    const dataWithZero: PrintingColumnarData = {
      ...PRINTING_DATA,
      released_at: [20210618, 0, 20180316, 20210618, 20210618, 20201106, 20210515],
    };
    const idx = new PrintingIndex(dataWithZero);
    const buf = new Uint8Array(idx.printingCount);
    evalPrintingField("date", ">", "80%", idx, buf);
    // 6 non-null. Newest 20% = 2 items
    expect(marked(buf).length).toBe(2);
  });

  test("partial year date<=202 means before 2021 (floor semantics)", () => {
    const lte = evalField("date", "<=", "202");
    expect(lte.error).toBeNull();
    expect(marked(lte.buf)).toEqual([2, 5]);
  });

  test("date>=2 matches all (2 -> 2000s)", () => {
    const gte = evalField("date", ">=", "2");
    expect(gte.error).toBeNull();
    expect(marked(gte.buf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("partial year date>20 same as date>2000", () => {
    const gt20 = evalField("date", ">", "20");
    const gt2000 = evalField("date", ">", "2000");
    expect(gt20.error).toBeNull();
    expect(gt2000.error).toBeNull();
    expect(marked(gt20.buf)).toEqual(marked(gt2000.buf));
  });

  test("partial year date>2 same as date>2000", () => {
    const gt2 = evalField("date", ">", "2");
    const gt2000 = evalField("date", ">", "2000");
    expect(gt2.error).toBeNull();
    expect(gt2000.error).toBeNull();
    expect(marked(gt2.buf)).toEqual(marked(gt2000.buf));
  });

  test("partial year date<20 matches only pre-2000", () => {
    const lt = evalField("date", "<", "20");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([]);
  });

  test("partial month range semantics", () => {
    // "2021-0" → [2021-01-01, 2021-10-01); date > that means date >= 2021-10-01 → none in test data
    const gt = evalField("date", ">", "2021-0");
    expect(gt.error).toBeNull();
    expect(marked(gt.buf)).toEqual([]);

    // "2018-1" → [2018-10-01, 2019-01-01); date < that matches row 2 (20180316)
    const lt = evalField("date", "<", "2018-1");
    expect(lt.error).toBeNull();
    expect(marked(lt.buf)).toEqual([2]);
  });

  test("partial day range semantics", () => {
    // "2021-06-1" → [2021-06-10, 2021-06-20); date > that means date >= 2021-06-20 → none (rows at 2021-06-18)
    const gt = evalField("date", ">", "2021-06-1");
    expect(gt.error).toBeNull();
    expect(marked(gt.buf)).toEqual([]);

    // date=2021-06-1 matches rows in that decade-day range
    const eq = evalField("date", ":", "2021-06-1");
    expect(eq.error).toBeNull();
    expect(marked(eq.buf)).toEqual([0, 1, 3, 4]);
  });

  test("trailing dashes are tolerated", () => {
    // "2021-" → month empty → 01, day → 01 → 20210101
    const r1 = evalField("date", ">=", "2021-");
    expect(r1.error).toBeNull();
    expect(marked(r1.buf)).toEqual([0, 1, 3, 4, 6]);

    // "2021-06-" → day empty → 01 → 20210601
    const r2 = evalField("date", ">=", "2021-06-");
    expect(r2.error).toBeNull();
    expect(marked(r2.buf)).toEqual([0, 1, 3, 4]);
  });

  test("out-of-range month is clamped", () => {
    // "2021-00" → month 0 clamped to 1 → 20210101
    const r1 = evalField("date", ">=", "2021-00");
    expect(r1.error).toBeNull();
    expect(marked(r1.buf)).toEqual([0, 1, 3, 4, 6]);

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
    // Rows 0,1,3,4 (2021-06-18), 5 (2020-11-06), 6 (2021-05-15) are > 2018-03-16
    expect(marked(buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("set code resolution is case-insensitive", () => {
    const { buf, error } = evalField("date", ">", "A25");
    expect(error).toBeNull();
    expect(marked(buf)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  test("date=mh2 matches printings released on MH2's date", () => {
    // MH2 released 2021-06-18, rows 0,1,3,4 have that date
    const { buf, error } = evalField("date", ":", "mh2");
    expect(error).toBeNull();
    expect(marked(buf)).toEqual([0, 1, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// flavor (Spec 142)
// ---------------------------------------------------------------------------

const FLAVOR_INDEX: FlavorTagData = {
  "mishra's artifact": [1, 0, 1, 2],
  "draw a card": [3, 3, 3, 4],
  "lightning strikes twice": [1, 5],
};

function evalFlavorField(op: string, val: string): { buf: Uint8Array; error: string | null } {
  const buf = new Uint8Array(pIdx.printingCount);
  const error = evalPrintingField("flavor", op, val, pIdx, buf, undefined, FLAVOR_INDEX);
  return { buf, error };
}

describe("flavor field", () => {
  test("substring match flavor:mishra", () => {
    expect(marked(evalFlavorField(":", "mishra").buf)).toEqual([0, 2]);
  });

  test("substring match ft:draw", () => {
    expect(marked(evalFlavorField(":", "draw").buf)).toEqual([3, 4]);
  });

  test("substring with spaces (draw a card)", () => {
    expect(marked(evalFlavorField(":", "draw a card").buf)).toEqual([3, 4]);
  });

  test("empty value matches all printings with flavor", () => {
    expect(marked(evalFlavorField(":", "").buf)).toEqual([0, 2, 3, 4, 5]);
  });

  test("returns error when flavor index null", () => {
    const buf = new Uint8Array(pIdx.printingCount);
    const error = evalPrintingField("flavor", ":", "x", pIdx, buf, undefined, null);
    expect(error).toBe("flavor index not loaded");
  });

  test("returns error for unsupported operator", () => {
    const { error } = evalFlavorField("!=", "mishra");
    expect(error).toBe('flavor: does not support operator "!="');
  });
});

// ---------------------------------------------------------------------------
// artist (Spec 149)
// ---------------------------------------------------------------------------

const ARTIST_INDEX: ArtistIndexData = {
  "vincent proce": [0, 0, 0, 1, 0, 2],
  "scott murphy": [0, 3, 0, 4],
  "anthony s. waters": [1, 3, 1, 4],
};

function evalArtistField(op: string, val: string): { buf: Uint8Array; error: string | null } {
  const buf = new Uint8Array(pIdx.printingCount);
  const error = evalPrintingField("artist", op, val, pIdx, buf, undefined, undefined, ARTIST_INDEX);
  return { buf, error };
}

describe("artist field", () => {
  test("substring match a:proce", () => {
    expect(marked(evalArtistField(":", "proce").buf)).toEqual([0, 1, 2]);
  });

  test("substring match artist:vincent", () => {
    expect(marked(evalArtistField(":", "vincent").buf)).toEqual([0, 1, 2]);
  });

  test("substring match artist:scott", () => {
    expect(marked(evalArtistField(":", "scott").buf)).toEqual([3, 4]);
  });

  test("empty value matches all printings with artist data", () => {
    expect(marked(evalArtistField(":", "").buf)).toEqual([0, 1, 2, 3, 4]);
  });

  test("returns error when artist index null", () => {
    const buf = new Uint8Array(pIdx.printingCount);
    const error = evalPrintingField("artist", ":", "x", pIdx, buf, undefined, undefined, null);
    expect(error).toBe("artist index not loaded");
  });

  test("returns error for unsupported operator", () => {
    const { error } = evalArtistField("!=", "proce");
    expect(error).toBe('artist: does not support operator "!="');
  });
});

describe("evalFlavorRegex", () => {
  test("regex match orc", () => {
    const idx: FlavorTagData = { "orc tribe": [1, 0], "orcs attack": [1, 2] };
    const buf = new Uint8Array(7);
    const error = evalFlavorRegex("orc", idx, pIdx, buf);
    expect(error).toBeNull();
    expect(marked(buf)).toEqual([0, 2]);
  });

  test("invalid regex returns error", () => {
    const buf = new Uint8Array(7);
    const error = evalFlavorRegex("[invalid", FLAVOR_INDEX, pIdx, buf);
    expect(error).toBe("invalid regex");
  });

  test("null flavor index returns error", () => {
    const buf = new Uint8Array(7);
    const error = evalFlavorRegex("mishra", null, pIdx, buf);
    expect(error).toBe("flavor index not loaded");
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

  test("expands face 1 to rows 0,1,2,5", () => {
    const faceBuf = new Uint8Array(10);
    faceBuf[1] = 1;
    const printingBuf = new Uint8Array(pIdx.printingCount);
    promoteFaceToPrinting(faceBuf, printingBuf, pIdx);
    expect(marked(printingBuf)).toEqual([0, 1, 2, 5, 6]);
  });

  test("empty face buf produces empty printing buf", () => {
    const faceBuf = new Uint8Array(10);
    const printingBuf = new Uint8Array(pIdx.printingCount);
    promoteFaceToPrinting(faceBuf, printingBuf, pIdx);
    expect(marked(printingBuf)).toEqual([]);
  });
});
