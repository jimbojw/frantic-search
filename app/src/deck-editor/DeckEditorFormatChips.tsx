// SPDX-License-Identifier: Apache-2.0
import { Show, For, Switch, Match } from 'solid-js'
import { useDeckEditorContext } from './DeckEditorContext'
import { ALL_FORMATS } from './serialization'

export default function DeckEditorFormatChips() {
  const ctx = useDeckEditorContext()

  return (
    <Show when={ctx.mode() === 'display' || ctx.mode() === 'review'} fallback={null}>
      <div class="grid grid-cols-1 min-[580px]:grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm min-w-0">
        <div class="flex flex-col shrink-0 self-center">
          <span class="text-gray-600 dark:text-gray-400 font-medium">Compatible with:</span>
        </div>
        <div class="flex flex-wrap gap-2 min-w-0">
          <For each={ALL_FORMATS}>
            {(fmt) => {
              const isSelected = () => ctx.selectedFormat() === fmt.id
              return (
                <button
                  type="button"
                  onClick={() => ctx.handleFormatSelect(fmt.id)}
                  class={`inline-flex items-center justify-center min-h-11 px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors ${
                    isSelected()
                      ? 'bg-gray-100 dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-500 text-blue-700 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'bg-gray-100 dark:bg-gray-800 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {fmt.label}
                </button>
              )
            }}
          </For>
        </div>
        <div class="col-span-full text-xs text-gray-500 dark:text-gray-400">
          <Switch fallback={null}>
            <Match when={ctx.selectedFormat() === 'archidekt'}>
              Use{' '}
              <a
                href="https://archidekt.com/sandbox"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Archidekt Sandbox
              </a>
              {' '}to import
            </Match>
            <Match when={ctx.selectedFormat() === 'arena'}>
              Follow Arena's{' '}
              <a
                href="https://mtgarena-support.wizards.com/hc/en-us/articles/360049857771-Importing-a-Deck"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Import Guide
              </a>
              {' '}— Decks tab → Import
            </Match>
            <Match when={ctx.selectedFormat() === 'manapool'}>
              Paste into Mana Pool's{' '}
              <a
                href="https://manapool.com/add-deck?ref=franticsearch"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Mass Entry form
              </a>
            </Match>
            <Match when={ctx.selectedFormat() === 'melee'}>
              Use Melee's{' '}
              <a
                href="https://help.melee.gg/docs/how-to-create-a-decklist-with-melees-decklist-builder"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                decklist builder
              </a>
              {' '}for tournament submission
            </Match>
            <Match when={ctx.selectedFormat() === 'moxfield'}>
              From{' '}
              <a
                href="https://www.moxfield.com/decks/personal"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Moxfield personal decks
              </a>
              {' '}(must be logged in) click New, then paste in the editor
            </Match>
            <Match when={ctx.selectedFormat() === 'mtggoldfish'}>
              Paste into{' '}
              <a
                href="https://www.mtggoldfish.com/decks/new"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                MTGGoldfish's deck builder
              </a>
            </Match>
            <Match when={ctx.selectedFormat() === 'mtgsalvation'}>
              Paste into MTG Salvation's deck builder
            </Match>
            <Match when={ctx.selectedFormat() === 'tappedout'}>
              Use TappedOut's{' '}
              <a
                href="https://tappedout.net/mtg-decks/paste/"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Paste page
              </a>
              {' '}to import
            </Match>
            <Match when={ctx.selectedFormat() === 'tcgplayer'}>
              Paste into TCGPlayer's{' '}
              <a
                href="https://partner.tcgplayer.com/X4mx1a"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:no-underline"
              >
                Mass Entry
              </a>
            </Match>
          </Switch>
        </div>
      </div>
    </Show>
  )
}
