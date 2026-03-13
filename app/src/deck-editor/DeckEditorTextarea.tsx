// SPDX-License-Identifier: Apache-2.0
import ListHighlight from '../ListHighlight'
import { useDeckEditorContext } from './DeckEditorContext'

export default function DeckEditorTextarea() {
  const ctx = useDeckEditorContext()

  return (
    <div class="grid overflow-hidden relative overscroll-contain bg-white dark:bg-gray-900">
      <div class="hl-layer overflow-hidden whitespace-pre-wrap break-words p-3 min-h-[200px]">
        <ListHighlight
          text={ctx.highlightText()}
          validation={ctx.highlightValidation()}
          class="text-sm leading-relaxed"
        />
      </div>
      <textarea
        ref={(el) => ctx.registerTextareaRef(el)}
        value={ctx.textareaValue()}
        onInput={ctx.handleInput}
        readOnly={ctx.mode() === 'display'}
        placeholder={ctx.mode() === 'init' ? 'Paste or type a deck list…\n\n1 Lightning Bolt\n4x Birds of Paradise\n1 Shock (M21) 159' : undefined}
        autocapitalize="none"
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        rows={10}
        class={`hl-input w-full bg-transparent p-3 text-sm leading-relaxed font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none overflow-hidden overscroll-contain resize-none min-h-[200px] ${
          ctx.mode() === 'display'
            ? 'cursor-default'
            : 'cursor-text focus:ring-2 focus:ring-blue-500 focus:ring-inset'
        }`}
      />
    </div>
  )
}
