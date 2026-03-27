// SPDX-License-Identifier: Apache-2.0
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { formatMarkdownInlineLink } from '@frantic-search/shared'
import { IconCheck, IconClipboardDocument } from './Icons'
import { captureCardDetailInteracted } from './analytics'

type CopyKind = 'url' | 'url_card_only' | 'name' | 'markdown' | 'slack_reddit'

const CLIPBOARD_CONTROL: Record<
  CopyKind,
  | 'card_copy_url'
  | 'card_copy_url_card_only'
  | 'card_copy_name'
  | 'card_copy_markdown'
  | 'card_copy_slack_reddit'
> = {
  url: 'card_copy_url',
  url_card_only: 'card_copy_url_card_only',
  name: 'card_copy_name',
  markdown: 'card_copy_markdown',
  slack_reddit: 'card_copy_slack_reddit',
}

function cardOnlyPageUrl(cardScryfallId: string): string {
  const u = new URL(location.href)
  u.search = ''
  u.searchParams.set('card', cardScryfallId)
  return u.toString()
}

export default function CardCopyMenu(props: {
  /** Printing Scryfall id for this card page (`card` query param). */
  cardScryfallId: () => string
  /** Oracle-level full name (faces joined with ` // `). */
  cardFullName: () => string
  /** Slack/Reddit bracket line, or null to hide that row. */
  slackReference: () => string | null
}) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  let wrapperRef: HTMLDivElement | undefined
  let triggerRef: HTMLButtonElement | undefined
  let menuRef: HTMLDivElement | undefined

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
    captureCardDetailInteracted({ control: 'card_copy_menu_opened' })
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
      captureCardDetailInteracted({ control: CLIPBOARD_CONTROL[kind] })
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

  function onCopyUrlCardOnly(e: MouseEvent) {
    e.stopPropagation()
    const id = props.cardScryfallId().trim()
    if (!id) return
    void copyPayload(cardOnlyPageUrl(id), 'url_card_only')
  }

  function onCopyName(e: MouseEvent) {
    e.stopPropagation()
    const name = props.cardFullName().trim()
    if (!name) return
    void copyPayload(name, 'name')
  }

  function onCopyMarkdown(e: MouseEvent) {
    e.stopPropagation()
    const name = props.cardFullName().trim()
    if (!name) return
    void copyPayload(formatMarkdownInlineLink(name, location.href), 'markdown')
  }

  function onCopySlack(e: MouseEvent) {
    e.stopPropagation()
    const s = props.slackReference()
    if (!s) return
    void copyPayload(s, 'slack_reddit')
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

  const triggerLabel = () => (copied() ? 'Copied' : 'Copy…')

  return (
    <div ref={(el) => { wrapperRef = el }} class="relative inline-flex shrink-0 overflow-visible">
      <button
        ref={(el) => { triggerRef = el }}
        type="button"
        onClick={toggleMenu}
        aria-label={triggerLabel()}
        aria-expanded={menuOpen()}
        aria-haspopup="menu"
        class="flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Show when={copied()} fallback={<IconClipboardDocument class="size-5 shrink-0" />}>
          <IconCheck class="size-5 shrink-0 text-green-600 dark:text-green-500" />
        </Show>
        <span class="text-sm whitespace-nowrap">{copied() ? 'Copied!' : 'Copy…'}</span>
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
            URL (as is)
          </button>
          <Show when={props.cardScryfallId().trim() !== ''}>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={onCopyUrlCardOnly}
            >
              URL (card only)
            </button>
          </Show>
          <Show when={props.cardFullName().trim() !== ''}>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={onCopyName}
            >
              Card name
            </button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={onCopyMarkdown}
            >
              Markdown link
            </button>
          </Show>
          <Show when={props.slackReference()}>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={onCopySlack}
            >
              Slack / Reddit
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
