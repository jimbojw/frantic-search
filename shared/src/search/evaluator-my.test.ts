// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Spec 077 / Spec 121: my:list query field
//
// Spec 121: My List is printing-domain only. All getListMask fixtures must
// return printingMask (faceMask zeroed). Face 1 = Bolt, Face 3 = Sol Ring.
// Printing 0 = Bolt nonfoil, Printing 1 = Bolt foil, Printing 3 = Sol Ring nonfoil.
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
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0], PRINTING_COUNT), // Bolt canonical nonfoil
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

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
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0], PRINTING_COUNT), // Bolt
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("-my:list returns only cards not in list", () => {
    const out = cache.evaluate(parse("-my:list"));
    expect(out.indices.length).toBe(9); // 10 face rows minus Bolt (face 1)
    expect(out.indices.includes(1)).toBe(false);
  });
});

describe("my:list composition", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0], PRINTING_COUNT), // Bolt
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

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
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([], PRINTING_COUNT), // zeroed
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:list returns 0 results when list is empty", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(0);
  });

  test("-my:list returns all cards when list is empty", () => {
    const out = cache.evaluate(parse("-my:list"));
    expect(out.indices.length).toBe(10); // all 10 face rows
  });
});

describe("my:trash", () => {
  const getListMask = (listId: string) =>
    listId === "trash"
      ? {
          faceMask: faceMask([], FACE_COUNT),
          printingMask: printingMask([3], PRINTING_COUNT), // Sol Ring canonical nonfoil
        }
      : null;
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:trash returns only cards in trash", () => {
    const out = cache.evaluate(parse("my:trash"));
    expect(out.indices.length).toBe(1);
    expect(out.indices[0]).toBe(3); // Sol Ring
  });

  test("-my:trash returns only cards not in trash", () => {
    const out = cache.evaluate(parse("-my:trash"));
    expect(out.indices.length).toBe(9); // 10 face rows minus Sol Ring (face 3)
    expect(out.indices.includes(3)).toBe(false);
  });

  test("empty trash: my:trash returns 0 results", () => {
    const emptyTrash = (listId: string) =>
      listId === "trash"
        ? {
            faceMask: faceMask([], FACE_COUNT),
            printingMask: printingMask([], PRINTING_COUNT),
          }
        : null;
    const emptyCache = new NodeCache(index, printingIndex, emptyTrash);
    const out = emptyCache.evaluate(parse("my:trash"));
    expect(out.indices.length).toBe(0);
  });

  test("empty trash: -my:trash returns all cards", () => {
    const emptyTrash = (listId: string) =>
      listId === "trash"
        ? {
            faceMask: faceMask([], FACE_COUNT),
            printingMask: printingMask([], PRINTING_COUNT),
          }
        : null;
    const emptyCache = new NodeCache(index, printingIndex, emptyTrash);
    const out = emptyCache.evaluate(parse("-my:trash"));
    expect(out.indices.length).toBe(10); // all 10 face rows
  });

  test("my:trash t:creature composes (AND)", () => {
    const out = cache.evaluate(parse("my:trash t:creature"));
    expect(out.indices.length).toBe(0); // Sol Ring is artifact, not creature
  });
});

describe("my:list unknown list", () => {
  const getListMask = (listId: string) =>
    listId === "default"
      ? {
          faceMask: faceMask([], FACE_COUNT),
          printingMask: printingMask([0], PRINTING_COUNT),
        }
      : null;
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:foo produces error node", () => {
    const { result } = cache.evaluate(parse("my:foo"));
    expect(result.error).toBe('unknown list "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("unknown list is transparent to filtering in AND", () => {
    const out = cache.evaluate(parse("my:foo t:creature"));
    expect(out.indices.length).toBe(4); // t:creature alone matches 4
  });
});

describe("my:list generic entries (Spec 121)", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0, 3], PRINTING_COUNT), // Bolt + Sol Ring canonical nonfoil
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:list produces printing-domain result", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.indices.length).toBe(2);
    expect(out.indices).toContain(1);
    expect(out.indices).toContain(3);
    expect(out.hasPrintingConditions).toBe(true);
  });

  test("generic list + my:list is:foil returns 0 (Spec 121: generic = canonical nonfoil only)", () => {
    const out = cache.evaluate(parse("my:list is:foil"));
    expect(out.indices.length).toBe(0); // Both canonical nonfoil, neither is foil
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

describe("my:list mixed (generic + printing entries, Spec 121)", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([1, 3], PRINTING_COUNT), // Bolt foil + Sol Ring canonical nonfoil
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my:list produces printing-domain result", () => {
    const out = cache.evaluate(parse("my:list"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.indices.length).toBe(2); // Bolt foil + Sol Ring
  });

  test("mixed list + my:list is:nonfoil matches (Sol Ring canonical nonfoil)", () => {
    const out = cache.evaluate(parse("my:list is:nonfoil"));
    expect(out.indices.length).toBe(1); // Bolt foil excluded; Sol Ring nonfoil (3) included
  });

  test("my:list unique:prints shows exactly list printings (no override, Spec 121)", () => {
    const out = cache.evaluate(parse("my:list unique:prints"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(out.printingIndices!.length).toBe(2); // Bolt foil (1) + Sol Ring nonfoil (3)
    expect(out.printingIndices).toContain(1);
    expect(out.printingIndices).toContain(3);
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

describe("my:list printing data not loaded", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0], PRINTING_COUNT),
  });
  const cache = new NodeCache(index, null, getListMask);

  test("my:list produces error when printingIndex is null", () => {
    const { result } = cache.evaluate(parse("my:list"));
    expect(result.error).toBe("printing data not loaded");
    expect(result.matchCount).toBe(-1);
  });
});

describe("my:list invalid operator", () => {
  const getListMask = () => ({
    faceMask: faceMask([], FACE_COUNT),
    printingMask: printingMask([0], PRINTING_COUNT),
  });
  const cache = new NodeCache(index, printingIndex, getListMask);

  test("my: with != operator produces error", () => {
    const { result } = cache.evaluate(parse("my!=foo"));
    expect(result.error).toBe("my: requires : or = operator");
    expect(result.matchCount).toBe(-1);
  });
});
