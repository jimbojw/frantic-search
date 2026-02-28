// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Printing-domain integration tests (through NodeCache.evaluate)
//
// These use the full evaluator pipeline with both face-level (TEST_DATA, 10
// face rows, 9 canonical cards) and printing-level (TEST_PRINTING_DATA, 5
// printing rows) synthetic data. Only Lightning Bolt (face 1) and Sol Ring
// (face 3) have printings in this dataset.
// ---------------------------------------------------------------------------

function evaluate(query: string) {
  const cache = new NodeCache(index, printingIndex);
  return cache.evaluate(parse(query));
}

function cardCount(query: string): number {
  const { indices } = evaluate(query);
  return indices.length;
}

// ---------------------------------------------------------------------------
// Single printing-domain leaves
// ---------------------------------------------------------------------------

describe("printing-domain leaves", () => {
  test("set:mh2 matches Lightning Bolt (1 card)", () => {
    expect(cardCount("set:mh2")).toBe(1);
  });

  test("set:c21 matches Sol Ring (1 card)", () => {
    expect(cardCount("set:c21")).toBe(1);
  });

  test("set:a25 matches Lightning Bolt (same card, different set)", () => {
    expect(cardCount("set:a25")).toBe(1);
  });

  test("set:xxx matches nothing", () => {
    expect(cardCount("set:xxx")).toBe(0);
  });

  test("rarity:rare matches Lightning Bolt only", () => {
    expect(cardCount("rarity:rare")).toBe(1);
  });

  test("rarity:uncommon matches both Bolt (A25) and Sol Ring", () => {
    expect(cardCount("rarity:uncommon")).toBe(2);
  });

  test("rarity>=uncommon matches all cards with printings", () => {
    expect(cardCount("rarity>=uncommon")).toBe(2);
  });

  test("rarity>=rare matches only Lightning Bolt", () => {
    expect(cardCount("rarity>=rare")).toBe(1);
  });

  test("price>=5 matches Sol Ring (foil at $5.00)", () => {
    expect(cardCount("price>=5")).toBe(1);
  });

  test("price<1 matches both cards (Bolt A25 at $0.50, Sol Ring at $0.75)", () => {
    expect(cardCount("price<1")).toBe(2);
  });

  test("year:2018 matches Lightning Bolt (A25 printing)", () => {
    expect(cardCount("year:2018")).toBe(1);
  });

  test("year:2021 matches both cards", () => {
    expect(cardCount("year:2021")).toBe(2);
  });

  test('date:"2018-03-16" matches Lightning Bolt (quoted to avoid dash-as-NOT)', () => {
    expect(cardCount('date:"2018-03-16"')).toBe(1);
  });

  test("cn:113 matches Lightning Bolt (A25 printing)", () => {
    expect(cardCount("cn:113")).toBe(1);
  });

  test("frame:2015 matches both cards with printings", () => {
    expect(cardCount("frame:2015")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// is: keywords in printing domain
// ---------------------------------------------------------------------------

describe("printing is: keywords", () => {
  test("is:foil matches Bolt and Sol Ring (both have foil printings)", () => {
    expect(cardCount("is:foil")).toBe(2);
  });

  test("is:nonfoil matches Bolt and Sol Ring (both have nonfoil printings)", () => {
    expect(cardCount("is:nonfoil")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Two printing conditions AND (stays in printing domain)
// ---------------------------------------------------------------------------

describe("printing-only AND", () => {
  test("set:mh2 rarity:rare — both conditions on printing domain", () => {
    expect(cardCount("set:mh2 rarity:rare")).toBe(1);
  });

  test("set:a25 rarity:uncommon — Bolt's A25 printing is uncommon", () => {
    expect(cardCount("set:a25 rarity:uncommon")).toBe(1);
  });

  test("set:mh2 rarity:uncommon — MH2 Bolt is rare, not uncommon", () => {
    expect(cardCount("set:mh2 rarity:uncommon")).toBe(0);
  });

  test("set:c21 is:foil — Sol Ring has a foil C21 printing", () => {
    expect(cardCount("set:c21 is:foil")).toBe(1);
  });

  test("set:mh2 price>2 — MH2 foil at $3.00 qualifies", () => {
    expect(cardCount("set:mh2 price>2")).toBe(1);
  });

  test("set:mh2 price<1 — no MH2 printing under $1.00", () => {
    expect(cardCount("set:mh2 price<1")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-domain AND (face + printing)
// ---------------------------------------------------------------------------

describe("cross-domain AND", () => {
  test("t:instant set:mh2 — instants in MH2 (Lightning Bolt)", () => {
    expect(cardCount("t:instant set:mh2")).toBe(1);
  });

  test("t:artifact set:c21 — artifacts in C21 (Sol Ring)", () => {
    expect(cardCount("t:artifact set:c21")).toBe(1);
  });

  test("t:creature set:mh2 — no creatures have MH2 printings in test data", () => {
    expect(cardCount("t:creature set:mh2")).toBe(0);
  });

  test("c:r rarity:rare — red cards with rare printings (Lightning Bolt)", () => {
    expect(cardCount("c:r rarity:rare")).toBe(1);
  });

  test("c:g set:mh2 — green cards in MH2 (none in test data)", () => {
    expect(cardCount("c:g set:mh2")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NOT with printing conditions
// ---------------------------------------------------------------------------

describe("NOT with printing domain", () => {
  test("-set:mh2 excludes Lightning Bolt, leaves 8 cards", () => {
    expect(cardCount("-set:mh2")).toBe(8);
  });

  test("-is:foil excludes Bolt and Sol Ring, leaves 7 cards", () => {
    expect(cardCount("-is:foil")).toBe(7);
  });

  test("-rarity:rare excludes Bolt, leaves 8 cards", () => {
    expect(cardCount("-rarity:rare")).toBe(8);
  });

  test("t:instant -set:mh2 — instants without MH2 printings (3 of 4 instants)", () => {
    expect(cardCount("t:instant -set:mh2")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// OR with printing conditions
// ---------------------------------------------------------------------------

describe("OR with printing domain", () => {
  test("set:mh2 OR set:a25 — both sets have Bolt, so 1 card", () => {
    expect(cardCount("set:mh2 OR set:a25")).toBe(1);
  });

  test("set:mh2 OR set:c21 — Bolt + Sol Ring = 2 cards", () => {
    expect(cardCount("set:mh2 OR set:c21")).toBe(2);
  });

  test("set:mh2 OR t:creature — mixed domain OR (Bolt + 4 creatures)", () => {
    expect(cardCount("set:mh2 OR t:creature")).toBe(5);
  });

  test("(set:mh2 OR set:c21) t:instant — both sets, intersect with instants", () => {
    expect(cardCount("(set:mh2 OR set:c21) t:instant")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Face indices output
// ---------------------------------------------------------------------------

describe("face indices output", () => {
  test("set:mh2 returns face index 1 (Lightning Bolt)", () => {
    const { indices } = evaluate("set:mh2");
    expect(Array.from(indices)).toEqual([1]);
  });

  test("set:c21 returns face index 3 (Sol Ring)", () => {
    const { indices } = evaluate("set:c21");
    expect(Array.from(indices)).toEqual([3]);
  });

  test("rarity:uncommon returns face indices 1 and 3", () => {
    const { indices } = evaluate("rarity:uncommon");
    expect(Array.from(indices)).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// printingIndices output
// ---------------------------------------------------------------------------

describe("printingIndices output", () => {
  test("set:mh2 returns printing rows 0,1 (both MH2 printings)", () => {
    const { printingIndices } = evaluate("set:mh2");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1]);
  });

  test("set:a25 returns printing row 2 only", () => {
    const { printingIndices } = evaluate("set:a25");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([2]);
  });

  test("set:c21 returns printing rows 3,4", () => {
    const { printingIndices } = evaluate("set:c21");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([3, 4]);
  });

  test("set:mh2 is:foil returns only the foil MH2 printing (row 1)", () => {
    const { printingIndices } = evaluate("set:mh2 is:foil");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([1]);
  });

  test("set:mh2 rarity:rare returns rows 0,1", () => {
    const { printingIndices } = evaluate("set:mh2 rarity:rare");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1]);
  });

  test("cross-domain AND: t:instant set:mh2 refines printing indices", () => {
    const { printingIndices } = evaluate("t:instant set:mh2");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1]);
  });

  test("face-only query has no printingIndices", () => {
    const { printingIndices } = evaluate("t:creature");
    expect(printingIndices).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// matchCount semantics: printing-domain root reports printing-row count
// ---------------------------------------------------------------------------

describe("matchCount domain semantics", () => {
  test("printing-only leaf: matchCount is printing-row count", () => {
    const { result } = evaluate("set:mh2");
    expect(result.matchCount).toBe(2);
  });

  test("printing-only AND: matchCount is printing-row count of intersection", () => {
    const { result } = evaluate("set:mh2 rarity:rare");
    expect(result.matchCount).toBe(2);
  });

  test("printing-only OR: matchCount is printing-row count of union", () => {
    const { result } = evaluate("set:mh2 OR set:c21");
    expect(result.matchCount).toBe(4);
  });

  test("cross-domain AND: matchCount is face count (promoted)", () => {
    const { result } = evaluate("t:instant set:mh2");
    expect(result.matchCount).toBe(1);
  });

  test("NOT of printing: matchCount is face count", () => {
    const { result } = evaluate("-set:mh2");
    expect(result.matchCount).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// hasPrintingConditions / printingsUnavailable flags
// ---------------------------------------------------------------------------

describe("printing metadata flags", () => {
  test("hasPrintingConditions is true when query has printing leaves", () => {
    const { hasPrintingConditions } = evaluate("set:mh2");
    expect(hasPrintingConditions).toBe(true);
  });

  test("hasPrintingConditions is false for face-only queries", () => {
    const { hasPrintingConditions } = evaluate("t:creature");
    expect(hasPrintingConditions).toBe(false);
  });

  test("printingsUnavailable is false when printing index is loaded", () => {
    const { printingsUnavailable } = evaluate("set:mh2");
    expect(printingsUnavailable).toBe(false);
  });

  test("printingsUnavailable is true when printing index is missing", () => {
    const cache = new NodeCache(index);
    const { printingsUnavailable } = cache.evaluate(parse("set:mh2"));
    expect(printingsUnavailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spec 047 test-plan cases: finish+price intersection, NOT+bare-word
// ---------------------------------------------------------------------------

describe("spec 047 test cases", () => {
  test("is:foil price<2 — no foil printing is under $2.00", () => {
    // Foil rows: #1 ($3.00), #4 ($5.00). Neither satisfies price<2.
    expect(cardCount("is:foil price<2")).toBe(0);
  });

  test("-set:mh2 lightning — NOT promotes to face domain, excluding Bolt entirely", () => {
    // -set:mh2 excludes Lightning Bolt (card has MH2 printings).
    // Bare word "lightning" only matches Lightning Bolt → AND = 0.
    expect(cardCount("-set:mh2 lightning")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling with printing index present
// ---------------------------------------------------------------------------

describe("printing error handling", () => {
  test("unknown rarity returns error with printing index", () => {
    const { result } = evaluate("rarity:legendary");
    expect(result.error).toBe('unknown rarity "legendary"');
    expect(result.matchCount).toBe(-1);
  });

  test("unknown frame returns error", () => {
    const { result } = evaluate("frame:retro");
    expect(result.error).toBe('unknown frame "retro"');
    expect(result.matchCount).toBe(-1);
  });

  test("invalid price returns error", () => {
    const { result } = evaluate("price:abc");
    expect(result.error).toBe('invalid price "abc"');
    expect(result.matchCount).toBe(-1);
  });

  test("error in printing leaf is skipped in AND (face leaf still evaluates)", () => {
    const { result } = evaluate("t:creature rarity:legendary");
    expect(result.matchCount).toBe(4);
  });

  test("error in printing leaf propagates through NOT", () => {
    const { result } = evaluate("-rarity:legendary");
    expect(result.error).toBe('unknown rarity "legendary"');
    expect(result.matchCount).toBe(-1);
  });
});
