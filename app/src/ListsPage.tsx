// SPDX-License-Identifier: Apache-2.0
import { createMemo, createSignal } from 'solid-js'
import type { DisplayColumns, InstanceState, PrintingDisplayColumns } from '@frantic-search/shared'
import { DEFAULT_LIST_ID, importDeckList, diffDeckList } from '@frantic-search/shared'
import type { CardListStore } from './card-list-store'
import DeckEditor from './DeckEditor'

export default function ListsPage(props: {
  listTab: 'default' | 'trash'
  onTabChange: (tab: 'default' | 'trash') => void
  cardListStore: CardListStore
  listVersion: number
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  onBack: () => void
}) {
  const [_isDraftActive, setIsDraftActive] = createSignal(false)

  const listId = () => DEFAULT_LIST_ID

  const instances = createMemo<InstanceState[]>(() => {
    props.listVersion
    const view = props.cardListStore.getView()
    const uuids = view.instancesByList.get(listId())
    if (!uuids || uuids.size === 0) return []
    const result: InstanceState[] = []
    for (const uuid of uuids) {
      const inst = view.instances.get(uuid)
      if (inst) result.push(inst)
    }
    return result
  })

  const metadata = createMemo(() => {
    props.listVersion
    return props.cardListStore.getView().lists.get(listId()) ?? null
  })

  async function handleApply(draftText: string): Promise<boolean> {
    const result = importDeckList(draftText, props.display, props.printingDisplay)
    const currentInstances = instances()
    const diff = diffDeckList(result.candidates, currentInstances)

    for (const inst of diff.removals) {
      await props.cardListStore.removeToTrash(inst.uuid)
    }

    for (const cand of diff.additions) {
      await props.cardListStore.addInstance(cand.oracle_id, listId(), {
        scryfallId: cand.scryfall_id,
        finish: cand.finish,
        zone: cand.zone,
        tags: cand.tags,
        collection_status: cand.collection_status,
        variant: cand.variant,
      })
    }

    if (result.deckName || Object.keys(result.tagColors).length > 0) {
      const meta = metadata()
      await props.cardListStore.updateListMetadata(listId(), {
        name: result.deckName ?? meta?.name ?? 'My List',
        ...(meta?.description ? { description: meta.description } : {}),
        ...(meta?.short_name ? { short_name: meta.short_name } : {}),
        ...(Object.keys(result.tagColors).length > 0 ? { tag_colors: result.tagColors } : {}),
      })
    }

    return true
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
        <h1 class="text-lg font-bold tracking-tight">
          {metadata()?.name ?? 'My List'}
        </h1>
      </div>

      <DeckEditor
        listId={listId()}
        instances={instances()}
        metadata={metadata()}
        display={props.display}
        printingDisplay={props.printingDisplay}
        onApply={handleApply}
        onDraftActiveChange={setIsDraftActive}
      />
    </div>
  )
}
