// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index, printingIndex } from "./evaluator.test-fixtures";
import type { OracleTagData } from "../data";
import { buildOracleTagEvalIndex, buildIllustrationTagEvalIndex } from "./eval-tags";

const oracleTags: OracleTagData = {
  ramp: [0, 3, 4], // Birds, Sol Ring, Tarmogoyf (face indices)
  removal: [1, 2, 9], // Bolt, Counterspell, Dismember
};
const illustrationTags = new Map<string, Uint32Array>([
  ["chair", new Uint32Array([0, 2, 5])], // printing rows 0, 2, 5 (Bolt variants)
  ["foot", new Uint32Array([3, 4])], // printing rows 3, 4 (Sol Ring)
]);

function tagRef(oracle: OracleTagData | null, illustration: Map<string, Uint32Array> | null) {
  return {
    oracle,
    oracleEvalIndex: oracle ? buildOracleTagEvalIndex(oracle) : null,
    illustration,
    illustrationEvalIndex: illustration ? buildIllustrationTagEvalIndex(illustration) : null,
    flavor: null,
    artist: null,
  };
}

const tagDataRef = tagRef(oracleTags, illustrationTags);

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

  test("otag:rem prefix matches removal (Spec 174)", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:rem"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(3);
  });

  test("otag:ramp unions all keys with matching prefix", () => {
    const oracleTagsExtended: OracleTagData = {
      ...oracleTags,
      "ramp-artifact": [5],
    };
    const cache = new NodeCache(index, null, null, tagRef(oracleTagsExtended, illustrationTags));
    const out = cache.evaluate(parse("otag:ramp"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(4);
  });

  test("otag=ramp does not include ramp-artifact prefix widen", () => {
    const oracleTagsExtended: OracleTagData = {
      ...oracleTags,
      "ramp-artifact": [5],
    };
    const cache = new NodeCache(index, null, null, tagRef(oracleTagsExtended, illustrationTags));
    const out = cache.evaluate(parse("otag=ramp"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(3);
  });

  test("otag:nonexistent yields unknown oracle tag (Spec 174)", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:nonexistent"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown oracle tag "nonexistent"');
  });

  test("otag: without oracle tags returns error", () => {
    const cache = new NodeCache(index, null, null, tagRef(null, null));
    const out = cache.evaluate(parse("otag:ramp"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe("oracle tags not loaded");
  });

  test("-otag:ramp negates correctly", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("-otag:ramp"));
    expect(out.result.matchCount).toBe(6);
    expect(out.result.error).toBeUndefined();
  });

  test("otag!=ramp negates exact = ramp (face rows: 10 − 3 ramp faces = 7)", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag!=ramp"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(7);
  });

  test("unsupported operator on otag", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag>ramp"));
    expect(out.result.error).toBe('otag: does not support operator ">"');
  });

  test("otag: composes with other face-domain conditions (passthrough on bad tag)", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const creatureOnly = cache.evaluate(parse("t:creature")).result.matchCount;
    const combined = cache.evaluate(parse("otag:nonexistent t:creature")).result.matchCount;
    expect(combined).toBe(creatureOnly);
  });

  test("otag: composes with other face-domain conditions", () => {
    const cache = new NodeCache(index, null, null, tagDataRef);
    const out = cache.evaluate(parse("otag:ramp t:creature"));
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
    expect(out.result.matchCount).toBe(3);
    expect(out.result.error).toBeUndefined();
  });

  test("art:chair alias works", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out1 = cache.evaluate(parse("atag:chair"));
    const out2 = cache.evaluate(parse("art:chair"));
    expect(out1.result.matchCount).toBe(out2.result.matchCount);
  });

  test("atag:nonexistent yields unknown illustration tag", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("atag:nonexistent"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown illustration tag "nonexistent"');
  });

  test("atag: without illustration tags returns error", () => {
    const cache = new NodeCache(index, printingIndex, null, tagRef(oracleTags, null));
    const out = cache.evaluate(parse("atag:chair"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe("illustration tags not loaded");
  });

  test("-atag:chair negates correctly", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("-atag:chair"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(8);
  });

  test("atag: composes with printing-domain conditions", () => {
    const cache = new NodeCache(index, printingIndex, null, tagDataRef);
    const out = cache.evaluate(parse("atag:chair set:mh2"));
    expect(out.result.matchCount).toBe(1);
    expect(out.result.error).toBeUndefined();
  });
});
