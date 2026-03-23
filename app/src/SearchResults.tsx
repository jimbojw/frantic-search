// SPDX-License-Identifier: Apache-2.0
import { For, Show, onCleanup } from 'solid-js'
import { Finish, DEFAULT_LIST_ID } from '@frantic-search/shared'
import ResultsBreakdown, { MV_BAR_COLOR, TYPE_BAR_COLOR } from './ResultsBreakdown'
import SparkBars from './SparkBars'
import { CI_COLORLESS, CI_W, CI_U, CI_B, CI_R, CI_G, CI_BACKGROUNDS } from './color-identity'
import ArtCrop from './ArtCrop'
import CopyButton from './CopyButton'
import CardImage from './CardImage'
import CardFaceRow from './CardFaceRow'
import { RARITY_LABELS, FINISH_LABELS, FINISH_TO_STRING, formatPrice, fullCardName } from './app-utils'
import { useSearchContext } from './SearchContext'
import { IconBug, IconChevronRight, IconXMark } from './Icons'
import ListControlsPopover from './ListControlsPopover'
import { formatDualCount } from './InlineBreakdown'
import { Outlink } from './Outlink'
import ResultsSummaryBar from './ResultsSummaryBar'
import { SuggestionList } from './SuggestionList'

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
          <Outlink
            href={__REPO_URL__}
            class="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <svg class="size-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Source on GitHub
          </Outlink>
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
                  <IconChevronRight class="size-2.5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-150" />
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
                  <IconXMark class="size-5" />
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
          <div class="text-sm border-t border-gray-200 dark:border-gray-800">
            <ResultsSummaryBar
              effectiveQuery={ctx.effectiveQuery()}
              effectiveBreakdown={ctx.effectiveBreakdown()}
              cardCount={0}
              zeroResult
            />
            <div class="px-3 pb-3">
              <SuggestionList
                suggestions={ctx.suggestions() ?? []}
                mode="empty"
                onApplyQuery={(q) => ctx.setQuery(q)}
                onCta={(action) => {
                  if (action === 'navigateToLists') ctx.navigateToLists?.()
                }}
                formatDualCount={formatDualCount}
                navigateToDocs={ctx.navigateToDocs}
              />
            </div>
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
                    const collectorNumber = () => {
                      if (!ctx.hasPrintingConditions() && ctx.uniqueMode() === 'cards') return null
                      const idx = pi()
                      const pd = pdc()
                      if (idx === undefined || !pd) return null
                      const cn = pd.collector_numbers[idx]
                      return cn && cn.trim() ? cn : null
                    }
                    const aggCount = () => ctx.showPrintingResults() ? ctx.aggregationCountForCard(ci) : undefined
                    const oracleId = () => d()?.oracle_ids?.[ci]
                    const showListTrigger = () => ctx.cardListStore && oracleId()
                    return (
                      <Show when={ctx.viewMode() === 'full'} fallback={
                        <li class="group px-4 py-2 text-sm flex items-start gap-3">
                          <Show when={showListTrigger()}>
                            <div class="shrink-0 flex items-center">
                              <ListControlsPopover
                                popoverId={`list-popover-${ctx.paneId ?? 'main'}-card-${ci}`}
                                cardImage={{
                                  scryfallId: artScryfallId()!,
                                  colorIdentity: d()!.color_identity[ci],
                                  thumbHash: d()!.card_thumb_hashes[ci],
                                  onClick: () => {
                                    const n = name()
                                    const q = n ? `!"${n}" unique:prints include:extras` : ''
                                    if (q && ctx.navigateToQuery) ctx.navigateToQuery(q)
                                    else ctx.navigateToCard(artScryfallId())
                                  },
                                }}
                                entries={[{
                                  label: 'Any printing',
                                  count: ctx.listCountForCard?.(ci) ?? 0,
                                  onAdd: () => ctx.cardListStore!.addInstance(oracleId()!, DEFAULT_LIST_ID).catch(() => {}),
                                  onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleId()!).catch(() => {}),
                                  addLabel: 'Add to list',
                                  removeLabel: 'Remove from list',
                                }]}
                              />
                            </div>
                          </Show>
                          <div class="shrink-0 flex flex-col items-start">
                            <ArtCrop
                              scryfallId={artScryfallId()}
                              colorIdentity={d()!.color_identity[ci]}
                              thumbHash={d()!.art_crop_thumb_hashes[ci]}
                            />
                            <Show when={(aggCount() ?? 0) > 1}>
                              <span class="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">({aggCount()})</span>
                            </Show>
                          </div>
                          <div class="min-w-0 flex-1">
                            <Show when={faces().length > 1} fallback={
                              <>
                                <CardFaceRow d={d()!} fi={faces()[0]} fullName={name()} showOracle={ctx.showOracleText()} onCardClick={() => ctx.navigateToCard(artScryfallId())} setBadge={setBadge()} collectorNumber={collectorNumber()} />
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
                                <Show when={(() => { const s = setBadge(); const c = collectorNumber(); if (!s) return null; if (c) return `${s} · ${c}`; return s })()}>
                                  {(text) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{text()}</span>}
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
                            <div class="shrink-0 flex flex-col items-start">
                              <CardImage
                                scryfallId={artScryfallId()}
                                colorIdentity={d()!.color_identity[ci]}
                                thumbHash={d()!.card_thumb_hashes[ci]}
                                class="w-[336px] max-w-full cursor-pointer rounded-lg"
                                onClick={() => ctx.navigateToCard(artScryfallId())}
                              />
                              <Show when={(aggCount() ?? 0) > 1}>
                                <span class="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">({aggCount()})</span>
                              </Show>
                              <Show when={showListTrigger()}>
                                <div class="mt-1 flex justify-center w-full">
                                  <ListControlsPopover
                                    popoverId={`list-popover-${ctx.paneId ?? 'main'}-card-${ci}`}
                                    cardImage={{
                                      scryfallId: artScryfallId()!,
                                      colorIdentity: d()!.color_identity[ci],
                                      thumbHash: d()!.card_thumb_hashes[ci],
                                      onClick: () => {
                                        const n = name()
                                        const q = n ? `!"${n}" unique:prints include:extras` : ''
                                        if (q && ctx.navigateToQuery) ctx.navigateToQuery(q)
                                        else ctx.navigateToCard(artScryfallId())
                                      },
                                    }}
                                    entries={[{
                                      label: 'Any printing',
                                      count: ctx.listCountForCard?.(ci) ?? 0,
                                      onAdd: () => ctx.cardListStore!.addInstance(oracleId()!, DEFAULT_LIST_ID).catch(() => {}),
                                      onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleId()!).catch(() => {}),
                                      addLabel: 'Add to list',
                                      removeLabel: 'Remove from list',
                                    }]}
                                  />
                                </div>
                              </Show>
                            </div>
                            <div class="min-w-0 flex-1 w-full">
                              <Show when={faces().length > 1} fallback={
                                <CardFaceRow d={d()!} fi={faces()[0]} fullName={name()} showOracle={true} onCardClick={() => ctx.navigateToCard(artScryfallId())} setBadge={setBadge()} collectorNumber={collectorNumber()} />
                              }>
                                <div class="flex items-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => ctx.navigateToCard(artScryfallId())}
                                    class="font-medium hover:underline text-left min-w-0 whitespace-normal break-words"
                                  >
                                    {name()}
                                  </button>
                                  <Show when={(() => { const s = setBadge(); const c = collectorNumber(); if (!s) return null; if (c) return `${s} · ${c}`; return s })()}>
                                    {(text) => <span class="shrink-0 text-[10px] font-mono text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 leading-none uppercase">{text()}</span>}
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
                        const overlayClass = () => isFoil ? 'foil-overlay ' : isEtched ? 'etched-overlay ' : ''
                        const oracleIdPrint = () => d()?.oracle_ids?.[ci]
                        const showListTriggerPrint = () => ctx.cardListStore && oracleIdPrint()
                        return (
                          <li class="group px-4 py-3 text-sm">
                            <div class="flex flex-col min-[600px]:flex-row items-start gap-4">
                              <div class={`${overlayClass()}w-[336px] max-w-full shrink-0 flex flex-col items-start rounded-lg`}>
                                <CardImage
                                  scryfallId={pd.scryfall_ids[pi]}
                                  colorIdentity={d()!.color_identity[ci]}
                                  thumbHash={d()!.card_thumb_hashes[ci]}
                                  class="cursor-pointer rounded-lg"
                                  onClick={() => ctx.navigateToCard(pd.scryfall_ids[pi])}
                                />
                                <Show when={showListTriggerPrint()}>
                                  <div class="mt-1 flex justify-center w-full">
                                    {(() => {
                                      const scryfallId = pd.scryfall_ids[pi]
                                      const finish = FINISH_TO_STRING[pd.finish[pi]] ?? 'nonfoil'
                                      const finishLabel = FINISH_LABELS[pd.finish[pi]] ?? 'Unknown'
                                      const cn = pd.collector_numbers[pi]?.trim() ?? ''
                                      const setCode = pd.set_codes[pi]?.toUpperCase() ?? ''
                                      const printingLabel = [setCode, cn, finish].filter(Boolean).join(' · ')
                                      return (
                                        <ListControlsPopover
                                          popoverId={`list-popover-${ctx.paneId ?? 'main'}-print-${pi}`}
                                          cardImage={{
                                            scryfallId,
                                            colorIdentity: d()!.color_identity[ci],
                                            thumbHash: d()!.card_thumb_hashes[ci],
                                            onClick: () => {
                                              const n = name()
                                              const q = n ? `!"${n}" unique:prints include:extras` : ''
                                              if (q && ctx.navigateToQuery) ctx.navigateToQuery(q)
                                              else ctx.navigateToCard(scryfallId)
                                            },
                                          }}
                                          entries={[
                                            {
                                              label: 'Any printing',
                                              count: ctx.listCountForPrinting?.(pi) ?? 0,
                                              onAdd: () => ctx.cardListStore!.addInstance(oracleIdPrint()!, DEFAULT_LIST_ID).catch(() => {}),
                                              onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleIdPrint()!).catch(() => {}),
                                              addLabel: 'Add card to list',
                                              removeLabel: 'Remove card from list',
                                            },
                                            {
                                              label: printingLabel,
                                              count: ctx.listCountForPrinting?.(pi, scryfallId, finish) ?? 0,
                                              onAdd: () => ctx.cardListStore!.addInstance(oracleIdPrint()!, DEFAULT_LIST_ID, { scryfallId, finish }).catch(() => {}),
                                              onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleIdPrint()!, scryfallId, finish).catch(() => {}),
                                              addLabel: `Add ${finishLabel} printing to list`,
                                              removeLabel: `Remove ${finishLabel} printing from list`,
                                            },
                                          ]}
                                        />
                                      )
                                    })()}
                                  </div>
                                </Show>
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
                                  <Show when={(ctx.aggregationCountForPrinting(pi) ?? 0) > 1}>
                                    <dt class="font-medium text-gray-600 dark:text-gray-300">Printings</dt>
                                    <dd>{ctx.aggregationCountForPrinting(pi)}</dd>
                                  </Show>
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
            <div class="border-t border-gray-200 dark:border-gray-800 overflow-visible rounded-b-xl">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(min(200px,45vw),1fr))] gap-px bg-gray-200 dark:bg-gray-800">
                <Show when={ctx.visibleDisplayItems()} fallback={
                  <For each={ctx.visibleIndices()}>
                    {(ci) => {
                      const name = () => {
                        const faces = ctx.facesOf().get(ci) ?? []
                        return fullCardName(d()!, faces)
                      }
                      const oracleIdImg = () => d()?.oracle_ids?.[ci]
                      const showListTriggerImg = () => ctx.cardListStore && oracleIdImg()
                      return (
                        <div class="bg-white dark:bg-gray-900 flex flex-col">
                          <CardImage
                            scryfallId={d()!.scryfall_ids[ci]}
                            colorIdentity={d()!.color_identity[ci]}
                            thumbHash={d()!.card_thumb_hashes[ci]}
                            class="cursor-pointer hover:brightness-110 transition-[filter]"
                            onClick={() => ctx.navigateToCard(d()!.scryfall_ids[ci])}
                            aria-label={name()}
                          />
                          <Show when={showListTriggerImg()}>
                            <div class="px-1.5 py-1 flex justify-center">
                              <ListControlsPopover
                                popoverId={`list-popover-${ctx.paneId ?? 'main'}-card-${ci}`}
                                cardImage={{
                                  scryfallId: d()!.scryfall_ids[ci],
                                  colorIdentity: d()!.color_identity[ci],
                                  thumbHash: d()!.card_thumb_hashes[ci],
                                  onClick: () => {
                                    const n = name()
                                    const q = n ? `!"${n}" unique:prints include:extras` : ''
                                    if (q && ctx.navigateToQuery) ctx.navigateToQuery(q)
                                    else ctx.navigateToCard(d()!.scryfall_ids[ci])
                                  },
                                }}
                                entries={[{
                                  label: 'Any printing',
                                  count: ctx.listCountForCard?.(ci) ?? 0,
                                  onAdd: () => ctx.cardListStore!.addInstance(oracleIdImg()!, DEFAULT_LIST_ID).catch(() => {}),
                                  onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleIdImg()!).catch(() => {}),
                                  addLabel: 'Add to list',
                                  removeLabel: 'Remove from list',
                                }]}
                              />
                            </div>
                          </Show>
                        </div>
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
                          const collectorNum = pd.collector_numbers[pi]?.trim() ?? ''
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
                          const overlayClass = () => isFoil ? 'foil-overlay' : isEtched ? 'etched-overlay' : ''
                          const aggCount = ctx.aggregationCountForPrinting(pi)
                          const oracleIdImgPrint = () => d()?.oracle_ids?.[ci]
                          const showListTriggerImgPrint = () => ctx.cardListStore && oracleIdImgPrint()
                          return (
                            <div class="bg-white dark:bg-gray-900 flex flex-col">
                              <div class={`overflow-hidden rounded-[4%] ${overlayClass()}`}>
                                <CardImage
                                  scryfallId={sid}
                                  colorIdentity={d()!.color_identity[ci]}
                                  thumbHash={d()!.card_thumb_hashes[ci]}
                                  class="cursor-pointer hover:brightness-110 transition-[filter]"
                                  onClick={() => ctx.navigateToCard(sid)}
                                  aria-label={name()}
                                />
                              </div>
                              <div class="px-1.5 py-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 leading-tight break-words flex items-start justify-between gap-2">
                                <span class="min-w-0 flex-1">
                                  <span class="uppercase">{setCode}</span>
                                  {collectorNum ? <>{' · '}{collectorNum}</> : null}
                                  {' · '}
                                  {rarityLabel}
                                  <Show when={finishLabel()}>
                                    {(f) => <>{' · '}{f()}</>}
                                  </Show>
                                  <Show when={(aggCount ?? 0) > 1}>
                                    {' · '}{aggCount} printings
                                  </Show>
                                </span>
                                <Show when={showListTriggerImgPrint()}>
                                  <span class="shrink-0">
                                    {(() => {
                                      const scryfallIdImg = pd.scryfall_ids[pi]
                                      const finishImg = FINISH_TO_STRING[pd.finish[pi]] ?? 'nonfoil'
                                      const finishLabelImg = FINISH_LABELS[pd.finish[pi]] ?? 'Unknown'
                                      const cnImg = pd.collector_numbers[pi]?.trim() ?? ''
                                      const setCodeImg = pd.set_codes[pi]?.toUpperCase() ?? ''
                                      const printingLabelImg = [setCodeImg, cnImg, finishImg].filter(Boolean).join(' · ')
                                      return (
                                        <ListControlsPopover
                                          popoverId={`list-popover-${ctx.paneId ?? 'main'}-print-${pi}`}
                                          cardImage={{
                                            scryfallId: scryfallIdImg,
                                            colorIdentity: d()!.color_identity[ci],
                                            thumbHash: d()!.card_thumb_hashes[ci],
                                            onClick: () => {
                                              const n = name()
                                              const q = n ? `!"${n}" unique:prints include:extras` : ''
                                              if (q && ctx.navigateToQuery) ctx.navigateToQuery(q)
                                              else ctx.navigateToCard(scryfallIdImg)
                                            },
                                          }}
                                          entries={[
                                            {
                                              label: 'Any printing',
                                              count: ctx.listCountForPrinting?.(pi) ?? 0,
                                              onAdd: () => ctx.cardListStore!.addInstance(oracleIdImgPrint()!, DEFAULT_LIST_ID).catch(() => {}),
                                              onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleIdImgPrint()!).catch(() => {}),
                                              addLabel: 'Add card to list',
                                              removeLabel: 'Remove card from list',
                                            },
                                            {
                                              label: printingLabelImg,
                                              count: ctx.listCountForPrinting?.(pi, scryfallIdImg, finishImg) ?? 0,
                                              onAdd: () => ctx.cardListStore!.addInstance(oracleIdImgPrint()!, DEFAULT_LIST_ID, { scryfallId: scryfallIdImg, finish: finishImg }).catch(() => {}),
                                              onRemove: () => ctx.cardListStore!.removeMostRecentMatchingInstance(DEFAULT_LIST_ID, oracleIdImgPrint()!, scryfallIdImg, finishImg).catch(() => {}),
                                              addLabel: `Add ${finishLabelImg} printing to list`,
                                              removeLabel: `Remove ${finishLabelImg} printing from list`,
                                            },
                                          ]}
                                        />
                                      )
                                    })()}
                                  </span>
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
          <ResultsSummaryBar
            effectiveQuery={ctx.effectiveQuery()}
            effectiveBreakdown={ctx.effectiveBreakdown()}
            cardCount={ctx.totalCards()}
            printingCount={
              ctx.totalPrintingItems() > 0 &&
              (ctx.uniqueMode() === 'prints' || ctx.hasPrintingConditions())
                ? ctx.totalPrintingItems()
                : undefined
            }
          />
          <Show when={
            ctx.suggestions()?.some((s) => s.id === 'unique-prints' || s.id === 'include-extras')
          }>
            <div class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800">
              <SuggestionList
                suggestions={ctx.suggestions() ?? []}
                mode="rider"
                onApplyQuery={(q) => ctx.setQuery(q)}
                formatDualCount={formatDualCount}
                navigateToDocs={ctx.navigateToDocs}
                hiddenCardCount={
                  (() => {
                    const s = ctx.suggestions()?.find((x) => x.id === 'include-extras')
                    if (!s?.count) return undefined
                    return s.count - ctx.totalCards()
                  })()
                }
                hiddenPrintingCount={
                  (() => {
                    const s = ctx.suggestions()?.find((x) => x.id === 'include-extras')
                    if (!s?.printingCount) return undefined
                    const showPrintings = ctx.uniqueMode() !== 'cards' || ctx.hasPrintingConditions()
                    if (!showPrintings) return undefined
                    return s.printingCount - ctx.totalPrintingItems()
                  })()
                }
              />
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  )
}
