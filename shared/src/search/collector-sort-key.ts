// SPDX-License-Identifier: Apache-2.0

/** Words per collector sort key (Spec 180). */
export const COLLECTOR_KEY_STRIDE = 8;

export const COLLECTOR_KIND_FALLBACK = 0;
export const COLLECTOR_KIND_DIGITS_ONLY = 1;
export const COLLECTOR_KIND_YEAR_DASH_DIGITS = 2;
export const COLLECTOR_KIND_DIGITS_UNICODE_STAR_END = 3;
export const COLLECTOR_KIND_DIGIT_LETTER_DIGITS = 4;
export const COLLECTOR_KIND_DIGITS_ASCII_SUFFIX = 5;
export const COLLECTOR_KIND_LETTERS_DIGITS_COMPACT = 6;

const U32_MAX = 0xffffffff;
/** U+2605 BLACK STAR (Spec 180). */
const BLACK_STAR = 0x2605;

function isAsciiDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isAsciiLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * Parse base-10 digits in [start, end); return null if empty, non-digit, or overflow uint32.
 */
export function parseDigitsU32(s: string, start: number, end: number): number | null {
  if (start >= end) return null;
  let v = 0;
  for (let i = start; i < end; i++) {
    const c = s.charCodeAt(i);
    if (!isAsciiDigit(c)) return null;
    const d = c - 48;
    const next = v * 10 + d;
    if (next > U32_MAX) return null;
    v = next;
  }
  return v >>> 0;
}

function clearKeyAt(keys: Uint32Array, o: number): void {
  for (let i = 0; i < COLLECTOR_KEY_STRIDE; i++) keys[o + i] = 0;
}

/**
 * Pack ASCII bytes from s[start, start+len) into lanes 3–7 (big-endian 4 bytes per lane).
 * Returns false if len > 20 or any code unit is non-ASCII.
 */
function packAsciiSuffixIntoLanes(keys: Uint32Array, o: number, s: string, start: number, len: number): boolean {
  if (len > 20) return false;
  for (let b = 0; b < len; b++) {
    const c = s.charCodeAt(start + b);
    if (c > 127) return false;
    const lane = 3 + (b >> 2);
    const shift = 24 - (b & 3) * 8;
    keys[o + lane] |= c << shift;
  }
  return true;
}

/**
 * Write Spec 180 fast key or fallback (lane 0 === 0) for collector string `s`.
 * `s` must be the same surface string the sort pipeline uses (lowercased in PrintingIndex).
 */
export function encodeCollectorSortKeyInto(keys: Uint32Array, rowIndex: number, s: string): void {
  const o = rowIndex * COLLECTOR_KEY_STRIDE;
  clearKeyAt(keys, o);
  const n = s.length;
  if (n === 0) return;

  // 1) DigitsOnly ^\d+$
  {
    let all = true;
    for (let i = 0; i < n; i++) {
      if (!isAsciiDigit(s.charCodeAt(i))) {
        all = false;
        break;
      }
    }
    if (all) {
      const v = parseDigitsU32(s, 0, n);
      if (v !== null) {
        keys[o] = COLLECTOR_KIND_DIGITS_ONLY;
        keys[o + 1] = v;
        return;
      }
      return;
    }
  }

  // 2) YearDashDigits ^\d{4}-\d+$
  if (n >= 6 && s.charCodeAt(4) === 45 /* - */) {
    let ok = true;
    for (let i = 0; i < 4; i++) {
      if (!isAsciiDigit(s.charCodeAt(i))) {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (let i = 5; i < n; i++) {
        if (!isAsciiDigit(s.charCodeAt(i))) {
          ok = false;
          break;
        }
      }
    }
    if (ok) {
      const year = parseDigitsU32(s, 0, 4);
      const seq = parseDigitsU32(s, 5, n);
      if (year !== null && seq !== null) {
        keys[o] = COLLECTOR_KIND_YEAR_DASH_DIGITS;
        keys[o + 1] = year;
        keys[o + 2] = seq;
        return;
      }
    }
  }

  // 3) DigitsUnicodeStarEnd ^(\d+)★$
  if (n >= 2 && s.charCodeAt(n - 1) === BLACK_STAR) {
    let allDigits = true;
    for (let i = 0; i < n - 1; i++) {
      if (!isAsciiDigit(s.charCodeAt(i))) {
        allDigits = false;
        break;
      }
    }
    if (allDigits) {
      const v = parseDigitsU32(s, 0, n - 1);
      if (v !== null) {
        keys[o] = COLLECTOR_KIND_DIGITS_UNICODE_STAR_END;
        keys[o + 1] = v;
        return;
      }
    }
  }

  // 4) DigitLetterDigits ^(\d+)([A-Za-z])(\d+)$
  {
    let i = 0;
    while (i < n && isAsciiDigit(s.charCodeAt(i))) i++;
    const letterPos = i;
    if (letterPos > 0 && letterPos < n) {
      const letter = s.charCodeAt(letterPos);
      if (isAsciiLetter(letter)) {
        const suffixStart = letterPos + 1;
        let k = suffixStart;
        while (k < n && isAsciiDigit(s.charCodeAt(k))) k++;
        if (k === n && suffixStart < n) {
          const prefix = parseDigitsU32(s, 0, letterPos);
          const suffix = parseDigitsU32(s, suffixStart, n);
          if (prefix !== null && suffix !== null) {
            keys[o] = COLLECTOR_KIND_DIGIT_LETTER_DIGITS;
            keys[o + 1] = prefix;
            keys[o + 2] = letter;
            keys[o + 3] = suffix;
            return;
          }
        }
      }
    }
  }

  // 5) DigitsAsciiSuffix ^(\d+)([a-zA-Z]+)$
  {
    let i = 0;
    while (i < n && isAsciiDigit(s.charCodeAt(i))) i++;
    if (i > 0 && i < n) {
      const digitEnd = i;
      let j = i;
      while (j < n && isAsciiLetter(s.charCodeAt(j))) j++;
      if (j === n) {
        const num = parseDigitsU32(s, 0, digitEnd);
        const suffixLen = n - digitEnd;
        if (num !== null && suffixLen > 0) {
          if (!packAsciiSuffixIntoLanes(keys, o, s, digitEnd, suffixLen)) return;
          keys[o] = COLLECTOR_KIND_DIGITS_ASCII_SUFFIX;
          keys[o + 1] = num;
          keys[o + 2] = suffixLen;
          return;
        }
      }
    }
  }

  // 6) LettersDigitsCompact ^([a-zA-Z]+)(\d+)$
  {
    let i = 0;
    while (i < n && isAsciiLetter(s.charCodeAt(i))) i++;
    if (i > 0 && i < n) {
      const lettersLen = i;
      const j = i;
      while (i < n && isAsciiDigit(s.charCodeAt(i))) i++;
      if (i === n) {
        const num = parseDigitsU32(s, j, n);
        if (num !== null) {
          if (!packAsciiSuffixIntoLanes(keys, o, s, 0, lettersLen)) return;
          keys[o] = COLLECTOR_KIND_LETTERS_DIGITS_COMPACT;
          keys[o + 1] = num;
          keys[o + 2] = lettersLen;
          return;
        }
      }
    }
  }

  // 7) Fallback — lanes already zeroed
}

/** Unsigned lexicographic compare of two strided keys; both must be fast (lane 0 > 0). */
export function compareCollectorLanes(keys: Uint32Array, rowA: number, rowB: number): number {
  const oa = rowA * COLLECTOR_KEY_STRIDE;
  const ob = rowB * COLLECTOR_KEY_STRIDE;
  for (let i = 0; i < COLLECTOR_KEY_STRIDE; i++) {
    const va = keys[oa + i];
    const vb = keys[ob + i];
    if (va !== vb) return va < vb ? -1 : 1;
  }
  return 0;
}
