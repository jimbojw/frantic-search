// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import type { IllustrationTagData, PrintingColumnarData } from "./data";
import {
  normalizeFlavorIndexForSearch,
  normalizeArtistIndexForSearch,
  resolveIllustrationTagsToPrintingRows,
} from "./supplemental-index-build";

describe("normalizeFlavorIndexForSearch", () => {
  test("merges keys that normalize to the same string", () => {
    const raw = {
      "Foo  Bar": [0, 1, 0, 3],
      "foo bar": [0, 5],
    };
    const out = normalizeFlavorIndexForSearch(raw);
    expect(Object.keys(out)).toEqual(["foo bar"]);
    expect(out["foo bar"]).toEqual([0, 1, 0, 3, 0, 5]);
  });

  test("dedupes identical face,printing pairs", () => {
    const raw = { x: [0, 1, 0, 1, 2, 3] };
    const out = normalizeFlavorIndexForSearch(raw);
    expect(out.x).toEqual([0, 1, 2, 3]);
  });
});

describe("normalizeArtistIndexForSearch", () => {
  test("same normalization as flavor", () => {
    const raw = { "A  B": [1, 2] };
    expect(normalizeArtistIndexForSearch(raw)).toEqual({ "a b": [1, 2] });
  });
});

describe("resolveIllustrationTagsToPrintingRows", () => {
  test("maps face,illust pairs to printing rows", () => {
    const printingData: PrintingColumnarData = {
      canonical_face_ref: [10, 10, 20],
      illustration_id_index: [0, 1, 0],
    } as PrintingColumnarData;

    const atags: IllustrationTagData = {
      chair: [10, 0, 10, 1],
      missing: [99, 0],
    };

    const map = resolveIllustrationTagsToPrintingRows(atags, printingData);
    expect(map.has("missing")).toBe(false);
    const chair = map.get("chair");
    expect(chair).toBeDefined();
    expect(Array.from(chair!)).toEqual([0, 1]);
  });
});
