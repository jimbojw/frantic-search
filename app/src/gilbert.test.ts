// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { gilbertCurve } from "./gilbert";

function verify(w: number, h: number) {
  const { curveX, curveY } = gilbertCurve(w, h);
  const n = w * h;
  return { curveX, curveY, n };
}

describe("gilbertCurve", () => {
  const sizes: [number, number][] = [
    [1, 1],
    [2, 2],
    [4, 4],
    [8, 8],
    [3, 5],
    [5, 3],
    [10, 10],
    [100, 63],
  ];

  test.each(sizes)("%ix%i returns correct number of points", (w, h) => {
    const { curveX, curveY, n } = verify(w, h);
    expect(curveX.length).toBe(n);
    expect(curveY.length).toBe(n);
  });

  test.each(sizes)("%ix%i visits every cell exactly once", (w, h) => {
    const { curveX, curveY, n } = verify(w, h);
    const visited = new Set<string>();
    for (let i = 0; i < n; i++) {
      visited.add(`${curveX[i]},${curveY[i]}`);
    }
    expect(visited.size).toBe(n);
  });

  test.each(sizes)("%ix%i stays within bounds", (w, h) => {
    const { curveX, curveY, n } = verify(w, h);
    for (let i = 0; i < n; i++) {
      expect(curveX[i]).toBeGreaterThanOrEqual(0);
      expect(curveX[i]).toBeLessThan(w);
      expect(curveY[i]).toBeGreaterThanOrEqual(0);
      expect(curveY[i]).toBeLessThan(h);
    }
  });

  test.each(sizes)(
    "%ix%i has only orthogonal steps (no diagonals) when width is even",
    (w, h) => {
      if (w % 2 !== 0 && h % 2 !== 0) return;
      const { curveX, curveY, n } = verify(w, h);
      for (let i = 1; i < n; i++) {
        const dx = Math.abs(curveX[i] - curveX[i - 1]);
        const dy = Math.abs(curveY[i] - curveY[i - 1]);
        expect(dx + dy).toBe(1);
      }
    },
  );

  test("starts at origin (0, 0)", () => {
    const { curveX, curveY } = gilbertCurve(10, 10);
    expect(curveX[0]).toBe(0);
    expect(curveY[0]).toBe(0);
  });

  test("handles the real-world density map size (~183x183)", () => {
    const side = Math.ceil(Math.sqrt(33340));
    const { curveX, curveY, n } = verify(side, side);
    const visited = new Set<string>();
    for (let i = 0; i < n; i++) {
      visited.add(`${curveX[i]},${curveY[i]}`);
    }
    expect(visited.size).toBe(n);
  });
});
