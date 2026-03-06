// SPDX-License-Identifier: Apache-2.0
import { For, Show, createMemo, createSignal } from 'solid-js'
import type { BreakdownNode } from '@frantic-search/shared'
import { SORT_FIELDS } from '@frantic-search/shared'
import { findFieldNode, cycleChip, parseBreakdown, toggleUniquePrints, hasUniquePrints, toggleIncludeExtras, hasIncludeExtras, cycleSortChip } from './query-edit'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'

// ---------------------------------------------------------------------------
// Chip data
// ---------------------------------------------------------------------------

const FORMAT_FIELDS = ['f', 'format', 'legal']
const IS_FIELDS = ['is']
const RARITY_FIELDS = ['r', 'rarity']
const USD_FIELDS = ['usd', '$']

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

function usdChip(value: string): ChipDef {
  return { label: `$<${value}`, field: USD_FIELDS, operator: '<', value, term: `$<${value}` }
}

const SORT_CHIP_FIELDS = ['sort']

function sortChip(value: string): ChipDef {
  return { label: `sort:${value}`, field: SORT_CHIP_FIELDS, operator: ':', value, term: `sort:${value}` }
}

const TABS = ['formats', 'layouts', 'roles', 'lands', 'rarities', 'printings', 'prices', 'sort'] as const
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
    isChip('gamechanger'),
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
    rarityChip('special'),
    rarityChip('rare'),
    rarityChip('uncommon'),
    rarityChip('common'),
  ],
  printings: [
    isChip('foil'),
    isChip('etched'),
    isChip('glossy'),
    isChip('borderless'),
    isChip('fullart'),
    isChip('extended'),
    isChip('textless'),
    isChip('promo'),
    isChip('reprint'),
  ],
  prices: [
    usdChip('0.10'),
    usdChip('1'),
    usdChip('2'),
    usdChip('5'),
    usdChip('10'),
    usdChip('20'),
    usdChip('50'),
    usdChip('100'),
  ],
  sort: [
    sortChip('name'),
    sortChip('mv'),
    sortChip('color'),
    sortChip('power'),
    sortChip('toughness'),
    sortChip('$'),
    sortChip('date'),
    sortChip('rarity'),
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
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${CHIP_CLASSES[props.state]}`}
    >
      {props.state === 'neutral' ? (
        <For each={buildSpans(props.chip.label)}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      ) : (
        props.chip.label
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Bimodal chips: unique:prints, include:extras
// ---------------------------------------------------------------------------

const UNIQUE_PRINTS_TABS: ReadonlySet<TabId> = new Set(['rarities', 'printings'])
const MODIFIER_TABS: ReadonlySet<TabId> = new Set(['formats', 'roles', 'rarities', 'printings'])

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
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {props.active ? (
        'unique:prints'
      ) : (
        <For each={buildSpans('unique:prints')}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      )}
    </button>
  )
}

function IncludeExtrasChip(props: {
  active: boolean
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(toggleIncludeExtras(props.query, props.breakdown))}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {props.active ? (
        'include:extras'
      ) : (
        <For each={buildSpans('include:extras')}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sort chip: tri-state with directional arrows (Spec 059)
// ---------------------------------------------------------------------------

function sortArrow(chipValue: string, state: ChipState): string {
  if (state === 'neutral') return ''
  const entry = SORT_FIELDS[chipValue.toLowerCase()]
  if (!entry) return ''
  const isDefaultAsc = entry.defaultDir === 'asc'
  if (state === 'positive') return isDefaultAsc ? ' ↑' : ' ↓'
  return isDefaultAsc ? ' ↓' : ' ↑'
}

function SortTermChip(props: {
  chip: ChipDef
  state: ChipState
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  const arrow = () => sortArrow(props.chip.value, props.state)
  // For the negative state, don't use line-through (it's a reversed sort, not exclusion)
  const classes = () => {
    if (props.state === 'neutral') return CHIP_CLASSES.neutral
    if (props.state === 'positive') return CHIP_CLASSES.positive
    return 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60'
  }

  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cycleSortChip(props.query, props.breakdown, props.chip))}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${classes()}`}
    >
      {props.state === 'neutral' ? (
        <For each={buildSpans(props.chip.label)}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      ) : (
        <>{props.chip.label}{arrow()}</>
      )}
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
          class="min-h-11 min-w-11 flex items-center justify-center p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
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
          class="min-h-11 min-w-11 flex items-center justify-center p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
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
                class={`min-h-11 px-2 py-2 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left ${
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
                <Show when={activeTab() === 'sort'} fallback={
                  <TermChip
                    chip={chip}
                    state={getChipState(bd(), chip)}
                    query={props.query}
                    breakdown={bd()}
                    onSetQuery={props.onSetQuery}
                  />
                }>
                  <SortTermChip
                    chip={chip}
                    state={getChipState(bd(), chip)}
                    query={props.query}
                    breakdown={bd()}
                    onSetQuery={props.onSetQuery}
                  />
                </Show>
              )}
            </For>
          </div>
          <Show when={MODIFIER_TABS.has(activeTab())}>
            <div class="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-gray-200 dark:border-gray-700">
              <Show when={UNIQUE_PRINTS_TABS.has(activeTab())}>
                <UniquePrintsChip
                  active={hasUniquePrints(bd())}
                  query={props.query}
                  breakdown={bd()}
                  onSetQuery={props.onSetQuery}
                />
              </Show>
              <IncludeExtrasChip
                active={hasIncludeExtras(bd())}
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
