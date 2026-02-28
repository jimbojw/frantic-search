// SPDX-License-Identifier: Apache-2.0
import { createSignal, For, Show } from 'solid-js'
import type { DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'
import { Format } from '@frantic-search/shared'
import { ManaCost, OracleText } from './card-symbols'
import { artCropUrl, normalImageUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'
import { RARITY_LABELS, FINISH_LABELS, formatPrice } from './app-utils'

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

const DOUBLE_SIDED_LAYOUTS = new Set(['transform', 'modal_dfc'])

function CardImage(props: { scryfallId: string; colorIdentity: number; layout: string }) {
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
            onClick={() => { setActiveFace('front'); setNormalLoaded(false); setNormalFailed(false) }}
            class={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${activeFace() === 'front' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => { setActiveFace('back'); setNormalLoaded(false); setNormalFailed(false) }}
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

export default function CardDetail(props: {
  canonicalIndex: number | undefined
  scryfallId: string
  display: DisplayColumns | null
  facesOf: Map<number, number[]>
  printingIndices?: number[]
  printingDisplay?: PrintingDisplayColumns | null
  onNavigateToQuery?: (q: string) => void
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
  const imageScryfallId = () => {
    const pidx = primaryPI()
    const pcols = pd()
    if (pidx !== undefined && pcols) return pcols.scryfall_ids[pidx]
    return props.scryfallId
  }
  const scryfallUrl = () => `https://scryfall.com/card/${props.scryfallId}`
  const allPrintsQuery = () => {
    const name = fullName()
    return name ? `!"${name}" unique:prints` : ''
  }

  return (
    <div class="mx-auto max-w-2xl px-4 py-6">
      <div class="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => history.back()}
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 -ml-1"
          aria-label="Back to search results"
        >
          <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 class="text-lg font-bold tracking-tight truncate mx-4">{fullName()}</h1>
        <a
          href={scryfallUrl()}
          target="_blank"
          rel="noopener noreferrer"
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 shrink-0"
          aria-label="View on Scryfall"
        >
          <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>
      <Show when={allPrintsQuery() && props.onNavigateToQuery}>
        <div class="flex justify-center mb-6">
          <button
            type="button"
            onClick={() => props.onNavigateToQuery!(allPrintsQuery())}
            class="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          >
            All prints &rarr;
          </button>
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
          return (
            <>
              <div class="mb-6 max-w-xs mx-auto">
                <CardImage
                  scryfallId={imageScryfallId()}
                  colorIdentity={cols().color_identity[idx]}
                  layout={cols().layouts[idx]}
                />
              </div>

              <Show when={primaryPI() !== undefined && pd()}>
                {(pcols) => {
                  const pidx = primaryPI()!
                  const indices = pis()!
                  const slackBotName = () => {
                    const name = fullName()
                    const set = pcols().set_codes[pidx].toUpperCase()
                    const num = pcols().collector_numbers[pidx]
                    return `[[${name}|${set}|${num}]]`
                  }
                  const [copied, setCopied] = createSignal(false)
                  const copySlackName = () => {
                    navigator.clipboard.writeText(slackBotName()).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                  }
                  return (
                    <div class="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        <dt class="font-medium text-gray-600 dark:text-gray-300">Set</dt>
                        <dd class="text-gray-700 dark:text-gray-200">
                          <Show when={props.onNavigateToQuery} fallback={
                            <>{pcols().set_names[pidx]} <span class="uppercase font-mono text-gray-500 dark:text-gray-400">({pcols().set_codes[pidx]})</span></>
                          }>
                            <button
                              type="button"
                              onClick={() => props.onNavigateToQuery!(`s:${pcols().set_codes[pidx]} unique:prints`)}
                              class="hover:text-blue-500 dark:hover:text-blue-400 transition-colors text-left"
                            >
                              {pcols().set_names[pidx]} <span class="uppercase font-mono text-gray-500 dark:text-gray-400">({pcols().set_codes[pidx]})</span>
                            </button>
                          </Show>
                        </dd>
                        <dt class="font-medium text-gray-600 dark:text-gray-300">Collector #</dt>
                        <dd class="text-gray-700 dark:text-gray-200">{pcols().collector_numbers[pidx]}</dd>
                        <dt class="font-medium text-gray-600 dark:text-gray-300">Rarity</dt>
                        <dd class="text-gray-700 dark:text-gray-200">{RARITY_LABELS[pcols().rarity[pidx]] ?? 'Unknown'}</dd>
                        <Show when={indices.length === 1} fallback={
                          <For each={indices}>
                            {(pi) => (<>
                              <dt class="font-medium text-gray-600 dark:text-gray-300">
                                {FINISH_LABELS[pcols().finish[pi]] ?? 'Unknown'} Price
                              </dt>
                              <dd class="text-gray-700 dark:text-gray-200">{formatPrice(pcols().price_usd[pi])}</dd>
                            </>)}
                          </For>
                        }>
                          <dt class="font-medium text-gray-600 dark:text-gray-300">Finish</dt>
                          <dd class="text-gray-700 dark:text-gray-200">{FINISH_LABELS[pcols().finish[pidx]] ?? 'Unknown'}</dd>
                          <dt class="font-medium text-gray-600 dark:text-gray-300">Price</dt>
                          <dd class="text-gray-700 dark:text-gray-200">{formatPrice(pcols().price_usd[pidx])}</dd>
                        </Show>
                      </dl>
                      <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <code class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{slackBotName()}</code>
                        <button
                          type="button"
                          onClick={copySlackName}
                          class="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5"
                          aria-label="Copy Slack bot reference"
                        >
                          <Show when={copied()} fallback={
                            <svg class="size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                            </svg>
                          }>
                            <svg class="size-3.5 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          </Show>
                        </button>
                      </div>
                    </div>
                  )
                }}
              </Show>

              <div class="space-y-4 mb-8">
                <For each={faces()}>
                  {(fi) => <FaceDetail d={cols()} fi={fi} />}
                </For>
              </div>

              <section>
                <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Format Legality</h2>
                <LegalityGrid legalities={legalities()} />
              </section>
            </>
          )
        }}
      </Show>
    </div>
  )
}
