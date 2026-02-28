// SPDX-License-Identifier: Apache-2.0

/**
 * Generates a small canvas of sparse white specks at random positions,
 * returning a `data:image/png` URL suitable for use as a tiling CSS
 * background-image.
 *
 * @param size    - Tile width and height in pixels.
 * @param density - Probability (0–1) that any given pixel is a speck.
 *                  0.01 ≈ 1 % of pixels lit.
 * @param alphaMin - Minimum alpha for lit pixels (0–255).
 * @param alphaMax - Maximum alpha for lit pixels (0–255).
 */
export function generateNoiseTile(
  size: number,
  density: number,
  alphaMin: number,
  alphaMax: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const d = img.data
  const alphaRange = alphaMax - alphaMin

  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() < density) {
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = alphaMin + Math.floor(Math.random() * alphaRange)
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Creates two noise tiles with coprime-ish dimensions and injects them
 * as CSS custom properties on :root so the etched-overlay CSS can
 * reference them with var(--etched-noise-1) / var(--etched-noise-2).
 */
export function injectEtchedNoiseTiles(): void {
  const tile1 = generateNoiseTile(64, 0.08, 4, 92)
  const tile2 = generateNoiseTile(96, 0.06, 2, 90)
  const root = document.documentElement
  root.style.setProperty('--etched-noise-1', `url("${tile1}")`)
  root.style.setProperty('--etched-noise-2', `url("${tile2}")`)
}
