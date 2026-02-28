// SPDX-License-Identifier: Apache-2.0
import { For, Show, createMemo, createSignal } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import { findFieldNode, cycleChip, parseBreakdown, toggleUniquePrints, hasUniquePrints } from './query-edit'

// ---------------------------------------------------------------------------
// Chip data
// ---------------------------------------------------------------------------

const FORMAT_FIELDS = ['f', 'format', 'legal']
const IS_FIELDS = ['is']
const RARITY_FIELDS = ['r', 'rarity']
const PRICE_FIELDS = ['price', 'usd']

type ChipDef = { label: string; field: string[]; operator: string; value: string; term: string }

function fmtChip(value: string): ChipDef {
  return { label: `f:${value}`, field: FORMAT_FIELDS, operator: ':', value, term: `f:${value}` }
}

function isChip(value: string): ChipDef {
  return { label: `is:${value}`, field: IS_FIELDS, operator: ':', value, term: `is:${value}` }
}

function rarityChip(value: string): ChipDef {
  return { label: `r:${value}`, field: RARITY_FIELDS, operator: ':', value, term: `r:${value}` }
}

function priceChip(value: string): ChipDef {
  return { label: `price<${value}`, field: PRICE_FIELDS, operator: '<', value, term: `price<${value}` }
}

const TABS = ['formats', 'layouts', 'roles', 'lands', 'rarities', 'printings', 'prices'] as const
type TabId = (typeof TABS)[number]

const TAB_CHIPS: Record<TabId, ChipDef[]> = {
  formats: [
    fmtChip('commander'),
    fmtChip('modern'),
    fmtChip('standard'),
    fmtChip('pioneer'),
    fmtChip('pauper'),
    fmtChip('legacy'),
  ],
  layouts: [
    isChip('dfc'),
    isChip('transform'),
    isChip('mdfc'),
    isChip('split'),
    isChip('adventure'),
    isChip('saga'),
    isChip('flip'),
    isChip('meld'),
  ],
  roles: [
    isChip('commander'),
    isChip('partner'),
    isChip('companion'),
    isChip('reserved'),
    isChip('permanent'),
    isChip('spell'),
  ],
  lands: [
    isChip('dual'),
    isChip('fetchland'),
    isChip('shockland'),
    isChip('checkland'),
    isChip('fastland'),
    isChip('painland'),
    isChip('triome'),
    isChip('manland'),
    isChip('bounceland'),
    isChip('scryland'),
  ],
  rarities: [
    rarityChip('mythic'),
    rarityChip('rare'),
    rarityChip('uncommon'),
    rarityChip('common'),
  ],
  printings: [
    isChip('foil'),
    isChip('etched'),
    isChip('borderless'),
    isChip('fullart'),
    isChip('extended'),
    isChip('textless'),
    isChip('promo'),
    isChip('reprint'),
  ],
  prices: [
    priceChip('0.10'),
    priceChip('1'),
    priceChip('2'),
    priceChip('5'),
    priceChip('10'),
    priceChip('20'),
    priceChip('50'),
    priceChip('100'),
  ],
}

const STORAGE_KEY = 'frantic-terms-tab'

function loadTab(): TabId {
  const stored = localStorage.getItem(STORAGE_KEY)
  return TABS.includes(stored as TabId) ? (stored as TabId) : 'formats'
}

// ---------------------------------------------------------------------------
// State detection
// ---------------------------------------------------------------------------

type ChipState = 'neutral' | 'positive' | 'negative'

function getChipState(
  bd: BreakdownNode | null,
  chip: ChipDef,
): ChipState {
  if (!bd) return 'neutral'
  if (findFieldNode(bd, chip.field, chip.operator, false, v => v === chip.value)) return 'positive'
  if (findFieldNode(bd, chip.field, chip.operator, true, v => v === chip.value)) return 'negative'
  return 'neutral'
}

// ---------------------------------------------------------------------------
// TermChip component
// ---------------------------------------------------------------------------

const CHIP_CLASSES: Record<ChipState, string> = {
  neutral: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300',
  positive: 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500',
  negative: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 line-through hover:bg-red-200 dark:hover:bg-red-900/60',
}

function TermChip(props: {
  chip: ChipDef
  state: ChipState
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cycleChip(props.query, props.breakdown, props.chip))}
      class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono cursor-pointer transition-colors ${CHIP_CLASSES[props.state]}`}
    >
      {props.chip.label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Bimodal chip: unique:prints
// ---------------------------------------------------------------------------

const UNIQUE_PRINTS_TABS: ReadonlySet<TabId> = new Set(['rarities', 'printings'])

function UniquePrintsChip(props: {
  active: boolean
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(toggleUniquePrints(props.query, props.breakdown))}
      class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      unique:prints
    </button>
  )
}

// ---------------------------------------------------------------------------
// TermsDrawer
// ---------------------------------------------------------------------------

export default function TermsDrawer(props: {
  query: string
  onSetQuery: (query: string) => void
  onHelpClick: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = createSignal<TabId>(loadTab())
  const bd = createMemo(() => parseBreakdown(props.query))

  function selectTab(tab: TabId) {
    setActiveTab(tab)
    localStorage.setItem(STORAGE_KEY, tab)
  }

  const chips = createMemo(() => TAB_CHIPS[activeTab()])

  return (
    <div class="flex flex-col px-3 pt-1.5 pb-2">
      {/* Header row: label, info, spacer, close */}
      <div class="flex items-center gap-1 pb-1.5">
        <span class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Terms
        </span>
        <button
          type="button"
          onClick={() => props.onHelpClick()}
          class="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
          aria-label="Syntax help"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-3.5">
            <circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="2" fill="none" />
            <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
            <rect x="10.5" y="11" width="3" height="7" rx="0.5" fill="currentColor" />
            <rect x="9" y="11" width="3" height="1.5" rx="0.5" fill="currentColor" />
            <rect x="9" y="16.5" width="6" height="1.5" rx="0.5" fill="currentColor" />
          </svg>
        </button>
        <div class="flex-1" />
        <button
          type="button"
          onClick={() => props.onClose()}
          class="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
          aria-label="Close filters"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content row: tabs + chips */}
      <div class="flex">
        <div class="flex flex-col gap-0.5 shrink-0 pr-2">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                onClick={() => selectTab(tab)}
                class={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left ${
                  activeTab() === tab
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            )}
          </For>
        </div>

        <div class="flex-1 flex flex-col gap-1.5 min-w-0">
          <div class="flex flex-wrap gap-1.5 content-start">
            <For each={chips()}>
              {(chip) => (
                <TermChip
                  chip={chip}
                  state={getChipState(bd(), chip)}
                  query={props.query}
                  breakdown={bd()}
                  onSetQuery={props.onSetQuery}
                />
              )}
            </For>
          </div>
          <Show when={UNIQUE_PRINTS_TABS.has(activeTab())}>
            <div class="flex items-center gap-1.5 pt-0.5 border-t border-gray-200 dark:border-gray-700">
              <UniquePrintsChip
                active={hasUniquePrints(bd())}
                query={props.query}
                breakdown={bd()}
                onSetQuery={props.onSetQuery}
              />
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
