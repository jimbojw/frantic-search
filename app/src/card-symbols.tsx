// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'

const MANA_SYMBOL_RE = /\{([^}]+)\}/g

const SYMBOL_OVERRIDES: Record<string, string> = {
  t: 'tap',
  q: 'untap',
}

function symbolToClass(raw: string): string {
  const normalized = raw.toLowerCase().replace('/', '')
  return SYMBOL_OVERRIDES[normalized] ?? normalized
}

export function ManaCost(props: { cost: string }) {
  const symbols = () => {
    const result: string[] = []
    let match
    MANA_SYMBOL_RE.lastIndex = 0
    while ((match = MANA_SYMBOL_RE.exec(props.cost)) !== null) {
      result.push(symbolToClass(match[1]))
    }
    return result
  }

  return (
    <span class="inline-flex items-center gap-px shrink-0">
      <For each={symbols()}>
        {(sym) => <i class={`ms ms-${sym} ms-cost`} />}
      </For>
    </span>
  )
}

type Segment = { type: 'text'; value: string } | { type: 'symbol'; value: string }

function parseSymbols(text: string): Segment[] {
  const result: Segment[] = []
  let lastIndex = 0
  MANA_SYMBOL_RE.lastIndex = 0
  let match
  while ((match = MANA_SYMBOL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    result.push({ type: 'symbol', value: symbolToClass(match[1]) })
    lastIndex = MANA_SYMBOL_RE.lastIndex
  }
  if (lastIndex < text.length) {
    result.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return result
}

export function OracleText(props: { text: string; class?: string }) {
  const segments = () => parseSymbols(props.text)

  return (
    <p class={props.class ?? 'mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap'}>
      <For each={segments()}>
        {(seg) => seg.type === 'symbol'
          ? <i class={`ms ms-${seg.value} ms-cost`} style="font-size: 0.85em" />
          : <>{seg.value}</>
        }
      </For>
    </p>
  )
}
