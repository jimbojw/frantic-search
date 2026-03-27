// SPDX-License-Identifier: Apache-2.0
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import {
  formatMarkdownInlineLink,
  parse,
  singleExactNameFromAst,
} from '@frantic-search/shared'
import { IconCheck, IconClipboardDocument } from './Icons'
import { captureUiInteracted } from './analytics'

type CopyKind = 'url' | 'markdown_search' | 'markdown_card_name'

const ANALYTICS_STATE: Record<CopyKind, string> = {
  url: 'copied_url',
  markdown_search: 'copied_markdown_search',
  markdown_card_name: 'copied_markdown_card_name',
}

export default function CopyLinkMenu(props: {
  variant: 'header' | 'rail'
  /** Effective search string for Markdown (search) row. */
  markdownSearchText: () => string
  /** Query string to parse for optional single EXACT name row. */
  exactNameQuery: () => string
}) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  let wrapperRef: HTMLDivElement | undefined
  let triggerRef: HTMLButtonElement | undefined
  let menuRef: HTMLDivElement | undefined

  const cardName = createMemo(() => {
    const q = props.exactNameQuery().trim()
    if (!q) return null
    return singleExactNameFromAst(parse(q))
  })

  function positionMenu() {
    if (!wrapperRef || !triggerRef || !menuRef) return
    const rect = triggerRef.getBoundingClientRect()
    const menuRect = menuRef.getBoundingClientRect()
    const PW = Math.max(220, menuRect.width)
    const BH = rect.height
    const BX = rect.left
    const VW = window.innerWidth
    const gap = 4
    const padding = 8

    const buttonCenterY = rect.top + BH / 2
    const showAbove = buttonCenterY > window.innerHeight / 2

    menuRef.style.inset = 'unset'
    if (showAbove) {
      menuRef.style.top = 'unset'
      menuRef.style.bottom = `${BH + gap}px`
    } else {
      menuRef.style.bottom = 'unset'
      menuRef.style.top = `${BH + gap}px`
    }

    const leftFits = BX >= padding && BX + PW <= VW - padding
    const rightFits = BX + rect.width - PW >= padding && BX + rect.width <= VW - padding

    if (leftFits) {
      menuRef.style.left = '0'
      menuRef.style.right = 'unset'
    } else if (rightFits) {
      menuRef.style.left = 'unset'
      menuRef.style.right = '0'
    } else {
      const left = VW / 2 - PW / 2 - BX
      menuRef.style.left = `${left}px`
      menuRef.style.right = 'unset'
    }
  }

  function openMenu() {
    setMenuOpen(true)
    captureUiInteracted({ element_name: 'copy_link_menu', action: 'clicked', state: 'opened' })
  }

  createEffect(() => {
    if (menuOpen()) {
      queueMicrotask(() => positionMenu())
      requestAnimationFrame(() => positionMenu())
    }
  })

  function closeMenu() {
    setMenuOpen(false)
  }

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    if (menuOpen()) closeMenu()
    else openMenu()
  }

  async function copyPayload(text: string, kind: CopyKind) {
    try {
      await navigator.clipboard.writeText(text)
      captureUiInteracted({
        element_name: 'copy_link_menu',
        action: 'clicked',
        state: ANALYTICS_STATE[kind],
      })
      setCopied(true)
      closeMenu()
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available */
    }
  }

  function onCopyUrl(e: MouseEvent) {
    e.stopPropagation()
    void copyPayload(location.href, 'url')
  }

  function onCopyMarkdownSearch(e: MouseEvent) {
    e.stopPropagation()
    const href = location.href
    void copyPayload(formatMarkdownInlineLink(props.markdownSearchText(), href), 'markdown_search')
  }

  function onCopyMarkdownCard(e: MouseEvent) {
    e.stopPropagation()
    const name = cardName()
    if (!name) return
    void copyPayload(formatMarkdownInlineLink(name, location.href), 'markdown_card_name')
  }

  onMount(() => {
    const wrapper = wrapperRef
    if (!wrapper) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuOpen() && !wrapper.contains(e.target as Node)) closeMenu()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    onCleanup(() => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    })
  })

  const baseClass =
    props.variant === 'header'
      ? 'flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
      : 'mt-2 flex h-8 min-w-8 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'

  const triggerLabel = () => (copied() ? 'Copied' : 'Copy…')

  return (
    <div ref={(el) => { wrapperRef = el }} class="relative inline-flex shrink-0 overflow-visible">
      <button
        ref={(el) => { triggerRef = el }}
        type="button"
        onClick={toggleMenu}
        title={props.variant === 'rail' ? triggerLabel() : undefined}
        aria-label={triggerLabel()}
        aria-expanded={menuOpen()}
        aria-haspopup="menu"
        class={baseClass}
      >
        <Show when={copied()} fallback={<IconClipboardDocument class="size-5 shrink-0" />}>
          <IconCheck class="size-5 shrink-0 text-green-600 dark:text-green-500" />
        </Show>
        {props.variant === 'header' && (
          <span class="text-sm whitespace-nowrap">{copied() ? 'Copied!' : 'Copy…'}</span>
        )}
      </button>
      <Show when={menuOpen()}>
        <div
          ref={(el) => { menuRef = el }}
          role="menu"
          aria-label="Copy options"
          class="absolute z-50 min-w-[220px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1"
        >
          <button
            type="button"
            role="menuitem"
            class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={onCopyUrl}
          >
            URL
          </button>
          <button
            type="button"
            role="menuitem"
            class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={onCopyMarkdownSearch}
          >
            Markdown (search)
          </button>
          <Show when={cardName()}>
            {(name) => (
              <button
                type="button"
                role="menuitem"
                class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={onCopyMarkdownCard}
              >
                Markdown — {name()}
              </button>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
