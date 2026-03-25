// SPDX-License-Identifier: Apache-2.0

import type {
  ArtistIndexData,
  FlavorTagData,
  IllustrationTagData,
  PrintingColumnarData,
} from "./data";

function normalizeSupplementalTextKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Merge strided (even, odd) pairs under keys normalized like flavor/artist search (Spec 142, 148).
 * Raw JSON keys may differ only by case or whitespace; search uses normalized keys only.
 */
function normalizeStridedSupplementalByTextKey(raw: Record<string, number[]>): Record<string, number[]> {
  const byNormalized = new Map<string, Array<[number, number]>>();
  for (const [key, arr] of Object.entries(raw)) {
    const norm = normalizeSupplementalTextKey(key);
    if (!norm) continue;
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < arr.length; i += 2) {
      pairs.push([arr[i]!, arr[i + 1]!]);
    }
    const existing = byNormalized.get(norm);
    if (existing) {
      existing.push(...pairs);
    } else {
      byNormalized.set(norm, pairs);
    }
  }
  const result: Record<string, number[]> = {};
  for (const [norm, pairs] of byNormalized) {
    const seen = new Set<string>();
    const unique: Array<[number, number]> = [];
    for (const [f, p] of pairs) {
      const k = `${f},${p}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push([f, p]);
      }
    }
    unique.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
    const strided: number[] = [];
    for (const [f, p] of unique) {
      strided.push(f, p);
    }
    result[norm] = strided;
  }
  return result;
}

export function normalizeFlavorIndexForSearch(raw: FlavorTagData): FlavorTagData {
  return normalizeStridedSupplementalByTextKey(raw) as FlavorTagData;
}

export function normalizeArtistIndexForSearch(raw: ArtistIndexData): ArtistIndexData {
  return normalizeStridedSupplementalByTextKey(raw) as ArtistIndexData;
}

/**
 * Resolve strided (canonical_face_index, illustration_id_index) pairs from atags.json
 * to printing row indices using printings.json layout (Spec 092).
 */
export function resolveIllustrationTagsToPrintingRows(
  atags: IllustrationTagData,
  printingData: PrintingColumnarData,
): Map<string, Uint32Array> {
  const faceRef = printingData.canonical_face_ref;
  const illustIdx = printingData.illustration_id_index ?? [];
  const pairToRows = new Map<string, number[]>();
  for (let i = 0; i < faceRef.length; i++) {
    const face = faceRef[i]!;
    const idx = illustIdx[i] ?? 0;
    const key = `${face},${idx}`;
    let arr = pairToRows.get(key);
    if (!arr) {
      arr = [];
      pairToRows.set(key, arr);
    }
    arr.push(i);
  }

  const result = new Map<string, Uint32Array>();
  for (const [label, arr] of Object.entries(atags)) {
    const rows: number[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      const face = arr[i]!;
      const illust = arr[i + 1]!;
      const key = `${face},${illust}`;
      const rowList = pairToRows.get(key);
      if (rowList) rows.push(...rowList);
    }
    if (rows.length > 0) {
      rows.sort((a, b) => a - b);
      result.set(label, new Uint32Array(rows));
    }
  }
  return result;
}
