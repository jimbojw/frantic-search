// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import { index } from "./evaluator.test-fixtures";
import type { KeywordData } from "../data";
import { buildKeywordDataRef } from "./eval-keywords";

// Keywords index: flying on faces 0,4; firststrike on 6,7 (Thalia, Ayara front)
const keywordsIndex: KeywordData = {
  flying: [0, 4],
  firststrike: [6, 7],
  deathtouch: [2, 9],
};

const keywordDataRef = buildKeywordDataRef(keywordsIndex);

describe("kw: evaluator", () => {
  test("kw:flying matches expected face indices", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:flying"));
    expect(out.result.matchCount).toBe(2);
    expect(out.result.error).toBeUndefined();
    const indices = Array.from(out.indices);
    expect(indices).toContain(0);
    expect(indices).toContain(4);
  });

  test("keyword=deathtouch matches same as keyword:deathtouch", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("keyword=deathtouch"));
    expect(out.result.matchCount).toBe(2);
    const indices = Array.from(out.indices);
    expect(indices).toContain(2);
    expect(indices).toContain(9);
  });

  test("kw:flying with card that lacks Flying has no match for that card", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:firststrike"));
    expect(out.result.matchCount).toBe(2);
    expect(out.indices).not.toContain(0);
  });

  test("kw=fly is unknown when only flying exists", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw=fly"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown keyword "fly"');
  });

  test("kw:fly prefix-matches flying", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:fly"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(2);
  });

  test("-kw:flying excludes cards with Flying", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("-kw:flying"));
    expect(out.result.matchCount).toBe(7);
    expect(out.result.error).toBeUndefined();
  });

  test("matching is case-insensitive", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out1 = cache.evaluate(parse("kw:FLYING"));
    const out2 = cache.evaluate(parse("kw:flying"));
    expect(out1.result.matchCount).toBe(out2.result.matchCount);
  });

  test("kw: with empty value matches all cards", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:"));
    expect(out.result.matchCount).toBe(10);
    expect(out.result.error).toBeUndefined();
  });

  test("kw= with empty value matches all cards", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw="));
    expect(out.result.matchCount).toBe(10);
    expect(out.result.error).toBeUndefined();
  });

  test("non-matching prefix returns unknown keyword error", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:xyz"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe('unknown keyword "xyz"');
  });

  test("prefix unions multiple keywords", () => {
    const kw: KeywordData = {
      flying: [0, 4],
      firststrike: [6, 7],
    };
    const cache = new NodeCache(index, null, null, null, buildKeywordDataRef(kw));
    const out = cache.evaluate(parse("kw:f"));
    expect(out.result.error).toBeUndefined();
    expect(out.result.matchCount).toBe(4);
  });

  test("kw: without keywords data returns error", () => {
    const cache = new NodeCache(index, null, null, null, buildKeywordDataRef(null));
    const out = cache.evaluate(parse("kw:flying"));
    expect(out.result.matchCount).toBe(-1);
    expect(out.result.error).toBe("keywords not loaded");
  });

  test("kw: requires : or = operator", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw!=flying"));
    expect(out.result.error).toBe("kw: requires : or = operator");
  });

  test("kw: composes with other face-domain conditions", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const out = cache.evaluate(parse("kw:flying t:creature"));
    expect(out.result.matchCount).toBe(2);
  });

  test("kw:xyz t:creature skips errored kw leaf (Spec 039 passthrough)", () => {
    const cache = new NodeCache(index, null, null, null, keywordDataRef);
    const creatureOnly = cache.evaluate(parse("t:creature")).result.matchCount;
    const combined = cache.evaluate(parse("kw:xyz t:creature")).result.matchCount;
    expect(combined).toBe(creatureOnly);
  });
});
