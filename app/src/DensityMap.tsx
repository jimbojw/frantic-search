// SPDX-License-Identifier: Apache-2.0
import { createSignal, createEffect, Show } from 'solid-js'
import type { DisplayColumns } from '@frantic-search/shared'
import { Color } from '@frantic-search/shared'
import { gilbertCurve } from './gilbert'

type LensKey = 'lens_name' | 'lens_chronology' | 'lens_mana_curve' | 'lens_complexity'
  | 'lens_color_identity' | 'lens_type_map' | 'lens_color_type'

const PANELS: { key: LensKey; label: string }[] = [
  { key: 'lens_name', label: 'Alphabetical' },
  { key: 'lens_chronology', label: 'Chronology' },
  { key: 'lens_mana_curve', label: 'Mana Curve' },
  { key: 'lens_color_identity', label: 'Color Map' },
  { key: 'lens_type_map', label: 'Type Map' },
  { key: 'lens_color_type', label: 'Color × Type' },
  { key: 'lens_complexity', label: 'Complexity' },
]

const ALPHA_MATCH = 255
const ALPHA_GHOST = 25

const CI_COLORS: [number, number, number][] = [
  [180, 176, 168], // Colorless
  [248, 225, 80],  // W
  [74, 144, 217],  // U
  [140, 110, 160], // B
  [217, 64, 64],   // R
  [58, 154, 90],   // G
  [255, 0, 200],   // Multicolor
]

type RGB = [number, number, number]

function popcount(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55)
  v = (v & 0x33) + ((v >> 2) & 0x33)
  return (v + (v >> 4)) & 0x0f
}

function colorsForBlock(ci: number): [RGB, RGB, RGB, RGB] {
  const pc = popcount(ci)

  if (pc === 0) {
    const c = CI_COLORS[0]
    return [c, c, c, c]
  }
  if (pc === 1) {
    let c: RGB
    if (ci & Color.White) c = CI_COLORS[1]
    else if (ci & Color.Blue) c = CI_COLORS[2]
    else if (ci & Color.Black) c = CI_COLORS[3]
    else if (ci & Color.Red) c = CI_COLORS[4]
    else c = CI_COLORS[5]
    return [c, c, c, c]
  }
  if (pc === 5) {
    const c = CI_COLORS[6]
    return [c, c, c, c]
  }

  const colors: RGB[] = []
  for (let bit = 0; bit < 5; bit++) {
    if (ci & (1 << bit)) colors.push(CI_COLORS[bit + 1])
  }

  if (pc === 2) return [colors[0], colors[1], colors[0], colors[1]]
  if (pc === 3) return [colors[0], colors[1], colors[2], CI_COLORS[0]]
  return [colors[0], colors[1], colors[2], colors[3]]
}

interface CanvasState {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  imageData: ImageData
  pixelCardIndex: Uint32Array
  pixelBaseOffset: Uint32Array
  stride: number
}

export default function DensityMap(props: {
  display: DisplayColumns
  indices: Uint32Array
  hasQuery: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const canvasRefs: HTMLCanvasElement[] = []
  const states: CanvasState[] = []

  const [colorByIdentity, setColorByIdentity] = createSignal(
    localStorage.getItem('frantic-density-color') !== 'false'
  )

  let curveCache: { side: number; curveX: Uint16Array; curveY: Uint16Array } | null = null

  function getCurve(s: number) {
    if (curveCache && curveCache.side === s) return curveCache
    const { curveX, curveY } = gilbertCurve(s, s)
    curveCache = { side: s, curveX, curveY }
    return curveCache
  }

  function writePixel(data: Uint8ClampedArray, offset: number, r: number, g: number, b: number) {
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = 255
  }

  function layoutAll() {
    const N = props.display.lens_name.length
    const side = Math.ceil(Math.sqrt(N))
    const canvasRes = side * 2
    const curve = getCurve(side)
    const useColor = colorByIdentity()
    const stride = canvasRes * 4

    states.length = 0
    for (let i = 0; i < PANELS.length; i++) {
      const canvas = canvasRefs[i]
      const ctx = canvas.getContext('2d')!
      canvas.width = canvasRes
      canvas.height = canvasRes

      const lens = props.display[PANELS[i].key]
      const imageData = ctx.createImageData(canvasRes, canvasRes)
      const data = imageData.data
      const pixelCardIndex = new Uint32Array(N)
      const pixelBaseOffset = new Uint32Array(N)

      for (let j = 3; j < data.length; j += 4) {
        data[j] = 255
      }

      for (let p = 0; p < N; p++) {
        const cardIdx = lens[p]
        const x = curve.curveX[p]
        const y = curve.curveY[p]
        const base = (2 * y * canvasRes + 2 * x) * 4

        pixelCardIndex[p] = cardIdx
        pixelBaseOffset[p] = base

        if (useColor) {
          const [tl, tr, bl, br] = colorsForBlock(props.display.color_identity[cardIdx])
          writePixel(data, base, tl[0], tl[1], tl[2])
          writePixel(data, base + 4, tr[0], tr[1], tr[2])
          writePixel(data, base + stride, bl[0], bl[1], bl[2])
          writePixel(data, base + stride + 4, br[0], br[1], br[2])
        } else {
          writePixel(data, base, 255, 255, 255)
          writePixel(data, base + 4, 255, 255, 255)
          writePixel(data, base + stride, 255, 255, 255)
          writePixel(data, base + stride + 4, 255, 255, 255)
        }
      }

      ctx.putImageData(imageData, 0, 0)
      states.push({ canvas, ctx, imageData, pixelCardIndex, pixelBaseOffset, stride })
    }
  }

  function updateMatches() {
    if (states.length === 0) return

    const indices = props.indices
    const hasQuery = props.hasQuery
    const faceCount = props.display.names.length

    let matchLookup: Uint8Array | null = null
    if (hasQuery) {
      matchLookup = new Uint8Array(faceCount)
      for (let i = 0; i < indices.length; i++) {
        matchLookup[indices[i]] = 1
      }
    }

    for (const s of states) {
      const data = s.imageData.data
      const N = s.pixelCardIndex.length
      const st = s.stride

      if (!hasQuery) {
        for (let p = 0; p < N; p++) {
          const base = s.pixelBaseOffset[p]
          data[base + 3] = ALPHA_MATCH
          data[base + 7] = ALPHA_MATCH
          data[base + st + 3] = ALPHA_MATCH
          data[base + st + 7] = ALPHA_MATCH
        }
      } else {
        for (let p = 0; p < N; p++) {
          const alpha = matchLookup![s.pixelCardIndex[p]] ? ALPHA_MATCH : ALPHA_GHOST
          const base = s.pixelBaseOffset[p]
          data[base + 3] = alpha
          data[base + 7] = alpha
          data[base + st + 3] = alpha
          data[base + st + 7] = alpha
        }
      }

      s.ctx.putImageData(s.imageData, 0, 0)
    }
  }

  createEffect(() => {
    const expanded = props.expanded
    const _color = colorByIdentity()
    void _color
    if (!expanded) return
    queueMicrotask(() => {
      if (canvasRefs[0]) {
        layoutAll()
        updateMatches()
      }
    })
  })

  createEffect(() => {
    const _indices = props.indices
    const _hasQuery = props.hasQuery
    void _indices
    void _hasQuery
    if (states.length > 0) {
      updateMatches()
    }
  })

  function toggleColor(checked: boolean) {
    setColorByIdentity(checked)
    localStorage.setItem('frantic-density-color', String(checked))
  }

  return (
    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm mb-3">
      <div
        onClick={() => props.onToggle()}
        class="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg class={`size-2.5 fill-current text-gray-500 dark:text-gray-400 transition-transform ${props.expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24">
          <path d="M8 5l8 7-8 7z" />
        </svg>
        <span class="font-mono text-xs text-gray-500 dark:text-gray-400">MAP</span>
      </div>
      <Show when={props.expanded}>
        <div class="px-3 pb-2 border-t border-gray-200 dark:border-gray-700 pt-2">
          <div class="grid grid-cols-3 gap-2">
            {PANELS.map((panel, i) => {
              const gridClass = i === 6 ? 'col-start-2' : ''
              return (
                <div class={gridClass}>
                  <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">{panel.label}</p>
                  <canvas
                    ref={(el) => { canvasRefs[i] = el }}
                    class="w-full rounded-sm"
                    style={{
                      "aspect-ratio": "1",
                      "image-rendering": "pixelated",
                      background: "black",
                    }}
                  />
                </div>
              )
            })}
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
      </Show>
    </div>
  )
}
