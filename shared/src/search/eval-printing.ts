// SPDX-License-Identifier: Apache-2.0
import type { PrintingIndex } from "./printing-index";
import type { CardIndex } from "./card-index";
import { RARITY_NAMES, RARITY_ORDER, Rarity, FRAME_NAMES, FORMAT_NAMES, GAME_NAMES, PrintingFlag, Finish } from "../bits";
import { parseDateRange } from "./date-range";

export const PERCENTILE_RE = /^(\d+(?:\.\d+)?)%$/;

export function parsePercentile(val: string): number | null {
  const m = val.match(PERCENTILE_RE);
  if (!m) return null;
  const p = parseFloat(m[1]);
  if (isNaN(p) || p < 0 || p > 100) return null;
  return p;
}

export function applyPercentileSlice(
  sortedIndices: Uint32Array,
  n: number,
  op: string,
  p: number,
  buf: Uint8Array,
): void {
  if (n === 0) return;
  const pFrac = p / 100;
  let start: number;
  let end: number;
  switch (op) {
    case ">":
    case ">=":
      start = Math.floor(n * pFrac);
      end = n;
      break;
    case "<":
      start = 0;
      end = Math.floor(n * pFrac);
      break;
    case "<=":
      start = 0;
      end = Math.floor(n * pFrac) + 1;
      break;
    case "=":
    case ":":
      const lo = Math.max(0, p - 0.5);
      const hi = Math.min(100, p + 0.5);
      start = Math.floor(n * (lo / 100));
      end = Math.ceil(n * (hi / 100));
      break;
    case "!=":
      const loEq = Math.max(0, p - 0.5);
      const hiEq = Math.min(100, p + 0.5);
      const bandStart = Math.floor(n * (loEq / 100));
      const bandEnd = Math.ceil(n * (hiEq / 100));
      for (let i = 0; i < bandStart; i++) buf[sortedIndices[i]] = 1;
      for (let i = bandEnd; i < n; i++) buf[sortedIndices[i]] = 1;
      return;
    default:
      return;
  }
  for (let i = start; i < end; i++) buf[sortedIndices[i]] = 1;
}

/** Scryfall language codes we recognize but do not support (in: language is out of scope). */
const KNOWN_LANGUAGES = new Set([
  "en", "es", "fr", "de", "it", "pt", "ja", "ko", "zhs", "zht", "ru", "pl",
  "japanese", "russian", "chinese", "spanish", "french", "german", "italian",
  "portuguese", "korean", "english",
]);

export const PRINTING_FIELDS = new Set([
  "set", "rarity", "usd", "collectornumber", "frame", "year", "date",
  "game", "legal", "banned", "restricted", "in", "atag",
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
    case "usd": {
      if (valLower === "null") {
        switch (op) {
          case ":": case "=":
            for (let i = 0; i < n; i++) if (pIdx.priceUsd[i] === 0) buf[i] = 1;
            break;
          case "!=":
            for (let i = 0; i < n; i++) if (pIdx.priceUsd[i] !== 0) buf[i] = 1;
            break;
          default:
            return "null cannot be used with comparison operators";
        }
        break;
      }
      const usdPercentile = parsePercentile(val);
      if (usdPercentile !== null) {
        applyPercentileSlice(
          pIdx.sortedUsdIndices,
          pIdx.sortedUsdCount,
          op,
          usdPercentile,
          buf,
        );
        break;
      }
      if (val.endsWith("%")) return `invalid percentile "${val.replace(/%$/, "")}"`;
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
      const datePercentile = parsePercentile(val);
      if (datePercentile !== null) {
        applyPercentileSlice(
          pIdx.sortedDateIndices,
          pIdx.sortedDateCount,
          op,
          datePercentile,
          buf,
        );
        break;
      }
      if (PERCENTILE_RE.test(val)) return `invalid percentile "${val.replace(/%$/, "")}"`;
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
    case "in": {
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `in: does not support operator "${op}"`;
      }
      // Disambiguate by value: game → set → rarity → language (unsupported) → unknown
      const targetGame = GAME_NAMES[valLower];
      if (targetGame !== undefined) {
        const games = pIdx.games;
        for (let i = 0; i < n; i++) {
          const g = games[i] ?? 0;
          const match = (op === ":" || op === "=") ? (g & targetGame) !== 0 : (g & targetGame) === 0;
          if (match) buf[i] = 1;
        }
        break;
      }
      if (pIdx.knownSetCodes.has(valLower)) {
        for (let i = 0; i < n; i++) {
          const match = (op === ":" || op === "=")
            ? pIdx.setCodesLower[i] === valLower
            : pIdx.setCodesLower[i] !== valLower;
          if (match) buf[i] = 1;
        }
        break;
      }
      const rarityBit = RARITY_NAMES[valLower] ?? (valLower === "bonus" ? Rarity.Special : undefined);
      if (rarityBit !== undefined) {
        for (let i = 0; i < n; i++) {
          const match = (op === ":" || op === "=")
            ? (pIdx.rarity[i] & rarityBit) !== 0
            : (pIdx.rarity[i] & rarityBit) === 0;
          if (match) buf[i] = 1;
        }
        break;
      }
      if (KNOWN_LANGUAGES.has(valLower)) return `unsupported in value "${val}"`;
      return `unknown in value "${val}"`;
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

/**
 * Add only the canonical nonfoil printing per face. Used when my: + unique:prints
 * to show "exactly what's in the list" without expanding generic entries to all printings.
 */
export function promoteFaceToPrintingCanonicalNonfoil(
  faceMask: Uint8Array,
  printingBuf: Uint8Array,
  pIdx: PrintingIndex,
): void {
  for (let cf = 0; cf < faceMask.length; cf++) {
    if (!faceMask[cf]) continue;
    const pRows = pIdx.printingsOf(cf);
    let added = false;
    for (const p of pRows) {
      if (pIdx.finish[p] === Finish.Nonfoil) {
        printingBuf[p] = 1;
        added = true;
        break;
      }
    }
    if (!added && pRows.length > 0) {
      printingBuf[pRows[0]] = 1;
    }
  }
}
