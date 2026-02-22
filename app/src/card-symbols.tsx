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

type Block = { reminder: boolean; segments: Segment[] }

const REMINDER_RE = /\([^)]*\)/g

function parseOracleBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let lastIndex = 0
  REMINDER_RE.lastIndex = 0
  let match
  while ((match = REMINDER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ reminder: false, segments: parseSymbols(text.slice(lastIndex, match.index)) })
    }
    blocks.push({ reminder: true, segments: parseSymbols(match[0]) })
    lastIndex = REMINDER_RE.lastIndex
  }
  if (lastIndex < text.length) {
    blocks.push({ reminder: false, segments: parseSymbols(text.slice(lastIndex)) })
  }
  return blocks
}

function SegmentList(props: { segments: Segment[] }) {
  return (
    <For each={props.segments}>
      {(seg) => seg.type === 'symbol'
        ? <i class={`ms ms-${seg.value} ms-cost`} style="font-size: 0.85em" />
        : <>{seg.value}</>
      }
    </For>
  )
}

export function OracleText(props: { text: string; class?: string }) {
  const blocks = () => parseOracleBlocks(props.text)

  return (
    <p class={props.class ?? 'mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap'}>
      <For each={blocks()}>
        {(block) => block.reminder
          ? <span class="italic"><SegmentList segments={block.segments} /></span>
          : <SegmentList segments={block.segments} />
        }
      </For>
    </p>
  )
}
