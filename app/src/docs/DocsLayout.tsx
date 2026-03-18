// SPDX-License-Identifier: Apache-2.0
import type { Accessor } from 'solid-js'
import { createSignal, createResource, createEffect, Show, For, onMount, onCleanup } from 'solid-js'
import { IconChevronLeft, IconChevronRight } from '../Icons'
import {
  DOC_INDEX,
  VISIBLE_QUADRANTS,
  buildReferenceSidebarTree,
  sectionContainsDocParam,
  type DocEntry,
  type DocQuadrant,
  type ReferenceSidebarNode,
  type SidebarSection,
} from './index'
import { getDocLoader } from './doc-loader'
import { MDXProvider } from './components/MdxProvider'
import DocCode from './components/DocCode'
import QueryExample from './components/QueryExample'
import DocsHub from './DocsHub'

const QUADRANT_LABELS: Record<DocQuadrant, string> = {
  tutorials: 'Tutorials',
  'how-to': 'How-To',
  reference: 'Reference',
  explanation: 'Explanation',
}

const QUADRANT_ORDER: DocQuadrant[] = ['tutorials', 'how-to', 'reference', 'explanation']

function buildDocUrl(docParam: string | null): string {
  const params = new URLSearchParams(location.search)
  if (docParam) params.set('doc', docParam)
  else params.set('doc', '')
  return `?${params.toString()}`
}

function SidebarNode(props: {
  node: ReferenceSidebarNode
  depth: number
  docParam: Accessor<string | null>
  buildDocUrl: (docParam: string | null) => string
  toggleSection: (id: string) => void
  isSectionExpanded: (id: string) => boolean
}) {
  const { node, depth, docParam, buildDocUrl, toggleSection, isSectionExpanded } = props
  const indent = depth > 0 ? 'ml-4' : ''
  const linkClass = (active: boolean) =>
    `block px-3 py-1.5 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`
  const topLinkClass = (active: boolean) =>
    `block px-3 py-2 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`

  if (node.type === 'link') {
    return (
      <li>
        <a
          href={buildDocUrl(node.docParam)}
          class={depth === 0 ? topLinkClass(docParam() === node.docParam) : linkClass(docParam() === node.docParam)}
        >
          {node.title}
        </a>
      </li>
    )
  }

  const section = node
  return (
    <li>
      <button
        type="button"
        onClick={() => toggleSection(section.id)}
        aria-expanded={isSectionExpanded(section.id)}
        class="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <IconChevronRight
          class={`size-4 shrink-0 transition-transform ${isSectionExpanded(section.id) ? 'rotate-90' : ''}`}
        />
        <span class="font-medium">{section.title}</span>
      </button>
      <Show when={isSectionExpanded(section.id)} keyed>
        <ul class={`${indent} mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 dark:border-gray-700 pl-2`}>
          <For each={section.children}>
            {(child) => (
              <SidebarNode
                node={child}
                depth={depth + 1}
                docParam={docParam}
                buildDocUrl={buildDocUrl}
                toggleSection={toggleSection}
                isSectionExpanded={isSectionExpanded}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  )
}

export default function DocsLayout(props: {
  docParam: Accessor<string | null>
  onSelectExample?: (q: string) => void
  onBack: () => void
  onNavigateHome: () => void
  onNavigateToDoc: (docParam: string | null) => void
}) {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)

  const [docModule] = createResource(
    () => props.docParam(),
    async (docParam) => {
      const loader = docParam ? getDocLoader(docParam) : undefined
      return loader ? loader() : null
    },
  )

  const currentEntry = () =>
    props.docParam() ? DOC_INDEX.find((e) => e.docParam === props.docParam()) : null

  const byQuadrant = () => {
    const map = new Map<DocQuadrant, DocEntry[]>()
    for (const entry of DOC_INDEX) {
      let list = map.get(entry.quadrant)
      if (!list) {
        list = []
        map.set(entry.quadrant, list)
      }
      list.push(entry)
    }
    return QUADRANT_ORDER.filter((q) => VISIBLE_QUADRANTS.includes(q)).map((q) => ({ quadrant: q, entries: map.get(q) ?? [] }))
  }

  const referenceTree = () => buildReferenceSidebarTree(DOC_INDEX)

  function findSectionById(nodes: ReferenceSidebarNode[], id: string): SidebarSection | null {
    for (const node of nodes) {
      if (node.type === 'section' && node.id === id) return node
      if (node.type === 'section') {
        const found = findSectionById(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  const [expandedSections, setExpandedSections] = createSignal<Set<string>>(new Set())
  const [collapsedByUser, setCollapsedByUser] = createSignal<Set<string>>(new Set())
  createEffect(() => {
    const docParam = props.docParam()
    if (!docParam || !docParam.startsWith('reference/')) return
    const doc: string = docParam
    const tree = referenceTree()
    const toExpand: string[] = []
    function collectSectionsToExpand(nodes: ReferenceSidebarNode[]) {
      for (const node of nodes) {
        if (node.type === 'section' && sectionContainsDocParam(node, doc)) {
          toExpand.push(node.id)
          collectSectionsToExpand(node.children)
        }
      }
    }
    collectSectionsToExpand(tree)
    if (toExpand.length > 0) {
      setExpandedSections((s) => new Set([...s, ...toExpand]))
      setCollapsedByUser((s) => {
        const next = new Set(s)
        for (const id of toExpand) next.delete(id)
        return next
      })
    }
  })

  const toggleSection = (id: string) => {
    const expanded = isSectionExpanded(id)
    if (expanded) {
      setCollapsedByUser((s) => new Set(s).add(id))
    } else {
      setExpandedSections((s) => new Set(s).add(id))
      setCollapsedByUser((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const isSectionExpanded = (sectionId: string): boolean => {
    const docParam = props.docParam()
    const section = findSectionById(referenceTree(), sectionId)
    if (!section) return false
    const contains = docParam && sectionContainsDocParam(section, docParam)
    const expanded = expandedSections().has(sectionId) || !!contains
    return expanded && !collapsedByUser().has(sectionId)
  }

  onMount(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = () => setSidebarOpen(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    onCleanup(() => mq.removeEventListener('change', handler))
  })

  return (
    <div class="flex flex-col min-h-dvh bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header class="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            class="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle sidebar"
          >
            <IconChevronRight class={`size-5 transition-transform ${sidebarOpen() ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={props.onNavigateHome}
            class="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Go to home"
            title="Frantic Search"
          >
            <img src="/pwa-192x192.png" alt="" class="size-8 rounded-lg" />
          </button>
          <button
            type="button"
            onClick={props.onBack}
            class="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Go back"
          >
            <IconChevronLeft class="size-5" />
          </button>
          <nav class="text-sm text-gray-500 dark:text-gray-400" aria-label="Breadcrumb">
            <a
              href={buildDocUrl(null)}
              onClick={(e) => {
                e.preventDefault()
                props.onNavigateToDoc(null)
              }}
              class="hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
            >
              Docs
            </a>
            <Show when={currentEntry()}>
              {(entry) => (
                <>
                  <span class="mx-1">›</span>
                  <span class="text-gray-700 dark:text-gray-300">{entry().title}</span>
                </>
              )}
            </Show>
          </nav>
        </div>
      </header>

      <div class="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          class={`absolute md:relative top-14 bottom-0 left-0 md:top-auto md:bottom-auto md:left-auto z-10 w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-transform duration-200 md:translate-x-0 ${
            sidebarOpen() ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
          onClick={(e) => {
            const target = (e.target as HTMLElement).closest('a[href^="?"]')
            if (target instanceof HTMLAnchorElement) {
              e.preventDefault()
              const href = target.getAttribute('href')
              if (href?.startsWith('?')) {
                const params = new URLSearchParams(href.slice(1))
                const doc = params.get('doc')
                props.onNavigateToDoc(doc === '' ? null : doc)
                setSidebarOpen(false)
              }
            }
          }}
        >
          <div class="flex-1 overflow-y-auto p-4">
            <nav class="flex flex-col gap-4">
              <For each={byQuadrant()}>
                {({ quadrant, entries }) => (
                  <div>
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                      {QUADRANT_LABELS[quadrant]}
                    </h3>
                    {quadrant === 'reference' ? (
                      <ul class="flex flex-col gap-0.5">
                        <For each={referenceTree()}>
                          {(node) => (
                            <SidebarNode
                              node={node}
                              depth={0}
                              docParam={props.docParam}
                              buildDocUrl={buildDocUrl}
                              toggleSection={toggleSection}
                              isSectionExpanded={isSectionExpanded}
                            />
                          )}
                        </For>
                      </ul>
                    ) : (
                      <ul class="flex flex-col gap-0.5">
                        <For each={entries}>
                          {(entry) => (
                            <li>
                              <a
                                href={buildDocUrl(entry.docParam)}
                                class={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                                  props.docParam() === entry.docParam
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                              >
                                {entry.title}
                              </a>
                            </li>
                          )}
                        </For>
                      </ul>
                    )}
                  </div>
                )}
              </For>
            </nav>
          </div>
        </aside>

        {/* Overlay when sidebar open on mobile */}
        <Show when={sidebarOpen()}>
          <div
            class="fixed inset-0 z-[9] bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        </Show>

        {/* Content */}
        <main class="flex-1 min-w-0 overflow-y-auto p-6 md:p-8">
          <Show when={!props.docParam()} fallback={
            <Show when={docModule.loading} fallback={
              <Show when={docModule.error} fallback={
                <Show when={docModule()} keyed>
                  {(mod) => {
                    const Content = mod.default
                    const isSyntax = props.docParam() === 'reference/syntax'
                    const syntaxProps = isSyntax
                      ? {
                          onSelectExample: props.onSelectExample ?? (() => {}),
                          onNavigateToDoc: props.onNavigateToDoc,
                        }
                      : {}
                    return (
                      <MDXProvider components={{ QueryExample, code: DocCode }}>
                        <div class="prose dark:prose-invert max-w-none prose-code:before:content-none prose-code:after:content-none">
                          <Content {...(syntaxProps as object)} />
                        </div>
                      </MDXProvider>
                    )
                  }}
                </Show>
              }>
                <div class="text-red-600 dark:text-red-400">
                  Failed to load article: {String(docModule.error)}
                </div>
              </Show>
            }>
              <div class="animate-pulse text-gray-500 dark:text-gray-400">Loading…</div>
            </Show>
          }>
            <DocsHub onNavigateToDoc={(dp) => props.onNavigateToDoc(dp)} />
          </Show>

          {/* Prev/Next footer */}
          <Show when={(() => {
            const entry = currentEntry()
            return entry && !docModule.loading && docModule() ? entry : null
          })()}>
            {(entry) => (
              <nav class="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 flex justify-between gap-4">
                <Show when={entry().prev} fallback={<span />}>
                  {(prev) => (
                    <a
                      href={buildDocUrl(prev())}
                      onClick={(e) => {
                        e.preventDefault()
                        props.onNavigateToDoc(prev())
                      }}
                      class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <IconChevronLeft class="size-4" />
                      Previous: {DOC_INDEX.find((e) => e.docParam === prev())?.title}
                    </a>
                  )}
                </Show>
                <Show when={entry().next} fallback={<span />}>
                  {(next) => (
                    <a
                      href={buildDocUrl(next())}
                      onClick={(e) => {
                        e.preventDefault()
                        props.onNavigateToDoc(next())
                      }}
                      class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline ml-auto cursor-pointer"
                    >
                      Next: {DOC_INDEX.find((e) => e.docParam === next())?.title}
                      <IconChevronRight class="size-4" />
                    </a>
                  )}
                </Show>
              </nav>
            )}
          </Show>
        </main>
      </div>
    </div>
  )
}
