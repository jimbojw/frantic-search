// SPDX-License-Identifier: Apache-2.0
import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { IconBug, IconInfoCircle, IconXMark } from './Icons'
import type { BreakdownNode } from '@frantic-search/shared'
import { SORT_FIELDS } from '@frantic-search/shared'
import { findFieldNode, cycleChip, parseBreakdown, toggleIncludeExtras, hasIncludeExtras, cycleSortChip, cyclePercentileChip, popularityClearPredicate, saltClearPredicate, getMetadataTagChipState, cycleMetadataTagChip, CI_FIELDS, getIdentityColorChipState, toggleIdentityColorChip, toggleIdentityColorlessChip, cycleCiNumericChip } from './query-edit'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'
import { useSearchContext } from './SearchContext'
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
type PercentileChipDef = ChipDef & { clearPredicate: (label: string) => boolean }

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

const MY_FIELDS = ['my']

function myChip(value: string): ChipDef {
  return { label: `my:${value}`, field: MY_FIELDS, operator: ':', value, term: `my:${value}` }
}

const SORT_CHIP_FIELDS = ['sort', 'order']

function sortChip(value: string): ChipDef {
  return { label: `sort:${value}`, field: SORT_CHIP_FIELDS, operator: ':', value, term: `sort:${value}` }
}

const POPULARITY_FIELDS = ['edhrec', 'edhrecrank']
const SALT_FIELDS = ['salt', 'edhrecsalt', 'saltiness']

function popularityPercentileChip(value: string): PercentileChipDef {
  return {
    label: `edhrec>${value}`,
    field: POPULARITY_FIELDS,
    operator: '>',
    value,
    term: `edhrec>${value}`,
    clearPredicate: popularityClearPredicate,
  }
}

function saltPercentileChip(value: string): PercentileChipDef {
  return {
    label: `salt>${value}`,
    field: SALT_FIELDS,
    operator: '>',
    value,
    term: `salt>${value}`,
    clearPredicate: saltClearPredicate,
  }
}

const TERMS_SECTIONS = ['formats', 'color', 'layouts', 'roles', 'lands', 'rarities', 'printings', 'prices', 'popularity', 'salt', 'sort'] as const
type TermsSectionId = (typeof TERMS_SECTIONS)[number]

const ALL_SECTIONS = ['mylist', 'views', ...TERMS_SECTIONS] as const
type SectionId = (typeof ALL_SECTIONS)[number]

const SECTION_CHIPS: Record<TermsSectionId, (ChipDef | PercentileChipDef)[]> = {
  color: [], // Spec 130: rendered by ColorSection
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
  popularity: [
    popularityPercentileChip('90%'),
    popularityPercentileChip('95%'),
    popularityPercentileChip('99%'),
  ],
  salt: [
    saltPercentileChip('90%'),
    saltPercentileChip('95%'),
    saltPercentileChip('99%'),
  ],
  sort: [
    sortChip('name'),
    sortChip('mv'),
    sortChip('color'),
    sortChip('power'),
    sortChip('toughness'),
    sortChip('edhrec'),
    sortChip('salt'),
    sortChip('$'),
    sortChip('date'),
    sortChip('rarity'),
  ],
}

const SECTION_LABELS: Record<SectionId, string> = {
  mylist: 'My List',
  views: 'Views',
  formats: 'Formats',
  color: 'Colors',
  layouts: 'Layouts',
  roles: 'Roles',
  lands: 'Lands',
  rarities: 'Rarities',
  printings: 'Printings',
  prices: 'Prices',
  popularity: 'Popularity',
  salt: 'Salt',
  sort: 'Sort',
}

// Content headings; inherits from nav labels, overrides where different
const SECTION_HEADINGS: Record<SectionId, string> = {
  ...SECTION_LABELS,
  color: 'Color Identity',
}

const STORAGE_KEY = 'frantic-terms-tab'

function loadSection(): SectionId {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'tools') return 'views' // migrated: TOOLS removed
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

function MetadataTagChip(props: {
  tag: string
  query: string
  breakdown: () => BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  const state = () => getMetadataTagChipState(props.breakdown(), props.tag)
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cycleMetadataTagChip(props.query, props.breakdown(), { tag: props.tag, term: `#${props.tag}` }))}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${CHIP_CLASSES[state()]}`}
    >
      #{props.tag}
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

function PercentileTermChip(props: {
  chip: PercentileChipDef
  state: ChipState
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cyclePercentileChip(props.query, props.breakdown, props.chip))}
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
// Spec 130: COLOR section chips
// ---------------------------------------------------------------------------

const WUBRG_COLORS = ['w', 'u', 'b', 'r', 'g'] as const
const MANA_CLASSES: Record<string, string> = {
  w: 'ms-w',
  u: 'ms-u',
  b: 'ms-b',
  r: 'ms-r',
  g: 'ms-g',
  c: 'ms-c',
}

function IdentityColorChip(props: {
  color: string
  prefix: string
  active: boolean
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  const isC = props.color === 'c'
  const onClick = () =>
    isC
      ? props.onSetQuery(toggleIdentityColorlessChip(props.query, props.breakdown))
      : props.onSetQuery(toggleIdentityColorChip(props.query, props.breakdown, props.color))
  return (
    <button
      type="button"
      onClick={onClick}
      class={`inline-flex items-center justify-center gap-0.5 min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
        props.active
          ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500'
          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      {props.active ? (
        <>
          {props.prefix}
          <i class={`ms ms-cost ${MANA_CLASSES[props.color] ?? 'ms-c'}`} />
        </>
      ) : (
        <>
          <For each={buildSpans(props.prefix)}>
            {(span) =>
              span.role
                ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
                : <>{span.text}</>
            }
          </For>
          <i class={`ms ms-cost ${MANA_CLASSES[props.color] ?? 'ms-c'}`} />
        </>
      )}
    </button>
  )
}

function IdentityNumericChip(props: {
  n: number
  state: 'neutral' | 'positive' | 'negative'
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  const label = `ci=${props.n}`
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cycleCiNumericChip(props.query, props.breakdown, props.n))}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${CHIP_CLASSES[props.state]}`}
    >
      {props.state === 'neutral' ? (
        <For each={buildSpans(label)}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      ) : (
        label
      )}
    </button>
  )
}

function IdentityMulticolorChip(props: {
  state: 'neutral' | 'positive' | 'negative'
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSetQuery(cycleChip(props.query, props.breakdown, { field: CI_FIELDS, operator: ':', value: 'm', term: 'ci:m' }))}
      class={`inline-flex items-center justify-center min-h-11 min-w-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${CHIP_CLASSES[props.state]}`}
    >
      {props.state === 'neutral' ? (
        <For each={buildSpans('ci:m')}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      ) : (
        'ci:m'
      )}
    </button>
  )
}

function ColorSection(props: {
  query: string
  breakdown: BreakdownNode | null
  onSetQuery: (query: string) => void
}) {
  const state = () => getIdentityColorChipState(props.breakdown)
  return (
    <>
      <div class="flex flex-wrap gap-1.5 content-start">
        <For each={WUBRG_COLORS}>
          {(color) => (
            <IdentityColorChip
              color={color}
              prefix="ci:"
              active={state().wubrg[color as 'w' | 'u' | 'b' | 'r' | 'g']}
              query={props.query}
              breakdown={props.breakdown}
              onSetQuery={props.onSetQuery}
            />
          )}
        </For>
        <IdentityColorChip
          color="c"
          prefix="ci="
          active={state().colorless}
          query={props.query}
          breakdown={props.breakdown}
          onSetQuery={props.onSetQuery}
        />
      </div>
      <div class="flex flex-wrap gap-1.5 content-start">
        <For each={[1, 2, 3, 4, 5]}>
          {(n) => (
            <IdentityNumericChip
              n={n}
              state={state().numeric[n]}
              query={props.query}
              breakdown={props.breakdown}
              onSetQuery={props.onSetQuery}
            />
          )}
        </For>
        <IdentityMulticolorChip
          state={state().multicolor}
          query={props.query}
          breakdown={props.breakdown}
          onSetQuery={props.onSetQuery}
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sort chip
// ---------------------------------------------------------------------------

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
          <IconXMark class="size-3.5" />
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
                    {SECTION_LABELS[section]}
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
            {/* MY LIST section (Spec 125) */}
            <section id="mylist" class="flex flex-col gap-1.5">
              <h2 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-0.5 -mb-0.5 z-10">
                My List
              </h2>
              <div class="flex flex-wrap gap-1.5 content-start">
                <TermChip
                  chip={myChip('list')}
                  state={getChipState(bd(), myChip('list'))}
                  query={props.query}
                  breakdown={bd()}
                  onSetQuery={props.onSetQuery}
                />
                <For each={ctx.deckTags?.() ?? []}>
                  {(tag) => (
                    <MetadataTagChip
                      tag={tag}
                      query={props.query}
                      breakdown={bd}
                      onSetQuery={props.onSetQuery}
                    />
                  )}
                </For>
              </div>
            </section>
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
                      label={`view:${mode}`}
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
            {/* TERMS sections */}
            <For each={TERMS_SECTIONS}>
              {(section) => (
                <section id={section} class="flex flex-col gap-1.5">
                  <h2 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-0.5 -mb-0.5 z-10">
                    {SECTION_HEADINGS[section]}
                  </h2>
                  <div class="flex flex-col gap-1.5">
                    <Show when={section === 'color'}>
                      <ColorSection
                        query={props.query}
                        breakdown={bd()}
                        onSetQuery={props.onSetQuery}
                      />
                    </Show>
                    <Show when={section !== 'color'}>
                      <div class="flex flex-wrap gap-1.5 content-start">
                        <For each={SECTION_CHIPS[section]}>
                          {(chip) => (
                            <>
                              <Show when={section === 'sort'}>
                                <SortTermChip
                                  chip={chip as ChipDef}
                                  state={getChipState(bd(), chip)}
                                  query={props.query}
                                  breakdown={bd()}
                                  onSetQuery={props.onSetQuery}
                                />
                              </Show>
                              <Show when={section === 'popularity' || section === 'salt'}>
                                <PercentileTermChip
                                  chip={chip as PercentileChipDef}
                                  state={getChipState(bd(), chip)}
                                  query={props.query}
                                  breakdown={bd()}
                                  onSetQuery={props.onSetQuery}
                                />
                              </Show>
                              <Show when={section !== 'sort' && section !== 'popularity' && section !== 'salt'}>
                                <TermChip
                                  chip={chip as ChipDef}
                                  state={getChipState(bd(), chip)}
                                  query={props.query}
                                  breakdown={bd()}
                                  onSetQuery={props.onSetQuery}
                                />
                              </Show>
                            </>
                          )}
                        </For>
                      </div>
                    </Show>
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
