// SPDX-License-Identifier: Apache-2.0
import { For, Show, onCleanup } from 'solid-js'
import { Finish } from '@frantic-search/shared'
import ResultsBreakdown, { MV_BAR_COLOR, TYPE_BAR_COLOR } from './ResultsBreakdown'
import SparkBars from './SparkBars'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'
import ArtCrop from './ArtCrop'
import CopyButton from './CopyButton'
import CardImage from './CardImage'
import CardFaceRow from './CardFaceRow'
import { RARITY_LABELS, FINISH_LABELS, formatPrice, fullCardName } from './app-utils'
import { useSearchContext } from './SearchContext'
import { IconBug } from './Icons'
import { HighlightedLabel } from './InlineBreakdown'

declare const __REPO_URL__: string
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

export default function SearchResults() {
  const ctx = useSearchContext()
  const d = () => ctx.display()

  return (
    <Show when={ctx.query().trim()} fallback={
      <div class="pt-4 text-center">
        <p class="text-sm text-gray-400 dark:text-gray-600">
          Type a query to search
        </p>
        <p class="mt-3 text-xs flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <a
            href={__REPO_URL__}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <svg class="size-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Source on GitHub
          </a>
          <button
            type="button"
            onClick={() => ctx.navigateToReport()}
            class="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <IconBug />
            Report a problem
          </button>
        </p>
        <p class="mt-1 text-[10px] font-mono text-gray-400 dark:text-gray-600">
          {__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      </div>
    }>
      <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <Show when={ctx.histograms()}>
          {(h) => (<>
            <div
              onClick={() => ctx.toggleHistograms()}
              class="flex items-center gap-3 px-3 py-1 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <Show when={ctx.histogramsExpanded()} fallback={
                <>
                  <svg class="size-2.5 shrink-0 fill-current text-gray-500 dark:text-gray-400 transition-transform duration-150" viewBox="0 0 24 24">
                    <path d="M8 5l8 7-8 7z" />
                  </svg>
                  <div class="grid grid-cols-3 gap-4 flex-1 min-w-0 pr-3">
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">mv:</span>
                      <SparkBars counts={h().manaValue} colors={MV_BAR_COLOR} />
                    </div>
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">ci:</span>
                      <SparkBars counts={h().colorIdentity} colors={[CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS[31]]} />
                    </div>
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="font-mono text-[10px] text-gray-400 dark:text-gray-500 shrink-0 w-[3em] text-right">t:</span>
                      <SparkBars counts={h().cardType} colors={TYPE_BAR_COLOR} />
                    </div>
                  </div>
                </>
              }>
                <div class="hidden md:grid grid-cols-3 gap-4 flex-1">
                  <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Mana Value</p>
                  <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Color Identity</p>
                  <p class="font-mono text-[10px] text-gray-400 dark:text-gray-500 pl-[1.5em]">Card Type</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); ctx.toggleHistograms() }}
                  class="hidden md:flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  aria-label="Collapse histograms"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Show>
            </div>
            <div
              class="grid transition-[grid-template-rows] duration-150 ease-out"
              style={{ 'grid-template-rows': ctx.histogramsExpanded() ? '1fr' : '0fr' }}
            >
              <div class="overflow-hidden">
                <ResultsBreakdown
                  histograms={h()}
                  query={ctx.query()}
                  onSetQuery={(q) => { ctx.flushPendingCommit(); ctx.setQuery(q) }}
                  onClose={() => ctx.toggleHistograms()}
                />
              </div>
            </div>
          </>)}
        </Show>
        <Show when={ctx.hasPrintingConditions() && !ctx.printingDisplay()}>
          <p class="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800/50">
            Printing data loading — set, rarity, and price filters are not yet available.
          </p>
        </Show>
        <Show when={ctx.totalCards() > 0} fallback={
          <div class="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800">
            <p>No cards found</p>
            <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400 dark:text-gray-600">
              <a
                href={ctx.scryfallUrl()}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              >
                Try on Scryfall ↗
              </a>
              <button
                type="button"
                onClick={() => ctx.navigateToReport()}
                class="hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              >
                Report a problem
              </button>
            </p>
            <Show when={ctx.indicesIncludingExtras()}>
              {(extrasCount) => {
                const pExtras = ctx.printingIndicesIncludingExtras()
                const showPrintings = () => pExtras !== undefined && (ctx.uniqueMode() !== 'cards' || ctx.hasPrintingConditions())
                return (
                  <p class="mt-1">
                    Try again with{' '}
                    <button
                      type="button"
                      onClick={() => ctx.setQuery(ctx.appendTerm(ctx.query(), 'include:extras', ctx.parseBreakdown(ctx.query())))}
                      class="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 px-2 py-2 md:py-0.5 rounded text-xs font-mono cursor-pointer transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      <HighlightedLabel label="include:extras" />
                    </button>
                    {' '}({extrasCount()} {extrasCount() === 1 ? 'card' : 'cards'}
                    <Show when={showPrintings()}>
                      , {pExtras} {pExtras === 1 ? 'printing' : 'printings'}
                    </Show>)?
                  </p>
                )
              }}
            </Show>
          </div>
        }>
          <Show when={ctx.viewMode() === 'images'} fallback={
            <ul class="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
              <Show when={ctx.printingExpanded() && ctx.visibleDisplayItems()} fallback={
                <For each={ctx.visibleIndices()}>
                  {(ci) => {
                    const faces = () => ctx.facesOf().get(ci) ?? []
                    const name = () => fullCardName(d()!, faces())
                    const pi = () => ctx.firstPrintingForCard().get(ci)
                    const pdc = () => ctx.printingDisplay()
                    const artScryfallId = () => {
                      const idx = pi()
                      const pd = pdc()
                      return idx !== undefined && pd ? pd.scryfall_ids[idx] : d()!.scryfall_ids[ci]
                    }
                    const setBadge = () => {
                      if (!ctx.hasPrintingConditions() && ctx.uniqueMode() === 'cards') return null
                      const idx = pi()
                      const pd = pdc()
                      if (idx === undefined || !pd) return null
                      return pd.set_codes[idx]
                    }
                    return (
                      <Show when={ctx.viewMode() === 'full'} fallback={
                        <li class="group px-4 py-2 text-sm flex items-start gap-3">
                          <ArtCrop
                            scryfallId={artScryfallId()}
                            colorIdentity={d()!.color_identity[ci]}
                            thumbHash={d()!.art_crop_thumb_hashes[ci]}
                          />
                          <div class="min-w-0 flex-1">
                            <Show when={faces().length > 1} fallback={
                              <>
                                <CardFaceRow d={d()!} fi={faces()[0]} fullName={name()} showOracle={ctx.showOracleText()} onCardClick={() => ctx.navigateToCard(artScryfallId())} setBadge={setBadge()} />
                              </>
                            }>
                              <div class="flex items-center gap-1.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => ctx.navigateToCard(artScryfallId())}
                                  class={`font-medium hover:underline text-left min-w-0 ${ctx.showOracleText() ? 'whitespace-normal break-words' : 'truncate'}`}
                                >
                                  {name()}
                                </button>
                                <Show when={setBadge()}>
                                  {(code) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{code()}</span>}
                                </Show>
                                <CopyButton text={name()} />
                              </div>
                              <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                <For each={faces()}>
                                  {(fi) => <CardFaceRow d={d()!} fi={fi} showOracle={ctx.showOracleText()} />}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </li>
                      }>
                        <li class="group px-4 py-3 text-sm">
                          <div class="flex flex-col min-[600px]:flex-row items-start gap-4">
                            <CardImage
                              scryfallId={artScryfallId()}
                              colorIdentity={d()!.color_identity[ci]}
                              thumbHash={d()!.card_thumb_hashes[ci]}
                              class="w-[336px] max-w-full shrink-0 cursor-pointer rounded-lg"
                              onClick={() => ctx.navigateToCard(artScryfallId())}
                            />
                            <div class="min-w-0 flex-1 w-full">
                              <Show when={faces().length > 1} fallback={
                                <CardFaceRow d={d()!} fi={faces()[0]} fullName={name()} showOracle={true} onCardClick={() => ctx.navigateToCard(artScryfallId())} setBadge={setBadge()} />
                              }>
                                <div class="flex items-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => ctx.navigateToCard(artScryfallId())}
                                    class="font-medium hover:underline text-left min-w-0 whitespace-normal break-words"
                                  >
                                    {name()}
                                  </button>
                                  <Show when={setBadge()}>
                                    {(code) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{code()}</span>}
                                  </Show>
                                  <CopyButton text={name()} />
                                </div>
                                <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                  <For each={faces()}>
                                    {(fi) => <CardFaceRow d={d()!} fi={fi} showOracle={true} />}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </li>
                      </Show>
                    )
                  }}
                </For>
              }>
                {(printItems) => {
                  const pd = ctx.printingDisplay()!
                  return (
                    <For each={printItems()}>
                      {(pi) => {
                        const ci = pd.canonical_face_ref[pi]
                        const faces = () => ctx.facesOf().get(ci) ?? []
                        const name = () => fullCardName(d()!, faces())
                        const isFoil = pd.finish[pi] === Finish.Foil
                        const isEtched = pd.finish[pi] === Finish.Etched
                        const overlayClass = () => ctx.uniqueMode() === 'prints' && isFoil ? 'foil-overlay ' : ctx.uniqueMode() === 'prints' && isEtched ? 'etched-overlay ' : ''
                        return (
                          <li class="group px-4 py-3 text-sm">
                            <div class="flex flex-col min-[600px]:flex-row items-start gap-4">
                              <div class={`${overlayClass()}w-[336px] max-w-full shrink-0 rounded-lg`}>
                                <CardImage
                                  scryfallId={pd.scryfall_ids[pi]}
                                  colorIdentity={d()!.color_identity[ci]}
                                  thumbHash={d()!.card_thumb_hashes[ci]}
                                  class="cursor-pointer rounded-lg"
                                  onClick={() => ctx.navigateToCard(pd.scryfall_ids[pi])}
                                />
                              </div>
                              <div class="min-w-0 flex-1 w-full">
                                <Show when={faces().length > 1} fallback={
                                  <CardFaceRow d={d()!} fi={faces()[0]} fullName={name()} showOracle={true} onCardClick={() => ctx.navigateToCard(pd.scryfall_ids[pi])} />
                                }>
                                  <div class="flex items-center gap-1.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => ctx.navigateToCard(pd.scryfall_ids[pi])}
                                      class="font-medium hover:underline text-left min-w-0 whitespace-normal break-words"
                                    >
                                      {name()}
                                    </button>
                                    <CopyButton text={name()} />
                                  </div>
                                  <div class="mt-1 space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                    <For each={faces()}>
                                      {(fi) => <CardFaceRow d={d()!} fi={fi} showOracle={true} />}
                                    </For>
                                  </div>
                                </Show>
                                <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                  <dt class="font-medium text-gray-600 dark:text-gray-300">Set</dt>
                                  <dd>{pd.set_names[pi]} <span class="uppercase font-mono">({pd.set_codes[pi]})</span></dd>
                                  <dt class="font-medium text-gray-600 dark:text-gray-300">Collector #</dt>
                                  <dd>{pd.collector_numbers[pi]}</dd>
                                  <dt class="font-medium text-gray-600 dark:text-gray-300">Rarity</dt>
                                  <dd>{RARITY_LABELS[pd.rarity[pi]] ?? 'Unknown'}</dd>
                                  {(() => {
                                    const sid = pd.scryfall_ids[pi]
                                    const group = ctx.finishGroupMap().get(sid)
                                    if (group && group.length > 1 && ctx.uniqueMode() === 'cards') {
                                      return (<>
                                        <dt class="font-medium text-gray-600 dark:text-gray-300">Finishes</dt>
                                        <dd>{group.map(g => {
                                          const label = FINISH_LABELS[g.finish] ?? 'Unknown'
                                          const price = formatPrice(g.price)
                                          return `${label} (${price})`
                                        }).join(' · ')}</dd>
                                      </>)
                                    }
                                    return (<>
                                      <dt class="font-medium text-gray-600 dark:text-gray-300">Finish</dt>
                                      <dd>{FINISH_LABELS[pd.finish[pi]] ?? 'Unknown'}</dd>
                                      <dt class="font-medium text-gray-600 dark:text-gray-300">Price</dt>
                                      <dd>{formatPrice(pd.price_usd[pi])}</dd>
                                    </>)
                                  })()}
                                </dl>
                              </div>
                            </div>
                          </li>
                        )
                      }}
                    </For>
                  )
                }}
              </Show>
              <Show when={ctx.hasMore()}>
                <li
                  ref={(el) => {
                    const obs = new IntersectionObserver(
                      ([entry]) => { if (entry.isIntersecting) ctx.setVisibleCount(c => c + ctx.batchSize()) },
                      { rootMargin: '600px' },
                    )
                    obs.observe(el)
                    onCleanup(() => obs.disconnect())
                  }}
                  class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic"
                >
                  …and {(ctx.totalDisplayItems() - ctx.visibleCount()).toLocaleString()} more
                </li>
              </Show>
            </ul>
          }>
            <div class="border-t border-gray-200 dark:border-gray-800 overflow-hidden rounded-b-xl">
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800">
                <Show when={ctx.visibleDisplayItems()} fallback={
                  <For each={ctx.visibleIndices()}>
                    {(ci) => {
                      const name = () => {
                        const faces = ctx.facesOf().get(ci) ?? []
                        return fullCardName(d()!, faces)
                      }
                      return (
                        <CardImage
                          scryfallId={d()!.scryfall_ids[ci]}
                          colorIdentity={d()!.color_identity[ci]}
                          thumbHash={d()!.card_thumb_hashes[ci]}
                          class="cursor-pointer hover:brightness-110 transition-[filter]"
                          onClick={() => ctx.navigateToCard(d()!.scryfall_ids[ci])}
                          aria-label={name()}
                        />
                      )
                    }}
                  </For>
                }>
                  {(printItems) => {
                    const pd = ctx.printingDisplay()!
                    return (
                      <For each={printItems()}>
                        {(pi) => {
                          const ci = pd.canonical_face_ref[pi]
                          const name = () => {
                            const faces = ctx.facesOf().get(ci) ?? []
                            return fullCardName(d()!, faces)
                          }
                          const setCode = pd.set_codes[pi]
                          const rarityLabel = RARITY_LABELS[pd.rarity[pi]] ?? ''
                          const sid = pd.scryfall_ids[pi]
                          const isFoil = pd.finish[pi] === Finish.Foil
                          const isEtched = pd.finish[pi] === Finish.Etched
                          const finishLabel = () => {
                            if (ctx.uniqueMode() === 'prints') return FINISH_LABELS[pd.finish[pi]] ?? null
                            const group = ctx.finishGroupMap().get(sid)
                            if (!group || group.length <= 1) return null
                            return group.map(g => FINISH_LABELS[g.finish] ?? '').filter(Boolean).join(', ')
                          }
                          const overlayClass = () => ctx.uniqueMode() === 'prints' && isFoil ? 'foil-overlay' : ctx.uniqueMode() === 'prints' && isEtched ? 'etched-overlay' : ''
                          const metaClass = () => ctx.uniqueMode() === 'prints' && isFoil ? 'foil-meta' : ctx.uniqueMode() === 'prints' && isEtched ? 'etched-meta' : ''
                          return (
                            <div class={`bg-white dark:bg-gray-900 flex flex-col ${overlayClass()}`}>
                              <CardImage
                                scryfallId={sid}
                                colorIdentity={d()!.color_identity[ci]}
                                thumbHash={d()!.card_thumb_hashes[ci]}
                                class="cursor-pointer hover:brightness-110 transition-[filter]"
                                onClick={() => ctx.navigateToCard(sid)}
                                aria-label={name()}
                              />
                              <div class={`px-1.5 py-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 leading-tight truncate ${metaClass()}`}>
                                <span class="uppercase">{setCode}</span>
                                {' · '}
                                {rarityLabel}
                                <Show when={finishLabel()}>
                                  {(f) => <>{' · '}{f()}</>}
                                </Show>
                              </div>
                            </div>
                          )
                        }}
                      </For>
                    )
                  }}
                </Show>
              </div>
              <Show when={ctx.hasMore()}>
                <div
                  ref={(el) => {
                    const obs = new IntersectionObserver(
                      ([entry]) => { if (entry.isIntersecting) ctx.setVisibleCount(c => c + ctx.batchSize()) },
                      { rootMargin: '600px' },
                    )
                    obs.observe(el)
                    onCleanup(() => obs.disconnect())
                  }}
                  class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 italic bg-white dark:bg-gray-900"
                >
                  …and {(ctx.totalDisplayItems() - ctx.visibleCount()).toLocaleString()} more
                </div>
              </Show>
            </div>
          </Show>
          <Show when={(() => {
            const extras = ctx.indicesIncludingExtras()
            if (extras === undefined) return false
            const hidden = extras - ctx.totalCards()
            return hidden > 0
          })()}>
            {(() => {
              const extras = ctx.indicesIncludingExtras()!
              const hiddenCards = extras - ctx.totalCards()
              const pExtras = ctx.printingIndicesIncludingExtras()
              const showPrintings = () => pExtras !== undefined && (ctx.uniqueMode() !== 'cards' || ctx.hasPrintingConditions())
              const hiddenPrintings = showPrintings() && pExtras !== undefined
                ? pExtras - ctx.totalPrintingItems()
                : 0
              return (
                <div class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800">
                  {hiddenCards} {hiddenCards === 1 ? 'card' : 'cards'}
                  <Show when={showPrintings() && hiddenPrintings > 0}>
                    {' '}({hiddenPrintings} {hiddenPrintings === 1 ? 'printing' : 'printings'})
                  </Show>
                  {' not shown. Try again with '}
                  <button
                    type="button"
                    onClick={() => ctx.setQuery(ctx.appendTerm(ctx.query(), 'include:extras', ctx.parseBreakdown(ctx.query())))}
                    class="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 px-2 py-2 md:py-0.5 rounded text-xs font-mono cursor-pointer transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    <HighlightedLabel label="include:extras" />
                  </button>
                  ?
                </div>
              )
            })()}
          </Show>
        </Show>
      </div>
    </Show>
  )
}
