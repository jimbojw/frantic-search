// SPDX-License-Identifier: BSD-2-Clause
// Gilbert curve — generalized Hilbert curve for arbitrary rectangles.
// Ported from Jakub Červený's gilbert2d.py (https://github.com/jakubcerveny/gilbert).

function sgn(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0
}

export function gilbertCurve(
  width: number,
  height: number,
): { curveX: Uint16Array; curveY: Uint16Array } {
  const n = width * height
  const curveX = new Uint16Array(n)
  const curveY = new Uint16Array(n)
  let idx = 0

  function emit(x: number, y: number) {
    curveX[idx] = x
    curveY[idx] = y
    idx++
  }

  function generate(
    x: number, y: number,
    ax: number, ay: number,
    bx: number, by: number,
  ) {
    const w = Math.abs(ax + ay)
    const h = Math.abs(bx + by)

    const dax = sgn(ax), day = sgn(ay)
    const dbx = sgn(bx), dby = sgn(by)

    if (h === 1) {
      for (let i = 0; i < w; i++) {
        emit(x, y)
        x += dax
        y += day
      }
      return
    }

    if (w === 1) {
      for (let i = 0; i < h; i++) {
        emit(x, y)
        x += dbx
        y += dby
      }
      return
    }

    let ax2 = ax >> 1, ay2 = ay >> 1
    let bx2 = bx >> 1, by2 = by >> 1

    const w2 = Math.abs(ax2 + ay2)
    const h2 = Math.abs(bx2 + by2)

    if (2 * w > 3 * h) {
      if (w2 % 2 && w > 2) {
        ax2 += dax
        ay2 += day
      }
      generate(x, y, ax2, ay2, bx, by)
      generate(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by)
    } else {
      if (h2 % 2 && h > 2) {
        bx2 += dbx
        by2 += dby
      }
      generate(x, y, bx2, by2, ax2, ay2)
      generate(x + bx2, y + by2, ax, ay, bx - bx2, by - by2)
      generate(
        x + (ax - dax) + (bx2 - dbx),
        y + (ay - day) + (by2 - dby),
        -bx2, -by2,
        -(ax - ax2), -(ay - ay2),
      )
    }
  }

  if (width > height) {
    generate(0, 0, width, 0, 0, height)
  } else {
    generate(0, 0, 0, height, width, 0)
  }

  return { curveX, curveY }
}
