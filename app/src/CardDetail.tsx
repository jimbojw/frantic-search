// SPDX-License-Identifier: Apache-2.0
import type { Accessor } from 'solid-js'
import { createSignal, For, onCleanup, Show } from 'solid-js'
import type { DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'
import {
  tokenizeTypeLine,
  manaCostToCompactQuery,
  colorBitmaskToQueryLetters,
  colorIdentityMaskToManaCostString,
  faceColorMasksUniform,
  keywordAbilityToKwChipQuery,
  moxfieldPreviewLine,
} from '@frantic-search/shared'
import ListLineHighlight from './ListLineHighlight'
import { ChipButton } from './ChipButton'
import { DECK_REVIEW_LINE_ADDED_BG, DECK_REVIEW_LINE_REMOVED_BG } from './deck-review-line-styles'
import { IconMinus, IconPlus } from './Icons'
import { buildSpans, ROLE_CLASSES } from './QueryHighlight'
import { Format, DEFAULT_LIST_ID } from '@frantic-search/shared'
import type { CardListStore } from './card-list-store'
import { getMatchingCount } from '@frantic-search/shared'
import { ManaCost, OracleText } from './card-symbols'
import { artCropUrl, normalImageUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'
import {
  RARITY_LABELS,
  FINISH_LABELS,
  FINISH_TO_STRING,
  countPrintingRowsForCanonicalFace,
  formatPrice,
} from './app-utils'
import { Outlink } from './Outlink'
import { captureCardDetailInteracted, type CardDetailListFinish, type OutlinkDestination } from './analytics'
import {
  buildManapoolCardOrSearchUrl,
  buildTcgplayerPartnerUrl,
  buildTcgplayerProductPageUrl,
} from './affiliate-urls'

const FORMAT_DISPLAY: { name: string; bit: number }[] = [
  { name: 'Standard', bit: Format.Standard },
  { name: 'Pioneer', bit: Format.Pioneer },
  { name: 'Modern', bit: Format.Modern },
  { name: 'Legacy', bit: Format.Legacy },
  { name: 'Vintage', bit: Format.Vintage },
  { name: 'Pauper', bit: Format.Pauper },
  { name: 'Commander', bit: Format.Commander },
  { name: 'Oathbreaker', bit: Format.Oathbreaker },
  { name: 'Historic', bit: Format.Historic },
  { name: 'Timeless', bit: Format.Timeless },
  { name: 'Alchemy', bit: Format.Alchemy },
  { name: 'Brawl', bit: Format.Brawl },
  { name: 'Standard Brawl', bit: Format.StandardBrawl },
  { name: 'Pauper Commander', bit: Format.PauperCommander },
  { name: 'Duel', bit: Format.Duel },
  { name: 'Gladiator', bit: Format.Gladiator },
  { name: 'Penny', bit: Format.Penny },
  { name: 'Old School', bit: Format.OldSchool },
  { name: 'Premodern', bit: Format.Premodern },
  { name: 'Predh', bit: Format.Predh },
  { name: 'Future', bit: Format.Future },
]

const RARITY_TO_QUERY: Record<number, string> = {
  1: 'common',
  2: 'uncommon',
  4: 'rare',
  8: 'mythic',
  16: 'special',
  32: 'bonus',
}

type LegalityStatus = 'legal' | 'banned' | 'restricted' | 'not_legal'

function getStatus(bit: number, legalities: { legal: number; banned: number; restricted: number }): LegalityStatus {
  if (legalities.banned & bit) return 'banned'
  if (legalities.restricted & bit) return 'restricted'
  if (legalities.legal & bit) return 'legal'
  return 'not_legal'
}

const STATUS_STYLES: Record<LegalityStatus, string> = {
  legal: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  banned: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  restricted: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  not_legal: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
}

const STATUS_LABELS: Record<LegalityStatus, string> = {
  legal: 'Legal',
  banned: 'Banned',
  restricted: 'Restricted',
  not_legal: 'Not Legal',
}

const PRICE_DATA_UNAVAILABLE = '(price data not available)'

function CardDetailListRow(props: {
  count: number
  onAdd: () => void
  onRemove: () => void
  addLabel: string
  removeLabel: string
  previewLine: Accessor<string>
  caption: string
  rowClass?: string
  /** When false, omit +/- (spacers keep column alignment). Printing rows still show preview without a list store. */
  showSteppers?: boolean
}) {
  const [flash, setFlash] = createSignal<'none' | 'added' | 'removed'>('none')
  let flashTimer: ReturnType<typeof setTimeout> | undefined

  const scheduleFlashEnd = () => {
    if (flashTimer !== undefined) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => setFlash('none'), 450)
  }

  onCleanup(() => {
    if (flashTimer !== undefined) clearTimeout(flashTimer)
  })

  const bumpFlash = (kind: 'added' | 'removed') => {
    setFlash(kind)
    scheduleFlashEnd()
  }

  const handleRemove = () => {
    props.onRemove()
    bumpFlash('removed')
  }

  const handleAdd = () => {
    props.onAdd()
    bumpFlash('added')
  }

  const previewFlashClass = () => {
    const f = flash()
    if (f === 'added') return DECK_REVIEW_LINE_ADDED_BG
    if (f === 'removed') return DECK_REVIEW_LINE_REMOVED_BG
    return ''
  }

  const steppers = () => props.showSteppers !== false
  return (
    <div class={`flex items-start gap-2 px-4 py-2.5 ${props.rowClass ?? ''}`}>
      <Show when={steppers()} fallback={<div class="min-w-11 shrink-0" aria-hidden="true" />}>
        <ChipButton
          class="shrink-0 self-start"
          disabled={props.count === 0}
          onClick={handleRemove}
          aria-label={props.removeLabel}
        >
          <IconMinus class="size-4" />
        </ChipButton>
      </Show>
      <div class="min-w-0 flex-1">
        <div
          class={`rounded px-1.5 py-0.5 -mx-1 transition-colors duration-300 ${previewFlashClass()}`}
        >
          <ListLineHighlight text={props.previewLine()} class="text-sm text-gray-800 dark:text-gray-100" />
        </div>
        <p class="mt-1 text-xs italic text-gray-600 dark:text-gray-400">{props.caption}</p>
      </div>
      <Show when={steppers()} fallback={<div class="min-w-11 shrink-0" aria-hidden="true" />}>
        <ChipButton class="shrink-0 self-start" onClick={handleAdd} aria-label={props.addLabel}>
          <IconPlus class="size-4" />
        </ChipButton>
      </Show>
    </div>
  )
}

const DOUBLE_SIDED_LAYOUTS = new Set(['transform', 'modal_dfc'])

function CardImage(props: {
  scryfallId: string
  colorIdentity: number
  layout: string
  onFaceToggle?: (face: 'front' | 'back') => void
}) {
  const hasBackFace = () => DOUBLE_SIDED_LAYOUTS.has(props.layout)
  const [artLoaded, setArtLoaded] = createSignal(false)
  const [normalLoaded, setNormalLoaded] = createSignal(false)
  const [normalFailed, setNormalFailed] = createSignal(false)
  const [activeFace, setActiveFace] = createSignal<'front' | 'back'>('front')

  return (
    <div>
      <div
        class="rounded-xl overflow-hidden shadow-md aspect-[488/680] relative"
        style={{ background: CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS }}
      >
        <img
          src={artCropUrl(props.scryfallId)}
          alt=""
          onLoad={() => setArtLoaded(true)}
          class="absolute inset-0 w-full h-full object-cover"
          classList={{
            'opacity-0': !artLoaded() || normalLoaded(),
            'opacity-100': artLoaded() && !normalLoaded(),
          }}
          style="transition: opacity 300ms ease-in"
        />
        <img
          src={normalImageUrl(props.scryfallId, activeFace())}
          alt=""
          onLoad={() => setNormalLoaded(true)}
          onError={() => setNormalFailed(true)}
          class="absolute inset-0 w-full h-full object-contain"
          classList={{ 'opacity-0': !normalLoaded(), 'opacity-100': normalLoaded() }}
          style="transition: opacity 300ms ease-in"
        />
        <Show when={normalFailed() && !normalLoaded()}>
          <p class="absolute bottom-2 left-0 right-0 text-center text-xs text-white/70">
            Full card image unavailable
          </p>
        </Show>
      </div>
      <Show when={hasBackFace()}>
        <div class="flex justify-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              setActiveFace('front')
              setNormalLoaded(false)
              setNormalFailed(false)
              props.onFaceToggle?.('front')
            }}
            class={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${activeFace() === 'front' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFace('back')
              setNormalLoaded(false)
              setNormalFailed(false)
              props.onFaceToggle?.('back')
            }}
            class={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${activeFace() === 'back' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            Back
          </button>
        </div>
      </Show>
    </div>
  )
}

function FaceDetail(props: { d: DisplayColumns; fi: number }) {
  const pow = () => props.d.power_lookup[props.d.powers[props.fi]]
  const tou = () => props.d.toughness_lookup[props.d.toughnesses[props.fi]]
  const loy = () => props.d.loyalty_lookup[props.d.loyalties[props.fi]]
  const def = () => props.d.defense_lookup[props.d.defenses[props.fi]]

  return (
    <div>
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{props.d.names[props.fi]}</h3>
        <ManaCost cost={props.d.mana_costs[props.fi]} />
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400">{props.d.type_lines[props.fi]}</p>
      <Show when={props.d.oracle_texts[props.fi]}>
        <div class="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 relative">
          <OracleText text={props.d.oracle_texts[props.fi]} class="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap" />
          <Show when={pow() && tou()}>
            <p class="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right mt-1">
              {pow()}/{tou()}
            </p>
          </Show>
          <Show when={loy()}>
            <p class="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right mt-1">
              Loyalty: {loy()}
            </p>
          </Show>
          <Show when={def()}>
            <p class="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right mt-1">
              Defense: {def()}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function formatTagCount(cards?: number, prints?: number): string {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString())
  if (cards !== undefined) return `${fmt(cards)} cards`
  if (prints !== undefined) return `${fmt(prints)} prints`
  return ''
}

/** Spec 166: subtitle for all-prints chip; natural singular/plural. */
function allPrintsChipSubtitle(cards?: number, prints?: number): string | null {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString())
  if (cards !== undefined && prints !== undefined) {
    return `${fmt(cards)} card${cards === 1 ? '' : 's'} (${fmt(prints)} print${prints === 1 ? '' : 's'})`
  }
  if (cards !== undefined) return `${fmt(cards)} card${cards === 1 ? '' : 's'}`
  if (prints !== undefined) return `${fmt(prints)} print${prints === 1 ? '' : 's'}`
  return null
}

function AllPrintsQueryChip(props: {
  query: string
  cards?: number
  prints?: number
  onNavigate?: (q: string) => void
}) {
  const sub = () => allPrintsChipSubtitle(props.cards, props.prints)
  const chipBase =
    'inline-flex min-w-0 max-w-full flex-col rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors'
  const row1Class = () =>
    `flex w-full min-w-0 items-center justify-center px-2 py-2 ${sub() ? 'min-h-[2.25rem]' : 'flex-1'}`
  const querySpans = () => (
    <For each={buildSpans(props.query)}>
      {(span) =>
        span.role ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span> : <>{span.text}</>
      }
    </For>
  )
  return (
    <Show
      when={props.onNavigate}
      fallback={
        <span class={`${chipBase} min-h-[3.75rem]`}>
          <div class={row1Class()}>
            <span class="block w-full min-w-0 break-words text-center">{querySpans()}</span>
          </div>
          <Show when={sub()}>
            <div class="flex items-center justify-center px-1.5 pb-1 pt-0.5">
              <span class="text-[10px] tabular-nums opacity-60" title={sub()!}>
                {sub()!}
              </span>
            </div>
          </Show>
        </span>
      }
    >
      {(nav) => (
        <button
          type="button"
          class={`${chipBase} min-h-[3.75rem] cursor-pointer text-center`}
          onClick={() => {
            captureCardDetailInteracted({ control: 'all_prints' })
            nav()(props.query)
          }}
        >
          <div class={row1Class()}>
            <span class="block w-full min-w-0 break-words text-center">{querySpans()}</span>
          </div>
          <Show when={sub()}>
            <div class="flex items-center justify-center px-1.5 pb-1 pt-0.5">
              <span class="text-[10px] tabular-nums opacity-60" title={sub()!}>
                {sub()!}
              </span>
            </div>
          </Show>
        </button>
      )}
    </Show>
  )
}

const QUERY_CHIP_BASE =
  'inline-flex max-w-full min-w-0 gap-0.5 min-h-11 px-2 py-2 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors'

const QUERY_CHIP_ALIGN_CENTER = 'items-center justify-center'
const QUERY_CHIP_ALIGN_WRAP = 'items-center justify-center'

function QueryChip(props: {
  query: string
  field: string
  onNavigate?: (q: string) => void
  label?: string
  /** Replaces default highlighted query text (e.g. color identity: `ci:` + mana symbols). */
  customLabel?: any
  /** When true, label wraps instead of single-line ellipsis (e.g. Card name / Face name). */
  wrapLabel?: boolean
}) {
  const querySpans = () => (
    <For each={buildSpans(props.query)}>
      {(span) =>
        span.role ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span> : <>{span.text}</>
      }
    </For>
  )
  const outerClass = () =>
    `${QUERY_CHIP_BASE} ${props.wrapLabel ? QUERY_CHIP_ALIGN_WRAP : QUERY_CHIP_ALIGN_CENTER}`
  const defaultLabelClass = () =>
    props.wrapLabel
      ? 'min-w-0 w-full max-w-full text-center break-words whitespace-normal'
      : 'truncate min-w-0'
  return (
    <Show
      when={props.onNavigate}
      fallback={
        <span class={outerClass()}>
          <Show
            when={props.customLabel !== undefined}
            fallback={<span class={defaultLabelClass()}>{props.label ? props.label : querySpans()}</span>}
          >
            {props.customLabel}
          </Show>
        </span>
      }
    >
      {(nav) => (
        <button
          type="button"
          class={`${outerClass()} cursor-pointer ${props.wrapLabel ? 'text-center' : 'text-left'}`}
          onClick={() => {
            captureCardDetailInteracted({ control: 'query_chip', field: props.field, query: props.query })
            nav()(props.query)
          }}
        >
          <Show
            when={props.customLabel !== undefined}
            fallback={<span class={defaultLabelClass()}>{props.label ? props.label : querySpans()}</span>}
          >
            {props.customLabel}
          </Show>
        </button>
      )}
    </Show>
  )
}

function ManaQueryChip(props: {
  cost: string
  onNavigate?: (q: string) => void
}) {
  const compact = () => manaCostToCompactQuery(props.cost)
  const query = () => `m=${compact()}`
  const label = () => (
    <span class="inline-flex shrink-0 items-center gap-0.5">
      <span class={`shrink-0 ${ROLE_CLASSES.field}`}>m</span>
      <span class={ROLE_CLASSES.operator}>=</span>
      <ManaCost cost={props.cost} />
    </span>
  )
  return (
    <Show
      when={props.onNavigate}
      fallback={
        <span class={`${QUERY_CHIP_BASE} ${QUERY_CHIP_ALIGN_CENTER}`}>
          {label()}
        </span>
      }
    >
      {(nav) => (
        <button
          type="button"
          class={`${QUERY_CHIP_BASE} ${QUERY_CHIP_ALIGN_CENTER} cursor-pointer`}
          onClick={() => {
            captureCardDetailInteracted({ control: 'query_chip', field: 'mana', query: query() })
            nav()(query())
          }}
        >
          {label()}
        </button>
      )}
    </Show>
  )
}

function TagChip(props: {
  label: string
  prefix: 'otag' | 'atag'
  cards?: number
  prints?: number
  onNavigate?: (q: string) => void
}) {
  const query = () => `${props.prefix}:${props.label}`
  const countDisplay = () => formatTagCount(props.cards, props.prints)
  const chipBase =
    'inline-flex max-w-full flex-col min-w-0 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors'
  const querySpans = () => (
    <For each={buildSpans(query())}>
      {(span) =>
        span.role ? <span class={ROLE_CLASSES[span.role]}>{span.text}</span> : <>{span.text}</>
      }
    </For>
  )
  const countRow = () => (
    <div class="flex items-center justify-center px-1.5 pb-1 pt-0.5">
      <span class="text-[10px] tabular-nums opacity-60" title={countDisplay()}>
        {countDisplay()}
      </span>
    </div>
  )
  return (
    <Show
      when={props.onNavigate}
      fallback={
        <span class={chipBase}>
          <div class="flex min-h-[2.25rem] items-center px-2 pt-1 pb-0.5">
            <span class="block min-w-0 flex-1 truncate">{querySpans()}</span>
          </div>
          {countRow()}
        </span>
      }
    >
      {(nav) => (
        <button
          type="button"
          class={`${chipBase} cursor-pointer text-left`}
          onClick={() => {
            captureCardDetailInteracted(
              props.prefix === 'otag'
                ? { control: 'otag_nav', tag_label: props.label }
                : { control: 'atag_nav', tag_label: props.label },
            )
            nav()(query())
          }}
        >
          <div class="flex min-h-[2.25rem] items-center px-2 pt-1 pb-0.5">
            <span class="block min-w-0 flex-1 truncate">{querySpans()}</span>
          </div>
          {countRow()}
        </button>
      )}
    </Show>
  )
}

function LegalityGrid(props: { legalities: { legal: number; banned: number; restricted: number } }) {
  return (
    <div class="grid grid-cols-2 gap-1.5">
      <For each={FORMAT_DISPLAY}>
        {(fmt) => {
          const status = () => getStatus(fmt.bit, props.legalities)
          return (
            <div class={`flex items-center justify-between rounded-md px-2.5 py-1 text-xs ${STATUS_STYLES[status()]}`}>
              <span>{fmt.name}</span>
              <span class="font-medium">{STATUS_LABELS[status()]}</span>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function DetailRow(props: {
  label: string
  children: any
  chips?: any
}) {
  return (
    <div class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div>
        <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{props.label}</dt>
        <dd class="text-sm text-gray-700 dark:text-gray-200 mt-0.5">{props.children}</dd>
      </div>
      <Show when={props.chips}>
        <dd class="flex min-w-0 flex-wrap items-center gap-1 justify-end">{props.chips}</dd>
      </Show>
    </div>
  )
}

const CARD_DETAILS_DL_CLASS =
  'rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-1'

function CardDetailFaceFields(props: {
  d: Accessor<DisplayColumns>
  fi: number
  /** When true, **Color** (`c:`) is shown in the oracle / combined panel instead (Spec 183). */
  omitColor?: boolean
  onNavigateToQuery?: (q: string) => void
}) {
  const c = () => props.d()
  const fi = () => props.fi
  const manaCost = () => c().mana_costs[fi()]
  const typeTokens = () => tokenizeTypeLine(c().type_lines[fi()])
  const colorLetters = () => colorBitmaskToQueryLetters(c().colors[fi()])
  const pow = () => c().power_lookup[c().powers[fi()]]
  const tou = () => c().toughness_lookup[c().toughnesses[fi()]]
  const loy = () => c().loyalty_lookup[c().loyalties[fi()]]
  const def = () => c().defense_lookup[c().defenses[fi()]]

  return (
    <>
      <DetailRow
        label="Mana Cost"
        chips={
          <div class="flex flex-wrap gap-1 justify-end">
            {manaCost() ? (
              <ManaQueryChip cost={manaCost()} onNavigate={props.onNavigateToQuery} />
            ) : (
              <QueryChip query="m=null" field="mana" onNavigate={props.onNavigateToQuery} />
            )}
          </div>
        }
      >
        {manaCost() ? (
          <ManaCost cost={manaCost()} />
        ) : (
          <span class="italic text-gray-400 dark:text-gray-500">none</span>
        )}
      </DetailRow>

      <DetailRow
        label="Type"
        chips={
          typeTokens().length > 0 ? (
            <div class="flex flex-wrap gap-1 justify-end">
              <For each={typeTokens()}>
                {(token) => <QueryChip query={`t:${token}`} field="type" onNavigate={props.onNavigateToQuery} />}
              </For>
            </div>
          ) : undefined
        }
      >
        {c().type_lines[fi()]}
      </DetailRow>

      <Show when={!props.omitColor}>
        <DetailRow
          label="Color"
          chips={
            <QueryChip
              query={`c:${colorLetters()}`}
              field="color"
              onNavigate={props.onNavigateToQuery}
              customLabel={
                <span class="inline-flex max-w-full min-w-0 items-center gap-0.5">
                  <span class="shrink-0 text-blue-600 dark:text-blue-400">c:</span>
                  <ManaCost cost={colorIdentityMaskToManaCostString(c().colors[fi()])} />
                </span>
              }
            />
          }
        >
          <ManaCost cost={colorIdentityMaskToManaCostString(c().colors[fi()])} />
        </DetailRow>
      </Show>

      <Show when={pow() && tou()}>
        <DetailRow label="Power" chips={<QueryChip query={`pow=${pow()}`} field="power" onNavigate={props.onNavigateToQuery} />}>
          {pow()}
        </DetailRow>
        <DetailRow label="Toughness" chips={<QueryChip query={`tou=${tou()}`} field="toughness" onNavigate={props.onNavigateToQuery} />}>
          {tou()}
        </DetailRow>
      </Show>
      <Show when={loy()}>
        <DetailRow label="Loyalty" chips={<QueryChip query={`loy=${loy()}`} field="loyalty" onNavigate={props.onNavigateToQuery} />}>
          {loy()}
        </DetailRow>
      </Show>
      <Show when={def()}>
        <DetailRow label="Defense" chips={<QueryChip query={`def=${def()}`} field="defense" onNavigate={props.onNavigateToQuery} />}>
          {def()}
        </DetailRow>
      </Show>
    </>
  )
}

function OutlinkButton(props: {
  href: string
  destination: OutlinkDestination
  children: any
  affiliate?: boolean
}) {
  return (
    <Outlink
      href={props.href}
      class="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      onClick={() => captureCardDetailInteracted({ control: 'outlink', destination: props.destination })}
    >
      {props.children}
      {' ↗'}
      <Show when={props.affiliate}>
        <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-1">affiliate</span>
      </Show>
    </Outlink>
  )
}

function formatYmd(ymd: number): string {
  if (!ymd) return '\u2014'
  const y = Math.floor(ymd / 10000)
  const m = Math.floor((ymd % 10000) / 100)
  const d = ymd % 100
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function ymdYear(ymd: number): number {
  return Math.floor(ymd / 10000)
}

function ymdToDateQuery(ymd: number): string {
  const y = Math.floor(ymd / 10000)
  const m = Math.floor((ymd % 10000) / 100)
  const d = ymd % 100
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function edhrecCardUrl(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `https://edhrec.com/cards/${slug}`
}

function edhrecCommanderUrl(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `https://edhrec.com/commanders/${slug}`
}

export type CardDetailPercentiles = {
  edhrecPercentile: number | null
  saltPercentile: number | null
  usdPercentiles: (number | null)[]
}

export default function CardDetail(props: {
  canonicalIndex: number | undefined
  scryfallId: string
  display: DisplayColumns | null
  facesOf: Map<number, number[]>
  printingIndices?: number[]
  printingDisplay?: PrintingDisplayColumns | null
  otags?: { label: string; cards: number }[]
  atags?: { label: string; prints: number }[]
  onNavigateToQuery?: (q: string) => void
  /** Opens My List (deck editor). When set, help text links "your list" here. */
  onNavigateToMyList?: () => void
  cardListStore?: CardListStore
  listVersion?: number
  artistName?: string | null
  percentiles?: CardDetailPercentiles | null
}) {
  const ci = () => props.canonicalIndex
  const d = () => props.display
  const pis = () => props.printingIndices
  const pd = () => props.printingDisplay
  const primaryPI = () => {
    const indices = pis()
    return indices && indices.length > 0 ? indices[0] : undefined
  }
  const faces = () => {
    const idx = ci()
    return idx != null ? (props.facesOf.get(idx) ?? []) : []
  }
  const fullName = () => {
    const cols = d()
    return cols ? faces().map(fi => cols.names[fi]).join(' // ') : ''
  }
  const isMultiFace = () => faces().length > 1
  const imageScryfallId = () => {
    const pidx = primaryPI()
    const pcols = pd()
    if (pidx !== undefined && pcols) return pcols.scryfall_ids[pidx]
    return props.scryfallId
  }
  const allPrintsQuery = () => {
    const name = fullName()
    return name ? `!"${name}" unique:prints include:extras` : ''
  }
  const allPrintsCardCount = () => (ci() != null && d() ? 1 : undefined)
  const allPrintsPrintCount = () => {
    const cols = d()
    const idx = ci()
    const pcols = pd()
    if (cols != null && idx != null && pcols) {
      return countPrintingRowsForCanonicalFace(pcols, idx)
    }
    const p = pis()
    return p && p.length > 0 ? p.length : undefined
  }
  const pageScryfallUrl = () => `https://scryfall.com/card/${props.scryfallId}`

  return (
    <div class="mx-auto max-w-2xl px-4 pb-6 pt-0">
      {/* §0: In-body title and all-prints chip (Spec 166) */}
      <h1 class="mb-2 min-w-0 break-words text-center text-lg font-bold tracking-tight">{fullName()}</h1>
      <Show when={allPrintsQuery() && props.onNavigateToQuery}>
        <div class="mb-6 flex w-full min-w-0 justify-center">
          <AllPrintsQueryChip
            query={allPrintsQuery()}
            cards={allPrintsCardCount()}
            prints={allPrintsPrintCount()}
            onNavigate={props.onNavigateToQuery}
          />
        </div>
      </Show>

      <Show when={ci() != null && d()} fallback={
        <p class="text-center text-sm text-gray-400 dark:text-gray-600 pt-8">
          Card not found in current results.
        </p>
      }>
        {(cols) => {
          const idx = ci()!
          const legalities = () => ({
            legal: cols().legalities_legal[idx],
            banned: cols().legalities_banned[idx],
            restricted: cols().legalities_restricted[idx],
          })
          const oracleId = () => d()!.oracle_ids[faces()[0]]

          return (
            <>
              {/* §2: Oracle details — image + face blocks */}
              <div class="mb-6 max-w-xs mx-auto">
                <CardImage
                  scryfallId={imageScryfallId()}
                  colorIdentity={cols().color_identity[idx]}
                  layout={cols().layouts[idx]}
                  onFaceToggle={(face) => captureCardDetailInteracted({ control: 'face_toggle', face })}
                />
              </div>
              <div class="space-y-4 mb-8">
                <For each={faces()}>
                  {(fi) => <FaceDetail d={cols()} fi={fi} />}
                </For>
              </div>

              {/* §1: List actions */}
              <Show when={primaryPI() !== undefined && pd()}>
                {(pcols) => {
                  const pidx = primaryPI()!
                  const indices = pis()!
                  const nameCount = () => {
                    props.listVersion
                    const store = props.cardListStore
                    if (!store) return 0
                    const oid = oracleId()
                    if (!oid) return 0
                    return getMatchingCount(store.getView(), DEFAULT_LIST_ID, oid)
                  }

                  return (
                    <section class="mb-6">
                      <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        List Actions
                      </h2>
                      <p class="text-xs italic text-gray-600 dark:text-gray-400 mb-3">
                        {props.onNavigateToMyList ? (
                          <>
                            Add or remove this card from{' '}
                            <a
                              href="?list"
                              class="text-blue-600 dark:text-blue-400 underline hover:no-underline font-medium not-italic"
                              onClick={(e) => {
                                e.preventDefault()
                                props.onNavigateToMyList?.()
                              }}
                            >
                              your list
                            </a>
                            .
                          </>
                        ) : (
                          <>Add or remove this card from your list.</>
                        )}
                      </p>
                      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                        <Show when={props.cardListStore && oracleId()}>
                          <CardDetailListRow
                            rowClass="border-b border-gray-200 dark:border-gray-700"
                            count={nameCount()}
                            previewLine={() =>
                              moxfieldPreviewLine({
                                quantity: nameCount(),
                                oracleId: oracleId()!,
                                display: cols(),
                                printingDisplay: pcols(),
                              }) ?? ''
                            }
                            caption="This card (by name only)"
                            onAdd={() => {
                              const oid = oracleId()!
                              captureCardDetailInteracted({
                                control: 'list_add',
                                list_scope: 'oracle',
                                oracle_id: oid,
                                finish: 'nonfoil',
                              })
                              props.cardListStore!.addInstance(oid, DEFAULT_LIST_ID).catch(() => {})
                            }}
                            onRemove={() => {
                              const oid = oracleId()!
                              captureCardDetailInteracted({
                                control: 'list_remove',
                                list_scope: 'oracle',
                                oracle_id: oid,
                                finish: 'nonfoil',
                              })
                              props.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oid).catch(() => {})
                            }}
                            addLabel="Add card to list"
                            removeLabel="Remove from list"
                          />
                        </Show>
                        <Show when={indices.length === 1} fallback={
                          <For each={indices}>
                            {(pi) => {
                              const printingCount = () => {
                                props.listVersion
                                const store = props.cardListStore
                                if (!store) return 0
                                const oid = oracleId()
                                if (!oid) return 0
                                const scryfallId = pcols().scryfall_ids[pi]
                                const finish = FINISH_TO_STRING[pcols().finish[pi]] ?? 'nonfoil'
                                return getMatchingCount(store.getView(), DEFAULT_LIST_ID, oid, scryfallId, finish)
                              }
                              const printingCaption = () => {
                                const usd = pcols().price_usd[pi]
                                const pricePart = usd !== 0 ? formatPrice(usd) : PRICE_DATA_UNAVAILABLE
                                return `${FINISH_LABELS[pcols().finish[pi]] ?? 'Unknown'} printing — ${pricePart}`
                              }
                              return (
                                <CardDetailListRow
                                  rowClass="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                                  showSteppers={!!(props.cardListStore && oracleId())}
                                  count={printingCount()}
                                  previewLine={() =>
                                    moxfieldPreviewLine({
                                      quantity: printingCount(),
                                      oracleId: oracleId()!,
                                      display: cols(),
                                      printingDisplay: pcols(),
                                      scryfallId: pcols().scryfall_ids[pi],
                                      finish: FINISH_TO_STRING[pcols().finish[pi]] ?? 'nonfoil',
                                    }) ?? ''
                                  }
                                  caption={printingCaption()}
                                  onAdd={() => {
                                    const store = props.cardListStore!
                                    const oid = oracleId()
                                    const scryfallId = pcols().scryfall_ids[pi]
                                    const finish = (FINISH_TO_STRING[pcols().finish[pi]] ?? 'nonfoil') as CardDetailListFinish
                                    if (oid) {
                                      captureCardDetailInteracted({
                                        control: 'list_add',
                                        list_scope: 'printing',
                                        oracle_id: oid,
                                        finish,
                                        scryfall_id: scryfallId,
                                      })
                                    }
                                    if (oid) store.addInstance(oid, DEFAULT_LIST_ID, { scryfallId, finish }).catch(() => {})
                                  }}
                                  onRemove={() => {
                                    const store = props.cardListStore!
                                    const oid = oracleId()
                                    const scryfallId = pcols().scryfall_ids[pi]
                                    const finish = (FINISH_TO_STRING[pcols().finish[pi]] ?? 'nonfoil') as CardDetailListFinish
                                    if (oid) {
                                      captureCardDetailInteracted({
                                        control: 'list_remove',
                                        list_scope: 'printing',
                                        oracle_id: oid,
                                        finish,
                                        scryfall_id: scryfallId,
                                      })
                                    }
                                    if (oid) store.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oid, scryfallId, finish).catch(() => {})
                                  }}
                                  addLabel={`Add ${FINISH_LABELS[pcols().finish[pi]] ?? 'this'} printing to list`}
                                  removeLabel={`Remove ${FINISH_LABELS[pcols().finish[pi]] ?? 'this'} printing from list`}
                                />
                              )
                            }}
                          </For>
                        }>
                          {(() => {
                            const singlePrintingCount = () => {
                              props.listVersion
                              const store = props.cardListStore
                              if (!store) return 0
                              const oid = oracleId()
                              if (!oid) return 0
                              const scryfallId = pcols().scryfall_ids[pidx]
                              const finish = FINISH_TO_STRING[pcols().finish[pidx]] ?? 'nonfoil'
                              return getMatchingCount(store.getView(), DEFAULT_LIST_ID, oid, scryfallId, finish)
                            }
                            const singlePrintingCaption = () => {
                              const usd = pcols().price_usd[pidx]
                              const pricePart = usd !== 0 ? formatPrice(usd) : PRICE_DATA_UNAVAILABLE
                              return `${FINISH_LABELS[pcols().finish[pidx]] ?? 'Unknown'} printing — ${pricePart}`
                            }
                            return (
                              <CardDetailListRow
                                showSteppers={!!(props.cardListStore && oracleId())}
                                count={singlePrintingCount()}
                                previewLine={() =>
                                  moxfieldPreviewLine({
                                    quantity: singlePrintingCount(),
                                    oracleId: oracleId()!,
                                    display: cols(),
                                    printingDisplay: pcols(),
                                    scryfallId: pcols().scryfall_ids[pidx],
                                    finish: FINISH_TO_STRING[pcols().finish[pidx]] ?? 'nonfoil',
                                  }) ?? ''
                                }
                                caption={singlePrintingCaption()}
                                onAdd={() => {
                                  const store = props.cardListStore!
                                  const oid = oracleId()
                                  const scryfallId = pcols().scryfall_ids[pidx]
                                  const finish = (FINISH_TO_STRING[pcols().finish[pidx]] ?? 'nonfoil') as CardDetailListFinish
                                  if (oid) {
                                    captureCardDetailInteracted({
                                      control: 'list_add',
                                      list_scope: 'printing',
                                      oracle_id: oid,
                                      finish,
                                      scryfall_id: scryfallId,
                                    })
                                  }
                                  if (oid) store.addInstance(oid, DEFAULT_LIST_ID, { scryfallId, finish }).catch(() => {})
                                }}
                                onRemove={() => {
                                  const store = props.cardListStore!
                                  const oid = oracleId()
                                  const scryfallId = pcols().scryfall_ids[pidx]
                                  const finish = (FINISH_TO_STRING[pcols().finish[pidx]] ?? 'nonfoil') as CardDetailListFinish
                                  if (oid) {
                                    captureCardDetailInteracted({
                                      control: 'list_remove',
                                      list_scope: 'printing',
                                      oracle_id: oid,
                                      finish,
                                      scryfall_id: scryfallId,
                                    })
                                  }
                                  if (oid) store.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oid, scryfallId, finish).catch(() => {})
                                }}
                                addLabel="Add this printing to list"
                                removeLabel="Remove this printing from list"
                              />
                            )
                          })()}
                        </Show>
                      </div>
                    </section>
                  )
                }}
              </Show>

              {/* §3: Card details — query chip tables */}
              <section class="mb-6">
                <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Card Details</h2>
                <div class="flex flex-col gap-3">
                  <dl class={CARD_DETAILS_DL_CLASS}>
                  <Show when={isMultiFace()}>
                    <DetailRow
                      label="Card name"
                      chips={
                        <QueryChip
                          query={`!"${fullName()}"`}
                          field="name"
                          onNavigate={props.onNavigateToQuery}
                          wrapLabel
                        />
                      }
                    >
                      {fullName()}
                    </DetailRow>
                  </Show>
                  <Show when={!isMultiFace() && faces().length > 0}>
                    <DetailRow
                      label="Card name"
                      chips={
                        <QueryChip
                          query={`!"${cols().names[faces()[0]]}"`}
                          field="name"
                          onNavigate={props.onNavigateToQuery}
                          wrapLabel
                        />
                      }
                    >
                      {cols().names[faces()[0]]}
                    </DetailRow>
                  </Show>

                  {/* Color identity (always at oracle scope) */}
                  <DetailRow
                    label="Color Identity"
                    chips={
                      <QueryChip
                        query={`ci:${colorBitmaskToQueryLetters(cols().color_identity[idx])}`}
                        field="identity"
                        onNavigate={props.onNavigateToQuery}
                        customLabel={
                          <span class="inline-flex max-w-full min-w-0 items-center gap-0.5">
                            <span class="shrink-0 text-blue-600 dark:text-blue-400">ci:</span>
                            <ManaCost cost={colorIdentityMaskToManaCostString(cols().color_identity[idx])} />
                          </span>
                        }
                      />
                    }
                  >
                    <ManaCost cost={colorIdentityMaskToManaCostString(cols().color_identity[idx])} />
                  </DetailRow>

                  {/* EDHREC rank */}
                  {(() => {
                    const r = cols().edhrec_rank[faces()[0]]
                    const pct = props.percentiles?.edhrecPercentile
                    return (
                      <DetailRow
                        label="EDHREC Rank"
                        chips={
                          r != null ? (
                            <div class="flex flex-wrap gap-1 justify-end">
                              <QueryChip query={`edhrec=${r}`} field="edhrec" onNavigate={props.onNavigateToQuery} />
                              <Show when={pct != null}>
                                <QueryChip query={`edhrec=${pct}%`} field="edhrec" onNavigate={props.onNavigateToQuery} />
                              </Show>
                            </div>
                          ) : (
                            <div class="flex flex-wrap gap-1 justify-end">
                              <QueryChip query="edhrec=null" field="edhrec" onNavigate={props.onNavigateToQuery} />
                            </div>
                          )
                        }
                      >
                        {r != null ? `#${r}` : 'Not ranked'}
                      </DetailRow>
                    )
                  })()}

                  {/* EDHREC salt */}
                  {(() => {
                    const s = cols().edhrec_salt[faces()[0]]
                    const pct = props.percentiles?.saltPercentile
                    return (
                      <DetailRow
                        label="EDHREC Salt"
                        chips={
                          s != null ? (
                            <div class="flex flex-wrap gap-1 justify-end">
                              <QueryChip query={`salt=${s}`} field="salt" onNavigate={props.onNavigateToQuery} />
                              <Show when={pct != null}>
                                <QueryChip query={`salt=${pct}%`} field="salt" onNavigate={props.onNavigateToQuery} />
                              </Show>
                            </div>
                          ) : (
                            <div class="flex flex-wrap gap-1 justify-end">
                              <QueryChip query="salt=null" field="salt" onNavigate={props.onNavigateToQuery} />
                            </div>
                          )
                        }
                      >
                        {s != null ? String(s) : 'Not rated'}
                      </DetailRow>
                    )
                  })()}

                  {/* Keywords (always shown per spec) */}
                  {(() => {
                    const kws = cols().keywords_for_face[faces()[0]] ?? []
                    return (
                      <DetailRow
                        label="Keywords"
                        chips={
                          kws.length > 0 ? (
                            <div class="flex flex-wrap gap-1 justify-end">
                              <For each={kws}>
                                {(kw) => (
                                  <QueryChip
                                    query={keywordAbilityToKwChipQuery(kw)}
                                    field="keyword"
                                    onNavigate={props.onNavigateToQuery}
                                  />
                                )}
                              </For>
                            </div>
                          ) : undefined
                        }
                      >
                        {kws.length > 0 ? kws.join(', ') : <span class="italic text-gray-400 dark:text-gray-500">none</span>}
                      </DetailRow>
                    )
                  })()}

                  <Show when={isMultiFace() && faceColorMasksUniform(cols().colors, faces())}>
                    <DetailRow
                      label="Color"
                      chips={
                        <QueryChip
                          query={`c:${colorBitmaskToQueryLetters(cols().colors[faces()[0]!])}`}
                          field="color"
                          onNavigate={props.onNavigateToQuery}
                          customLabel={
                            <span class="inline-flex max-w-full min-w-0 items-center gap-0.5">
                              <span class="shrink-0 text-blue-600 dark:text-blue-400">c:</span>
                              <ManaCost cost={colorIdentityMaskToManaCostString(cols().colors[faces()[0]!])} />
                            </span>
                          }
                        />
                      }
                    >
                      <ManaCost cost={colorIdentityMaskToManaCostString(cols().colors[faces()[0]!])} />
                    </DetailRow>
                  </Show>

                  <Show when={!isMultiFace() && faces().length > 0}>
                    <CardDetailFaceFields d={cols} fi={faces()[0]} onNavigateToQuery={props.onNavigateToQuery} />
                  </Show>
                  </dl>

                  <Show when={isMultiFace()}>
                    <For each={faces()}>
                      {(fi) => (
                        <dl class={CARD_DETAILS_DL_CLASS}>
                          <DetailRow
                            label="Face name"
                            chips={
                              <QueryChip
                                query={`!"${cols().names[fi]}"`}
                                field="name"
                                onNavigate={props.onNavigateToQuery}
                                wrapLabel
                              />
                            }
                          >
                            {cols().names[fi]}
                          </DetailRow>
                          <CardDetailFaceFields
                            d={cols}
                            fi={fi}
                            omitColor={faceColorMasksUniform(cols().colors, faces())}
                            onNavigateToQuery={props.onNavigateToQuery}
                          />
                        </dl>
                      )}
                    </For>
                  </Show>
                </div>
              </section>

              {/* §4: Printing details */}
              <Show when={primaryPI() !== undefined && pd()}>
                {(pcols) => {
                  const pidx = primaryPI()!
                  const indices = pis()!
                  const setCode = () => pcols().set_codes[pidx]
                  const setType = () => pcols().set_types[pidx]
                  const releasedAt = () => pcols().released_at[pidx]
                  const rarityBit = () => pcols().rarity[pidx]
                  const rarityQuery = () => RARITY_TO_QUERY[rarityBit()] ?? 'common'

                  return (
                    <section class="mb-6">
                      <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Printing Details</h2>
                      <dl class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-1">
                        <DetailRow
                          label="Set"
                          chips={<QueryChip query={`set:${setCode()}`} field="set" onNavigate={props.onNavigateToQuery} />}
                        >
                          {pcols().set_names[pidx]} <span class="uppercase font-mono text-gray-500 dark:text-gray-400">({setCode()})</span>
                        </DetailRow>

                        <Show when={setType()}>
                          <DetailRow
                            label="Set Type"
                            chips={<QueryChip query={`st:${setType()}`} field="set_type" onNavigate={props.onNavigateToQuery} />}
                          >
                            {setType()}
                          </DetailRow>
                        </Show>

                        <Show when={releasedAt()}>
                          <DetailRow
                            label="Released"
                            chips={
                              <div class="flex flex-wrap gap-1 justify-end">
                                <QueryChip query={`year=${ymdYear(releasedAt())}`} field="year" onNavigate={props.onNavigateToQuery} />
                                <QueryChip query={`date=${ymdToDateQuery(releasedAt())}`} field="date" onNavigate={props.onNavigateToQuery} />
                              </div>
                            }
                          >
                            {formatYmd(releasedAt())}
                          </DetailRow>
                        </Show>

                        <DetailRow
                          label="Collector #"
                          chips={<QueryChip query={`cn:${pcols().collector_numbers[pidx]}`} field="collector_number" onNavigate={props.onNavigateToQuery} />}
                        >
                          {pcols().collector_numbers[pidx]}
                        </DetailRow>

                        <DetailRow
                          label="Rarity"
                          chips={<QueryChip query={`r:${rarityQuery()}`} field="rarity" onNavigate={props.onNavigateToQuery} />}
                        >
                          {RARITY_LABELS[rarityBit()] ?? 'Unknown'}
                        </DetailRow>

                        {/* Price rows per finish */}
                        <Show when={indices.length === 1} fallback={
                          <For each={indices}>
                            {(pi, piIdx) => {
                              const price = () => pcols().price_usd[pi]
                              const pctIdx = piIdx()
                              const pct = () => props.percentiles?.usdPercentiles[pctIdx] ?? null
                              return (
                                <DetailRow
                                  label={`${FINISH_LABELS[pcols().finish[pi]] ?? 'Unknown'} Price`}
                                  chips={
                                    price() !== 0 ? (
                                      <div class="flex flex-wrap gap-1 justify-end">
                                        <QueryChip query={`$=${(price() / 100).toFixed(2)}`} field="usd" onNavigate={props.onNavigateToQuery} />
                                        <Show when={pct() != null}>
                                          <QueryChip query={`$=${pct()}%`} field="usd" onNavigate={props.onNavigateToQuery} />
                                        </Show>
                                      </div>
                                    ) : (
                                      <div class="flex flex-wrap gap-1 justify-end">
                                        <QueryChip query="$=null" field="usd" onNavigate={props.onNavigateToQuery} />
                                      </div>
                                    )
                                  }
                                >
                                  {formatPrice(price())}
                                </DetailRow>
                              )
                            }}
                          </For>
                        }>
                          {(() => {
                            const price = () => pcols().price_usd[pidx]
                            const pct = () => props.percentiles?.usdPercentiles[0] ?? null
                            return (
                              <DetailRow
                                label="Price"
                                chips={
                                  price() !== 0 ? (
                                    <div class="flex flex-wrap gap-1 justify-end">
                                      <QueryChip query={`$=${(price() / 100).toFixed(2)}`} field="usd" onNavigate={props.onNavigateToQuery} />
                                      <Show when={pct() != null}>
                                        <QueryChip query={`$=${pct()}%`} field="usd" onNavigate={props.onNavigateToQuery} />
                                      </Show>
                                    </div>
                                  ) : (
                                    <div class="flex flex-wrap gap-1 justify-end">
                                      <QueryChip query="$=null" field="usd" onNavigate={props.onNavigateToQuery} />
                                    </div>
                                  )
                                }
                              >
                                {formatPrice(price())}
                              </DetailRow>
                            )
                          })()}
                        </Show>

                        <Show when={props.artistName}>
                          <DetailRow
                            label="Illustrated by"
                            chips={<QueryChip query={`a:"${props.artistName}"`} field="artist" onNavigate={props.onNavigateToQuery} />}
                          >
                            {props.artistName}
                          </DetailRow>
                        </Show>
                      </dl>
                    </section>
                  )
                }}
              </Show>

              {/* §5: Outlinks */}
              <section class="mb-8">
                <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">External Links</h2>
                <div class="flex flex-wrap gap-2">
                  <OutlinkButton href={pageScryfallUrl()} destination="scryfall_card">
                    Scryfall
                  </OutlinkButton>
                  <Show when={fullName()}>
                    <Show when={faces().some((fi) => cols().is_commander[fi])}>
                      <OutlinkButton href={edhrecCommanderUrl(fullName())} destination="edhrec_commander">
                        EDHREC (commander)
                      </OutlinkButton>
                    </Show>
                    <OutlinkButton href={edhrecCardUrl(fullName())} destination="edhrec_card">
                      EDHREC (card)
                    </OutlinkButton>
                  </Show>
                  <OutlinkButton
                    href={(() => {
                      const name = fullName()
                      const pcols = pd()
                      const pidx = primaryPI()
                      if (!name) return buildManapoolCardOrSearchUrl({ cardNameForSearch: '' })
                      if (pcols == null || pidx === undefined) {
                        return buildManapoolCardOrSearchUrl({ cardNameForSearch: name })
                      }
                      return buildManapoolCardOrSearchUrl({
                        cardNameForSearch: name,
                        setCode: pcols.set_codes[pidx],
                        collectorNumber: pcols.collector_numbers[pidx],
                        cardNameForSlug: name,
                      })
                    })()}
                    destination="manapool"
                    affiliate
                  >
                    Mana Pool
                  </OutlinkButton>
                  <OutlinkButton
                    href={(() => {
                      const name = fullName()
                      const searchUrl = `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(name)}`
                      if (!name) return searchUrl
                      const pcols = pd()
                      const pidx = primaryPI()
                      if (pcols == null || pidx === undefined) return searchUrl
                      const pid = pcols.tcgplayer_product_ids?.[pidx] ?? 0
                      const productUrl = buildTcgplayerProductPageUrl(pid)
                      if (!productUrl) return searchUrl
                      return buildTcgplayerPartnerUrl(productUrl, 'card-detail-page') ?? productUrl
                    })()}
                    destination="tcgplayer"
                    affiliate
                  >
                    TCGPlayer
                  </OutlinkButton>
                </div>
              </section>

              {/* §6: Format legality */}
              <section>
                <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Format Legality</h2>
                <LegalityGrid legalities={legalities()} />
              </section>

              {/* §7: Function tags (otags) */}
              <Show when={(props.otags?.length ?? 0) > 0}>
                <section class="mt-6">
                  <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Function Tags</h2>
                  <div class="flex flex-wrap gap-1.5 content-start">
                    <For each={props.otags ?? []}>
                      {(item) => (
                        <TagChip label={item.label} prefix="otag" cards={item.cards} onNavigate={props.onNavigateToQuery} />
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              {/* §8: Illustration tags (atags) */}
              <Show when={(props.atags?.length ?? 0) > 0}>
                <section class="mt-6">
                  <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Illustration Tags</h2>
                  <div class="flex flex-wrap gap-1.5 content-start">
                    <For each={props.atags ?? []}>
                      {(item) => (
                        <TagChip label={item.label} prefix="atag" prints={item.prints} onNavigate={props.onNavigateToQuery} />
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            </>
          )
        }}
      </Show>
    </div>
  )
}
