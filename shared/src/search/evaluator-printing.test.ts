// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex, TEST_PRINTING_DATA } from "./evaluator.test-fixtures";
import { PrintingIndex } from "./printing-index";

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

  test("rarity:special matches Lightning Bolt (SLD printing)", () => {
    expect(cardCount("rarity:special")).toBe(1);
  });

  test("rarity>=rare includes special (special is between rare and mythic)", () => {
    expect(cardCount("rarity>=rare")).toBe(1);
  });

  test("rarity<mythic includes special-rarity printings", () => {
    expect(cardCount("rarity<mythic")).toBe(2);
  });

  test("usd>=5 matches Sol Ring (foil at $5.00)", () => {
    expect(cardCount("usd>=5")).toBe(1);
  });

  test("usd<1 matches both cards (Bolt A25 at $0.50, Sol Ring at $0.75)", () => {
    expect(cardCount("usd<1")).toBe(2);
  });

  test("$<1 matches same as usd<1 (Spec 074)", () => {
    expect(cardCount("$<1")).toBe(2);
  });

  test("$>=5 matches Sol Ring foil (Spec 074)", () => {
    expect(cardCount("$>=5")).toBe(1);
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

  test("date=2021 matches both cards (year range, Spec 061)", () => {
    expect(cardCount("date=2021")).toBe(2);
  });

  test("game:arena matches Lightning Bolt (has Arena printings)", () => {
    expect(cardCount("game:arena")).toBe(1);
  });

  test("game:paper matches both cards (all printings are paper)", () => {
    expect(cardCount("game:paper")).toBe(2);
  });

  test("game:mtgo matches Sol Ring only (C21 has MTGO)", () => {
    expect(cardCount("game:mtgo")).toBe(1);
  });

  test("in:arena matches Lightning Bolt (Spec 072)", () => {
    expect(cardCount("in:arena")).toBe(1);
  });

  test("in:mh2 matches Lightning Bolt (set disambiguation)", () => {
    expect(cardCount("in:mh2")).toBe(1);
  });

  test("in:rare matches Lightning Bolt (rarity disambiguation)", () => {
    expect(cardCount("in:rare")).toBe(1);
  });

  test("in:mh2 in:a25 matches Lightning Bolt (in both sets)", () => {
    expect(cardCount("in:mh2 in:a25")).toBe(1);
  });

  test("in:ru produces unsupported error", () => {
    const { result } = evaluate("in:ru");
    expect(result.error).toBe('unsupported in value "ru"');
  });

  test("in:foo produces unknown error", () => {
    const { result } = evaluate("in:foo");
    expect(result.error).toBe('unknown in value "foo"');
  });

  test("date>2025 matches nothing (no 2026+ printings in test data)", () => {
    expect(cardCount("date>2025")).toBe(0);
  });

  test("year=2025-02 produces error (Spec 061)", () => {
    const { result } = evaluate("year=2025-02");
    expect(result.error).toMatch(/invalid year/);
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

  test("is:nonfoil matches non-foil printings (including etched)", () => {
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

  test("set:mh2 usd>2 — MH2 foil at $3.00 qualifies", () => {
    expect(cardCount("set:mh2 usd>2")).toBe(1);
  });

  test("set:mh2 usd<1 — no MH2 printing under $1.00", () => {
    expect(cardCount("set:mh2 usd<1")).toBe(0);
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

  test("t:instant game:arena — instants with Arena printings (Lightning Bolt)", () => {
    expect(cardCount("t:instant game:arena")).toBe(1);
  });

  test("c:g set:mh2 — green cards in MH2 (none in test data)", () => {
    expect(cardCount("c:g set:mh2")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NOT with printing conditions
// ---------------------------------------------------------------------------

describe("NOT with printing domain", () => {
  test("-set:mh2 matches cards with non-MH2 printings", () => {
    // NOT stays in printing domain: rows not in MH2 = {2,3,4,5}.
    // Promotes to face: Bolt (rows 2,5) + Sol Ring (rows 3,4) = 2 cards.
    expect(cardCount("-set:mh2")).toBe(2);
  });

  test("-is:foil matches cards with non-foil printings", () => {
    // NOT stays in printing domain: non-foil rows = {0,2,3,5}.
    // Promotes to face: Bolt + Sol Ring = 2 cards.
    expect(cardCount("-is:foil")).toBe(2);
  });

  test("-rarity:rare matches cards with non-rare printings", () => {
    // NOT stays in printing domain: non-rare rows = {2,3,4,5}.
    // Promotes to face: Bolt + Sol Ring = 2 cards.
    expect(cardCount("-rarity:rare")).toBe(2);
  });

  test("t:instant -set:mh2 — instants with non-MH2 printings", () => {
    // -set:mh2 (printing): non-MH2 rows → faces 1,3.
    // t:instant (face): faces 1,2,5,9. Intersection: face 1 (Bolt).
    expect(cardCount("t:instant -set:mh2")).toBe(1);
  });

  test("-is:foil is:etched — etched rows that aren't foil (Scryfall semantics)", () => {
    // NOT stays in printing: non-foil rows = {0,2,3,5}. AND with
    // is:etched = {5}. Promotes to face: Bolt. = 1 card.
    expect(cardCount("-is:foil is:etched")).toBe(1);
  });

  test("-is:nonfoil is:etched — etched rows that aren't nonfoil", () => {
    // is:nonfoil (finish !== Foil) matches rows {0,2,3,5}.
    // NOT inverts in printing domain: rows {1,4}.
    // AND with is:etched {5}: empty. No row is both foil and etched.
    expect(cardCount("-is:nonfoil is:etched")).toBe(0);
  });

  test("is:etched alone matches Bolt (CMR etched printing)", () => {
    expect(cardCount("is:etched")).toBe(1);
  });

  test("-is:foil is:etched printingIndices returns only the etched row", () => {
    const { printingIndices } = evaluate("-is:foil is:etched");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([5]);
  });

  test("-set:mh2 lightning printingIndices excludes MH2 rows", () => {
    const { printingIndices } = evaluate("-set:mh2 lightning");
    expect(printingIndices).toBeDefined();
    // Bolt's non-MH2 printings: A25 (rows 2,10), CMR etched (row 5), WCD (row 6), SLD (row 8)
    expect(Array.from(printingIndices!)).toEqual([2, 5, 6, 8, 10]);
  });
});

// ---------------------------------------------------------------------------
// Spec 080: usd=null and negated price semantics
// ---------------------------------------------------------------------------

describe("Spec 080: usd null and negated price", () => {
  test("-usd=null matches printings with price data", () => {
    // All printings in standard fixture have price data
    expect(cardCount("-usd=null")).toBe(2);
  });

  test("usd=null matches no cards when all have price data", () => {
    expect(cardCount("usd=null")).toBe(0);
  });

  test("-usd>100 excludes null-price printings (operator inversion)", () => {
    // Row 1 (Bolt foil) set to 0 = no price data. usd>100 matches rows 4,5,8.
    // -usd>100 = usd<=100 should match 0,2,3,6,7,9,10 (NOT row 1).
    const dataWithNull = {
      ...TEST_PRINTING_DATA,
      price_usd: [100, 0, 50, 75, 500, 200, 10, 50, 200, 150, 60],
    };
    const pIdx = new PrintingIndex(dataWithNull);
    const cache = new NodeCache(index, pIdx);
    const { printingIndices } = cache.evaluate(parse("-usd>100"));
    expect(printingIndices).toBeDefined();
    const indices = Array.from(printingIndices!);
    expect(indices).not.toContain(1);
    expect(indices).toContain(0);
    expect(indices).toContain(2);
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
// OR printing intersection — printingIndices refinement (Issue #76, Spec 070)
// ---------------------------------------------------------------------------

describe("OR printing intersection (printingIndices)", () => {
  test("(set:sld OR set:mh2) lightning — only SLD + MH2 printings", () => {
    const { printingIndices } = evaluate("(set:sld OR set:mh2) lightning");
    expect(printingIndices).toBeDefined();
    // MH2 rows 0,1,9 + SLD row 8 — not A25(2,10), CMR(5), WCD(6)
    expect(Array.from(printingIndices!)).toEqual([0, 1, 8, 9]);
  });

  test("(set:sld OR set:c21) t:instant — only SLD Bolt printings, not C21 Sol Ring", () => {
    const { printingIndices } = evaluate("(set:sld OR set:c21) t:instant");
    expect(printingIndices).toBeDefined();
    // SLD row 8 is Bolt (instant). C21 rows 3,4 are Sol Ring (artifact).
    expect(Array.from(printingIndices!)).toEqual([8]);
  });

  test("(set:sld OR is:ub) lightning — only printing #8 (SLD+UB)", () => {
    // is:ub matches printing #8 (universesbeyond promo type). set:sld also matches #8.
    // Union is just #8. AND with "lightning" (Bolt) → #8 only.
    const { printingIndices } = evaluate("(set:sld OR is:ub) lightning");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([8]);
  });

  test("(set:sld OR set:mh2) — pure printing OR, no face constraint", () => {
    const { printingIndices } = evaluate("set:sld OR set:mh2");
    expect(printingIndices).toBeDefined();
    // MH2 rows 0,1,9 + SLD row 8
    expect(Array.from(printingIndices!)).toEqual([0, 1, 8, 9]);
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
  test("set:mh2 returns printing rows 0,1,9 (all MH2 printings)", () => {
    const { printingIndices } = evaluate("set:mh2");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1, 9]);
  });

  test("set:a25 returns printing rows 2,10", () => {
    const { printingIndices } = evaluate("set:a25");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([2, 10]);
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

  test("set:mh2 rarity:rare returns rows 0,1,9", () => {
    const { printingIndices } = evaluate("set:mh2 rarity:rare");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1, 9]);
  });

  test("cross-domain AND: t:instant set:mh2 refines printing indices", () => {
    const { printingIndices } = evaluate("t:instant set:mh2");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([0, 1, 9]);
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
    expect(result.matchCount).toBe(3);
  });

  test("printing-only AND: matchCount is printing-row count of intersection", () => {
    const { result } = evaluate("set:mh2 rarity:rare");
    expect(result.matchCount).toBe(3);
  });

  test("printing-only OR: matchCount is printing-row count of union", () => {
    const { result } = evaluate("set:mh2 OR set:c21");
    expect(result.matchCount).toBe(5);
  });

  test("cross-domain AND: matchCount is face count (promoted)", () => {
    const { result } = evaluate("t:instant set:mh2");
    expect(result.matchCount).toBe(1);
  });

  test("NOT of printing: matchCount is printing-row count", () => {
    // -set:mh2 stays in printing domain: 8 non-MH2 rows (2,3,4,5,6,7,8,10).
    const { result } = evaluate("-set:mh2");
    expect(result.matchCount).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Spec 082: dual counts (matchCountCards, matchCountPrints)
// ---------------------------------------------------------------------------

describe("dual counts (Spec 082)", () => {
  test("face-domain leaf t:creature has matchCountCards and matchCountPrints", () => {
    const { result } = evaluate("t:creature");
    expect(result.matchCountCards).toBe(4); // Birds, Tarmogoyf, Thalia, Ayara
    expect(result.matchCountPrints).toBe(0); // none of these have printings in fixture
  });

  test("printing-domain leaf set:mh2 has matchCountCards and matchCountPrints", () => {
    const { result } = evaluate("set:mh2");
    expect(result.matchCountPrints).toBe(3); // MH2 rows 0,1,9
    expect(result.matchCountCards).toBe(1); // Lightning Bolt only
  });

  test("cross-domain AND t:instant set:mh2 has dual counts on root and children", () => {
    const { result } = evaluate("t:instant set:mh2");
    expect(result.matchCountCards).toBe(1);
    expect(result.matchCountPrints).toBe(3);
    expect(result.children).toHaveLength(2);
    const [tInstant, setMh2] = result.children!;
    expect(tInstant.matchCountCards).toBe(4); // 4 instants
    expect(tInstant.matchCountPrints).toBe(8); // Bolt has 8 printings
    expect(setMh2.matchCountPrints).toBe(3);
    expect(setMh2.matchCountCards).toBe(1);
  });

  test("without PrintingIndex, dual counts are omitted", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("t:creature"));
    expect(result.matchCountCards).toBeUndefined();
    expect(result.matchCountPrints).toBeUndefined();
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
  test("is:foil usd<2 — no foil printing is under $2.00", () => {
    // Foil rows: #1 ($3.00), #4 ($5.00). Neither satisfies usd<2.
    expect(cardCount("is:foil usd<2")).toBe(0);
  });

  test("-set:mh2 lightning — Bolt survives via non-MH2 printings", () => {
    // -set:mh2 stays in printing domain (non-MH2 rows). Promoted to face:
    // Bolt (A25, CMR) + Sol Ring. AND with "lightning" (Bolt) → 1 card.
    expect(cardCount("-set:mh2 lightning")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Promo types (Spec 047, issue #72)
// ---------------------------------------------------------------------------

describe("promo types is: keywords", () => {
  test("is:poster matches Lightning Bolt (printing #8 has poster)", () => {
    expect(cardCount("is:poster")).toBe(1);
    expect(cardCount("is:poster lightning")).toBe(1);
  });

  test("is:rainbowfoil matches Lightning Bolt (printing #1 has rainbowfoil)", () => {
    expect(cardCount("is:rainbowfoil")).toBe(1);
  });

  test("is:glossy matches Sol Ring (printing #3 has glossy)", () => {
    expect(cardCount("is:glossy")).toBe(1);
    expect(cardCount("is:glossy sol")).toBe(1);
  });

  test("is:alchemy matches nothing (no alchemy in test data)", () => {
    expect(cardCount("is:alchemy")).toBe(0);
  });

  test("is:universesbeyond with printings loaded matches Lightning Bolt", () => {
    // Printing #8 (SLD) has universesbeyond promo type
    expect(cardCount("is:universesbeyond")).toBe(1);
    expect(cardCount("is:universesbeyond lightning")).toBe(1);
  });

  test("is:ub is alias for is:universesbeyond", () => {
    expect(cardCount("is:ub")).toBe(cardCount("is:universesbeyond"));
  });

  test("-is:poster matches cards without poster printings", () => {
    // Bolt has poster on #8, so -is:poster excludes Bolt. Sol Ring has no poster.
    // -is:poster matches all printings that are NOT poster. Promoted to face:
    // Bolt has printings 0,1,2,5,6 (non-poster) so Bolt still matches.
    // Sol Ring has printings 3,4,7 (none have poster) so Sol Ring matches.
    expect(cardCount("-is:poster")).toBe(2);
  });

  test("is:universesbeyond without printings falls back to face domain", () => {
    const cache = new NodeCache(index);
    const output = cache.evaluate(parse("is:universesbeyond"));
    // Face-domain: Dismember (face 9) has CardFlag.UniversesBeyond
    expect(output.indices.length).toBe(1);
    expect(output.indices[0]).toBe(9);
    expect(output.printingsUnavailable).toBe(false);
  });

  test("is:ub without printings falls back to face domain", () => {
    const cache = new NodeCache(index);
    const output = cache.evaluate(parse("is:ub"));
    expect(output.indices.length).toBe(1);
    expect(output.indices[0]).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Printing-level format legality (Spec 056)
// ---------------------------------------------------------------------------

describe("printing-level format legality", () => {
  test("f:commander with printing data produces printing-domain result", () => {
    const { result } = evaluate("f:commander");
    // All 9 cards are commander-legal, but matchCount is printing-row count
    // for printing-domain results. Tournament-usable rows: 0,1,2,3,4,5,8,9,10 (9 rows).
    // Rows 6 (GoldBorder) and 7 (Oversized) are excluded.
    expect(result.matchCount).toBe(9);
  });

  test("f:commander excludes gold-bordered printings", () => {
    const { printingIndices } = evaluate("f:commander unique:prints lightning");
    expect(printingIndices).toBeDefined();
    // Bolt has 8 printings: rows 0,1,2,5,8,9,10 (normal) + row 6 (GoldBorder).
    // f:commander should exclude row 6.
    expect(Array.from(printingIndices!)).toEqual([0, 1, 2, 5, 8, 9, 10]);
  });

  test("f:commander excludes oversized printings", () => {
    const output = evaluate("f:commander unique:prints sol");
    expect(output.printingIndices).toBeDefined();
    // Sol Ring has 3 printings: rows 3,4 (normal) + row 7 (Oversized).
    // f:commander should exclude row 7.
    expect(Array.from(output.printingIndices!)).toEqual([3, 4]);
  });

  test("-f:commander finds non-tournament-usable printings of legal cards", () => {
    // Bolt IS legal in commander, so -f:commander inverts the printing buffer.
    // For Bolt: rows 0,1,2,5 pass f:commander. Row 6 (GoldBorder) does NOT.
    // -f:commander matches row 6 for Bolt.
    // Sol Ring IS legal in commander. Rows 3,4 pass. Row 7 (Oversized) does NOT.
    // -f:commander matches row 7 for Sol Ring.
    const { printingIndices } = evaluate("-f:commander unique:prints (lightning OR sol)");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([6, 7]);
  });

  test("f:modern with printing data — Bolt has modern-legal non-gold printings", () => {
    const { printingIndices } = evaluate("f:modern unique:prints lightning");
    expect(printingIndices).toBeDefined();
    // Bolt is modern-legal. Normal printings: rows 0,1,2,5,8,9,10. Row 6 (gold) excluded.
    expect(Array.from(printingIndices!)).toEqual([0, 1, 2, 5, 8, 9, 10]);
  });

  test("f:pioneer filters at card level — Bolt is not pioneer-legal", () => {
    const output = evaluate("f:pioneer lightning");
    expect(output.indices.length).toBe(0);
  });

  test("banned:legacy matches Sol Ring (banned in legacy) excluding non-tournament", () => {
    const { printingIndices } = evaluate("banned:legacy unique:prints");
    expect(printingIndices).toBeDefined();
    // Sol Ring is banned in legacy. Tournament-usable printings: rows 3,4.
    // Row 7 (Oversized) is excluded.
    expect(Array.from(printingIndices!)).toEqual([3, 4]);
  });

  test("restricted:vintage matches Sol Ring excluding non-tournament", () => {
    const { printingIndices } = evaluate("restricted:vintage unique:prints");
    expect(printingIndices).toBeDefined();
    // Sol Ring is restricted in vintage. Tournament-usable printings: rows 3,4.
    expect(Array.from(printingIndices!)).toEqual([3, 4]);
  });

  test("f:commander without unique:prints still returns correct card set", () => {
    // Without unique:prints, result is face indices only (no printingIndices).
    const output = evaluate("f:commander");
    // All 9 cards are commander-legal; promoted to face = 9 cards with printings
    // that pass (Bolt + Sol Ring). But other cards have no printings, so
    // promotion only marks face indices 1 and 3.
    // Wait — promotePrintingToFace marks faces for which ANY printing passed.
    // Bolt (face 1): rows 0,1,2,5 pass → face 1 marked.
    // Sol Ring (face 3): rows 3,4 pass → face 3 marked.
    // Cards without printings (faces 0,2,4,5,6,7,9) have no printing rows, so
    // they are NOT marked. Only 2 cards survive promotion.
    expect(output.indices.length).toBe(2);
  });

  test("hasPrintingConditions is true for f:commander with printing data", () => {
    const output = evaluate("f:commander");
    expect(output.hasPrintingConditions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Face-domain fallback for legality (printing data not loaded)
// ---------------------------------------------------------------------------

describe("legality face-domain fallback", () => {
  function evaluateNoPI(query: string) {
    const cache = new NodeCache(index);
    return cache.evaluate(parse(query));
  }

  test("f:commander without printing data falls back to face-domain", () => {
    const output = evaluateNoPI("f:commander");
    // Face-domain: all 9 cards are commander-legal.
    expect(output.indices.length).toBe(9);
  });

  test("hasPrintingConditions is false for f:commander without printing data", () => {
    const output = evaluateNoPI("f:commander");
    expect(output.hasPrintingConditions).toBe(false);
  });

  test("printingsUnavailable is false for f:commander without printing data", () => {
    const output = evaluateNoPI("f:commander");
    expect(output.printingsUnavailable).toBe(false);
  });

  test("-f:commander without printing data uses face-domain NOT", () => {
    const output = evaluateNoPI("-f:commander");
    // Face-domain NOT: all 9 cards are commander-legal, so 0 cards match.
    expect(output.indices.length).toBe(0);
  });

  test("f:commander re-evaluates after setPrintingIndex", () => {
    const cache = new NodeCache(index);
    const before = cache.evaluate(parse("f:commander"));
    expect(before.indices.length).toBe(9);

    cache.setPrintingIndex(printingIndex);
    const after = cache.evaluate(parse("f:commander"));
    // Now printing-domain: only cards with tournament-usable printings.
    expect(after.indices.length).toBe(2);
    expect(after.hasPrintingConditions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// is:oversized
// ---------------------------------------------------------------------------

describe("is:oversized", () => {
  test("is:oversized matches oversized printings", () => {
    const output = evaluate("is:oversized");
    // Row 7 is oversized (Sol Ring). Promoted to face: 1 card.
    expect(output.indices.length).toBe(1);
    expect(Array.from(output.indices)).toEqual([3]); // Sol Ring face index
  });

  test("is:oversized printingIndices returns only oversized rows", () => {
    const { printingIndices } = evaluate("is:oversized");
    expect(printingIndices).toBeDefined();
    expect(Array.from(printingIndices!)).toEqual([7]);
  });

  test("-is:oversized excludes oversized printings", () => {
    const { printingIndices } = evaluate("-is:oversized unique:prints sol");
    expect(printingIndices).toBeDefined();
    // Sol Ring printings: rows 3,4,7. Excluding oversized: rows 3,4.
    expect(Array.from(printingIndices!)).toEqual([3, 4]);
  });
});

// ---------------------------------------------------------------------------
// is:spotlight, is:booster, is:masterpiece (Spec 073)
// ---------------------------------------------------------------------------

describe("is:spotlight is:booster is:masterpiece", () => {
  test("is:spotlight matches spotlight printings", () => {
    const output = evaluate("is:spotlight");
    expect(output.indices.length).toBe(1);
    expect(Array.from(output.indices)).toEqual([1]); // Lightning Bolt
    const { printingIndices } = evaluate("is:spotlight");
    expect(Array.from(printingIndices!)).toEqual([9]);
  });

  test("is:booster matches booster printings", () => {
    const { printingIndices } = evaluate("is:booster");
    expect(printingIndices).toBeDefined();
    // Row 10 has Booster flag
    expect(Array.from(printingIndices!)).toContain(10);
  });

  test("is:masterpiece matches masterpiece printings", () => {
    const { printingIndices } = evaluate("is:masterpiece");
    expect(printingIndices).toBeDefined();
    // Row 10 has Masterpiece flag
    expect(Array.from(printingIndices!)).toEqual([10]);
  });

  test("is:showcase matches nothing in test data", () => {
    const output = evaluate("is:showcase");
    expect(output.indices.length).toBe(0);
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
    const { result } = evaluate("usd:abc");
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

// ---------------------------------------------------------------------------
// unique:prints
// ---------------------------------------------------------------------------

describe("unique:prints", () => {
  test("unique:prints flag is set on output", () => {
    const output = evaluate("unique:prints");
    expect(output.uniqueMode).toBe("prints");
  });

  test("unique:art flag is set on output", () => {
    const output = evaluate("unique:art");
    expect(output.uniqueMode).toBe("art");
  });

  test("unique:cards is explicit and sets cards mode", () => {
    const output = evaluate("unique:cards");
    expect(output.uniqueMode).toBe("cards");
  });

  test("last legal unique: term wins", () => {
    expect(evaluate("unique:prints unique:cards").uniqueMode).toBe("cards");
    expect(evaluate("unique:cards unique:art").uniqueMode).toBe("art");
    expect(evaluate("unique:art unique:prints").uniqueMode).toBe("prints");
  });

  test("unique:prints with face-only query expands all printings", () => {
    const output = evaluate("t:instant unique:prints");
    // t:instant matches 4 cards (Bolt, Counterspell, Azorius Charm, Dismember).
    // Only Bolt has printings (rows 0,1,2,5,6,8). Others have none.
    expect(output.uniqueMode).toBe("prints");
    expect(output.indices.length).toBe(4);
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([0, 1, 2, 5, 6, 8, 9, 10]);
  });

  test("unique:prints alone expands all printings of all cards", () => {
    const output = evaluate("unique:prints");
    // All 9 cards match. Printings: Bolt (0,1,2,5,6,8,9,10) + Sol Ring (3,4,7).
    expect(output.indices.length).toBe(9);
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([0, 1, 2, 5, 6, 8, 9, 10, 3, 4, 7]);
  });

  test("unique:prints with printing conditions returns only matching printings", () => {
    // r:rare matches Bolt (rows 0,1,6,9 are rare). unique:prints should return
    // only the rare printing rows, not all Bolt printings.
    const output = evaluate("r:rare unique:prints");
    expect(output.uniqueMode).toBe("prints");
    expect(output.indices.length).toBe(1); // Bolt only
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([0, 1, 6, 9]);
  });

  test("is:foil unique:prints returns only foil printings", () => {
    // Foil rows: #1 (Bolt MH2 foil), #4 (Sol Ring C21 foil).
    const output = evaluate("is:foil unique:prints");
    expect(output.uniqueMode).toBe("prints");
    expect(output.indices.length).toBe(2); // Bolt + Sol Ring
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([1, 4]);
  });

  test("is:nonfoil unique:prints returns only nonfoil printings", () => {
    // Nonfoil rows (finish !== Foil): #0, #2, #3, #5, #6, #7, #8, #9, #10.
    // Order: by face (indices), then printingsOf(face) — Bolt first, then Sol Ring.
    const output = evaluate("is:nonfoil unique:prints");
    expect(output.uniqueMode).toBe("prints");
    expect(output.indices.length).toBe(2); // Bolt + Sol Ring
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([0, 2, 5, 6, 8, 9, 10, 3, 7]);
  });

  test("-is:foil unique:prints returns non-foil printings", () => {
    // NOT preserves printing domain: non-foil rows = {0,2,3,5,6,7,8,9,10}.
    // Order: by face, then printingsOf(face).
    const output = evaluate("-is:foil unique:prints");
    expect(output.uniqueMode).toBe("prints");
    expect(output.printingIndices).toBeDefined();
    expect(Array.from(output.printingIndices!)).toEqual([0, 2, 5, 6, 8, 9, 10, 3, 7]);
  });

  test("unique:prints is not treated as a filter (does not affect card count)", () => {
    const without = evaluate("t:instant");
    const with_ = evaluate("t:instant unique:prints");
    expect(with_.indices.length).toBe(without.indices.length);
  });

  test("unique:prints flag is false for normal queries", () => {
    const output = evaluate("t:creature");
    expect(output.uniqueMode).toBe("cards");
  });

  test("hasPrintingConditions is false for pure unique:prints (it's a modifier, not a condition)", () => {
    const output = evaluate("unique:prints");
    expect(output.hasPrintingConditions).toBe(false);
  });

  test("hasPrintingConditions is true when unique:prints is combined with printing conditions", () => {
    const output = evaluate("r:rare unique:prints");
    expect(output.hasPrintingConditions).toBe(true);
  });

  test("unique:prints breakdown shows modifier label, not filter", () => {
    const output = evaluate("unique:prints");
    // The unique:prints node should appear in the breakdown
    expect(output.result.matchCount).toBe(9);
  });

  test("++ alias sets uniqueMode prints (Spec 048)", () => {
    const output = evaluate("++");
    expect(output.uniqueMode).toBe("prints");
  });

  test("@@ alias sets uniqueMode art (Spec 048)", () => {
    const output = evaluate("@@");
    expect(output.uniqueMode).toBe("art");
  });

  test("++ and unique:prints produce same uniqueMode", () => {
    expect(evaluate("t:creature ++").uniqueMode).toBe(evaluate("t:creature unique:prints").uniqueMode);
  });

  test("@@ and unique:art produce same uniqueMode", () => {
    expect(evaluate("t:creature @@").uniqueMode).toBe(evaluate("t:creature unique:art").uniqueMode);
  });
});

// ---------------------------------------------------------------------------
// include:extras
// ---------------------------------------------------------------------------

describe("include:extras", () => {
  test("include:extras flag is set on output", () => {
    const output = evaluate("include:extras");
    expect(output.includeExtras).toBe(true);
  });

  test("include:extras matches all cards (does not reduce results)", () => {
    const output = evaluate("include:extras");
    expect(output.indices.length).toBe(9);
  });

  test("include:extras combined with filter does not affect card count", () => {
    const without = evaluate("t:instant");
    const with_ = evaluate("t:instant include:extras");
    expect(with_.indices.length).toBe(without.indices.length);
  });

  test("includeExtras is false for normal queries", () => {
    const output = evaluate("t:creature");
    expect(output.includeExtras).toBe(false);
  });

  test("includeExtras is false for unique:prints", () => {
    const output = evaluate("unique:prints");
    expect(output.includeExtras).toBe(false);
  });

  test("include:extras with unique:prints sets both flags", () => {
    const output = evaluate("include:extras unique:prints");
    expect(output.includeExtras).toBe(true);
    expect(output.uniqueMode).toBe("prints");
  });

  test("include:extras breakdown shows modifier, not filter", () => {
    const output = evaluate("include:extras");
    expect(output.result.matchCount).toBe(9);
  });

  test("include:foo produces an error", () => {
    const output = evaluate("include:foo");
    expect(output.result.error).toBeDefined();
    expect(output.result.error).toContain("foo");
  });

  test("hasPrintingConditions is false for pure include:extras", () => {
    const output = evaluate("include:extras");
    expect(output.hasPrintingConditions).toBe(false);
  });

  test("include:extras inside NOT still sets the flag", () => {
    const output = evaluate("-include:extras t:creature");
    expect(output.includeExtras).toBe(true);
  });

  test("include:extras inside OR still sets the flag", () => {
    const output = evaluate("t:creature OR include:extras");
    expect(output.includeExtras).toBe(true);
  });

  test("** alias sets includeExtras (Spec 057)", () => {
    const output = evaluate("**");
    expect(output.includeExtras).toBe(true);
  });

  test("** alias matches all cards", () => {
    const output = evaluate("**");
    expect(output.indices.length).toBe(9);
  });

  test("** and include:extras produce same includeExtras", () => {
    expect(evaluate("t:creature **").includeExtras).toBe(evaluate("t:creature include:extras").includeExtras);
  });

  test("** combined with filter does not affect card count", () => {
    const without = evaluate("t:instant");
    const with_ = evaluate("t:instant **");
    expect(with_.indices.length).toBe(without.indices.length);
  });
});

// ---------------------------------------------------------------------------
// view: (Spec 058 — display modifier, does not filter)
// ---------------------------------------------------------------------------

describe("view:", () => {
  test("view:slim does not filter (matches all)", () => {
    const output = evaluate("view:slim");
    expect(output.indices.length).toBe(9);
  });

  test("view:images combined with filter does not affect card count", () => {
    const without = evaluate("t:instant");
    const with_ = evaluate("t:instant view:images");
    expect(with_.indices.length).toBe(without.indices.length);
  });

  test("view:invalid does not filter (display modifier, ignored for filtering)", () => {
    const output = evaluate("t:creature view:invalid");
    expect(output.indices.length).toBe(4); // t:creature count
  });

  test("v:slim alias works like view:slim (Spec 083)", () => {
    const output = evaluate("v:slim");
    expect(output.indices.length).toBe(9);
  });

  test("v:images alias works like view:images (Spec 083)", () => {
    const without = evaluate("t:instant");
    const with_ = evaluate("t:instant v:images");
    expect(with_.indices.length).toBe(without.indices.length);
  });
});

// ---------------------------------------------------------------------------
// sort: (Spec 059 — sort directive, does not filter)
// ---------------------------------------------------------------------------

describe("sort:", () => {
  test("sort:name produces match-all buffer", () => {
    const output = evaluate("sort:name");
    expect(output.indices.length).toBe(9);
  });

  test("-sort:name produces match-all (NOT does not invert)", () => {
    const output = evaluate("-sort:name");
    expect(output.indices.length).toBe(9);
  });

  test("sort:foo produces match-all + error", () => {
    const output = evaluate("sort:foo");
    expect(output.indices.length).toBe(9);
    expect(output.result.error).toBe('unknown sort field "foo"');
  });

  test("-sort:foo produces match-all + error", () => {
    const output = evaluate("-sort:foo");
    expect(output.indices.length).toBe(9);
  });

  test("sort:name combined with filter does not reduce results", () => {
    const without = evaluate("t:creature");
    const with_ = evaluate("t:creature sort:name");
    expect(with_.indices.length).toBe(without.indices.length);
  });

  test("-sort:name combined with filter does not reduce results", () => {
    const without = evaluate("t:creature");
    const with_ = evaluate("t:creature -sort:name");
    expect(with_.indices.length).toBe(without.indices.length);
  });

  test("sort: is not treated as printing condition", () => {
    const output = evaluate("sort:usd");
    expect(output.hasPrintingConditions).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sort: — sortBy extraction (Spec 059)
// ---------------------------------------------------------------------------

describe("sort: sortBy extraction", () => {
  test("sort:mv → asc face-domain", () => {
    const { sortBy } = evaluate("t:creature sort:mv");
    expect(sortBy).toEqual({ field: "mv", direction: "asc", isPrintingDomain: false });
  });

  test("-sort:mv → desc (reversed)", () => {
    const { sortBy } = evaluate("t:creature -sort:mv");
    expect(sortBy).toEqual({ field: "mv", direction: "desc", isPrintingDomain: false });
  });

  test("sort:date → desc (default) printing-domain", () => {
    const { sortBy } = evaluate("sort:date");
    expect(sortBy).toEqual({ field: "date", direction: "desc", isPrintingDomain: true });
  });

  test("-sort:date → asc (reversed)", () => {
    const { sortBy } = evaluate("-sort:date");
    expect(sortBy).toEqual({ field: "date", direction: "asc", isPrintingDomain: true });
  });

  test("sort:name → asc", () => {
    const { sortBy } = evaluate("sort:name");
    expect(sortBy).toEqual({ field: "name", direction: "asc", isPrintingDomain: false });
  });

  test("-sort:name → desc (reversed)", () => {
    const { sortBy } = evaluate("-sort:name");
    expect(sortBy).toEqual({ field: "name", direction: "desc", isPrintingDomain: false });
  });

  test("sort:power → desc (default)", () => {
    const { sortBy } = evaluate("sort:power");
    expect(sortBy).toEqual({ field: "power", direction: "desc", isPrintingDomain: false });
  });

  test("-sort:power → asc (reversed)", () => {
    const { sortBy } = evaluate("-sort:power");
    expect(sortBy).toEqual({ field: "power", direction: "asc", isPrintingDomain: false });
  });

  test("aliases: sort:cmc → field mv", () => {
    const { sortBy } = evaluate("sort:cmc");
    expect(sortBy!.field).toBe("mv");
  });

  test("aliases: sort:pow → field power", () => {
    const { sortBy } = evaluate("sort:pow");
    expect(sortBy!.field).toBe("power");
  });

  test("aliases: sort:usd → field usd", () => {
    const { sortBy } = evaluate("sort:usd");
    expect(sortBy!.field).toBe("usd");
  });

  test("aliases: sort:$ → field usd (Spec 074)", () => {
    const { sortBy } = evaluate("sort:$");
    expect(sortBy!.field).toBe("usd");
  });

  test("aliases: sort:released → field date", () => {
    const { sortBy } = evaluate("sort:released");
    expect(sortBy!.field).toBe("date");
  });

  test("last valid wins: sort:name sort:usd → usd", () => {
    const { sortBy } = evaluate("sort:name sort:usd");
    expect(sortBy).toEqual({ field: "usd", direction: "asc", isPrintingDomain: true });
  });

  test("invalid trailing does not override: sort:name sort:bogus → name", () => {
    const { sortBy } = evaluate("sort:name sort:bogus");
    expect(sortBy).toEqual({ field: "name", direction: "asc", isPrintingDomain: false });
  });

  test("no sort term → sortBy is null", () => {
    const { sortBy } = evaluate("t:creature");
    expect(sortBy).toBeNull();
  });

  test("only invalid sort → sortBy is null", () => {
    const { sortBy } = evaluate("sort:bogus");
    expect(sortBy).toBeNull();
  });

  test("sort: is case-insensitive", () => {
    const { sortBy } = evaluate("Sort:Name");
    expect(sortBy).toEqual({ field: "name", direction: "asc", isPrintingDomain: false });
  });

  test("sort inside OR: last valid wins", () => {
    const { sortBy } = evaluate("(sort:name OR t:creature) sort:mv");
    expect(sortBy).toEqual({ field: "mv", direction: "asc", isPrintingDomain: false });
  });
});
