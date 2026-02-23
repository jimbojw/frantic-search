// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, onMount } from 'solid-js'
import type { DisplayColumns } from '@frantic-search/shared'
import { Color } from '@frantic-search/shared'
import { gilbertCurve } from './gilbert'

type LensKey = 'lens_name' | 'lens_chronology' | 'lens_mana_curve' | 'lens_complexity'

const LENSES: { key: LensKey; label: string }[] = [
  { key: 'lens_name', label: 'Alphabetical' },
  { key: 'lens_chronology', label: 'Chronology' },
  { key: 'lens_mana_curve', label: 'Mana Curve' },
  { key: 'lens_complexity', label: 'Complexity' },
]

const ALPHA_MATCH = 255
const ALPHA_GHOST = 25

// RGB palette optimized for visibility against black background
const CI_COLORS: [number, number, number][] = [
  [180, 176, 168], // Colorless
  [248, 225, 80],  // W
  [74, 144, 217],  // U
  [140, 110, 160], // B
  [217, 64, 64],   // R
  [58, 154, 90],   // G
  [255, 0, 200],   // Multicolor
]

function popcount(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55)
  v = (v & 0x33) + ((v >> 2) & 0x33)
  return (v + (v >> 4)) & 0x0f
}

function colorForIdentity(ci: number): [number, number, number] {
  if (ci === 0) return CI_COLORS[0]
  if (popcount(ci) >= 2) return CI_COLORS[6]
  if (ci & Color.White) return CI_COLORS[1]
  if (ci & Color.Blue) return CI_COLORS[2]
  if (ci & Color.Black) return CI_COLORS[3]
  if (ci & Color.Red) return CI_COLORS[4]
  if (ci & Color.Green) return CI_COLORS[5]
  return CI_COLORS[0]
}

export default function DensityMap(props: {
  display: DisplayColumns
  indices: Uint32Array
  hasQuery: boolean
}) {
  let canvasRef!: HTMLCanvasElement

  const [activeLens, setActiveLens] = createSignal<LensKey>(
    (localStorage.getItem('frantic-density-lens') as LensKey) || 'lens_chronology'
  )
  const [colorByIdentity, setColorByIdentity] = createSignal(
    localStorage.getItem('frantic-density-color') !== 'false'
  )

  let side = 0
  let curveCache: { side: number; curveX: Uint16Array; curveY: Uint16Array } | null = null
  let imageData: ImageData | null = null
  let pixelCardIndex: Uint32Array | null = null
  let pixelOffset: Uint32Array | null = null
  let ctx: CanvasRenderingContext2D | null = null

  function getCurve(s: number) {
    if (curveCache && curveCache.side === s) return curveCache
    const { curveX, curveY } = gilbertCurve(s, s)
    curveCache = { side: s, curveX, curveY }
    return curveCache
  }

  function layout() {
    if (!ctx) return

    const lens = props.display[activeLens()]
    const N = lens.length
    side = Math.ceil(Math.sqrt(N))

    canvasRef.width = side
    canvasRef.height = side

    const curve = getCurve(side)
    imageData = ctx.createImageData(side, side)
    const data = imageData.data

    pixelCardIndex = new Uint32Array(N)
    pixelOffset = new Uint32Array(N)

    // Fill entire buffer black with alpha 255
    for (let i = 3; i < data.length; i += 4) {
      data[i] = 255
    }

    const useColor = colorByIdentity()
    for (let p = 0; p < N; p++) {
      const cardIdx = lens[p]
      const x = curve.curveX[p]
      const y = curve.curveY[p]
      const offset = (y * side + x) * 4

      pixelCardIndex[p] = cardIdx
      pixelOffset[p] = offset

      if (useColor) {
        const [r, g, b] = colorForIdentity(props.display.color_identity[cardIdx])
        data[offset] = r
        data[offset + 1] = g
        data[offset + 2] = b
      } else {
        data[offset] = 255
        data[offset + 1] = 255
        data[offset + 2] = 255
      }
      data[offset + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
  }

  function updateMatches() {
    if (!ctx || !imageData || !pixelCardIndex || !pixelOffset) return

    const data = imageData.data
    const N = pixelCardIndex.length
    const indices = props.indices

    if (!props.hasQuery) {
      for (let p = 0; p < N; p++) {
        data[pixelOffset[p] + 3] = ALPHA_MATCH
      }
    } else {
      const faceCount = props.display.names.length
      const matchLookup = new Uint8Array(faceCount)
      for (let i = 0; i < indices.length; i++) {
        matchLookup[indices[i]] = 1
      }
      for (let p = 0; p < N; p++) {
        data[pixelOffset[p] + 3] = matchLookup[pixelCardIndex[p]] ? ALPHA_MATCH : ALPHA_GHOST
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }

  onMount(() => {
    ctx = canvasRef.getContext('2d')!
    layout()
    updateMatches()
  })

  createEffect(() => {
    // Re-layout when lens or color mode changes
    const _lens = activeLens()
    const _color = colorByIdentity()
    void _lens
    void _color
    if (ctx) {
      layout()
      updateMatches()
    }
  })

  createEffect(() => {
    // Update matches when indices or hasQuery changes
    const _indices = props.indices
    const _hasQuery = props.hasQuery
    void _indices
    void _hasQuery
    if (ctx && pixelCardIndex) {
      updateMatches()
    }
  })

  function selectLens(key: LensKey) {
    setActiveLens(key)
    localStorage.setItem('frantic-density-lens', key)
  }

  function toggleColor(checked: boolean) {
    setColorByIdentity(checked)
    localStorage.setItem('frantic-density-color', String(checked))
  }

  return (
    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm mb-3">
      <div class="px-3 py-2">
        <p class="font-mono text-xs text-gray-500 dark:text-gray-400 mb-2">MAP</p>
        <canvas
          ref={canvasRef}
          class="w-full rounded-sm"
          style={{
            "aspect-ratio": "1",
            "image-rendering": "pixelated",
            background: "black",
          }}
        />
        <div class="flex flex-wrap gap-1 mt-2">
          {LENSES.map((lens) => (
            <button
              type="button"
              onClick={() => selectLens(lens.key)}
              class={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                activeLens() === lens.key
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {lens.label}
            </button>
          ))}
        </div>
        <label class="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={colorByIdentity()}
            onChange={(e) => toggleColor(e.currentTarget.checked)}
            class="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500/30"
          />
          <span class="text-[10px] font-mono text-gray-500 dark:text-gray-400">Color by identity</span>
        </label>
      </div>
    </div>
  )
}
