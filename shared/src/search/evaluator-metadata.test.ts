// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Spec 123: # metadata tag queries
//
// Printing 0 = Bolt nonfoil, 1 = Bolt foil, 3 = Sol Ring nonfoil.
// ---------------------------------------------------------------------------

function printingIndices(indices: number[]): { printingIndices: Uint32Array } {
  return { printingIndices: new Uint32Array(indices) };
}

function metadataIndex(keys: string[], indexArrays: Uint32Array[]) {
  return { keys, indexArrays };
}

describe("#combo metadata query", () => {
  const getListMask = () => printingIndices([0, 3]);
  const getMetadataIndex = () =>
    metadataIndex(["combo", "deck"], [new Uint32Array([0]), new Uint32Array([0, 3])]);
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("#combo returns printings with combo tag", () => {
    const out = cache.evaluate(parse("#combo"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(Array.from(out.printingIndices!)).toEqual([0]);
  });
});

describe("# naked returns union of all non-trash instances", () => {
  const getListMask = () => printingIndices([0, 3]);
  const getMetadataIndex = () =>
    metadataIndex(["combo", "deck"], [new Uint32Array([0]), new Uint32Array([0, 3])]);
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("# returns all indexed printings", () => {
    const out = cache.evaluate(parse("#"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(Array.from(out.printingIndices!).sort()).toEqual([0, 3]);
  });
});

describe("-#combo negates metadata match", () => {
  const getListMask = () => printingIndices([0, 3]);
  const getMetadataIndex = () =>
    metadataIndex(["combo", "deck"], [new Uint32Array([0]), new Uint32Array([0, 3])]);
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("-#combo returns printings without combo tag", () => {
    const out = cache.evaluate(parse("-#combo"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(Array.from(out.printingIndices!)).toContain(3);
    expect(Array.from(out.printingIndices!)).not.toContain(0);
  });
});

describe("my:list #combo composes (AND)", () => {
  const getListMask = () => printingIndices([0, 3]);
  const getMetadataIndex = () =>
    metadataIndex(["combo", "deck"], [new Uint32Array([0]), new Uint32Array([0, 3])]);
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("my:list #combo returns intersection", () => {
    const out = cache.evaluate(parse("my:list #combo"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(Array.from(out.printingIndices!)).toEqual([0]);
  });
});

describe("no metadata: #value returns empty", () => {
  const getListMask = () => printingIndices([0]);
  const getMetadataIndex = () => null;
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("#combo returns 0 when getMetadataIndex is null", () => {
    const out = cache.evaluate(parse("#combo"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(out.printingIndices!.length).toBe(0);
  });
});

describe("substring match: #com matches combo and commander", () => {
  const getListMask = () => printingIndices([0, 1, 3]);
  const getMetadataIndex = () =>
    metadataIndex(
      ["combo", "commander", "deck"],
      [new Uint32Array([0]), new Uint32Array([1]), new Uint32Array([0, 1, 3])],
    );
  const cache = new NodeCache(
    index,
    printingIndex,
    getListMask,
    null,
    null,
    getMetadataIndex,
  );

  test("#com returns printings with combo or commander", () => {
    const out = cache.evaluate(parse("#com"));
    expect(out.hasPrintingConditions).toBe(true);
    expect(out.printingIndices).toBeDefined();
    expect(Array.from(out.printingIndices!).sort()).toEqual([0, 1]);
  });
});
