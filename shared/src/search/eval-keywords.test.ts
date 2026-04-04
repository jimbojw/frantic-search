// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evalKeyword, buildKeywordDataRef } from "./eval-keywords";
import type { KeywordData } from "../data";

function ref(k: KeywordData | null) {
  return buildKeywordDataRef(k);
}

describe("evalKeyword", () => {
  test("returns error when keywords not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "flying", null, buf)).toBe("keywords not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("non-matching prefix returns unknown keyword error (passthrough)", () => {
    const keywords: KeywordData = { flying: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "xyz", ref(keywords), buf)).toBe('unknown keyword "xyz"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("colon sets buffer for full key (prefix match)", () => {
    const keywords: KeywordData = { flying: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "flying", ref(keywords), buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  test("equals requires exact normalized key (fly does not match flying)", () => {
    const keywords: KeywordData = { flying: [1, 2] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("=", "fly", ref(keywords), buf)).toBe('unknown keyword "fly"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("colon normalized prefix matches longer key (e.g. fly → flying)", () => {
    const keywords: KeywordData = { flying: [1, 2], firststrike: [3] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "fly", ref(keywords), buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(0);
  });

  test("equals exact matches when normalized forms equal", () => {
    const keywords: KeywordData = { flying: [1, 2] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("=", "flying", ref(keywords), buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
  });

  test("unions multiple keys when prefix matches both", () => {
    const keywords: KeywordData = {
      prowess: [0, 1],
      protection: [2, 3],
      flying: [4],
    };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "pro", ref(keywords), buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[4]).toBe(0);
  });

  test("equals ORs wire keys that normalize identically", () => {
    const keywords: KeywordData = {
      flying: [1],
      FLYING: [2],
    };
    const buf = new Uint8Array(10);
    expect(evalKeyword("=", "flying", ref(keywords), buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
  });

  test("keyword:deathtouch matches cards with Deathtouch", () => {
    const keywords: KeywordData = { deathtouch: [2, 4, 6] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "deathtouch", ref(keywords), buf)).toBe(null);
    expect(buf[2]).toBe(1);
    expect(buf[4]).toBe(1);
    expect(buf[6]).toBe(1);
  });

  test("matching is case-insensitive via normalization", () => {
    const keywords: KeywordData = { flying: [2] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "FLYING", ref(keywords), buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("empty value fills buffer with 1s for colon and equals", () => {
    const keywords: KeywordData = { flying: [1, 3] };
    const buf = new Uint8Array(5);
    expect(evalKeyword(":", "", ref(keywords), buf)).toBe(null);
    expect(buf.every((b) => b === 1)).toBe(true);
    const buf2 = new Uint8Array(5);
    buf2.fill(0);
    expect(evalKeyword("=", "", ref(keywords), buf2)).toBe(null);
    expect(buf2.every((b) => b === 1)).toBe(true);
  });

  test("whitespace-only value matches all after trim", () => {
    const keywords: KeywordData = { flying: [1] };
    const buf = new Uint8Array(3);
    expect(evalKeyword(":", "   ", ref(keywords), buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
  });

  test("skips indices beyond buffer length", () => {
    const keywords: KeywordData = { flying: [0, 15, 20] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "flying", ref(keywords), buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[15]).toBeUndefined();
  });

  test("keyword with empty array sets no bits", () => {
    const keywords: KeywordData = { empty: [] };
    const buf = new Uint8Array(10);
    expect(evalKeyword(":", "empty", ref(keywords), buf)).toBe(null);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("empty keyword index object yields unknown keyword for non-empty query", () => {
    const keywords: KeywordData = {};
    const buf = new Uint8Array(5);
    expect(evalKeyword(":", "flying", ref(keywords), buf)).toBe('unknown keyword "flying"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("multi-word key matches full phrase and shorter normalized prefix with colon", () => {
    const keywords: KeywordData = { "first strike": [7] };
    const buf1 = new Uint8Array(10);
    expect(evalKeyword(":", "first strike", ref(keywords), buf1)).toBe(null);
    expect(buf1[7]).toBe(1);
    const buf2 = new Uint8Array(10);
    expect(evalKeyword(":", "first", ref(keywords), buf2)).toBe(null);
    expect(buf2[7]).toBe(1);
  });

  test("equals does not widen first to first strike", () => {
    const keywords: KeywordData = { "first strike": [7] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("=", "first", ref(keywords), buf)).toBe('unknown keyword "first"');
    expect(buf[7]).toBe(0);
  });
});
