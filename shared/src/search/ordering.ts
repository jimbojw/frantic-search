// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, SortDirective } from "./ast";
import type { CardIndex } from "./card-index";
import type { PrintingIndex } from "./printing-index";
import { COLLECTOR_KEY_STRIDE } from "./collector-sort-key";
import { RARITY_ORDER } from "../bits";
import { FIELD_ALIASES } from "./eval-leaves";

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Keyed integer hash: mixes a 32-bit seed with a card index to produce
 * a pseudorandom 32-bit unsigned integer. Same (seed, index) pair always
 * yields the same value.
 */
export function seededRank(seedHash: number, index: number): number {
  let h = seedHash ^ index;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

const NAME_SUBSTRING_OPS = new Set([":", "="]);

/** Mutable out-record for null-aware sort comparisons (Spec 059 — no per-compare object alloc). */
type SortCmpOut = { cmp: number; applyDir: boolean };

const _outFaceField: SortCmpOut = { cmp: 0, applyDir: true };
const _outPrintingField: SortCmpOut = { cmp: 0, applyDir: true };
const _outCollector: SortCmpOut = { cmp: 0, applyDir: true };

let _setCodeCollator: Intl.Collator | undefined;
let _collectorNumberCollator: Intl.Collator | undefined;

function getSetCodeCollator(): Intl.Collator {
  return _setCodeCollator ??= new Intl.Collator();
}

function getCollectorNumberCollator(): Intl.Collator {
  return _collectorNumberCollator ??= new Intl.Collator("und", {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Walk the AST and collect values from BARE nodes and name-field terms
 * (name:value, n:value) that are not under a NOT. These represent the
 * user's name-search intent for prefix boosting (Issue #86).
 */
export function collectBareWords(ast: ASTNode): string[] {
  switch (ast.type) {
    case "BARE":
      return [ast.value];
    case "FIELD":
      if (
        ast.value &&
        NAME_SUBSTRING_OPS.has(ast.operator) &&
        FIELD_ALIASES[ast.field.toLowerCase()] === "name"
      ) {
        return [ast.value];
      }
      return [];
    case "AND":
    case "OR":
      return ast.children.flatMap(collectBareWords);
    case "NOT":
      return [];
    default:
      return [];
  }
}

/**
 * Sort indices in-place: cards whose names start with any bare word come
 * first (tier 0), followed by everything else (tier 1). Within each tier,
 * order is determined by a keyed hash — stable and pseudorandom.
 */
export function seededSort(
  indices: number[],
  seed: string,
  nameColumn: string[],
  bareWords: string[],
  sessionSalt = 0,
): void {
  if (indices.length <= 1) return;

  const seedHash = fnv1a(seed) ^ sessionSalt;
  const hasBareWords = bareWords.length > 0;
  const n = indices.length;

  const tier = new Uint8Array(n);
  const rank = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    tier[i] = hasBareWords && bareWords.some(w => nameColumn[idx].startsWith(w)) ? 0 : 1;
    rank[i] = seededRank(seedHash, idx);
  }

  const perm = Array.from({ length: n }, (_, i) => i);
  perm.sort((a, b) => tier[a] !== tier[b] ? tier[a] - tier[b] : rank[a] - rank[b]);

  const sorted = perm.map(i => indices[i]);
  for (let i = 0; i < n; i++) indices[i] = sorted[i];
}

/**
 * Sort printing indices in-place using the same tier + keyed-hash strategy
 * as seededSort, but keyed on the canonical face ref. Printings of the same
 * card share identical tier and rank, so stable sort preserves their relative
 * (intra-card) order.
 */
export function seededSortPrintings(
  printingIndices: Uint32Array,
  seed: string,
  canonicalFaceRef: number[],
  nameColumn: string[],
  bareWords: string[],
  sessionSalt = 0,
): void {
  const n = printingIndices.length;
  if (n <= 1) return;

  const seedHash = fnv1a(seed) ^ sessionSalt;
  const hasBareWords = bareWords.length > 0;

  const tier = new Uint8Array(n);
  const rank = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const faceIdx = canonicalFaceRef[printingIndices[i]];
    tier[i] = hasBareWords && bareWords.some(w => nameColumn[faceIdx].startsWith(w)) ? 0 : 1;
    rank[i] = seededRank(seedHash, faceIdx);
  }

  const perm = Array.from({ length: n }, (_, i) => i);
  perm.sort((a, b) => tier[a] !== tier[b] ? tier[a] - tier[b] : rank[a] - rank[b]);

  const sorted = perm.map(i => printingIndices[i]);
  for (let i = 0; i < n; i++) printingIndices[i] = sorted[i];
}

/**
 * Reorder printing indices to match a given card order. Groups printings by
 * canonical face (preserving input order within each group) and emits them in
 * the order of cardOrder. Used when face-domain sort is active: cards are
 * already sorted via sortByField; printings must follow that order.
 */
export function reorderPrintingsByCardOrder(
  printingIndices: Uint32Array,
  cardOrder: number[],
  canonicalFaceRef: number[],
): Uint32Array {
  const cardPrintings = new Map<number, number[]>();
  for (let i = 0; i < printingIndices.length; i++) {
    const p = printingIndices[i];
    const cf = canonicalFaceRef[p];
    let arr = cardPrintings.get(cf);
    if (!arr) {
      arr = [];
      cardPrintings.set(cf, arr);
    }
    arr.push(p);
  }
  const result = new Uint32Array(printingIndices.length);
  let k = 0;
  for (const cf of cardOrder) {
    const prints = cardPrintings.get(cf);
    if (prints) for (const p of prints) result[k++] = p;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spec 059 — field comparators
// ---------------------------------------------------------------------------

/** Gray code rank: position of v in the single-bit-transition sequence (0–31). */
function grayRank5(v: number): number {
  let g = v & 0x1f;
  let n = 0;
  while (g) {
    n ^= g;
    g >>= 1;
  }
  return n & 0x1f;
}

function compareName(a: number, b: number, idx: CardIndex): number {
  const na = idx.combinedNamesNormalized[a];
  const nb = idx.combinedNamesNormalized[b];
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

function compareMv(a: number, b: number, idx: CardIndex): number {
  return idx.manaValue[a] - idx.manaValue[b];
}

function compareColor(a: number, b: number, idx: CardIndex): number {
  return grayRank5(idx.colors[a]) - grayRank5(idx.colors[b]);
}

function compareIdentity(a: number, b: number, idx: CardIndex): number {
  return grayRank5(idx.colorIdentity[a]) - grayRank5(idx.colorIdentity[b]);
}

function compareEdhrec(a: number, b: number, idx: CardIndex): number {
  const ra = idx.edhrecRank[a];
  const rb = idx.edhrecRank[b];
  if (ra == null && rb == null) return 0;
  if (ra == null) return 1;
  if (rb == null) return -1;
  return ra - rb;
}

function compareSalt(a: number, b: number, idx: CardIndex): number {
  const sa = idx.edhrecSalt[a];
  const sb = idx.edhrecSalt[b];
  if (sa == null && sb == null) return 0;
  if (sa == null) return 1;
  if (sb == null) return -1;
  return sa - sb;
}

function comparePrintingRarity(a: number, b: number, pIdx: PrintingIndex): number {
  const ra = RARITY_ORDER[pIdx.rarity[a]] ?? -1;
  const rb = RARITY_ORDER[pIdx.rarity[b]] ?? -1;
  return ra - rb;
}

/** Empty collector number sorts last; else numeric-aware collator (Scryfall-style cn ordering). */
function comparePrintingCollectorInto(
  out: SortCmpOut,
  a: number,
  b: number,
  pIdx: PrintingIndex,
  coll: Intl.Collator,
): void {
  const ca = pIdx.collectorNumbersLower[a] ?? "";
  const cb = pIdx.collectorNumbersLower[b] ?? "";
  const emptyA = ca.length === 0;
  const emptyB = cb.length === 0;
  if (emptyA && emptyB) {
    out.cmp = 0;
    out.applyDir = false;
    return;
  }
  if (emptyA) {
    out.cmp = 1;
    out.applyDir = false;
    return;
  }
  if (emptyB) {
    out.cmp = -1;
    out.applyDir = false;
    return;
  }
  const keys = pIdx.collectorSortKeys;
  const oa = a * COLLECTOR_KEY_STRIDE;
  const ob = b * COLLECTOR_KEY_STRIDE;
  const k0a = keys[oa];
  const k0b = keys[ob];
  if (k0a > 0 && k0b > 0) {
    for (let i = 0; i < COLLECTOR_KEY_STRIDE; i++) {
      const va = keys[oa + i];
      const vb = keys[ob + i];
      if (va !== vb) {
        out.cmp = va < vb ? -1 : 1;
        out.applyDir = true;
        return;
      }
    }
    out.cmp = 0;
    out.applyDir = true;
    return;
  }
  if (k0a > 0 && k0b === 0) {
    out.cmp = -1;
    out.applyDir = true;
    return;
  }
  if (k0a === 0 && k0b > 0) {
    out.cmp = 1;
    out.applyDir = true;
    return;
  }
  out.cmp = coll.compare(ca, cb);
  out.applyDir = true;
}

/** Null-aware field comparison: `applyDir` false means do not multiply by sort direction (null/empty last). */
function compareFieldInto(
  out: SortCmpOut,
  a: number,
  b: number,
  field: string,
  idx: CardIndex,
): void {
  switch (field) {
    case "name":
      out.cmp = compareName(a, b, idx);
      out.applyDir = true;
      return;
    case "mv":
      out.cmp = compareMv(a, b, idx);
      out.applyDir = true;
      return;
    case "color":
      out.cmp = compareColor(a, b, idx);
      out.applyDir = true;
      return;
    case "identity":
      out.cmp = compareIdentity(a, b, idx);
      out.applyDir = true;
      return;
    case "power": {
      const va = idx.numericPowerLookup[a];
      const vb = idx.numericPowerLookup[b];
      if (isNaN(va) && isNaN(vb)) {
        out.cmp = 0;
        out.applyDir = false;
        return;
      }
      if (isNaN(va)) {
        out.cmp = 1;
        out.applyDir = false;
        return;
      }
      if (isNaN(vb)) {
        out.cmp = -1;
        out.applyDir = false;
        return;
      }
      out.cmp = va - vb;
      out.applyDir = true;
      return;
    }
    case "toughness": {
      const va = idx.numericToughnessLookup[a];
      const vb = idx.numericToughnessLookup[b];
      if (isNaN(va) && isNaN(vb)) {
        out.cmp = 0;
        out.applyDir = false;
        return;
      }
      if (isNaN(va)) {
        out.cmp = 1;
        out.applyDir = false;
        return;
      }
      if (isNaN(vb)) {
        out.cmp = -1;
        out.applyDir = false;
        return;
      }
      out.cmp = va - vb;
      out.applyDir = true;
      return;
    }
    case "edhrec":
      out.cmp = compareEdhrec(a, b, idx);
      out.applyDir = true;
      return;
    case "salt":
      out.cmp = compareSalt(a, b, idx);
      out.applyDir = true;
      return;
    default:
      out.cmp = 0;
      out.applyDir = true;
  }
}

function comparePrintingFieldInto(
  out: SortCmpOut,
  a: number,
  b: number,
  field: string,
  pIdx: PrintingIndex,
  setColl: Intl.Collator,
): void {
  switch (field) {
    case "usd": {
      const pa = pIdx.priceUsd[a];
      const pb = pIdx.priceUsd[b];
      if (pa === 0 && pb === 0) {
        out.cmp = 0;
        out.applyDir = false;
        return;
      }
      if (pa === 0) {
        out.cmp = 1;
        out.applyDir = false;
        return;
      }
      if (pb === 0) {
        out.cmp = -1;
        out.applyDir = false;
        return;
      }
      out.cmp = pa - pb;
      out.applyDir = true;
      return;
    }
    case "date": {
      const da = pIdx.releasedAt[a];
      const db = pIdx.releasedAt[b];
      if (da === 0 && db === 0) {
        out.cmp = 0;
        out.applyDir = false;
        return;
      }
      if (da === 0) {
        out.cmp = 1;
        out.applyDir = false;
        return;
      }
      if (db === 0) {
        out.cmp = -1;
        out.applyDir = false;
        return;
      }
      out.cmp = da - db;
      out.applyDir = true;
      return;
    }
    case "rarity":
      out.cmp = comparePrintingRarity(a, b, pIdx);
      out.applyDir = true;
      return;
    case "set": {
      const sa = pIdx.setCodesLower[a] ?? "";
      const sb = pIdx.setCodesLower[b] ?? "";
      const emptyA = sa.length === 0;
      const emptyB = sb.length === 0;
      if (emptyA && emptyB) {
        out.cmp = 0;
        out.applyDir = false;
        return;
      }
      if (emptyA) {
        out.cmp = 1;
        out.applyDir = false;
        return;
      }
      if (emptyB) {
        out.cmp = -1;
        out.applyDir = false;
        return;
      }
      out.cmp = setColl.compare(sa, sb);
      out.applyDir = true;
      return;
    }
    default:
      out.cmp = 0;
      out.applyDir = true;
  }
}

// ---------------------------------------------------------------------------
// Spec 059 — face-domain sort
// ---------------------------------------------------------------------------

export function sortByField(
  indices: number[],
  directive: SortDirective,
  idx: CardIndex,
  seedHash: number,
): void {
  if (indices.length <= 1) return;
  const { field, direction } = directive;
  const dir = direction === "desc" ? -1 : 1;

  indices.sort((a, b) => {
    compareFieldInto(_outFaceField, a, b, field, idx);
    const { cmp, applyDir } = _outFaceField;
    if (cmp !== 0) return applyDir ? dir * cmp : cmp;
    if (field !== "name") {
      const nameCmp = compareName(a, b, idx);
      if (nameCmp !== 0) return nameCmp;
    }
    return seededRank(seedHash, a) - seededRank(seedHash, b);
  });
}

// ---------------------------------------------------------------------------
// Spec 059 — printing-domain sort
// ---------------------------------------------------------------------------

export interface PrintingDomainSortResult {
  cardOrder: number[];
  groupedPrintings: Uint32Array;
}

export function sortPrintingDomain(
  deduped: number[],
  rawPrintingIndices: Uint32Array,
  directive: SortDirective,
  idx: CardIndex,
  pIdx: PrintingIndex,
  seedHash: number,
): PrintingDomainSortResult {
  const { field, direction } = directive;
  const dir = direction === "desc" ? -1 : 1;

  const setColl = getSetCodeCollator();
  const collectorColl = getCollectorNumberCollator();

  // 1. Partition printings by canonical face
  const cardPrintings = new Map<number, number[]>();
  for (let i = 0; i < rawPrintingIndices.length; i++) {
    const p = rawPrintingIndices[i];
    const cf = pIdx.canonicalFaceRef[p];
    let arr = cardPrintings.get(cf);
    if (!arr) {
      arr = [];
      cardPrintings.set(cf, arr);
    }
    arr.push(p);
  }

  // 2. Sort each card's printing list
  for (const [, prints] of cardPrintings) {
    prints.sort((a, b) => {
      comparePrintingFieldInto(_outPrintingField, a, b, field, pIdx, setColl);
      let cmp = _outPrintingField.cmp;
      let applyDir = _outPrintingField.applyDir;
      if (cmp !== 0) return applyDir ? dir * cmp : cmp;
      if (field === "set") {
        comparePrintingCollectorInto(_outCollector, a, b, pIdx, collectorColl);
        cmp = _outCollector.cmp;
        applyDir = _outCollector.applyDir;
        if (cmp !== 0) return applyDir ? dir * cmp : cmp;
      }
      const dateCmp = pIdx.releasedAt[b] - pIdx.releasedAt[a];
      if (dateCmp !== 0) return dateCmp;
      comparePrintingCollectorInto(_outCollector, a, b, pIdx, collectorColl);
      if (_outCollector.cmp !== 0) return _outCollector.cmp;
      return seededRank(seedHash, a) - seededRank(seedHash, b);
    });
  }

  // 3. Sort cards by representative printing (first in each card's sorted list)
  const cardOrder = deduped.filter(cf => cardPrintings.has(cf));
  cardOrder.sort((cfA, cfB) => {
    const repA = cardPrintings.get(cfA)![0];
    const repB = cardPrintings.get(cfB)![0];
    comparePrintingFieldInto(_outPrintingField, repA, repB, field, pIdx, setColl);
    let cmp = _outPrintingField.cmp;
    let applyDir = _outPrintingField.applyDir;
    if (cmp !== 0) return applyDir ? dir * cmp : cmp;
    if (field === "set") {
      comparePrintingCollectorInto(_outCollector, repA, repB, pIdx, collectorColl);
      cmp = _outCollector.cmp;
      applyDir = _outCollector.applyDir;
      if (cmp !== 0) return applyDir ? dir * cmp : cmp;
    }
    const nameCmp = compareName(cfA, cfB, idx);
    if (nameCmp !== 0) return nameCmp;
    return seededRank(seedHash, cfA) - seededRank(seedHash, cfB);
  });

  // 4. Emit grouped printing runs in card order
  let totalPrintings = 0;
  for (const cf of cardOrder) totalPrintings += cardPrintings.get(cf)!.length;
  const groupedPrintings = new Uint32Array(totalPrintings);
  let k = 0;
  for (const cf of cardOrder) {
    const prints = cardPrintings.get(cf)!;
    for (const p of prints) groupedPrintings[k++] = p;
  }

  return { cardOrder, groupedPrintings };
}
