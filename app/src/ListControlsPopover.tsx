// SPDX-License-Identifier: Apache-2.0
import { For, onMount, onCleanup } from 'solid-js'
import ListControls from './ListControls'
import { IconMinus, IconPlus } from './Icons'

export type ListControlEntry = {
  label: string
  count: number
  onAdd: () => void
  onRemove: () => void
  addLabel: string
  removeLabel: string
}

export default function ListControlsPopover(props: {
  popoverId: string
  entries: ListControlEntry[]
}) {
  let triggerRef: HTMLButtonElement | undefined
  let popoverRef: HTMLDivElement | undefined

  function positionPopover() {
    if (!triggerRef || !popoverRef) return
    const rect = triggerRef.getBoundingClientRect()
    const popoverHeight = 120
    const gap = 6
    const showAbove = rect.bottom + popoverHeight + gap > window.innerHeight
    popoverRef.style.position = 'fixed'
    popoverRef.style.inset = 'unset'
    popoverRef.style.left = `${rect.left}px`
    if (showAbove) {
      popoverRef.style.top = 'unset'
      popoverRef.style.bottom = `${window.innerHeight - rect.top + gap}px`
    } else {
      popoverRef.style.bottom = 'unset'
      popoverRef.style.top = `${rect.bottom + gap}px`
    }
  }

  onMount(() => {
    const popover = popoverRef
    if (!popover) return
    const handler = (e: ToggleEvent) => {
      if (e.newState === 'open') positionPopover()
    }
    popover.addEventListener('toggle', handler)
    onCleanup(() => popover.removeEventListener('toggle', handler))
  })

  return (
    <>
      <button
        ref={(el) => { triggerRef = el }}
        type="button"
        popovertarget={props.popoverId}
        popovertargetaction="toggle"
        class="shrink-0 flex items-center justify-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-800/80 px-1.5 py-0.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 transition-colors"
        aria-label="Add or remove from list"
      >
        <IconMinus class="size-3.5" />
        <IconPlus class="size-3.5" />
      </button>
      <div
        ref={(el) => { popoverRef = el }}
        id={props.popoverId}
        popover="auto"
        class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2"
      >
        <div class="flex flex-col gap-2">
          <For each={props.entries}>
            {(entry) => (
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0 min-w-[4rem] truncate" title={entry.label}>
                  {entry.label}
                </span>
                <ListControls
                  count={entry.count}
                  onAdd={entry.onAdd}
                  onRemove={entry.onRemove}
                  addLabel={entry.addLabel}
                  removeLabel={entry.removeLabel}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  )
}
