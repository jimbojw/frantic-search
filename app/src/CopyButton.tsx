// SPDX-License-Identifier: Apache-2.0
import { createSignal, Show } from 'solid-js'
import { IconCheck, IconClipboardDocument } from './Icons'

export default function CopyButton(props: { text: string; onCopySuccess?: () => void }) {
  const [copied, setCopied] = createSignal(false)
  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(props.text)
      props.onCopySuccess?.()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available */
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied() ? 'Copied' : 'Copy name'}
      class="shrink-0 p-0.5 rounded text-gray-400 dark:text-gray-500 opacity-60 transition-opacity group-hover:opacity-100 hover:opacity-100 active:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
    >
      <Show when={copied()} fallback={<IconClipboardDocument class="size-4" />}>
        <IconCheck class="size-4 text-green-600 dark:text-green-500" />
      </Show>
    </button>
  )
}
