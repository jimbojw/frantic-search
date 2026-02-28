// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from "./ast";

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
