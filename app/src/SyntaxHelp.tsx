// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'

interface FieldEntry {
  field: string
  aliases: string[]
  description: string
  example: string
}

interface OperatorEntry {
  operator: string
  meaning: string
  example: string
}

interface CombiningEntry {
  label: string
  description: string
  example: string
}

interface RegexEntry {
  label: string
  description: string
  example: string
}

interface DivergenceEntry {
  behavior: string
  scryfall: string
  franticSearch: string
}

const FIELDS: FieldEntry[] = [
  { field: 'name', aliases: ['n'], description: 'Card name (substring)', example: 'n:bolt' },
  { field: 'oracle', aliases: ['o'], description: 'Rules text (substring)', example: 'o:trample' },
  { field: 'type', aliases: ['t'], description: 'Type line (substring)', example: 't:creature' },
  { field: 'color', aliases: ['c'], description: 'Card colors', example: 'c:rg' },
  { field: 'identity', aliases: ['id', 'ci', 'cmd'], description: 'Color identity', example: 'id:wubrg' },
  { field: 'power', aliases: ['pow'], description: 'Power (numeric)', example: 'pow>=4' },
  { field: 'toughness', aliases: ['tou'], description: 'Toughness (numeric)', example: 'tou>5' },
  { field: 'loyalty', aliases: ['loy'], description: 'Loyalty (numeric)', example: 'loy>=3' },
  { field: 'defense', aliases: ['def'], description: 'Defense (numeric)', example: 'def>3' },
  { field: 'mana value', aliases: ['mv', 'cmc'], description: 'Mana value (numeric)', example: 'mv<=2' },
  { field: 'mana', aliases: ['m'], description: 'Mana cost (symbols)', example: 'm:{b/p}' },
  { field: 'legal', aliases: ['f', 'format'], description: 'Format legality', example: 'f:modern' },
]

const OPERATORS: OperatorEntry[] = [
  { operator: ':', meaning: 'Contains / has at least', example: 'o:destroy' },
  { operator: '=', meaning: 'Exactly equals', example: 'c=rg' },
  { operator: '!=', meaning: 'Not equal', example: 'c!=r' },
  { operator: '>', meaning: 'Greater than', example: 'pow>3' },
  { operator: '<', meaning: 'Less than', example: 'mv<3' },
  { operator: '>=', meaning: 'Greater or equal', example: 'tou>=5' },
  { operator: '<=', meaning: 'Less or equal', example: 'cmc<=2' },
]

const COMBINING: CombiningEntry[] = [
  { label: 'Implicit AND', description: 'Cards matching all terms', example: 't:creature c:green' },
  { label: 'OR', description: 'Cards matching either term', example: 'c:red OR c:blue' },
  { label: 'NOT', description: 'Exclude matching cards', example: '-c:black' },
  { label: 'Parentheses', description: 'Group sub-expressions', example: '(c:red OR c:blue) t:instant' },
  { label: 'Exact name', description: 'Match full card name', example: '!"Lightning Bolt"' },
]

const REGEX: RegexEntry[] = [
  { label: 'Field regex', description: 'Regex on a specific field', example: 'o:/enters the battlefield/' },
  { label: 'Bare regex', description: 'Searches name, oracle text, and type line', example: '/bolt/' },
]

const DIVERGENCES: DivergenceEntry[] = [
  { behavior: 'Default format filter', scryfall: 'Excludes cards not legal in any format', franticSearch: 'Shows all cards. Use f:standard (etc.) to filter.' },
  { behavior: 'Bare regex', scryfall: 'Not supported', franticSearch: '/pattern searches name, oracle text, and type line' },
]

function ExampleButton(props: { example: string; onSelect: (q: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.example)}
      class="font-mono text-blue-600 dark:text-blue-400 hover:underline focus:underline focus:outline-none"
    >
      {props.example}
    </button>
  )
}

export default function SyntaxHelp(props: { onSelectExample: (q: string) => void }) {
  return (
    <div class="mx-auto max-w-2xl px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-bold tracking-tight">Syntax Guide</h1>
        <button
          type="button"
          onClick={() => history.back()}
          aria-label="Close syntax help"
          class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
        >
          <svg class="size-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Frantic Search is based on{' '}
        <a
          href="https://scryfall.com/docs/syntax"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Scryfall syntax
        </a>.
      </p>

      <section class="mb-8">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Fields</h2>
        <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th class="px-4 py-2 font-medium">Field</th>
                <th class="px-4 py-2 font-medium hidden sm:table-cell">Aliases</th>
                <th class="px-4 py-2 font-medium">Searches</th>
                <th class="px-4 py-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <For each={FIELDS}>
                {(entry) => (
                  <tr>
                    <td class="px-4 py-1.5 font-mono text-xs">{entry.field}</td>
                    <td class="px-4 py-1.5 font-mono text-xs text-gray-400 dark:text-gray-500 hidden sm:table-cell">
                      {entry.aliases.length > 0 ? entry.aliases.join(', ') : '\u2014'}
                    </td>
                    <td class="px-4 py-1.5 text-xs text-gray-600 dark:text-gray-300">{entry.description}</td>
                    <td class="px-4 py-1.5 text-xs">
                      <ExampleButton example={entry.example} onSelect={props.onSelectExample} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Operators</h2>
        <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th class="px-4 py-2 font-medium">Operator</th>
                <th class="px-4 py-2 font-medium">Meaning</th>
                <th class="px-4 py-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <For each={OPERATORS}>
                {(entry) => (
                  <tr>
                    <td class="px-4 py-1.5 font-mono text-xs">{entry.operator}</td>
                    <td class="px-4 py-1.5 text-xs text-gray-600 dark:text-gray-300">{entry.meaning}</td>
                    <td class="px-4 py-1.5 text-xs">
                      <ExampleButton example={entry.example} onSelect={props.onSelectExample} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Combining Queries</h2>
        <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <For each={COMBINING}>
            {(entry) => (
              <div class="px-4 py-2.5 flex items-baseline justify-between gap-4">
                <div class="min-w-0">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{entry.label}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">{entry.description}</span>
                </div>
                <span class="text-xs shrink-0">
                  <ExampleButton example={entry.example} onSelect={props.onSelectExample} />
                </span>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Regex</h2>
        <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <For each={REGEX}>
            {(entry) => (
              <div class="px-4 py-2.5 flex items-baseline justify-between gap-4">
                <div class="min-w-0">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{entry.label}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">{entry.description}</span>
                </div>
                <span class="text-xs shrink-0">
                  <ExampleButton example={entry.example} onSelect={props.onSelectExample} />
                </span>
              </div>
            )}
          </For>
        </div>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400 px-1">
          Regex is case-insensitive. The trailing <code class="font-mono">/</code> is optional.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Differences from Scryfall</h2>
        <div class="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-amber-200 dark:border-amber-800/50 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th class="px-4 py-2 font-medium">Behavior</th>
                <th class="px-4 py-2 font-medium">Scryfall</th>
                <th class="px-4 py-2 font-medium">Frantic Search</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-amber-100 dark:divide-amber-800/30">
              <For each={DIVERGENCES}>
                {(entry) => (
                  <tr>
                    <td class="px-4 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">{entry.behavior}</td>
                    <td class="px-4 py-1.5 text-xs text-gray-600 dark:text-gray-300">{entry.scryfall}</td>
                    <td class="px-4 py-1.5 text-xs text-gray-600 dark:text-gray-300">{entry.franticSearch}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
