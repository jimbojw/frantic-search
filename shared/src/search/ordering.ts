// SPDX-License-Identifier: Apache-2.0
import type { ASTNode, SortDirective } from "./ast";
import type { CardIndex } from "./card-index";
import type { PrintingIndex } from "./printing-index";
import { RARITY_ORDER } from "../bits";

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

/**
 * Walk the AST and collect values from BARE nodes that are not under a NOT.
 * These represent the user's name-search intent for prefix boosting.
 */
export function collectBareWords(ast: ASTNode): string[] {
  switch (ast.type) {
    case "BARE":
      return [ast.value];
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

/** Null-aware field comparison: returns [cmp, bothPresent] where cmp is the
 *  null-aware ordering (null sorts last regardless of direction) and bothPresent
 *  indicates whether both values are present (so the caller can apply direction). */
function compareFieldRaw(a: number, b: number, field: string, idx: CardIndex): { cmp: number; applyDir: boolean } {
  switch (field) {
    case "name": return { cmp: compareName(a, b, idx), applyDir: true };
    case "mv": return { cmp: compareMv(a, b, idx), applyDir: true };
    case "color": return { cmp: compareColor(a, b, idx), applyDir: true };
    case "identity": return { cmp: compareIdentity(a, b, idx), applyDir: true };
    case "power": {
      const va = idx.numericPowerLookup[a];
      const vb = idx.numericPowerLookup[b];
      if (isNaN(va) && isNaN(vb)) return { cmp: 0, applyDir: false };
      if (isNaN(va)) return { cmp: 1, applyDir: false };
      if (isNaN(vb)) return { cmp: -1, applyDir: false };
      return { cmp: va - vb, applyDir: true };
    }
    case "toughness": {
      const va = idx.numericToughnessLookup[a];
      const vb = idx.numericToughnessLookup[b];
      if (isNaN(va) && isNaN(vb)) return { cmp: 0, applyDir: false };
      if (isNaN(va)) return { cmp: 1, applyDir: false };
      if (isNaN(vb)) return { cmp: -1, applyDir: false };
      return { cmp: va - vb, applyDir: true };
    }
    case "edhrec": return { cmp: compareEdhrec(a, b, idx), applyDir: true };
    case "salt": return { cmp: compareSalt(a, b, idx), applyDir: true };
    default: return { cmp: 0, applyDir: true };
  }
}

function comparePrintingFieldRaw(a: number, b: number, field: string, pIdx: PrintingIndex): { cmp: number; applyDir: boolean } {
  switch (field) {
    case "usd": {
      const pa = pIdx.priceUsd[a];
      const pb = pIdx.priceUsd[b];
      if (pa === 0 && pb === 0) return { cmp: 0, applyDir: false };
      if (pa === 0) return { cmp: 1, applyDir: false };
      if (pb === 0) return { cmp: -1, applyDir: false };
      return { cmp: pa - pb, applyDir: true };
    }
    case "date": {
      const da = pIdx.releasedAt[a];
      const db = pIdx.releasedAt[b];
      if (da === 0 && db === 0) return { cmp: 0, applyDir: false };
      if (da === 0) return { cmp: 1, applyDir: false };
      if (db === 0) return { cmp: -1, applyDir: false };
      return { cmp: da - db, applyDir: true };
    }
    case "rarity": return { cmp: comparePrintingRarity(a, b, pIdx), applyDir: true };
    default: return { cmp: 0, applyDir: true };
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
    const { cmp, applyDir } = compareFieldRaw(a, b, field, idx);
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
      const { cmp, applyDir } = comparePrintingFieldRaw(a, b, field, pIdx);
      if (cmp !== 0) return applyDir ? dir * cmp : cmp;
      const dateCmp = pIdx.releasedAt[b] - pIdx.releasedAt[a];
      if (dateCmp !== 0) return dateCmp;
      const cnCmp = pIdx.collectorNumbersLower[a]
        .localeCompare(pIdx.collectorNumbersLower[b]);
      if (cnCmp !== 0) return cnCmp;
      return seededRank(seedHash, a) - seededRank(seedHash, b);
    });
  }

  // 3. Sort cards by representative printing (first in each card's sorted list)
  const cardOrder = deduped.filter(cf => cardPrintings.has(cf));
  cardOrder.sort((cfA, cfB) => {
    const repA = cardPrintings.get(cfA)![0];
    const repB = cardPrintings.get(cfB)![0];
    const { cmp, applyDir } = comparePrintingFieldRaw(repA, repB, field, pIdx);
    if (cmp !== 0) return applyDir ? dir * cmp : cmp;
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
