// SPDX-License-Identifier: Apache-2.0

export const CI_W = '#E8D44D'
export const CI_U = '#4A90D9'
export const CI_B = '#6B5B6B'
export const CI_R = '#D94040'
export const CI_G = '#3A9A5A'
export const CI_COLORLESS = '#C0BCB0'

function stripes(...colors: string[]): string {
  const step = 100 / colors.length
  const stops = colors.flatMap((c, i) => `${c} ${i * step}%,${c} ${(i + 1) * step}%`)
  return `linear-gradient(to right,${stops.join(',')})`
}

// All 32 possible 5-bit color identity values, indexed by bitmask.
// Bits: W=1, U=2, B=4, R=8, G=16.
export const CI_BACKGROUNDS: string[] = /* #__PURE__ */ (() => {
  const COLORS: [number, string][] = [[1, CI_W], [2, CI_U], [4, CI_B], [8, CI_R], [16, CI_G]]
  const table: string[] = new Array(32)
  for (let mask = 0; mask < 32; mask++) {
    const active = COLORS.filter(([bit]) => mask & bit).map(([, c]) => c)
    table[mask] = active.length === 0 ? CI_COLORLESS
      : active.length === 1 ? active[0]
      : stripes(...active)
  }
  return table
})()

export function artCropUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/art_crop/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
