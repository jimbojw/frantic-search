// SPDX-License-Identifier: Apache-2.0
import { For, createMemo } from 'solid-js'
import type { Histograms, BreakdownNode } from '@frantic-search/shared'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'
import {
  findFieldNode,
  extractValue,
  graduatedColorBar,
  graduatedColorX,
  colorlessBar,
  colorlessX,
  toggleSimple,
} from './query-edit'

export const MV_BAR_COLOR = '#60a5fa'    // blue-400
export const TYPE_BAR_COLOR = '#34d399'  // emerald-400

const CI_FIELDS = ['ci', 'identity', 'id', 'commander', 'cmd']
const MV_FIELDS = ['mv', 'cmc', 'manavalue']
const TYPE_FIELDS = ['t', 'type']

const MV_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const MV_TERMS = ['mv=0', 'mv=1', 'mv=2', 'mv=3', 'mv=4', 'mv=5', 'mv=6', 'mv>=7']
const MV_OPS = ['=', '=', '=', '=', '=', '=', '=', '>=']
const MV_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7']

const TYPE_LABELS = ['Lgn', 'Cre', 'Ins', 'Sor', 'Art', 'Enc', 'Plw', 'Lnd']
const TYPE_TERMS = ['t:legendary', 't:creature', 't:instant', 't:sorcery', 't:artifact', 't:enchantment', 't:planeswalker', 't:land']
const TYPE_VALUES = ['legendary', 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land']

const WUBRG_RE = /^[wubrg]+$/i

type ColorBarDef = {
  label: () => any
  background: string
  color: string
  kind: 'colorless' | 'wubrg' | 'multicolor'
}

const COLOR_BARS: ColorBarDef[] = [
  { label: () => <i class="ms ms-c ms-cost" />, background: CI_COLORLESS, color: 'c', kind: 'colorless' },
  { label: () => <i class="ms ms-w ms-cost" />, background: CI_W, color: 'w', kind: 'wubrg' },
  { label: () => <i class="ms ms-u ms-cost" />, background: CI_U, color: 'u', kind: 'wubrg' },
  { label: () => <i class="ms ms-b ms-cost" />, background: CI_B, color: 'b', kind: 'wubrg' },
  { label: () => <i class="ms ms-r ms-cost" />, background: CI_R, color: 'r', kind: 'wubrg' },
  { label: () => <i class="ms ms-g ms-cost" />, background: CI_G, color: 'g', kind: 'wubrg' },
  { label: () => <span class="inline-block size-3.5 rounded" style={{ background: CI_BACKGROUNDS[31] }} />, background: CI_BACKGROUNDS[31], color: 'm', kind: 'multicolor' },
]

// ---------------------------------------------------------------------------
// Active state detection
// ---------------------------------------------------------------------------

function isSimpleActive(
  breakdown: BreakdownNode | null,
  field: string[],
  operator: string,
  negated: boolean,
  value: string,
): boolean {
  if (!breakdown) return false
  return findFieldNode(breakdown, field, operator, negated, v => v === value) !== null
}

// ---------------------------------------------------------------------------
// BarRow component
// ---------------------------------------------------------------------------

function BarRow(props: {
  label: () => any
  count: number
  maxCount: number
  background: string
  drillActive: boolean
  excludeActive: boolean
  onDrill: () => void
  onExclude: () => void
}) {
  const pct = () => props.maxCount > 0 ? (props.count / props.maxCount) * 100 : 0
  const isGradient = () => props.background.startsWith('linear-gradient')
  return (
    <div class="flex items-center gap-0 h-6">
      <div class="w-6 shrink-0 flex items-center justify-center text-sm">
        {props.label()}
      </div>
      <div class="border-l border-gray-300 dark:border-gray-600 h-full" />
      <button
        type="button"
        onClick={() => props.onDrill()}
        class={`flex-1 h-full flex items-center px-1 cursor-pointer transition-colors min-w-0 ${
          props.drillActive
            ? 'bg-blue-50 dark:bg-blue-900/20'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'
        }`}
      >
        <div
          class="h-3.5 rounded-sm transition-all"
          style={{
            width: `${pct()}%`,
            "min-width": props.count > 0 ? '2px' : undefined,
            ...(isGradient()
              ? { background: props.background }
              : { "background-color": props.background }),
          }}
        />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); props.onExclude() }}
        class={`size-6 shrink-0 flex items-center justify-center rounded-full transition-colors ${
          props.excludeActive
            ? 'text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
            : 'text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
        }`}
        aria-label="Exclude"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResultsBreakdown
// ---------------------------------------------------------------------------

export default function ResultsBreakdown(props: {
  histograms: Histograms
  breakdown: BreakdownNode | null
  query: string
  onSetQuery: (query: string) => void
}) {
  const colorMax = () => Math.max(...props.histograms.colorIdentity)
  const mvMax = () => Math.max(...props.histograms.manaValue)
  const typeMax = () => Math.max(...props.histograms.cardType)

  // Memoize CI node lookups across all three operator types (Spec 043)
  const ciEqNode = createMemo(() =>
    props.breakdown ? findFieldNode(props.breakdown, CI_FIELDS, '=', false) : null
  )
  const ciColonNode = createMemo(() =>
    props.breakdown ? findFieldNode(props.breakdown, CI_FIELDS, ':', false, v => WUBRG_RE.test(v)) : null
  )
  const ciGteNode = createMemo(() =>
    props.breakdown ? findFieldNode(props.breakdown, CI_FIELDS, '>=', false) : null
  )

  function handleColorDrill(bar: ColorBarDef) {
    if (bar.kind === 'wubrg') {
      props.onSetQuery(graduatedColorBar(props.query, props.breakdown, bar.color))
    } else if (bar.kind === 'colorless') {
      props.onSetQuery(colorlessBar(props.query, props.breakdown))
    } else {
      props.onSetQuery(toggleSimple(props.query, props.breakdown, {
        field: CI_FIELDS, operator: ':', negated: false, value: 'm', appendTerm: 'ci:m',
      }))
    }
  }

  function handleColorExclude(bar: ColorBarDef) {
    if (bar.kind === 'wubrg') {
      props.onSetQuery(graduatedColorX(props.query, props.breakdown, bar.color))
    } else if (bar.kind === 'colorless') {
      props.onSetQuery(colorlessX(props.query, props.breakdown))
    } else {
      props.onSetQuery(toggleSimple(props.query, props.breakdown, {
        field: CI_FIELDS, operator: ':', negated: true, value: 'm', appendTerm: '-ci:m',
      }))
    }
  }

  function colorDrillActive(bar: ColorBarDef): boolean {
    if (bar.kind === 'wubrg') {
      const c = bar.color
      const eq = ciEqNode()
      if (eq && extractValue(eq.label, '=').toLowerCase().includes(c)) return true
      const colon = ciColonNode()
      if (colon && extractValue(colon.label, ':').toLowerCase().includes(c)) return true
      const gte = ciGteNode()
      if (gte && extractValue(gte.label, '>=').toLowerCase().includes(c)) return true
      return false
    }
    if (bar.kind === 'colorless') {
      if (isSimpleActive(props.breakdown, CI_FIELDS, '=', false, 'c')) return true
      return ciColonNode() !== null
    }
    return isSimpleActive(props.breakdown, CI_FIELDS, ':', false, 'm')
  }

  function colorExcludeActive(bar: ColorBarDef): boolean {
    if (bar.kind === 'wubrg') {
      const c = bar.color
      const eq = ciEqNode()
      if (eq && !extractValue(eq.label, '=').toLowerCase().includes(c)) return true
      const colon = ciColonNode()
      if (colon && !extractValue(colon.label, ':').toLowerCase().includes(c)) return true
      return false
    }
    if (bar.kind === 'colorless') {
      if (isSimpleActive(props.breakdown, CI_FIELDS, '=', true, 'c')) return true
      if (ciEqNode()) return true
      return ciGteNode() !== null
    }
    return isSimpleActive(props.breakdown, CI_FIELDS, ':', true, 'm')
  }

  return (
    <div class="grid grid-cols-3 gap-4 px-3 pb-2">
      <div>
        <For each={MV_LABELS}>
          {(label, i) => (
            <BarRow
              label={() => <span class="font-mono text-xs">{label}</span>}
              count={props.histograms.manaValue[i()]}
              maxCount={mvMax()}
              background={MV_BAR_COLOR}
              drillActive={isSimpleActive(props.breakdown, MV_FIELDS, MV_OPS[i()], false, MV_VALUES[i()])}
              excludeActive={isSimpleActive(props.breakdown, MV_FIELDS, MV_OPS[i()], true, MV_VALUES[i()])}
              onDrill={() => props.onSetQuery(toggleSimple(props.query, props.breakdown, {
                field: MV_FIELDS, operator: MV_OPS[i()], negated: false, value: MV_VALUES[i()], appendTerm: MV_TERMS[i()],
              }))}
              onExclude={() => props.onSetQuery(toggleSimple(props.query, props.breakdown, {
                field: MV_FIELDS, operator: MV_OPS[i()], negated: true, value: MV_VALUES[i()], appendTerm: '-' + MV_TERMS[i()],
              }))}
            />
          )}
        </For>
      </div>
      <div>
        <For each={COLOR_BARS}>
          {(bar, i) => (
            <BarRow
              label={bar.label}
              count={props.histograms.colorIdentity[i()]}
              maxCount={colorMax()}
              background={bar.background}
              drillActive={colorDrillActive(bar)}
              excludeActive={colorExcludeActive(bar)}
              onDrill={() => handleColorDrill(bar)}
              onExclude={() => handleColorExclude(bar)}
            />
          )}
        </For>
      </div>
      <div>
        <For each={TYPE_LABELS}>
          {(label, i) => (
            <BarRow
              label={() => <span class="font-mono text-xs">{label}</span>}
              count={props.histograms.cardType[i()]}
              maxCount={typeMax()}
              background={TYPE_BAR_COLOR}
              drillActive={isSimpleActive(props.breakdown, TYPE_FIELDS, ':', false, TYPE_VALUES[i()])}
              excludeActive={isSimpleActive(props.breakdown, TYPE_FIELDS, ':', true, TYPE_VALUES[i()])}
              onDrill={() => props.onSetQuery(toggleSimple(props.query, props.breakdown, {
                field: TYPE_FIELDS, operator: ':', negated: false, value: TYPE_VALUES[i()], appendTerm: TYPE_TERMS[i()],
              }))}
              onExclude={() => props.onSetQuery(toggleSimple(props.query, props.breakdown, {
                field: TYPE_FIELDS, operator: ':', negated: true, value: TYPE_VALUES[i()], appendTerm: '-' + TYPE_TERMS[i()],
              }))}
            />
          )}
        </For>
      </div>
    </div>
  )
}
