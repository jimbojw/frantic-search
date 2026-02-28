// SPDX-License-Identifier: Apache-2.0
import type { PrintingIndex } from "./printing-index";
import { RARITY_NAMES, RARITY_ORDER, FRAME_NAMES } from "../bits";

export const PRINTING_FIELDS = new Set([
  "set", "rarity", "price", "collectornumber", "frame", "year", "date",
]);

export function isPrintingField(canonical: string): boolean {
  return PRINTING_FIELDS.has(canonical);
}

function buildRarityMask(op: string, targetBit: number): number {
  const targetOrder = RARITY_ORDER[targetBit];
  if (targetOrder === undefined) return 0;
  let mask = 0;
  for (const [bit, order] of Object.entries(RARITY_ORDER)) {
    const bitNum = Number(bit);
    switch (op) {
      case ":": case "=": if (order === targetOrder) mask |= bitNum; break;
      case "!=": if (order !== targetOrder) mask |= bitNum; break;
      case ">":  if (order > targetOrder) mask |= bitNum; break;
      case "<":  if (order < targetOrder) mask |= bitNum; break;
      case ">=": if (order >= targetOrder) mask |= bitNum; break;
      case "<=": if (order <= targetOrder) mask |= bitNum; break;
    }
  }
  return mask;
}

function parseDateLiteral(val: string): number {
  const parts = val.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return y * 10000 + m * 100 + d;
  }
  return 0;
}

function resolveSetDate(codeLower: string, pIdx: PrintingIndex): number {
  for (let i = 0; i < pIdx.printingCount; i++) {
    if (pIdx.setCodesLower[i] === codeLower) {
      return pIdx.setReleasedAt[pIdx.setIndices[i]];
    }
  }
  return 0;
}

function resolveDateValue(val: string, pIdx: PrintingIndex): number {
  const lower = val.toLowerCase();
  if (lower === "now" || lower === "today") {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  const literal = parseDateLiteral(val);
  if (literal > 0) return literal;
  return resolveSetDate(lower, pIdx);
}

export function evalPrintingField(
  canonical: string,
  op: string,
  val: string,
  pIdx: PrintingIndex,
  buf: Uint8Array,
): string | null {
  const n = pIdx.printingCount;
  const valLower = val.toLowerCase();

  switch (canonical) {
    case "set": {
      if (!pIdx.knownSetCodes.has(valLower)) return `unknown set "${val}"`;
      for (let i = 0; i < n; i++) {
        if (pIdx.setCodesLower[i] === valLower) buf[i] = 1;
      }
      break;
    }
    case "rarity": {
      const targetBit = RARITY_NAMES[valLower];
      if (targetBit === undefined) return `unknown rarity "${val}"`;
      const mask = buildRarityMask(op, targetBit);
      for (let i = 0; i < n; i++) {
        if (pIdx.rarity[i] & mask) buf[i] = 1;
      }
      break;
    }
    case "price": {
      const queryDollars = parseFloat(val);
      if (isNaN(queryDollars)) return `invalid price "${val}"`;
      const queryCents = Math.round(queryDollars * 100);
      for (let i = 0; i < n; i++) {
        const p = pIdx.priceUsd[i];
        if (p === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = p === queryCents; break;
          case "!=": match = p !== queryCents; break;
          case ">":  match = p > queryCents; break;
          case "<":  match = p < queryCents; break;
          case ">=": match = p >= queryCents; break;
          case "<=": match = p <= queryCents; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "collectornumber": {
      for (let i = 0; i < n; i++) {
        if (pIdx.collectorNumbersLower[i] === valLower) buf[i] = 1;
      }
      break;
    }
    case "frame": {
      const frameBit = FRAME_NAMES[valLower];
      if (frameBit === undefined) return `unknown frame "${val}"`;
      for (let i = 0; i < n; i++) {
        if (pIdx.frame[i] & frameBit) buf[i] = 1;
      }
      break;
    }
    case "year": {
      const queryYear = parseInt(val, 10);
      if (isNaN(queryYear)) return `invalid year "${val}"`;
      for (let i = 0; i < n; i++) {
        const cardYear = Math.floor(pIdx.releasedAt[i] / 10000);
        if (pIdx.releasedAt[i] === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = cardYear === queryYear; break;
          case "!=": match = cardYear !== queryYear; break;
          case ">":  match = cardYear > queryYear; break;
          case "<":  match = cardYear < queryYear; break;
          case ">=": match = cardYear >= queryYear; break;
          case "<=": match = cardYear <= queryYear; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "date": {
      const queryDate = resolveDateValue(val, pIdx);
      if (queryDate === 0) return `invalid date "${val}" (expected YYYY-MM-DD, "now", or a set code)`;
      for (let i = 0; i < n; i++) {
        const d = pIdx.releasedAt[i];
        if (d === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = d === queryDate; break;
          case "!=": match = d !== queryDate; break;
          case ">":  match = d > queryDate; break;
          case "<":  match = d < queryDate; break;
          case ">=": match = d >= queryDate; break;
          case "<=": match = d <= queryDate; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    default:
      return `unknown printing field "${canonical}"`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Domain promotion helpers
// ---------------------------------------------------------------------------

export function promotePrintingToFace(
  printingBuf: Uint8Array,
  faceBuf: Uint8Array,
  canonicalFaceRef: number[],
  printingCount: number,
): void {
  for (let p = 0; p < printingCount; p++) {
    if (printingBuf[p]) faceBuf[canonicalFaceRef[p]] = 1;
  }
}

export function promoteFaceToPrinting(
  faceBuf: Uint8Array,
  printingBuf: Uint8Array,
  pIdx: PrintingIndex,
): void {
  for (let p = 0; p < pIdx.printingCount; p++) {
    if (faceBuf[pIdx.canonicalFaceRef[p]]) printingBuf[p] = 1;
  }
}
