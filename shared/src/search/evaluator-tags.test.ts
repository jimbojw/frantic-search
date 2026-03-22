// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";
import type { OracleTagData } from "../data";

const oracleTags: OracleTagData = {
  ramp: [0, 3, 4], // Birds, Sol Ring, Tarmogoyf (face indices)
  removal: [1, 2, 9], // Bolt, Counterspell, Dismember
};
const illustrationTags = new Map<string, Uint32Array>([
  ["chair", new Uint32Array([0, 2, 5])], // printing rows 0, 2, 5 (Bolt variants)
  ["foot", new Uint32Array([3, 4])], // printing rows 3, 4 (Sol Ring)
]);

const tagDataRef = {
  oracle: oracleTags,
  illustration: illustrationTags,
  flavor: null,
  artist: null,
};

describe("otag: evaluator", () => {
  test("otag:ramp matches expected face indices", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:ramp"));
    expect(out.result.matchCount).toBe(3);
    expect(out.result.error).toBeUndefined();
    const indices = Array.from(out.indices);
    expect(indices).toContain(0);
    expect(indices).toContain(3);
    expect(indices).toContain(4);
  });

  test("otag:removal matches expected faces", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:removal"));
    expect(out.result.matchCount).toBe(3);
    const indices = Array.from(out.indices);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
    expect(indices).toContain(9);
  });

  test("otag:nonexistent returns error", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:nonexistent"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown tag "nonexistent"');
  });

  test("otag: without oracle tags returns error", () => {
    const cache = new NodeCache(index, null, null, { oracle: null, illustration: null, flavor: null, artist: null });
    const out = cache.evaluate(parse("otag:ramp"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe("oracle tags not loaded");
  });

  test("-otag:ramp negates correctly", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("-otag:ramp"));
    // 10 face rows, 9 canonical faces (Ayara 7+8 share). 3 ramp → 6 non-ramp
    expect(out.result.matchCount).toBe(6);
    expect(out.result.error).toBeUndefined();
  });

  test("otag: requires : or = operator", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag!=ramp"));
    expect(out.result.error).toBe("otag: requires : or = operator");
  });

  test("otag: composes with other face-domain conditions", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:ramp t:creature"));
    // ramp = faces 0,3,4. creature = 0,4,6,7,8. Intersection = 0,4 (Birds, Tarmogoyf)
    expect(out.result.matchCount).toBe(2);
  });

  test("function: and oracletag: are aliases for otag:", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const otagOut = cache.evaluate(parse("otag:ramp"));
    const functionOut = cache.evaluate(parse("function:ramp"));
    const oracletagOut = cache.evaluate(parse("oracletag:ramp"));
    expect(otagOut.result.matchCount).toBe(3);
    expect(functionOut.result.matchCount).toBe(otagOut.result.matchCount);
    expect(oracletagOut.result.matchCount).toBe(otagOut.result.matchCount);
    expect(functionOut.result.error).toBeUndefined();
    expect(oracletagOut.result.error).toBeUndefined();
  });
});

describe("atag: evaluator", () => {
  test("atag:chair matches expected printing rows", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("atag:chair"));
    // chair = printings 0,2,5 → 3 printing rows match
    expect(out.result.matchCount).toBe(3);
    expect(out.result.error).toBeUndefined();
  });

  test("art:chair alias works", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out1 = cache.evaluate(parse("atag:chair"));
    const out2 = cache.evaluate(parse("art:chair"));
    expect(out1.result.matchCount).toBe(out2.result.matchCount);
  });

  test("atag:nonexistent returns error", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("atag:nonexistent"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown tag "nonexistent"');
  });

  test("atag: without illustration tags returns error", () => {
    const cache = new NodeCache(index, printingIndex, null, {
      oracle: oracleTags,
      illustration: null,
      flavor: null,
      artist: null,
    });
    const out = cache.evaluate(parse("atag:chair"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe("illustration tags not loaded");
  });

  test("-atag:chair negates correctly", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("-atag:chair"));
    expect(out.result.error).toBeUndefined();
    // 11 printing rows total, 3 match chair → 8 don't match
    expect(out.result.matchCount).toBe(8);
  });

  test("atag: composes with printing-domain conditions", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("atag:chair set:mh2"));
    // chair = printings 0,2,5. set:mh2 = 0,1,9,10. Intersection = 0,1
    expect(out.result.matchCount).toBe(1);
    expect(out.result.error).toBeUndefined();
  });
});
