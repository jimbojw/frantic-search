// SPDX-License-Identifier: Apache-2.0
import { createSignal, Show } from 'solid-js'
import { IconCheck, IconClipboardDocument } from './Icons'

export default function CopyUrlButton(props: { variant: 'header' | 'rail' }) {
  const [copied, setCopied] = createSignal(false)
  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available */
    }
  }
  const baseClass =
    props.variant === 'header'
      ? 'flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
      : 'mt-2 flex h-8 min-w-8 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied() ? 'Copied' : 'Copy URL'}
      class={baseClass}
    >
      <Show when={copied()} fallback={<IconClipboardDocument class="size-5 shrink-0" />}>
        <IconCheck class="size-5 shrink-0 text-green-600 dark:text-green-500" />
      </Show>
      {props.variant === 'header' && (
        <span class="text-sm whitespace-nowrap">{copied() ? 'Copied!' : 'Copy URL'}</span>
      )}
    </button>
  )
}
