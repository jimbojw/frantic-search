// SPDX-License-Identifier: Apache-2.0
import type { PrintingColumnarData } from "../data";

export class PrintingIndex {
  readonly printingCount: number;
  readonly canonicalFaceRef: number[];
  readonly scryfallIds: string[];
  readonly collectorNumbersLower: string[];
  readonly setIndices: number[];
  readonly setCodesLower: string[];
  readonly rarity: number[];
  readonly printingFlags: number[];
  readonly finish: number[];
  readonly frame: number[];
  readonly priceUsd: number[];
  readonly releasedAt: number[];
  readonly setReleasedAt: number[];
  readonly knownSetCodes: Set<string>;

  /** Reverse map: canonical face index -> printing row indices. */
  private readonly _printingsOf: Map<number, number[]>;

  constructor(data: PrintingColumnarData) {
    this.printingCount = data.canonical_face_ref.length;
    this.canonicalFaceRef = data.canonical_face_ref;
    this.scryfallIds = data.scryfall_ids;
    this.collectorNumbersLower = data.collector_numbers.map(cn => cn.toLowerCase());
    this.setIndices = data.set_indices;
    this.setCodesLower = data.set_indices.map(
      idx => data.set_lookup[idx]?.code?.toLowerCase() ?? "",
    );
    this.rarity = data.rarity;
    this.printingFlags = data.printing_flags;
    this.finish = data.finish;
    this.frame = data.frame;
    this.priceUsd = data.price_usd;
    this.releasedAt = data.released_at;
    this.setReleasedAt = data.set_lookup.map(e => e.released_at);
    this.knownSetCodes = new Set(data.set_lookup.map(e => e.code.toLowerCase()));

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
  }

  printingsOf(canonicalFaceIndex: number): number[] {
    return this._printingsOf.get(canonicalFaceIndex) ?? [];
  }
}
