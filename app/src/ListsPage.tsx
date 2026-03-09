// SPDX-License-Identifier: Apache-2.0
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { DisplayColumns, InstanceState, ListMetadata, MaterializedView, PrintingDisplayColumns } from '@frantic-search/shared'
import { DEFAULT_LIST_ID, TRASH_LIST_ID } from '@frantic-search/shared'
import type { CardListStore } from './card-list-store'
import { buildOracleToCanonicalFaceMap } from './list-mask-builder'
import { buildFacesOf, fullCardName } from './app-utils'
import ListImportTextarea from './ListImportTextarea'

const FINISH_LABELS: Record<string, string> = {
  nonfoil: 'Nonfoil',
  foil: 'Foil',
  etched: 'Etched',
}

function finishLabel(finish: string | null): string {
  if (!finish) return ''
  return FINISH_LABELS[finish.toLowerCase()] ?? finish
}

export interface ListEntry {
  oracle_id: string
  name: string
  orphaned: boolean
  oracleCount: number
  printingBreakdown: { finish: string; count: number }[]
  totalCount: number
}

function aggregateListEntries(
  view: MaterializedView,
  listId: string,
  display: DisplayColumns | null,
  facesOf: Map<number, number[]>,
  oracleToCanonicalFace: Map<string, number>
): ListEntry[] {
  const uuids = view.instancesByList.get(listId)
  if (!uuids || uuids.size === 0) return []

  const byOracle = new Map<string, InstanceState[]>()
  for (const uuid of uuids) {
    const instance = view.instances.get(uuid)
    if (!instance) continue
    let arr = byOracle.get(instance.oracle_id)
    if (!arr) {
      arr = []
      byOracle.set(instance.oracle_id, arr)
    }
    arr.push(instance)
  }

  const entries: ListEntry[] = []
  for (const [oracle_id, instances] of byOracle) {
    let oracleCount = 0
    const finishCounts = new Map<string, number>()
    for (const inst of instances) {
      if (inst.scryfall_id == null && inst.finish == null) {
        oracleCount++
      } else if (inst.finish) {
        finishCounts.set(inst.finish, (finishCounts.get(inst.finish) ?? 0) + 1)
      }
    }
    const printingBreakdown = Array.from(finishCounts.entries())
      .map(([finish, count]) => ({ finish, count }))
      .sort((a, b) => a.finish.localeCompare(b.finish))
    const totalCount = oracleCount + printingBreakdown.reduce((s, p) => s + p.count, 0)

    let name: string
    let orphaned: boolean
    if (display && oracleToCanonicalFace.has(oracle_id)) {
      const cf = oracleToCanonicalFace.get(oracle_id)!
      const faceIndices = facesOf.get(cf) ?? [cf]
      name = fullCardName(display, faceIndices)
      orphaned = false
    } else {
      name = 'Unknown card'
      orphaned = true
    }

    entries.push({
      oracle_id,
      name,
      orphaned,
      oracleCount,
      printingBreakdown,
      totalCount,
    })
  }

  entries.sort((a, b) => {
    if (a.orphaned !== b.orphaned) return a.orphaned ? 1 : -1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return entries
}

function DebugExport(props: { cardListStore: CardListStore }) {
  const [expanded, setExpanded] = createSignal(false)
  const [data, setData] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  async function loadAndExpand() {
    if (expanded()) {
      setExpanded(false)
      return
    }
    setLoading(true)
    try {
      const dump = await props.cardListStore.getDebugDump()
      setData(dump)
      setExpanded(true)
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard() {
    const text = data()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may fail in some contexts
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={loadAndExpand}
        disabled={loading()}
        class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {loading() ? 'Loading…' : expanded() ? 'Hide debug info' : 'Show debug info'}
      </button>
      <Show when={expanded() && data()}>
        <div class="mt-3 flex flex-col gap-2">
          <div class="flex justify-end">
            <button
              type="button"
              onClick={copyToClipboard}
              class="px-3 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {copied() ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <pre class="overflow-auto max-h-96 p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
            {data()}
          </pre>
        </div>
      </Show>
    </div>
  )
}

function MetadataForm(props: {
  meta: ListMetadata
  onSave: (updates: Partial<Omit<ListMetadata, 'list_id'>>) => void
}) {
  const [name, setName] = createSignal(props.meta.name)
  const [shortName, setShortName] = createSignal(props.meta.short_name ?? 'list')
  createEffect(() => {
    setName(props.meta.name)
    setShortName(props.meta.short_name ?? 'list')
  })
  return (
    <section class="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">List metadata</h2>
      <div class="flex flex-col gap-3">
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1" for="list-name">Name</label>
          <input
            id="list-name"
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim() || 'My List'
              if (v !== props.meta.name) props.onSave({ name: v })
            }}
            class="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1" for="list-short-name">Short name (for my: queries)</label>
          <input
            id="list-short-name"
            type="text"
            value={shortName()}
            onInput={(e) => setShortName(e.currentTarget.value)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim() || 'list'
              if ((v === 'list' || v === 'default') && v !== (props.meta.short_name ?? 'list')) {
                props.onSave({ short_name: v })
              }
            }}
            placeholder="list"
            class="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Use "list" or "default" for the default list.</p>
        </div>
      </div>
    </section>
  )
}

export default function ListsPage(props: {
  listTab: 'default' | 'trash'
  onTabChange: (tab: 'default' | 'trash') => void
  cardListStore: CardListStore
  listVersion: number
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  onBack: () => void
}) {
  const listId = () => (props.listTab === 'trash' ? TRASH_LIST_ID : DEFAULT_LIST_ID)
  const title = () => (props.listTab === 'trash' ? 'Trash' : 'My List')

  const oracleToCanonicalFace = createMemo(() => {
    const d = props.display
    return d ? buildOracleToCanonicalFaceMap(d) : new Map<string, number>()
  })

  const facesOf = createMemo(() => {
    const d = props.display
    return d ? buildFacesOf(d.canonical_face) : new Map<number, number[]>()
  })

  const entries = createMemo(() => {
    props.listVersion // track for reactivity when list changes
    const view = props.cardListStore.getView()
    return aggregateListEntries(
      view,
      listId(),
      props.display,
      facesOf(),
      oracleToCanonicalFace()
    )
  })

  const metadata = createMemo(() => {
    props.listVersion // track for reactivity when list metadata changes
    if (props.listTab !== 'default') return null
    return props.cardListStore.getView().lists.get(DEFAULT_LIST_ID) ?? null
  })

  function formatPrintingBreakdown(entry: ListEntry): string {
    const parts: string[] = []
    if (entry.oracleCount > 0) {
      parts.push(`${entry.oracleCount}× generic`)
    }
    for (const { finish, count } of entry.printingBreakdown) {
      parts.push(`${count}× ${finishLabel(finish)}`)
    }
    return parts.join(', ')
  }

  return (
    <div class="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div class="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => props.onBack()}
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 -ml-1"
          aria-label="Back"
        >
          <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 class="text-lg font-bold tracking-tight">{title()}</h1>
      </div>

      {/* List selector tabs */}
      <div class="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 mb-6">
        <button
          type="button"
          onClick={() => props.onTabChange('default')}
          class={`flex-1 min-h-10 px-4 rounded-md text-sm font-medium transition-colors ${
            props.listTab === 'default'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          My List
        </button>
        <button
          type="button"
          onClick={() => props.onTabChange('trash')}
          class={`flex-1 min-h-10 px-4 rounded-md text-sm font-medium transition-colors ${
            props.listTab === 'trash'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Trash
        </button>
      </div>

      {/* Metadata section (default list only) */}
      <Show when={props.listTab === 'default' && metadata()}>
        {(meta) => (
          <MetadataForm
            meta={meta()}
            onSave={(updates) =>
              props.cardListStore.updateListMetadata(DEFAULT_LIST_ID, { ...meta(), ...updates }).catch(() => {})
            }
          />
        )}
      </Show>

      {/* Import section (default list only) */}
      <Show when={props.listTab === 'default'}>
        <section class="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h2 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Import</h2>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Paste or type a deck list. Use formats like <code class="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs">1 Card Name</code> or <code class="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs">4x Card Name (SET) 123</code>.
          </p>
          <ListImportTextarea
            display={props.display}
            printingDisplay={props.printingDisplay}
            class="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 overflow-hidden"
          />
        </section>
      </Show>

      {/* Loading state */}
      <Show when={!props.display}>
        <div class="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
          Loading card data…
        </div>
      </Show>

      {/* Empty state */}
      <Show when={props.display && entries().length === 0}>
        <div class="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
          No cards in list. Add cards from search results or the card detail page.
        </div>
      </Show>

      {/* List contents */}
      <Show when={props.display && entries().length > 0}>
        <div class="space-y-1">
          <For each={entries()}>
            {(entry) => (
              <div
                class="flex items-center justify-between gap-4 py-3 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                classList={{ 'opacity-70': entry.orphaned }}
              >
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {entry.name}
                    {entry.orphaned && (
                      <span class="ml-2 text-xs text-amber-600 dark:text-amber-400">(unresolved)</span>
                    )}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatPrintingBreakdown(entry)}
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <Show when={props.listTab === 'default' && entry.totalCount > 0}>
                    <button
                      type="button"
                      onClick={() => {
                        props.cardListStore.removeMostRecentMatchingInstance(listId(), entry.oracle_id).catch(() => {})
                      }}
                      class="min-h-9 min-w-9 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      aria-label="Remove one"
                    >
                      <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
                      </svg>
                    </button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Debug section */}
      <section class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <DebugExport cardListStore={props.cardListStore} />
      </section>
    </div>
  )
}
