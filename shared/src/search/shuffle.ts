// SPDX-License-Identifier: Apache-2.0

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In-place Fisher-Yates shuffle seeded by the given string.
 * Same seed always produces the same permutation.
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const rand = mulberry32(fnv1a(seed));
  for (let i = array.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}
