// SPDX-License-Identifier: Apache-2.0
import type { PrintingIndex } from "./printing-index";
import type { CardIndex } from "./card-index";
import { RARITY_NAMES, RARITY_ORDER, FRAME_NAMES, FORMAT_NAMES, GAME_NAMES, PrintingFlag } from "../bits";
import { parseDateRange } from "./date-range";

export const PRINTING_FIELDS = new Set([
  "set", "rarity", "price", "collectornumber", "frame", "year", "date",
  "game", "legal", "banned", "restricted",
]);

export const FACE_FALLBACK_PRINTING_FIELDS = new Set([
  "legal", "banned", "restricted",
]);

export const NON_TOURNAMENT_MASK = PrintingFlag.GoldBorder | PrintingFlag.Oversized;

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

export function evalPrintingField(
  canonical: string,
  op: string,
  val: string,
  pIdx: PrintingIndex,
  buf: Uint8Array,
  cardIndex?: CardIndex,
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
      if (val.includes("-") || /^\d{5,}/.test(val)) {
        return `invalid year "${val}" (year: accepts only YYYY or partial year, e.g. 2025 or 202)`;
      }
      const range = parseDateRange(val, pIdx);
      if (range === null) return `invalid year "${val}"`;
      const { lo, hi } = range;
      for (let i = 0; i < n; i++) {
        const d = pIdx.releasedAt[i];
        if (d === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = d >= lo && d < hi; break;
          case "!=": match = !(d >= lo && d < hi); break;
          case ">":  match = d >= hi; break;
          case ">=": match = d >= lo; break;
          case "<":  match = d < lo; break;
          case "<=": match = d < hi; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "date": {
      const range = parseDateRange(val, pIdx);
      if (range === null) return `invalid date "${val}" (expected a date like YYYY-MM-DD, "now", or a set code)`;
      const { lo, hi } = range;
      for (let i = 0; i < n; i++) {
        const d = pIdx.releasedAt[i];
        if (d === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = d >= lo && d < hi; break;
          case "!=": match = !(d >= lo && d < hi); break;
          case ">":  match = d >= hi; break;
          case ">=": match = d >= lo; break;
          case "<":  match = d < lo; break;
          case "<=": match = d < hi; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "game": {
      const targetBit = GAME_NAMES[valLower];
      if (targetBit === undefined) return `unknown game "${val}"`;
      const games = pIdx.games;
      for (let i = 0; i < n; i++) {
        const g = games[i] ?? 0;
        let match = false;
        switch (op) {
          case ":": case "=": match = (g & targetBit) !== 0; break;
          case "!=": match = (g & targetBit) === 0; break;
          default: return `game: does not support operator "${op}"`;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "legal":
    case "banned":
    case "restricted": {
      if (!cardIndex) return `card index unavailable for legality check`;
      const formatBit = FORMAT_NAMES[valLower];
      if (formatBit === undefined) return `unknown format "${val}"`;
      const col = canonical === "legal" ? cardIndex.legalitiesLegal
        : canonical === "banned" ? cardIndex.legalitiesBanned
        : cardIndex.legalitiesRestricted;
      const cfRef = pIdx.canonicalFaceRef;
      const flags = pIdx.printingFlags;
      for (let i = 0; i < n; i++) {
        if ((col[cfRef[i]] & formatBit) && !(flags[i] & NON_TOURNAMENT_MASK)) buf[i] = 1;
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
