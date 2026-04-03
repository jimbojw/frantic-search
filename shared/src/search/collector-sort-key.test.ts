// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import {
  COLLECTOR_KEY_STRIDE,
  COLLECTOR_KIND_DIGITS_ASCII_SUFFIX,
  COLLECTOR_KIND_DIGITS_ONLY,
  COLLECTOR_KIND_DIGITS_UNICODE_STAR_END,
  COLLECTOR_KIND_DIGIT_LETTER_DIGITS,
  COLLECTOR_KIND_FALLBACK,
  COLLECTOR_KIND_LETTERS_DIGITS_COMPACT,
  COLLECTOR_KIND_YEAR_DASH_DIGITS,
  compareCollectorLanes,
  encodeCollectorSortKeyInto,
  parseDigitsU32,
} from "./collector-sort-key";

const STAR = "\u2605";

function keyFor(s: string): Uint32Array {
  const keys = new Uint32Array(COLLECTOR_KEY_STRIDE);
  encodeCollectorSortKeyInto(keys, 0, s);
  return keys;
}

describe("parseDigitsU32", () => {
  test("parses small values", () => {
    expect(parseDigitsU32("316", 0, 3)).toBe(316);
    expect(parseDigitsU32("0", 0, 1)).toBe(0);
  });

  test("max uint32", () => {
    expect(parseDigitsU32("4294967295", 0, 10)).toBe(0xffffffff);
  });

  test("overflow returns null", () => {
    expect(parseDigitsU32("4294967296", 0, 10)).toBeNull();
  });
});

describe("encodeCollectorSortKeyInto — Spec 180 acceptance", () => {
  test("DigitsOnly: 1, 10, 316", () => {
    for (const s of ["1", "10", "316"]) {
      const k = keyFor(s);
      expect(k[0]).toBe(COLLECTOR_KIND_DIGITS_ONLY);
      expect(k[1]).toBe(Number(s));
      expect(k[2]).toBe(0);
    }
  });

  test("YearDashDigits: 1993-1", () => {
    const k = keyFor("1993-1");
    expect(k[0]).toBe(COLLECTOR_KIND_YEAR_DASH_DIGITS);
    expect(k[1]).toBe(1993);
    expect(k[2]).toBe(1);
  });

  test("DigitsUnicodeStarEnd", () => {
    const k = keyFor(`316${STAR}`);
    expect(k[0]).toBe(COLLECTOR_KIND_DIGITS_UNICODE_STAR_END);
    expect(k[1]).toBe(316);
  });

  test("DigitLetterDigits — research set sample", () => {
    for (const s of ["1e05", "3n08", "2u07"]) {
      const k = keyFor(s);
      expect(k[0]).toBe(COLLECTOR_KIND_DIGIT_LETTER_DIGITS);
      expect(k[1]).toBe(Number(s[0]));
      expect(k[2]).toBe(s.charCodeAt(1));
      expect(k[3]).toBe(Number(s.slice(2)));
    }
  });

  test("DigitsAsciiSuffix: 1a, 10s", () => {
    const a = keyFor("1a");
    expect(a[0]).toBe(COLLECTOR_KIND_DIGITS_ASCII_SUFFIX);
    expect(a[1]).toBe(1);
    expect(a[2]).toBe(1);
    expect(a[3]).toBe(0x61000000);

    const b = keyFor("10s");
    expect(b[0]).toBe(COLLECTOR_KIND_DIGITS_ASCII_SUFFIX);
    expect(b[1]).toBe(10);
    expect(b[2]).toBe(1);
    expect(b[3]).toBe(0x73000000);
  });

  test("LettersDigitsCompact: s1, ab12", () => {
    const s1 = keyFor("s1");
    expect(s1[0]).toBe(COLLECTOR_KIND_LETTERS_DIGITS_COMPACT);
    expect(s1[1]).toBe(1);
    expect(s1[2]).toBe(1);
    expect(s1[3]).toBe(0x73000000);

    const ab = keyFor("ab12");
    expect(ab[0]).toBe(COLLECTOR_KIND_LETTERS_DIGITS_COMPACT);
    expect(ab[1]).toBe(12);
    expect(ab[2]).toBe(2);
    expect(ab[3]).toBe(0x61620000);
  });

  test("fallback: AER-69, 130★s, dagger, phi", () => {
    expect(keyFor("aer-69")[0]).toBe(COLLECTOR_KIND_FALLBACK);
    expect(keyFor(`130${STAR}s`)[0]).toBe(COLLECTOR_KIND_FALLBACK);
    expect(keyFor("7\u2020")[0]).toBe(COLLECTOR_KIND_FALLBACK);
    expect(keyFor("633\u03a6")[0]).toBe(COLLECTOR_KIND_FALLBACK);
  });

  test("PLA001a remains fallback (v1)", () => {
    expect(keyFor("pla001a")[0]).toBe(COLLECTOR_KIND_FALLBACK);
  });

  test("empty string is fallback", () => {
    expect(keyFor("")[0]).toBe(COLLECTOR_KIND_FALLBACK);
  });
});

describe("lane ordering", () => {
  test("1 before 1a (digits_only kind < suffix kind)", () => {
    const keys = new Uint32Array(COLLECTOR_KEY_STRIDE * 2);
    encodeCollectorSortKeyInto(keys, 0, "1");
    encodeCollectorSortKeyInto(keys, 1, "1a");
    expect(compareCollectorLanes(keys, 0, 1)).toBeLessThan(0);
  });

  test("same kind 5: numeric primary then suffix bytes", () => {
    const keys = new Uint32Array(COLLECTOR_KEY_STRIDE * 2);
    encodeCollectorSortKeyInto(keys, 0, "10a");
    encodeCollectorSortKeyInto(keys, 1, "10b");
    expect(compareCollectorLanes(keys, 0, 1)).toBeLessThan(0);
  });

  test("partition signal: fast vs fallback", () => {
    const keys = new Uint32Array(COLLECTOR_KEY_STRIDE * 2);
    encodeCollectorSortKeyInto(keys, 0, "5");
    encodeCollectorSortKeyInto(keys, 1, "aer-69");
    expect(keys[0]).toBeGreaterThan(0);
    expect(keys[COLLECTOR_KEY_STRIDE]).toBe(0);
  });
});
