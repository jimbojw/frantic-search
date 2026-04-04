// SPDX-License-Identifier: Apache-2.0
import type { PrintingIndex } from "./printing-index";
import type { FlavorTagData, ArtistIndexData } from "../data";
import { RARITY_NAMES, RARITY_ORDER, FRAME_NAMES, GAME_NAMES, Finish } from "../bits";
import { parseDateRange } from "./date-range";
import { resolveForField, normalizeForResolution, type ResolutionContext } from "./categorical-resolve";
import { isEquatableNullLiteral } from "./null-query-literal";

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
  "set", "set_type", "rarity", "usd", "collectornumber", "frame", "year", "date",
  "game", "in", "atag", "flavor", "artist",
]);

export function isPrintingField(canonical: string): boolean {
  return PRINTING_FIELDS.has(canonical);
}

/** Spec 181: normalized vocabulary union for `in:` prefix-branch hints. */
export function collectInPrefixHintNormalizedCandidates(pIdx: PrintingIndex): string[] {
  const s = new Set<string>();
  for (const key of Object.keys(GAME_NAMES)) {
    const n = normalizeForResolution(key);
    if (n.length > 0) s.add(n);
  }
  for (const key of Object.keys(RARITY_NAMES)) {
    const n = normalizeForResolution(key);
    if (n.length > 0) s.add(n);
  }
  for (const code of pIdx.knownSetCodes) {
    const sn = pIdx.setCodeNormByLower.get(code);
    if (sn !== undefined && sn.length > 0) s.add(sn);
  }
  return [...s];
}

/** Precomputed `normalizeForResolution(FRAME_NAMES key)` → bit (Spec 047 / 182). */
const FRAME_NORM_BITS: { norm: string; bit: number }[] = Object.entries(FRAME_NAMES).map(([key, bit]) => ({
  norm: normalizeForResolution(key),
  bit,
}));

function combinedFrameMask(prefixOp: boolean, u: string): number {
  let m = 0;
  for (const row of FRAME_NORM_BITS) {
    if (prefixOp) {
      if (row.norm.startsWith(u)) m |= row.bit;
    } else if (row.norm === u) {
      m |= row.bit;
    }
  }
  return m;
}

/** Precomputed norms for `in:` game / rarity prefix and exact union (Spec 182). */
const GAME_IN_NORM_BITS: { norm: string; bit: number }[] = Object.entries(GAME_NAMES).map(([key, bit]) => ({
  norm: normalizeForResolution(key),
  bit,
}));

const RARITY_IN_NORM_BITS: { norm: string; bit: number }[] = Object.entries(RARITY_NAMES).map(([key, bit]) => ({
  norm: normalizeForResolution(key),
  bit,
}));

function combinedInGameMask(prefixOp: boolean, u: string): number {
  let m = 0;
  for (const row of GAME_IN_NORM_BITS) {
    if (prefixOp) {
      if (row.norm.startsWith(u)) m |= row.bit;
    } else if (row.norm === u) {
      m |= row.bit;
    }
  }
  return m;
}

function combinedInRarityMask(prefixOp: boolean, u: string): number {
  let m = 0;
  for (const row of RARITY_IN_NORM_BITS) {
    if (prefixOp) {
      if (row.norm.startsWith(u)) m |= row.bit;
    } else if (row.norm === u) {
      m |= row.bit;
    }
  }
  return m;
}

function matchedSetNormsPrefix(pIdx: PrintingIndex, u: string): Set<string> {
  const out = new Set<string>();
  for (const code of pIdx.knownSetCodes) {
    const sn = pIdx.setCodeNormByLower.get(code);
    if (sn !== undefined && sn.startsWith(u)) out.add(sn);
  }
  return out;
}

function hasExactSetNorm(pIdx: PrintingIndex, u: string): boolean {
  for (const code of pIdx.knownSetCodes) {
    if (pIdx.setCodeNormByLower.get(code) === u) return true;
  }
  return false;
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
  context?: ResolutionContext,
  flavorIndex?: FlavorTagData | null,
  artistIndex?: ArtistIndexData | null,
): string | null {
  const n = pIdx.printingCount;

  switch (canonical) {
    case "set": {
      if (op !== ":" && op !== "=") {
        return `set: does not support operator "${op}"`;
      }
      // Spec 047: `:` prefix union, `=` exact; precomputed row norms (Spec 182).
      const trimmed = val.trim();
      if (trimmed === "") {
        if (op === "=") {
          for (let i = 0; i < n; i++) buf[i] = 1;
        } else {
          for (let i = 0; i < n; i++) {
            if (pIdx.setCodesNormResolved[i]!.length > 0) buf[i] = 1;
          }
        }
      } else {
        const u = normalizeForResolution(trimmed);
        const prefixOp = op === ":";
        let matchedAny = false;
        for (let i = 0; i < n; i++) {
          const row = pIdx.setCodesNormResolved[i]!;
          const ok = prefixOp ? row.startsWith(u) : row === u;
          if (!ok) continue;
          matchedAny = true;
          buf[i] = 1;
        }
        if (!matchedAny) return `unknown set "${trimmed}"`;
      }
      break;
    }
    case "set_type": {
      if (op !== ":" && op !== "=") {
        return `set_type: does not support operator "${op}"`;
      }
      const trimmedSt = val.trim();
      if (trimmedSt === "") {
        if (op === "=") {
          for (let i = 0; i < n; i++) buf[i] = 1;
        } else {
          for (let i = 0; i < n; i++) {
            if (pIdx.setTypesNormResolved[i]!.length > 0) buf[i] = 1;
          }
        }
      } else {
        const u = normalizeForResolution(trimmedSt);
        const prefixOpSt = op === ":";
        let matchedAnySt = false;
        for (let i = 0; i < n; i++) {
          const row = pIdx.setTypesNormResolved[i]!;
          const ok = prefixOpSt ? row.startsWith(u) : row === u;
          if (!ok) continue;
          matchedAnySt = true;
          buf[i] = 1;
        }
        if (!matchedAnySt) return `unknown set_type "${trimmedSt}"`;
      }
      break;
    }
    case "rarity": {
      // Ordinal comparisons: single anchor via Spec 103 resolveForField (Spec 047).
      if (op === ">" || op === ">=" || op === "<" || op === "<=") {
        const rarityVal = resolveForField("rarity", val, context);
        const targetBit = RARITY_NAMES[rarityVal.toLowerCase()];
        if (targetBit === undefined) return `unknown rarity "${val}"`;
        const mask = buildRarityMask(op, targetBit);
        for (let i = 0; i < n; i++) {
          if (pIdx.rarity[i]! & mask) buf[i] = 1;
        }
        break;
      }
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `rarity: does not support operator "${op}"`;
      }
      const trimmedR = val.trim();
      if (trimmedR === "") {
        for (let i = 0; i < n; i++) buf[i] = 1;
        break;
      }
      const uR = normalizeForResolution(trimmedR);
      if (op === "!=") {
        const combinedEq = combinedInRarityMask(false, uR);
        if (combinedEq === 0) return `unknown rarity "${trimmedR}"`;
        for (let i = 0; i < n; i++) {
          if ((pIdx.rarity[i]! & combinedEq) === 0) buf[i] = 1;
        }
      } else {
        const combined = combinedInRarityMask(op === ":", uR);
        if (combined === 0) return `unknown rarity "${trimmedR}"`;
        for (let i = 0; i < n; i++) {
          if (pIdx.rarity[i]! & combined) buf[i] = 1;
        }
      }
      break;
    }
    case "usd": {
      if (isEquatableNullLiteral(val)) {
        if (op === ":" || op === "=") {
          for (let i = 0; i < n; i++) if (pIdx.priceUsd[i] === 0) buf[i] = 1;
          break;
        }
        if (op === "!=") {
          for (let i = 0; i < n; i++) if (pIdx.priceUsd[i] !== 0) buf[i] = 1;
          break;
        }
        if (val.trim().toLowerCase() === "null") {
          return "null cannot be used with comparison operators";
        }
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
      if (op !== ":" && op !== "=") {
        return `collectornumber: does not support operator "${op}"`;
      }
      const trimmedCn = val.trim();
      if (trimmedCn === "") {
        for (let i = 0; i < n; i++) buf[i] = 1;
        break;
      }
      const uCn = normalizeForResolution(trimmedCn);
      const prefixCn = op === ":";
      let matchedCn = false;
      for (let i = 0; i < n; i++) {
        const c = pIdx.collectorNumbersNormResolved[i]!;
        const ok = prefixCn ? c.startsWith(uCn) : c === uCn;
        if (!ok) continue;
        matchedCn = true;
        buf[i] = 1;
      }
      if (!matchedCn) return `unknown collector number "${trimmedCn}"`;
      break;
    }
    case "frame": {
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `frame: does not support operator "${op}"`;
      }
      const trimmed = val.trim();
      if (trimmed === "") {
        // Same as `kw:` / `keyword:` (Spec 176): empty `:` and `=` are neutral — all printings match.
        for (let i = 0; i < n; i++) buf[i] = 1;
      } else {
        const u = normalizeForResolution(trimmed);
        if (op === "!=") {
          // Principled Frantic extension (Spec 182): `!=` negates **exact `=`** only, not prefix `:` (use NOT for that).
          const combined = combinedFrameMask(false, u);
          if (combined === 0) return `unknown frame "${trimmed}"`;
          for (let i = 0; i < n; i++) {
            if ((pIdx.frame[i] & combined) === 0) buf[i] = 1;
          }
        } else {
          const combined = combinedFrameMask(op === ":", u);
          if (combined === 0) return `unknown frame "${trimmed}"`;
          for (let i = 0; i < n; i++) {
            if (pIdx.frame[i] & combined) buf[i] = 1;
          }
        }
      }
      break;
    }
    case "year": {
      if (val.includes("-") || /^\d{5,}/.test(val)) {
        return `invalid year "${val}" (year: accepts only YYYY or partial year, e.g. 2025 or 202)`;
      }
      const range = parseDateRange(val, pIdx);
      if (range === null) return `invalid year "${val}"`;
      const { lo, hi, floorNext } = range;
      for (let i = 0; i < n; i++) {
        const d = pIdx.releasedAt[i];
        if (d === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = d >= lo && d < hi; break;
          case "!=": match = !(d >= lo && d < hi); break;
          case ">":  match = d >= floorNext; break;
          case ">=": match = d >= lo; break;
          case "<":  match = d < lo; break;
          case "<=": match = d < floorNext; break;
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
      const { lo, hi, floorNext } = range;
      for (let i = 0; i < n; i++) {
        const d = pIdx.releasedAt[i];
        if (d === 0) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = d >= lo && d < hi; break;
          case "!=": match = !(d >= lo && d < hi); break;
          case ">":  match = d >= floorNext; break;
          case ">=": match = d >= lo; break;
          case "<":  match = d < lo; break;
          case "<=": match = d < floorNext; break;
        }
        if (match) buf[i] = 1;
      }
      break;
    }
    case "game": {
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `game: does not support operator "${op}"`;
      }
      const trimmedG = val.trim();
      if (trimmedG === "") {
        for (let i = 0; i < n; i++) buf[i] = 1;
        break;
      }
      const uG = normalizeForResolution(trimmedG);
      if (op === "!=") {
        const combinedEx = combinedInGameMask(false, uG);
        if (combinedEx === 0) return `unknown game "${trimmedG}"`;
        for (let i = 0; i < n; i++) {
          if (((pIdx.games[i] ?? 0) & combinedEx) === 0) buf[i] = 1;
        }
      } else {
        const combined = combinedInGameMask(op === ":", uG);
        if (combined === 0) return `unknown game "${trimmedG}"`;
        for (let i = 0; i < n; i++) {
          if ((pIdx.games[i] ?? 0) & combined) buf[i] = 1;
        }
      }
      break;
    }
    case "in": {
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `in: does not support operator "${op}"`;
      }
      const trimmedIn = val.trim();
      if (trimmedIn === "") {
        for (let i = 0; i < n; i++) buf[i] = 1;
        break;
      }
      const tlow = trimmedIn.toLowerCase();
      if (KNOWN_LANGUAGES.has(tlow)) {
        return `unsupported in value "${trimmedIn}"`;
      }
      const uIn = normalizeForResolution(trimmedIn);

      if (op === ":") {
        const gBits = combinedInGameMask(true, uIn);
        const rMask = combinedInRarityMask(true, uIn);
        const setNorms = matchedSetNormsPrefix(pIdx, uIn);
        if (gBits === 0 && rMask === 0 && setNorms.size === 0) {
          return `unknown in value "${trimmedIn}"`;
        }
        const gamesCol = pIdx.games;
        for (let i = 0; i < n; i++) {
          const g = gamesCol[i] ?? 0;
          const r = pIdx.rarity[i] ?? 0;
          const sn = pIdx.setCodesNormResolved[i]!;
          if ((g & gBits) !== 0 || (r & rMask) !== 0 || setNorms.has(sn)) buf[i] = 1;
        }
        break;
      }

      // `=` / `!=`: exact positive predicate (game → set → rarity); `!=` negates that mask only (Spec 182).
      const gEx = combinedInGameMask(false, uIn);
      const invert = op === "!=";
      if (gEx !== 0) {
        const gamesEx = pIdx.games;
        for (let i = 0; i < n; i++) {
          const pos = ((gamesEx[i] ?? 0) & gEx) !== 0;
          buf[i] = invert ? (pos ? 0 : 1) : (pos ? 1 : 0);
        }
        break;
      }
      if (hasExactSetNorm(pIdx, uIn)) {
        for (let i = 0; i < n; i++) {
          const pos = pIdx.setCodesNormResolved[i] === uIn;
          buf[i] = invert ? (pos ? 0 : 1) : (pos ? 1 : 0);
        }
        break;
      }
      const rEx = combinedInRarityMask(false, uIn);
      if (rEx !== 0) {
        for (let i = 0; i < n; i++) {
          const pos = (pIdx.rarity[i] & rEx) !== 0;
          buf[i] = invert ? (pos ? 0 : 1) : (pos ? 1 : 0);
        }
        break;
      }
      return `unknown in value "${trimmedIn}"`;
    }
    case "flavor": {
      if (op !== ":" && op !== "=") {
        return `flavor: does not support operator "${op}"`;
      }
      if (!flavorIndex) return "flavor index not loaded";
      const normVal = val.toLowerCase().trim().replace(/\s+/g, " ");
      if (normVal === "") {
        for (const key in flavorIndex) {
          const arr = flavorIndex[key]!;
          for (let i = 1; i < arr.length; i += 2) {
            const pi = arr[i]!;
            if (pi < n) buf[pi] = 1;
          }
        }
      } else {
        for (const key in flavorIndex) {
          if (!key.includes(normVal)) continue;
          const arr = flavorIndex[key]!;
          for (let i = 0; i < arr.length; i += 2) {
            const pi = arr[i + 1]!;
            if (pi < n) buf[pi] = 1;
          }
        }
      }
      break;
    }
    case "artist": {
      if (op !== ":" && op !== "=") {
        return `artist: does not support operator "${op}"`;
      }
      if (!artistIndex) return "artist index not loaded";
      const normVal = val.toLowerCase().trim().replace(/\s+/g, " ");
      if (normVal === "") {
        for (const key in artistIndex) {
          const arr = artistIndex[key]!;
          for (let i = 1; i < arr.length; i += 2) {
            const pi = arr[i]!;
            if (pi < n) buf[pi] = 1;
          }
        }
      } else {
        for (const key in artistIndex) {
          if (!key.includes(normVal)) continue;
          const arr = artistIndex[key]!;
          for (let i = 0; i < arr.length; i += 2) {
            const pi = arr[i + 1]!;
            if (pi < n) buf[pi] = 1;
          }
        }
      }
      break;
    }
    default:
      return `unknown printing field "${canonical}"`;
  }
  return null;
}

/**
 * Evaluate flavor regex in printing domain. Spec 142.
 * Returns error string or null on success.
 */
export function evalFlavorRegex(
  pattern: string,
  flavorIndex: FlavorTagData | null,
  pIdx: PrintingIndex,
  buf: Uint8Array,
): string | null {
  if (!flavorIndex) return "flavor index not loaded";
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return "invalid regex";
  }
  const n = pIdx.printingCount;
  for (const key in flavorIndex) {
    if (!re.test(key)) continue;
    const arr = flavorIndex[key]!;
    for (let i = 0; i < arr.length; i += 2) {
      const pi = arr[i + 1]!;
      if (pi < n) buf[pi] = 1;
    }
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
