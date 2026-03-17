// SPDX-License-Identifier: Apache-2.0
import { For } from 'solid-js'
import { DOC_INDEX, VISIBLE_QUADRANTS, type DocQuadrant } from './index'

const QUADRANT_LABELS: Record<DocQuadrant, string> = {
  tutorials: 'Tutorials',
  'how-to': 'How-To',
  reference: 'Reference',
  explanation: 'Explanation',
}

const QUADRANT_ORDER: DocQuadrant[] = ['tutorials', 'how-to', 'reference', 'explanation']

function buildDocUrl(docParam: string): string {
  const params = new URLSearchParams(location.search)
  params.set('doc', docParam)
  return `?${params.toString()}`
}

/** Reference quadrant shows hub + cheat sheet only; granular articles reached via hub, cheat sheet, or sidebar. */
const REFERENCE_HUB_ENTRIES = [
  { docParam: 'reference/index', title: 'Reference' },
  { docParam: 'reference/syntax', title: 'Syntax cheat sheet' },
]

export default function DocsHub(props: { onNavigateToDoc: (docParam: string) => void }) {
  const byQuadrant = () => {
    const map = new Map<DocQuadrant, typeof DOC_INDEX>()
    for (const entry of DOC_INDEX) {
      let list = map.get(entry.quadrant)
      if (!list) {
        list = []
        map.set(entry.quadrant, list)
      }
      list.push(entry)
    }
    return QUADRANT_ORDER.filter((q) => VISIBLE_QUADRANTS.includes(q)).map((q) => ({
      quadrant: q,
      entries: q === 'reference' ? REFERENCE_HUB_ENTRIES : (map.get(q) ?? []),
    }))
  }

  return (
    <div class="prose dark:prose-invert max-w-none">
      <h1>Documentation</h1>
      <p class="lead text-gray-600 dark:text-gray-400">
        Learn how to search, find budget alternatives, and understand the query syntax.
      </p>
      <div class="flex flex-col gap-8 mt-8">
        <For each={byQuadrant()}>
          {({ quadrant, entries }) => (
            <section>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                {QUADRANT_LABELS[quadrant]}
              </h2>
              <ul class="list-none pl-0 space-y-2">
                <For each={entries}>
                  {(entry) => (
                    <li>
                      <a
                        href={buildDocUrl(entry.docParam)}
                        onClick={(e) => {
                          e.preventDefault()
                          props.onNavigateToDoc(entry.docParam)
                        }}
                        class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {entry.title}
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
