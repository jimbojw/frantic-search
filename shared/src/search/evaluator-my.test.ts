// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Spec 077: my:list query field
//
// Uses index (10 face rows) and printingIndex (11 printing rows).
// Face 1 = Lightning Bolt, Face 3 = Sol Ring (have printings).
// Printing 1 = Bolt foil, Printing 4 = Sol Ring foil.
// ---------------------------------------------------------------------------

function faceMask(indices: number[], faceCount: number): Uint8Array {
  const buf = new Uint8Array(faceCount);
  for (const i of indices) buf[i] = 1;
  return buf;
}

function printingMask(indices: number[], printingCount: number): Uint8Array {
  const buf = new Uint8Array(printingCount);
  for (const i of indices) buf[i] = 1;
  return buf;
}

const FACE_COUNT = 10;
const PRINTING_COUNT = 11;

describe("my:list list ID mapping", () => {
  const getListMask = () => ({ faceMask: faceMask([1], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("my:list maps to listId default", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1); // Lightning Bolt
  });

  test("my:default maps to listId default", () => {
    const out = cache.evaluate(parse("my:default"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1);
  });

  test("my: with empty value normalizes to my:list", () => {
    const out = cache.evaluate(parse("my:"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1);
  });
});

describe("my:list negation", () => {
  const getListMask = () => ({ faceMask: faceMask([1], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("-my:list returns only cards not in list", () => {
    const out = cache.evaluate(parse("-my:list"));
    expect(out.indices.length).toBe(9 - 1); // 9 canonical cards minus Bolt
    expect(out.indices.includes(1)).toBe(false);
  });
});

describe("my:list composition", () => {
  const getListMask = () => ({ faceMask: faceMask([1], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("my:list t:creature composes (AND)", () => {
    const out = cache.evaluate(parse("my:list t:creature"));
    expect(out.indices.length).toBe(0); // Bolt is Instant, not Creature
  });

  test("my:list t:instant composes (AND)", () => {
    const out = cache.evaluate(parse("my:list t:instant"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1);
  });

  test("my:list OR t:legendary composes (OR)", () => {
    const out = cache.evaluate(parse("my:list OR t:legendary"));
    expect(out.indices.length).toBeGreaterThan(1);
    expect(out.indices.includes(1)).toBe(true);
  });
});

describe("my:list empty list", () => {
  const getListMask = () => ({ faceMask: faceMask([], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("my:list returns 0 results when list is empty", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(0);
  });

  test("-my:list returns all cards when list is empty", () => {
    const out = cache.evaluate(parse("-my:list"));
    expect(out.indices.length).toBe(9);
  });
});

describe("my:list unknown list", () => {
  const getListMask = (listId: string) =>
    listId === "default" ? { faceMask: faceMask([1], FACE_COUNT), printingMask: undefined as undefined } : null;
  const cache = new NodeCache(index, null, getListMask);

  test("my:foo produces error node", () => {
    const { result } = cache.evaluate(parse("my:foo"));
    expect(result.error).toBe('unknown list "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("unknown list is transparent to filtering in AND", () => {
    const out = cache.evaluate(parse("my:foo t:creature"));
    expect(out.indices.length).toBe(4); // t:creature alone matches 4 (Birds, Tarmogoyf, Thalia, Ayara)
  });
});

describe("my:list oracle-only (face-domain)", () => {
  const getListMask = () => ({ faceMask: faceMask([1, 3], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("my:list produces face-domain result", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(2);
    expect(out.indices).toContain(1);
    expect(out.indices).toContain(3);
    expect(out.hasPrintingConditions).toBe(false);
  });

  test("oracle-only list + my:list is:foil matches (generic card has foil printings)", () => {
    const cacheWithPrintings = new NodeCache(index, printingIndex, getListMask);
    const out = cacheWithPrintings.evaluate(parse("my:list is:foil"));
    expect(out.indices.length).toBe(2); // Bolt and Sol Ring both have foil printings
  });
});

describe("my:list printing-only (printing-domain)", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([1], PRINTING_COUNT), // Bolt foil
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:list produces printing-domain result", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1);
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(out.printingIndices!.length).toBe(1);
    expect(out.printingIndices![0]).toBe(1);
  });

  test("printing-only foil + my:list is:foil matches", () => {
    const out = cache.evaluate(parse("my:list is:foil"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(1);
  });

  test("printing-only foil + my:list is:nonfoil no match", () => {
    const out = cache.evaluate(parse("my:list is:nonfoil"));
    expect(out.indices.length).toBe(0);
  });
});

describe("my:list mixed (face + printing entries)", () => {
  const getListMask = () => ({
    faceMask: faceMask([3], FACE_COUNT), // Sol Ring (oracle-level)
    printingMask: printingMask([1], PRINTING_COUNT), // Bolt foil (printing-level)
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:list produces printing-domain result", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.indices.length).toBe(2); // Bolt (1 foil) + Sol Ring (all printings)
  });

  test("mixed list + my:list is:nonfoil matches (generic Sol Ring expands to all printings)", () => {
    const out = cache.evaluate(parse("my:list is:nonfoil"));
    expect(out.indices.length).toBe(1); // Bolt foil excluded; Sol Ring has nonfoil printings
  });
});

describe("my:list without getListMask (CLI)", () => {
  const cache = new NodeCache(index);

  test("my:list produces error when getListMask is absent", () => {
    const { result } = cache.evaluate(parse("my:list"));
    expect(result.error).toBe('unknown list "default"');
    expect(result.matchCount).toBe(-1);
  });
});

describe("my:list invalid operator", () => {
  const getListMask = () => ({ faceMask: faceMask([1], FACE_COUNT), printingMask: undefined });
  const cache = new NodeCache(index, null, getListMask);

  test("my: with != operator produces error", () => {
    const { result } = cache.evaluate(parse("my!=foo"));
    expect(result.error).toBe("my: requires : or = operator");
    expect(result.matchCount).toBe(-1);
  });
});
