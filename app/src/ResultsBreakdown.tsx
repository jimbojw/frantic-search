// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'
import type { Histograms } from '@frantic-search/shared'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'

type BarDef = {
  label: () => any
  background: string
  drillTerm: string
  excludeTerm: string
}

const COLOR_BARS: BarDef[] = [
  { label: () => <i class="ms ms-c ms-cost" />, background: CI_COLORLESS, drillTerm: 'ci:c', excludeTerm: '-ci:c' },
  { label: () => <i class="ms ms-w ms-cost" />, background: CI_W, drillTerm: 'ci>=w', excludeTerm: '-ci>=w' },
  { label: () => <i class="ms ms-u ms-cost" />, background: CI_U, drillTerm: 'ci>=u', excludeTerm: '-ci>=u' },
  { label: () => <i class="ms ms-b ms-cost" />, background: CI_B, drillTerm: 'ci>=b', excludeTerm: '-ci>=b' },
  { label: () => <i class="ms ms-r ms-cost" />, background: CI_R, drillTerm: 'ci>=r', excludeTerm: '-ci>=r' },
  { label: () => <i class="ms ms-g ms-cost" />, background: CI_G, drillTerm: 'ci>=g', excludeTerm: '-ci>=g' },
  { label: () => <span class="inline-block size-3.5 rounded" style={{ background: CI_BACKGROUNDS[31] }} />, background: CI_BACKGROUNDS[31], drillTerm: 'ci:m', excludeTerm: '-ci:m' },
]

const MV_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const MV_TERMS = ['mv=0', 'mv=1', 'mv=2', 'mv=3', 'mv=4', 'mv=5', 'mv=6', 'mv>=7']

const TYPE_LABELS = ['Lgn', 'Cre', 'Ins', 'Sor', 'Art', 'Enc', 'Plw', 'Lnd']
const TYPE_TERMS = ['t:legendary', 't:creature', 't:instant', 't:sorcery', 't:artifact', 't:enchantment', 't:planeswalker', 't:land']

const MV_BAR_COLOR = '#60a5fa'    // blue-400
const TYPE_BAR_COLOR = '#34d399'  // emerald-400

function BarRow(props: {
  label: () => any
  count: number
  maxCount: number
  background: string
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
        class="flex-1 h-full flex items-center px-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors min-w-0"
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
        class="size-6 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        aria-label="Exclude"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function ResultsBreakdown(props: {
  histograms: Histograms
  onAppendQuery: (term: string) => void
}) {
  const colorMax = () => Math.max(...props.histograms.colorIdentity)
  const mvMax = () => Math.max(...props.histograms.manaValue)
  const typeMax = () => Math.max(...props.histograms.cardType)

  return (
    <div class="grid grid-cols-3 gap-4 px-3 pb-2 border-t border-gray-200 dark:border-gray-700 pt-2">
      <div>
        <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 mb-1">Color Identity</p>
        <For each={COLOR_BARS}>
          {(bar, i) => (
            <BarRow
              label={bar.label}
              count={props.histograms.colorIdentity[i()]}
              maxCount={colorMax()}
              background={bar.background}
              onDrill={() => props.onAppendQuery(bar.drillTerm)}
              onExclude={() => props.onAppendQuery(bar.excludeTerm)}
            />
          )}
        </For>
      </div>
      <div>
        <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 mb-1">Mana Value</p>
        <For each={MV_LABELS}>
          {(label, i) => (
            <BarRow
              label={() => <span class="font-mono text-xs">{label}</span>}
              count={props.histograms.manaValue[i()]}
              maxCount={mvMax()}
              background={MV_BAR_COLOR}
              onDrill={() => props.onAppendQuery(MV_TERMS[i()])}
              onExclude={() => props.onAppendQuery('-' + MV_TERMS[i()])}
            />
          )}
        </For>
      </div>
      <div>
        <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 mb-1">Card Type</p>
        <For each={TYPE_LABELS}>
          {(label, i) => (
            <BarRow
              label={() => <span class="font-mono text-xs">{label}</span>}
              count={props.histograms.cardType[i()]}
              maxCount={typeMax()}
              background={TYPE_BAR_COLOR}
              onDrill={() => props.onAppendQuery(TYPE_TERMS[i()])}
              onExclude={() => props.onAppendQuery('-' + TYPE_TERMS[i()])}
            />
          )}
        </For>
      </div>
    </div>
  )
}
