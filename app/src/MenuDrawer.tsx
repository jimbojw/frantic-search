// SPDX-License-Identifier: Apache-2.0
import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { IconBookOpen, IconBug, IconInfoCircle, IconXMark } from './Icons'
import type { BreakdownNode } from '@frantic-search/shared'
import { SORT_FIELDS } from '@frantic-search/shared'
import {
  findFieldNode,
  cycleChip,
  parseBreakdown,
  toggleIncludeExtras,
  hasIncludeExtras,
  cycleSortChip,
  cyclePercentileChip,
  popularityClearPredicate,
  saltClearPredicate,
  getMetadataTagChipState,
  cycleMetadataTagChip,
  CI_FIELDS,
  getIdentityColorChipState,
  toggleIdentityColorChip,
  toggleIdentityColorlessChip,
  cycleCiNumericChip,
  cycleManaValueMenuChip,
  getManaValueMenuActiveIndex,
} from './query-edit'
import { MV_FIELDS, MV_LABELS, MV_OPS, MV_TERMS, MV_VALUES } from './mana-value-query'
import { captureMenuChipUsed } from './analytics'
import { ChipButton } from './ChipButton'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'
import { useSearchContext } from './SearchContext'
import type { ViewMode } from './view-mode'
import { VIEW_MODES } from './view-mode'

// ---------------------------------------------------------------------------
// Chip data
// ---------------------------------------------------------------------------

const FORMAT_FIELDS = ['f', 'format', 'legal']
const IS_FIELDS = ['is']
const TYPE_FIELDS = ['t', 'type']
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

function typeChip(value: string): ChipDef {
  return { label: `t:${value}`, field: TYPE_FIELDS, operator: ':', value, term: `t:${value}` }
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

const TERMS_SECTIONS = [
  'formats',
  'color',
  'types',
  'mana',
  'layouts',
  'roles',
  'lands',
  'rarities',
  'printings',
  'prices',
  'popularity',
  'salt',
  'sort',
] as const
type TermsSectionId = (typeof TERMS_SECTIONS)[number]

const ALL_SECTIONS = ['mylist', 'views', ...TERMS_SECTIONS] as const
type SectionId = (typeof ALL_SECTIONS)[number]

const SECTION_CHIPS: Record<TermsSectionId, (ChipDef | PercentileChipDef)[]> = {
  color: [], // Spec 130: rendered by ColorSection
  mana: [], // Spec 168: rendered by ManaValueMenuChip grid
  types: [ // Spec 167
    typeChip('legendary'),
    typeChip('creature'),
    typeChip('instant'),
    typeChip('sorcery'),
    typeChip('artifact'),
    typeChip('enchantment'),
    typeChip('planeswalker'),
    typeChip('land'),
    isChip('permanent'),
  ],
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
    sortChip('identity'),
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
  types: 'Types',
  mana: 'Mana',
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
  mana: 'Mana value',
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

function TermChip(props: {
  chip: ChipDef
  state: ChipState
  query: string
  breakdown: BreakdownNode | null
  section: string
  onSetQuery: (query: string) => void
}) {
  return (
    <ChipButton
      state={props.state}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: props.chip.label })
        props.onSetQuery(cycleChip(props.query, props.breakdown, props.chip))
      }}
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
    </ChipButton>
  )
}

// ---------------------------------------------------------------------------
// ViewChip (Spec 083)
// ---------------------------------------------------------------------------

function ViewChip(props: {
  mode: ViewMode
  label: string
  active: boolean
  section: string
  onChange: (mode: ViewMode) => void
}) {
  return (
    <ChipButton
      active={props.active}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: props.label })
        props.onChange(props.mode)
      }}
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
    </ChipButton>
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
  section: string
  onChange: (mode: 'cards' | 'art' | 'prints') => void
}) {
  return (
    <ChipButton
      active={props.active}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: props.label })
        props.onChange(props.mode)
      }}
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
    </ChipButton>
  )
}

function MetadataTagChip(props: {
  tag: string
  query: string
  breakdown: () => BreakdownNode | null
  section: string
  onSetQuery: (query: string) => void
}) {
  const state = () => getMetadataTagChipState(props.breakdown(), props.tag)
  return (
    <ChipButton
      state={state()}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: `#${props.tag}` })
        props.onSetQuery(cycleMetadataTagChip(props.query, props.breakdown(), { tag: props.tag, term: `#${props.tag}` }))
      }}
    >
      #{props.tag}
    </ChipButton>
  )
}

function IncludeExtrasChip(props: {
  active: boolean
  query: string
  breakdown: BreakdownNode | null
  section: string
  onSetQuery: (query: string) => void
}) {
  return (
    <ChipButton
      active={props.active}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: 'include:extras' })
        props.onSetQuery(toggleIncludeExtras(props.query, props.breakdown))
      }}
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
    </ChipButton>
  )
}

// ---------------------------------------------------------------------------
// Mana value chips — mutually exclusive (Spec 168)
// ---------------------------------------------------------------------------

const MV_MENU_FIELDS: string[] = [...MV_FIELDS]

function ManaValueMenuChip(props: {
  active: boolean
  query: string
  breakdown: BreakdownNode | null
  chip: { field: string[]; operator: string; value: string; term: string }
  onSetQuery: (query: string) => void
}) {
  return (
    <ChipButton
      active={props.active}
      onClick={() => {
        captureMenuChipUsed({ section: 'mana', chip_label: props.chip.term })
        props.onSetQuery(cycleManaValueMenuChip(props.query, props.breakdown, props.chip))
      }}
    >
      {props.active ? (
        props.chip.term
      ) : (
        <For each={buildSpans(props.chip.term)}>
          {(span) =>
            span.role
              ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span>
              : <>{span.text}</>
          }
        </For>
      )}
    </ChipButton>
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
  section: string
  onSetQuery: (query: string) => void
}) {
  return (
    <ChipButton
      state={props.state}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: props.chip.label })
        props.onSetQuery(cyclePercentileChip(props.query, props.breakdown, props.chip))
      }}
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
    </ChipButton>
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
  section: string
  onSetQuery: (query: string) => void
}) {
  const isC = props.color === 'c'
  const chipLabel = `${props.prefix}${props.color}`
  const onClick = () => {
    captureMenuChipUsed({ section: props.section, chip_label: chipLabel })
    isC
      ? props.onSetQuery(toggleIdentityColorlessChip(props.query, props.breakdown))
      : props.onSetQuery(toggleIdentityColorChip(props.query, props.breakdown, props.color))
  }
  return (
    <ChipButton
      active={props.active}
      class="gap-0.5"
      onClick={onClick}
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
    </ChipButton>
  )
}

function IdentityNumericChip(props: {
  n: number
  state: 'neutral' | 'positive' | 'negative'
  query: string
  breakdown: BreakdownNode | null
  section: string
  onSetQuery: (query: string) => void
}) {
  const label = `ci=${props.n}`
  return (
    <ChipButton
      state={props.state}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: label })
        props.onSetQuery(cycleCiNumericChip(props.query, props.breakdown, props.n))
      }}
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
    </ChipButton>
  )
}

function IdentityMulticolorChip(props: {
  state: 'neutral' | 'positive' | 'negative'
  query: string
  breakdown: BreakdownNode | null
  section: string
  onSetQuery: (query: string) => void
}) {
  return (
    <ChipButton
      state={props.state}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: 'ci:m' })
        props.onSetQuery(cycleChip(props.query, props.breakdown, { field: CI_FIELDS, operator: ':', value: 'm', term: 'ci:m' }))
      }}
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
    </ChipButton>
  )
}

function ColorSection(props: {
  query: string
  breakdown: BreakdownNode | null
  section: string
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
              section={props.section}
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
          section={props.section}
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
              section={props.section}
              onSetQuery={props.onSetQuery}
            />
          )}
        </For>
        <IdentityMulticolorChip
          state={state().multicolor}
          query={props.query}
          breakdown={props.breakdown}
          section={props.section}
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
  section: string
  onSetQuery: (query: string) => void
}) {
  const arrow = () => sortArrow(props.chip.value, props.state)
  const chipState = (): 'neutral' | 'positive' | 'negative' | 'alt-negative' =>
    props.state === 'negative' ? 'alt-negative' : props.state

  return (
    <ChipButton
      state={chipState()}
      onClick={() => {
        captureMenuChipUsed({ section: props.section, chip_label: props.chip.label })
        props.onSetQuery(cycleSortChip(props.query, props.breakdown, props.chip))
      }}
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
    </ChipButton>
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
  onDocsClick?: () => void
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
              <Show when={props.onDocsClick}>
                <button
                  type="button"
                  onClick={() => props.onDocsClick!()}
                  class="flex items-center gap-2 min-h-11 px-2 py-2 text-[11px] font-medium uppercase tracking-wider rounded transition-colors cursor-pointer text-left text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <IconBookOpen class="size-3.5 shrink-0" />
                  Docs
                </button>
              </Show>
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
                  section="mylist"
                  onSetQuery={props.onSetQuery}
                />
                <For each={ctx.deckTags?.() ?? []}>
                  {(tag) => (
                    <MetadataTagChip
                      tag={tag}
                      query={props.query}
                      breakdown={bd}
                      section="mylist"
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
                      section="views"
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
                      section="views"
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
                  section="views"
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
                        section="color"
                        onSetQuery={props.onSetQuery}
                      />
                    </Show>
                    <Show when={section === 'mana'}>
                      <div class="flex flex-wrap gap-1.5 content-start">
                        <For each={[...MV_LABELS]}>
                          {(_, i) => (
                            <ManaValueMenuChip
                              active={getManaValueMenuActiveIndex(bd()) === i()}
                              query={props.query}
                              breakdown={bd()}
                              chip={{
                                field: MV_MENU_FIELDS,
                                operator: MV_OPS[i()]!,
                                value: MV_VALUES[i()]!,
                                term: MV_TERMS[i()]!,
                              }}
                              onSetQuery={props.onSetQuery}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={section !== 'color' && section !== 'mana'}>
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
                                  section={section}
                                  onSetQuery={props.onSetQuery}
                                />
                              </Show>
                              <Show when={section === 'popularity' || section === 'salt'}>
                                <PercentileTermChip
                                  chip={chip as PercentileChipDef}
                                  state={getChipState(bd(), chip)}
                                  query={props.query}
                                  breakdown={bd()}
                                  section={section}
                                  onSetQuery={props.onSetQuery}
                                />
                              </Show>
                              <Show when={section !== 'sort' && section !== 'popularity' && section !== 'salt'}>
                                <TermChip
                                  chip={chip as ChipDef}
                                  state={getChipState(bd(), chip)}
                                  query={props.query}
                                  breakdown={bd()}
                                  section={section}
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
