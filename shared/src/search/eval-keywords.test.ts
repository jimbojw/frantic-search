// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evalKeyword } from "./eval-keywords";
import type { KeywordData } from "../data";

describe("evalKeyword", () => {
  test("returns error when keywords not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalKeyword("flying", null, buf)).toBe("keywords not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("returns error for unknown keyword", () => {
    const keywords: KeywordData = { flying: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("xyz", keywords, buf)).toBe('unknown keyword "xyz"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("sets buffer for matching face indices", () => {
    const keywords: KeywordData = { flying: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("flying", keywords, buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  test("keyword:deathtouch matches cards with Deathtouch", () => {
    const keywords: KeywordData = { deathtouch: [2, 4, 6] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("deathtouch", keywords, buf)).toBe(null);
    expect(buf[2]).toBe(1);
    expect(buf[4]).toBe(1);
    expect(buf[6]).toBe(1);
  });

  test("matching is case-insensitive", () => {
    const keywords: KeywordData = { flying: [2] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("FLYING", keywords, buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("empty value fills buffer with 1s (match all)", () => {
    const keywords: KeywordData = { flying: [1, 3] };
    const buf = new Uint8Array(5);
    expect(evalKeyword("", keywords, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[4]).toBe(1);
  });

  test("skips indices beyond buffer length", () => {
    const keywords: KeywordData = { flying: [0, 15, 20] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("flying", keywords, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[15]).toBeUndefined();
  });

  test("keyword with empty array sets no bits", () => {
    const keywords: KeywordData = { empty: [] };
    const buf = new Uint8Array(10);
    expect(evalKeyword("empty", keywords, buf)).toBe(null);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
