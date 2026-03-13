// SPDX-License-Identifier: Apache-2.0
import { For, createMemo } from 'solid-js'
import type { ImportCandidate, InstanceState, DisplayColumns, PrintingDisplayColumns, DeckFormat } from '@frantic-search/shared'
import type { DiffResult } from '@frantic-search/shared'
import { serialize } from './serialization'
import ListHighlight from '../ListHighlight'

/** Zone order for Review diff list (Spec 119 § 7). */
const REVIEW_ZONE_ORDER: (string | null)[] = [
  'Commander',
  'Companion',
  'Deck',
  null,
  'Sideboard',
  'Maybeboard',
]

function candidateToInstance(c: ImportCandidate, listId: string): InstanceState {
  return {
    uuid: '',
    list_id: listId,
    oracle_id: c.oracle_id,
    scryfall_id: c.scryfall_id,
    finish: c.finish,
    zone: c.zone,
    tags: c.tags,
    collection_status: c.collection_status,
    variant: c.variant,
  }
}

function zoneOrderIndex(zone: string | null): number {
  const idx = REVIEW_ZONE_ORDER.indexOf(zone)
  return idx >= 0 ? idx : REVIEW_ZONE_ORDER.length
}

function sortKey(line: string): string {
  return line.replace(/^\d+x?\s*/i, '').toLowerCase()
}

interface DiffLine {
  kind: 'added' | 'removed' | 'unchanged'
  line: string
  zone: string | null
}

type DiffItem = { kind: 'header'; label: string } | DiffLine

function zoneDisplayName(zone: string | null): string {
  return zone ?? 'Deck'
}

function groupByZone(instances: InstanceState[]): Map<string | null, InstanceState[]> {
  const m = new Map<string | null, InstanceState[]>()
  for (const inst of instances) {
    const z = inst.zone ?? null
    let arr = m.get(z)
    if (!arr) {
      arr = []
      m.set(z, arr)
    }
    arr.push(inst)
  }
  return m
}

function buildDiffLines(
  diff: DiffResult,
  matched: InstanceState[],
  format: DeckFormat,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  listId: string,
  addedVisible: boolean,
  removedVisible: boolean,
  unchangedVisible: boolean
): DiffItem[] {
  const lines: DiffLine[] = []
  /** Card lines start with quantity (e.g. "1 ", "4x "). Exclude zone headers like "SIDEBOARD:". */
  const isCardLine = (l: string) => /^\d+x?\s/.test(l.trim())

  const addGroup = (kind: DiffLine['kind'], instances: InstanceState[]) => {
    if (instances.length === 0) return
    const zone = instances[0]!.zone ?? null
    const text = serialize(format, instances, display, printingDisplay)
    const perLine = text.split(/\r?\n/).filter((l) => l.trim() && isCardLine(l))
    for (const l of perLine) {
      lines.push({ kind, line: l.trim(), zone })
    }
  }

  if (addedVisible && diff.additions.length > 0) {
    const added = diff.additions.map((c) => candidateToInstance(c, listId))
    for (const insts of groupByZone(added).values()) {
      addGroup('added', insts)
    }
  }
  if (removedVisible && diff.removals.length > 0) {
    for (const insts of groupByZone(diff.removals).values()) {
      addGroup('removed', insts)
    }
  }
  if (unchangedVisible && matched.length > 0) {
    for (const insts of groupByZone(matched).values()) {
      addGroup('unchanged', insts)
    }
  }

  const byZone = new Map<string | null, DiffLine[]>()
  for (const d of lines) {
    const z = d.zone
    let arr = byZone.get(z)
    if (!arr) {
      arr = []
      byZone.set(z, arr)
    }
    arr.push(d)
  }

  const zones = [...byZone.keys()].sort(
    (a, b) => zoneOrderIndex(a) - zoneOrderIndex(b)
  )
  const otherZones = zones.filter((z) => zoneOrderIndex(z) >= REVIEW_ZONE_ORDER.length)
  otherZones.sort((a, b) => (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' }))

  const orderedZones = [
    ...zones.filter((z) => zoneOrderIndex(z) < REVIEW_ZONE_ORDER.length),
    ...otherZones,
  ]

  const result: DiffItem[] = []
  for (const zone of orderedZones) {
    const zoneLines = byZone.get(zone) ?? []
    if (zoneLines.length === 0) continue
    zoneLines.sort((a, b) => sortKey(a.line).localeCompare(sortKey(b.line), undefined, { sensitivity: 'base' }))
    result.push({ kind: 'header', label: zoneDisplayName(zone) })
    result.push(...zoneLines)
  }
  return result
}

export default function DeckEditorReviewView(props: {
  diff: DiffResult
  matchedInstances: InstanceState[]
  format: DeckFormat
  display: DisplayColumns
  printingDisplay: PrintingDisplayColumns | null
  listId: string
  addedVisible: boolean
  removedVisible: boolean
  unchangedVisible: boolean
}) {
  const items = createMemo(() =>
    buildDiffLines(
      props.diff,
      props.matchedInstances,
      props.format,
      props.display,
      props.printingDisplay,
      props.listId,
      props.addedVisible,
      props.removedVisible,
      props.unchangedVisible
    )
  )

  return (
    <div class="min-h-[200px] px-3 py-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900">
      <div class="flex flex-col gap-1 font-mono text-sm">
        <For each={items()}>
          {(item) =>
            item.kind === 'header' ? (
              <div class="pt-2 first:pt-0 text-gray-500 dark:text-gray-400 font-bold">
                {item.label}
              </div>
            ) : item.kind === 'added' ? (
              <div class="flex items-start gap-1.5 min-w-0 -mx-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/20">
                <span class="shrink-0 font-mono text-green-700 dark:text-green-400 font-medium" aria-hidden>
                  +
                </span>
                <div class="min-w-0 overflow-x-auto">
                  <ListHighlight text={item.line} class="text-sm leading-relaxed" />
                </div>
              </div>
            ) : item.kind === 'removed' ? (
              <div class="flex items-start gap-1.5 min-w-0 -mx-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/20">
                <span class="shrink-0 font-mono text-red-700 dark:text-red-400 font-medium" aria-hidden>
                  −
                </span>
                <div class="min-w-0 overflow-x-auto">
                  <ListHighlight text={item.line} class="text-sm leading-relaxed" />
                </div>
              </div>
            ) : (
              <div class="flex items-start gap-1.5 min-w-0 -mx-1 px-1.5">
                <span class="shrink-0 font-mono font-medium" aria-hidden>
                  {'\u00A0'}
                </span>
                <div class="min-w-0 overflow-x-auto">
                  <ListHighlight text={item.line} class="text-sm leading-relaxed text-gray-600 dark:text-gray-400" />
                </div>
              </div>
            )
          }
        </For>
      </div>
    </div>
  )
}
