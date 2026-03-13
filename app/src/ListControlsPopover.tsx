// SPDX-License-Identifier: Apache-2.0
import { createSignal, For, onMount, onCleanup, Show } from 'solid-js'
import ListControls from './ListControls'
import CardImage from './CardImage'
import { IconMinus, IconPlus, IconVerticalBar } from './Icons'

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
  /** Optional card image to show at top of popover. */
  cardImage?: {
    scryfallId: string
    colorIdentity: number
    thumbHash: string
    onClick?: () => void
  }
}) {
  const [isOpen, setIsOpen] = createSignal(false)
  let wrapperRef: HTMLDivElement | undefined
  let triggerRef: HTMLButtonElement | undefined
  let popoverRef: HTMLDivElement | undefined

  function positionPopover() {
    if (!wrapperRef || !triggerRef || !popoverRef) return
    const rect = triggerRef.getBoundingClientRect()
    const PW = 300
    const BH = rect.height
    const BW = rect.width
    const BX = rect.left
    const VW = window.innerWidth
    const gap = 4
    const padding = 8

    // Vertical: bottom:BH aligns popover bottom with button top; top:BH aligns popover top with button bottom.
    // No need to know popover height. If button center is in lower half of viewport, show above; else below.
    const buttonCenterY = rect.top + BH / 2
    const showAbove = buttonCenterY > window.innerHeight / 2

    popoverRef.style.inset = 'unset'
    if (showAbove) {
      popoverRef.style.top = 'unset'
      popoverRef.style.bottom = `${BH + gap}px`
    } else {
      popoverRef.style.bottom = 'unset'
      popoverRef.style.top = `${BH + gap}px`
    }

    // Horizontal: left:0 (align left edges) fits if popover right BX+PW stays in viewport.
    // right:0 (align right edges) fits if popover left BX+BW-PW stays in viewport.
    // Else center: popover.left = VW/2 - PW/2 - BX (in wrapper-relative coords, BX = wrapper left).
    const leftFits = BX >= padding && BX + PW <= VW - padding
    const rightFits = BX + BW - PW >= padding && BX + BW <= VW - padding

    if (leftFits) {
      popoverRef.style.left = '0'
      popoverRef.style.right = 'unset'
    } else if (rightFits) {
      popoverRef.style.left = 'unset'
      popoverRef.style.right = '0'
    } else {
      const left = VW / 2 - PW / 2 - BX
      popoverRef.style.left = `${left}px`
      popoverRef.style.right = 'unset'
    }
  }

  function open() {
    setIsOpen(true)
    queueMicrotask(() => positionPopover())
  }

  function close() {
    setIsOpen(false)
  }

  onMount(() => {
    const wrapper = wrapperRef
    if (!wrapper) return
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen() && !wrapper.contains(e.target as Node)) close()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    onCleanup(() => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    })
  })

  return (
    <div ref={(el) => { wrapperRef = el }} class="relative inline-flex shrink-0 overflow-visible">
      <button
        ref={(el) => { triggerRef = el }}
        type="button"
        onClick={() => (isOpen() ? close() : open())}
        class="flex items-center justify-center gap-0.5 min-h-11 min-w-11 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-800/80 px-2 py-2 text-xs font-mono text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 transition-colors"
        aria-label="Add or remove from list"
        aria-expanded={isOpen()}
        aria-haspopup="dialog"
      >
        <IconPlus class="size-3.5" />
        <IconVerticalBar class="size-4.5 opacity-60" />
        <IconMinus class="size-3.5" />
      </button>
      <Show when={isOpen()}>
        <div
          ref={(el) => { popoverRef = el }}
          id={props.popoverId}
          role="dialog"
          aria-label="Add or remove from list"
          class="absolute w-[300px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden z-50"
        >
          <div class="flex flex-col">
          <Show when={props.cardImage}>
            {(card) => (
              <div class="shrink-0 px-2 pt-2">
                <CardImage
                  scryfallId={card().scryfallId}
                  colorIdentity={card().colorIdentity}
                  thumbHash={card().thumbHash}
                  class="w-full cursor-pointer rounded-lg"
                  onClick={() => {
                    card().onClick?.()
                    close()
                  }}
                />
              </div>
            )}
          </Show>
          <div class="p-2 grid gap-2 grid-cols-[1fr_auto]">
            <For each={props.entries}>
              {(entry) => (
                <>
                  <span class="text-xs text-gray-500 dark:text-gray-400 min-w-0 break-words flex items-center" title={entry.label}>
                    {entry.label}
                  </span>
                  <div class="flex items-center justify-end">
                    <ListControls
                      count={entry.count}
                      onAdd={entry.onAdd}
                      onRemove={entry.onRemove}
                      addLabel={entry.addLabel}
                      removeLabel={entry.removeLabel}
                    />
                  </div>
                </>
              )}
            </For>
          </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
