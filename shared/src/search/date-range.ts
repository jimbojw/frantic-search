// SPDX-License-Identifier: Apache-2.0
import type { PrintingIndex } from "./printing-index";

const SPECIAL_DATE_VALUES = new Set(["now", "today"]);

function addDays(date: number, days: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor((date % 10000) / 100);
  const d = (date % 100) + days;
  const d2 = new Date(y, m - 1, d);
  return (
    d2.getFullYear() * 10000 +
    (d2.getMonth() + 1) * 100 +
    d2.getDate()
  );
}

function addYears(date: number, years: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor((date % 10000) / 100);
  const d = date % 100;
  const d2 = new Date(y + years, m - 1, d);
  return (
    d2.getFullYear() * 10000 +
    (d2.getMonth() + 1) * 100 +
    d2.getDate()
  );
}

function resolveSetDate(codeLower: string, pIdx: PrintingIndex): number | null {
  for (let i = 0; i < pIdx.printingCount; i++) {
    if (pIdx.setCodesLower[i] === codeLower) {
      return pIdx.setReleasedAt[pIdx.setIndices[i]];
    }
  }
  return null;
}

/**
 * Parse a date value into a half-open range [lo, hi) in YYYYMMDD format.
 * Used by both evaluator and canonicalizer. See Spec 061.
 * For partial year values, floorNext is the first day after the floor (used for > and <=).
 * For complete values, floorNext equals hi.
 */
export function parseDateRange(
  val: string,
  pIdx?: PrintingIndex | null,
): { lo: number; hi: number; floorNext: number } | null {
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();

  if (SPECIAL_DATE_VALUES.has(lower)) {
    const d = new Date();
    const lo = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const hi = addDays(lo, 1);
    return { lo, hi, floorNext: hi };
  }

  if (/^[a-z0-9]{3,}$/.test(lower) && /[a-z]/.test(lower)) {
    if (pIdx) {
      const released = resolveSetDate(lower, pIdx);
      if (released !== null) {
        const hi = addDays(released, 1);
        return { lo: released, hi, floorNext: hi };
      }
    }
    return null;
  }

  const parts = trimmed.split("-");
  if (parts.length < 1 || parts.length > 3) return null;

  const yearStr = parts[0];
  if (yearStr.length < 1 || yearStr.length > 4 || !/^\d+$/.test(yearStr)) return null;
  if (parts.length === 1 && yearStr.length > 4) return null;

  const yearLo = parseInt(yearStr.padEnd(4, "0"), 10);
  const yearSpan = Math.pow(10, 4 - yearStr.length);
  const yearHi = yearLo + yearSpan;

  let monthLo = 1;
  let monthHi = 13;
  if (parts.length >= 2) {
    const mStr = parts[1];
    if (mStr.length > 2 || !/^\d*$/.test(mStr)) return null;
    if (mStr.length === 0) {
      monthLo = 1;
      monthHi = 13;
    } else {
      const mPadLo = parseInt(mStr.padEnd(2, "0"), 10);
      const mPadHi = parseInt(mStr.padEnd(2, "9"), 10);
      monthLo = Math.max(1, Math.min(12, mPadLo === 0 ? 1 : mPadLo));
      const mMax = Math.min(12, mPadHi > 12 ? 12 : mPadHi);
      monthHi = mMax + 1;
      if (mStr.length < 2) {
        monthLo = Math.max(1, Math.min(12, mPadLo === 0 ? 1 : mPadLo));
        monthHi = Math.min(13, mPadHi + 1);
        if (mPadHi >= 12) monthHi = 13;
      }
    }
  }

  let dayLo = 1;
  let dayHi = 32;
  if (parts.length >= 3) {
    const dStr = parts[2];
    if (dStr.length > 2 || !/^\d*$/.test(dStr)) return null;
    if (dStr.length === 0) {
      dayLo = 1;
      dayHi = 32;
    } else {
      const dPadLo = parseInt(dStr.padEnd(2, "0"), 10);
      const dPadHi = parseInt(dStr.padEnd(2, "9"), 10);
      dayLo = Math.max(1, Math.min(31, dPadLo === 0 ? 1 : dPadLo));
      dayHi = Math.min(32, dPadHi + 1);
      if (dPadHi >= 31) dayHi = 32;
    }
  }

  const lo = yearLo * 10000 + monthLo * 100 + dayLo;
  let hi: number;
  if (parts.length === 1) {
    hi = yearHi * 10000 + 100 + 1;
  } else if (parts.length === 2) {
    hi = yearLo * 10000 + monthHi * 100 + 1;
    if (monthHi > 12) {
      hi = (yearLo + 1) * 10000 + 100 + 1;
    }
  } else {
    hi = yearLo * 10000 + monthLo * 100 + dayHi;
    if (dayHi > 31) {
      hi = yearLo * 10000 + (monthLo + 1) * 100 + 1;
      if (monthLo === 12) hi = (yearLo + 1) * 10000 + 100 + 1;
    }
  }

  const floorNext =
    parts.length === 1 && yearSpan > 1 ? addYears(lo, 1) : hi;

  return { lo, hi, floorNext };
}
