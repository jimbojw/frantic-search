// SPDX-License-Identifier: Apache-2.0
import { createMemo, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { DisplayColumns, InstanceState, LineValidationResult, PrintingDisplayColumns } from '@frantic-search/shared'
import type { DeckFormat } from '@frantic-search/shared'
import { DEFAULT_LIST_ID, TRASH_LIST_ID } from '@frantic-search/shared'
import type { CardListStore } from './card-list-store'
import { captureMyListInteracted, toMyListListId } from './analytics'
import { IconChevronLeft } from './Icons'
import type { DeckReportContext } from './deck-editor/DeckEditorContext'
import { DeckEditor } from './deck-editor'
import type { EditorMode } from './deck-editor/types'

export default function ListsPage(props: {
  listTab: 'default' | 'trash'
  onTabChange: (tab: 'default' | 'trash') => void
  cardListStore: CardListStore
  listVersion: number
  display: DisplayColumns | null
  printingDisplay: PrintingDisplayColumns | null
  workerStatus: Accessor<'loading' | 'ready' | 'error'>
  onSerializeRequest?: (instances: InstanceState[], format: DeckFormat, listName?: string) => Promise<string>
  onValidateRequest?: (lines: string[]) => Promise<{ result: LineValidationResult[]; indices: Int32Array }>
  onBack: () => void
  onDeckReportClick?: (context: DeckReportContext) => void
  onViewInSearch?: (listId: string) => void
}) {
  const [_isDraftActive, setIsDraftActive] = createSignal(false)
  const [editorMode, setEditorMode] = createSignal<EditorMode>('init')

  const listId = () => (props.listTab === 'trash' ? TRASH_LIST_ID : DEFAULT_LIST_ID)

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

  return (
    <div class="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div class="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => {
            captureMyListInteracted({
              control: 'back',
              list_id: toMyListListId(listId()),
              editor_mode: editorMode(),
            })
            props.onBack()
          }}
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 -ml-1"
          aria-label="Back"
        >
          <IconChevronLeft class="size-5" />
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
        workerStatus={props.workerStatus}
        cardListStore={props.cardListStore}
        onApplySuccess={undefined}
        onSerializeRequest={props.onSerializeRequest}
        onValidateRequest={props.onValidateRequest}
        onDraftActiveChange={setIsDraftActive}
        onDeckReportClick={props.onDeckReportClick}
        onViewInSearch={props.onViewInSearch}
        onEditorModeChange={setEditorMode}
      />
    </div>
  )
}
