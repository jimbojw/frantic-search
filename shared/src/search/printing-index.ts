// SPDX-License-Identifier: Apache-2.0
import type { PrintingColumnarData } from "../data";
import { COLLECTOR_KEY_STRIDE, encodeCollectorSortKeyInto } from "./collector-sort-key";
import { normalizeForResolution } from "./categorical-resolve";

function buildPercentileArrays(
  priceUsd: number[],
  releasedAt: number[],
  n: number,
): {
  sortedUsdIndices: Uint32Array;
  sortedUsdCount: number;
  sortedDateIndices: Uint32Array;
  sortedDateCount: number;
} {
  let usdCount = 0;
  let dateCount = 0;
  for (let i = 0; i < n; i++) {
    if (priceUsd[i] !== 0) usdCount++;
    if (releasedAt[i] !== 0) dateCount++;
  }

  const sortedUsdIndices = new Uint32Array(usdCount);
  const sortedDateIndices = new Uint32Array(dateCount);

  let usdK = 0;
  let dateK = 0;
  for (let i = 0; i < n; i++) {
    if (priceUsd[i] !== 0) sortedUsdIndices[usdK++] = i;
    if (releasedAt[i] !== 0) sortedDateIndices[dateK++] = i;
  }

  sortedUsdIndices.sort((a, b) => priceUsd[a] - priceUsd[b]);
  sortedDateIndices.sort((a, b) => releasedAt[a] - releasedAt[b]);

  return {
    sortedUsdIndices,
    sortedUsdCount: usdCount,
    sortedDateIndices,
    sortedDateCount: dateCount,
  };
}

export class PrintingIndex {
  readonly printingCount: number;
  readonly canonicalFaceRef: number[];
  readonly scryfallIds: string[];
  readonly collectorNumbersLower: string[];
  /** Spec 180: strided uint32 fast sort keys for collector tie-break (`COLLECTOR_KEY_STRIDE` words per printing). */
  readonly collectorSortKeys: Uint32Array;
  readonly setIndices: number[];
  readonly setCodesLower: string[];
  /** Spec 047 / 182: `normalizeForResolution` of each row's set code (hot path avoids per-eval normalize). */
  readonly setCodesNormResolved: string[];
  /** Lowercase set type per printing row via `set_lookup[set_indices[i]].set_type` (Spec 179). */
  readonly setTypesLower: string[];
  /** Spec 179 / 182: `normalizeForResolution` of each row's set type string. */
  readonly setTypesNormResolved: string[];
  readonly rarity: number[];
  readonly printingFlags: number[];
  readonly finish: number[];
  readonly frame: number[];
  readonly priceUsd: number[];
  readonly releasedAt: number[];
  readonly games: number[];
  readonly promoTypesFlags0: number[];
  readonly promoTypesFlags1: number[];
  readonly setReleasedAt: number[];
  readonly knownSetCodes: Set<string>;
  /** Distinct non-empty lowercase set types from `set_lookup` (Spec 179). */
  readonly knownSetTypes: Set<string>;

  /** Sorted printing indices for percentile queries (non-null only). Ascending by value. */
  readonly sortedUsdIndices: Uint32Array;
  readonly sortedDateIndices: Uint32Array;
  readonly sortedUsdCount: number;
  readonly sortedDateCount: number;

  /** Reverse map: canonical face index -> printing row indices. */
  private readonly _printingsOf: Map<number, number[]>;

  constructor(data: PrintingColumnarData, canonicalScryfallIds?: string[]) {
    this.printingCount = data.canonical_face_ref.length;
    this.canonicalFaceRef = data.canonical_face_ref;
    this.scryfallIds = data.scryfall_ids;
    this.collectorNumbersLower = data.collector_numbers.map(cn => cn.toLowerCase());
    this.collectorSortKeys = new Uint32Array(this.printingCount * COLLECTOR_KEY_STRIDE);
    for (let i = 0; i < this.printingCount; i++) {
      encodeCollectorSortKeyInto(this.collectorSortKeys, i, this.collectorNumbersLower[i] ?? "");
    }
    this.setIndices = data.set_indices;
    this.setCodesLower = data.set_indices.map(
      idx => data.set_lookup[idx]?.code?.toLowerCase() ?? "",
    );
    this.setTypesLower = data.set_indices.map(
      idx => data.set_lookup[idx]?.set_type?.toLowerCase() ?? "",
    );
    this.setCodesNormResolved = this.setCodesLower.map(c => normalizeForResolution(c));
    this.setTypesNormResolved = this.setTypesLower.map(t => normalizeForResolution(t));
    this.rarity = data.rarity;
    this.printingFlags = data.printing_flags;
    this.finish = data.finish;
    this.frame = data.frame;
    this.priceUsd = data.price_usd;
    this.releasedAt = data.released_at;
    this.games = data.games ?? [];
    this.promoTypesFlags0 = data.promo_types_flags_0 ?? [];
    this.promoTypesFlags1 = data.promo_types_flags_1 ?? [];
    this.setReleasedAt = data.set_lookup.map(e => e.released_at);
    this.knownSetCodes = new Set(data.set_lookup.map(e => e.code.toLowerCase()));
    const knownSetTypes = new Set<string>();
    for (const e of data.set_lookup) {
      const t = e.set_type?.toLowerCase() ?? "";
      if (t.length > 0) knownSetTypes.add(t);
    }
    this.knownSetTypes = knownSetTypes;

    const { sortedUsdIndices, sortedUsdCount, sortedDateIndices, sortedDateCount } =
      buildPercentileArrays(data.price_usd, data.released_at, data.canonical_face_ref.length);
    this.sortedUsdIndices = sortedUsdIndices;
    this.sortedUsdCount = sortedUsdCount;
    this.sortedDateIndices = sortedDateIndices;
    this.sortedDateCount = sortedDateCount;

    this._printingsOf = new Map();
    for (let i = 0; i < this.printingCount; i++) {
      const cf = data.canonical_face_ref[i];
      let arr = this._printingsOf.get(cf);
      if (!arr) {
        arr = [];
        this._printingsOf.set(cf, arr);
      }
      arr.push(i);
    }

    if (canonicalScryfallIds) {
      for (const [cf, arr] of this._printingsOf) {
        const canonicalId = canonicalScryfallIds[cf];
        if (canonicalId) {
          const idx = arr.findIndex((pi) => this.scryfallIds[pi] === canonicalId);
          if (idx > 0) {
            const [canonical] = arr.splice(idx, 1);
            arr.unshift(canonical);
          }
        }
      }
    }
  }

  printingsOf(canonicalFaceIndex: number): number[] {
    return this._printingsOf.get(canonicalFaceIndex) ?? [];
  }
}
