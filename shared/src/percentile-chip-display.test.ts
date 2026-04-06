// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import {
  positionInEqualityPercentileBand,
  displayEqualityPercentileLabel,
  sortedArrayPosition,
} from "./percentile-chip-display";

describe("positionInEqualityPercentileBand", () => {
  it("matches Spec 095 equality index range for n=100, p=90", () => {
    const n = 100;
    const p = 90;
    const lo = Math.max(0, p - 0.5);
    const hi = Math.min(100, p + 0.5);
    const start = Math.floor(n * (lo / 100));
    const end = Math.ceil(n * (hi / 100));
    expect(start).toBe(89);
    expect(end).toBe(91);
    for (let pos = 0; pos < n; pos++) {
      const inBand = pos >= start && pos < end;
      expect(positionInEqualityPercentileBand(pos, n, p)).toBe(inBand);
    }
  });
});

describe("displayEqualityPercentileLabel", () => {
  it("returns a p whose equality band contains pos (property-style)", () => {
    for (const n of [1, 2, 10, 100]) {
      for (let pos = 0; pos < n; pos++) {
        const p = displayEqualityPercentileLabel(pos, n);
        expect(p).not.toBeNull();
        expect(positionInEqualityPercentileBand(pos, n, p!)).toBe(true);
      }
    }
  });
});

describe("sortedArrayPosition", () => {
  it("finds first index of target in sorted slice", () => {
    const a = new Uint32Array([5, 2, 8, 2]);
    expect(sortedArrayPosition(a, 4, 2)).toBe(1);
    expect(sortedArrayPosition(a, 4, 5)).toBe(0);
    expect(sortedArrayPosition(a, 4, 9)).toBeNull();
  });
});
