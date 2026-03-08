// SPDX-License-Identifier: Apache-2.0
import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { IconBug, IconInfoCircle } from './Icons'
import type { BreakdownNode } from '@frantic-search/shared'
import { SORT_FIELDS } from '@frantic-search/shared'
import { findFieldNode, cycleChip, parseBreakdown, toggleIncludeExtras, hasIncludeExtras, cycleSortChip } from './query-edit'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'
import { useSearchContext } from './SearchContext'
import { Outlink } from './Outlink'
import type { ViewMode } from './view-mode'
import { VIEW_MODES } from './view-mode'

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

const TERMS_SECTIONS = ['formats', 'layouts', 'roles', 'lands', 'rarities', 'printings', 'prices', 'sort'] as const
type TermsSectionId = (typeof TERMS_SECTIONS)[number]

const ALL_SECTIONS = ['views', 'tools', ...TERMS_SECTIONS] as const
type SectionId = (typeof ALL_SECTIONS)[number]

const SECTION_CHIPS: Record<TermsSectionId, ChipDef[]> = {
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
    sortChip('edhrec'),
    sortChip('$'),
    sortChip('date'),
    sortChip('rarity'),
  ],
}

const SECTION_LABELS: Record<SectionId, string> = {
  views: 'Views',
  tools: 'Tools',
  formats: 'Formats',
  layouts: 'Layouts',
  roles: 'Roles',
  lands: 'Lands',
  rarities: 'Rarities',
  printings: 'Printings',
  prices: 'Prices',
  sort: 'Sort',
}

const STORAGE_KEY = 'frantic-terms-tab'

function loadSection(): SectionId {
  const stored = localStorage.getItem(STORAGE_KEY)
  return ALL_SECTIONS.includes(stored as SectionId) ? (stored as SectionId) : 'views'
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
// ViewChip (Spec 083)
// ---------------------------------------------------------------------------

function ViewChip(props: {
  mode: ViewMode
  label: string
  active: boolean
  onChange: (mode: ViewMode) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(props.mode)}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {props.active ? (
        props.label
      ) : (
        <For each={buildSpans(props.label)}>
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
// UniqueChip, IncludeExtrasChip (Spec 084)
// ---------------------------------------------------------------------------

const UNIQUE_MODES = ['cards', 'art', 'prints'] as const

function UniqueChip(props: {
  mode: 'cards' | 'art' | 'prints'
  label: string
  active: boolean
  onChange: (mode: 'cards' | 'art' | 'prints') => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(props.mode)}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {props.active ? (
        props.label
      ) : (
        <For each={buildSpans(props.label)}>
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
// MenuDrawer
// ---------------------------------------------------------------------------

export default function MenuDrawer(props: {
  query: string
  onSetQuery: (query: string) => void
  onHelpClick: () => void
  onReportClick: () => void
  onListsClick: () => void
  onClose: () => void
}) {
  const ctx = useSearchContext()
  const [activeSection, setActiveSection] = createSignal<SectionId>(loadSection())
  const bd = createMemo(() => parseBreakdown(props.query))
  let contentRef: HTMLDivElement | undefined
  const navRefs: Partial<Record<SectionId, HTMLButtonElement>> = {}

  function scrollToSection(section: SectionId) {
    const el = contentRef?.querySelector(`#${section}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
    setActiveSection(section)
    localStorage.setItem(STORAGE_KEY, section)
  }

  onMount(() => {
    const root = contentRef
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = entry.target.id as SectionId
          if (ALL_SECTIONS.includes(id)) {
            setActiveSection(id)
            localStorage.setItem(STORAGE_KEY, id)
            const btn = navRefs[id]
            if (btn) btn.scrollIntoView({ block: 'nearest', behavior: 'auto' })
            break
          }
        }
      },
      {
        root,
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0,
      },
    )

    for (const id of ALL_SECTIONS) {
      const el = root.querySelector(`#${id}`)
      if (el) observer.observe(el)
    }

    onCleanup(() => observer.disconnect())

    const target = loadSection()
    requestAnimationFrame(() => {
      const el = root.querySelector(`#${target}`)
      if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
  })

  return (
    <div class="flex flex-col flex-1 min-h-0 px-3 pt-1.5 pb-2">
      {/* Header row: label, spacer, close */}
      <div class="flex items-center gap-1 pb-1.5 shrink-0">
        <span class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Menu
        </span>
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

      {/* Two-column layout: nav rail + content */}
      <div class="flex flex-row flex-1 min-h-0 gap-2 overflow-hidden">
        {/* Left rail: section labels + sticky footer */}
        <div class="flex flex-col shrink-0 w-24 min-h-0">
          <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div class="flex flex-col gap-0.5 py-2">
              <For each={ALL_SECTIONS}>
                {(section) => (
                  <button
                    ref={(el) => { navRefs[section] = el }}
                    type="button"
                    onClick={() => scrollToSection(section)}
                    class={`min-h-11 px-2 py-2 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left ${
                      activeSection() === section
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    {section}
                  </button>
                )}
              </For>
            </div>
          </div>
          {/* Sticky Help footer */}
          <div class="shrink-0 pt-2 mt-auto border-t border-gray-200 dark:border-gray-700">
            <div class="flex flex-col gap-0.5 py-2">
              <button
                type="button"
                onClick={() => props.onHelpClick()}
                class="flex items-center gap-2 min-h-11 px-2 py-2 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <IconInfoCircle class="size-3.5 shrink-0" />
                Syntax Help
              </button>
              <button
                type="button"
                onClick={() => props.onReportClick()}
                class="flex items-center gap-2 min-h-11 px-2 py-2 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <IconBug class="size-3.5 shrink-0" />
                Report Bug
              </button>
            </div>
          </div>
        </div>

        {/* Right content: all sections in one scroll container */}
        <div
          ref={(el) => { contentRef = el }}
          class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth scroll-pt-2"
        >
          <div class="flex flex-col gap-4 pb-4">
            {/* VIEWS section (Spec 084: three rows) */}
            <section id="views" class="flex flex-col gap-1.5">
              <h2 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-0.5 -mb-0.5 z-10">
                Views
              </h2>
              <div class="flex flex-wrap gap-1.5 content-start">
                <For each={VIEW_MODES}>
                  {(mode) => (
                    <ViewChip
                      mode={mode}
                      label={`v:${mode}`}
                      active={ctx.viewMode() === mode}
                      onChange={ctx.changeViewMode}
                    />
                  )}
                </For>
              </div>
              <div class="flex flex-wrap gap-1.5 content-start">
                <For each={UNIQUE_MODES}>
                  {(mode) => (
                    <UniqueChip
                      mode={mode}
                      label={`unique:${mode}`}
                      active={ctx.uniqueMode() === mode}
                      onChange={ctx.changeUniqueMode}
                    />
                  )}
                </For>
              </div>
              <div class="flex flex-wrap gap-1.5 content-start">
                <IncludeExtrasChip
                  active={hasIncludeExtras(bd())}
                  query={props.query}
                  breakdown={bd()}
                  onSetQuery={props.onSetQuery}
                />
              </div>
            </section>
            {/* TOOLS section */}
            <section id="tools" class="flex flex-col gap-1.5">
              <h2 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-0.5 -mb-0.5 z-10">
                Tools
              </h2>
              <div class="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={props.onListsClick}
                  class="text-left whitespace-nowrap text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors text-[11px]"
                >
                  My List
                </button>
                <Outlink
                  href={ctx.scryfallUrl()}
                  class="whitespace-nowrap text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors text-[11px]"
                >
                  Try on Scryfall ↗
                </Outlink>
              </div>
            </section>
            {/* TERMS sections */}
            <For each={TERMS_SECTIONS}>
              {(section) => (
                <section id={section} class="flex flex-col gap-1.5">
                  <h2 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-0.5 -mb-0.5 z-10">
                    {SECTION_LABELS[section]}
                  </h2>
                  <div class="flex flex-wrap gap-1.5 content-start">
                    <For each={SECTION_CHIPS[section]}>
                      {(chip) => (
                        <Show when={section === 'sort'} fallback={
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
                </section>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
