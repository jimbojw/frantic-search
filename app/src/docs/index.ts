// SPDX-License-Identifier: Apache-2.0
// Hand-maintained — update when adding, removing, or reordering articles

export type DocQuadrant = 'tutorials' | 'how-to' | 'reference' | 'explanation'

export interface DocEntry {
  id: string
  docParam: string
  title: string
  quadrant: DocQuadrant
  prev?: string
  next?: string
}

/** Quadrants shown in sidebar and hub. Set to ['reference'] to hide others until content is ready. */
export const VISIBLE_QUADRANTS: DocQuadrant[] = ['reference']

export interface SidebarLink {
  docParam: string
  title: string
}

export interface SidebarSection {
  id: string
  title: string
  indexDocParam: string
  children: ReferenceSidebarNode[]
}

export type ReferenceSidebarNode = { type: 'link' } & SidebarLink | { type: 'section' } & SidebarSection

/** Recursively check if a section contains docParam (any descendant link matches). */
export function sectionContainsDocParam(section: SidebarSection, docParam: string): boolean {
  if (docParam === section.indexDocParam) return true
  for (const child of section.children) {
    if (child.type === 'link') {
      if (child.docParam === docParam) return true
    } else {
      if (sectionContainsDocParam(child as SidebarSection, docParam)) return true
    }
  }
  return false
}

const REFERENCE_SECTION_LABELS: Record<string, string> = {
  fields: 'Fields',
  modifiers: 'Modifiers',
  composition: 'Composition',
  sorting: 'Sorting',
  special: 'Special',
  feedback: 'Feedback',
  scryfall: 'Scryfall',
  lists: 'Lists',
}

/** Build hierarchical sidebar tree for Reference quadrant. Derived from DOC_INDEX by path prefix. */
export function buildReferenceSidebarTree(entries: DocEntry[]): ReferenceSidebarNode[] {
  const refEntries = entries.filter((e) => e.quadrant === 'reference')
  const result: ReferenceSidebarNode[] = []

  result.push({ type: 'link', docParam: 'reference/index', title: 'Reference' })
  result.push({ type: 'link', docParam: 'reference/syntax', title: 'Syntax Cheat Sheet' })

  for (const segment of ['fields', 'modifiers', 'composition', 'sorting', 'special', 'feedback', 'scryfall', 'lists']) {
    const prefix = `reference/${segment}/`
    const segmentEntries = refEntries.filter((e) => e.docParam.startsWith(prefix))

    if (segment === 'fields' && segmentEntries.length > 0) {
      // Nested structure: Fields Overview + Face Fields + Printing Fields
      const fieldsIndex = segmentEntries.find((e) => e.docParam === 'reference/fields/index')
      const faceEntries = segmentEntries
        .filter((e) => e.docParam.startsWith('reference/fields/face/'))
        .map((e) => ({ type: 'link' as const, docParam: e.docParam, title: e.title }))
      const printingEntries = segmentEntries
        .filter((e) => e.docParam.startsWith('reference/fields/printing/'))
        .map((e) => ({ type: 'link' as const, docParam: e.docParam, title: e.title }))

      const fieldsChildren: ReferenceSidebarNode[] = []
      if (fieldsIndex) {
        fieldsChildren.push({ type: 'link', docParam: fieldsIndex.docParam, title: fieldsIndex.title })
      }
      if (faceEntries.length > 0) {
        fieldsChildren.push({
          type: 'section',
          id: 'reference-fields-face',
          title: 'Face Fields',
          indexDocParam: faceEntries[0].docParam,
          children: faceEntries,
        })
      }
      if (printingEntries.length > 0) {
        fieldsChildren.push({
          type: 'section',
          id: 'reference-fields-printing',
          title: 'Printing Fields',
          indexDocParam: printingEntries[0].docParam,
          children: printingEntries,
        })
      }
      result.push({
        type: 'section',
        id: 'reference-fields',
        title: REFERENCE_SECTION_LABELS.fields,
        indexDocParam: fieldsIndex?.docParam ?? faceEntries[0]?.docParam ?? printingEntries[0]?.docParam ?? prefix,
        children: fieldsChildren,
      })
    } else if (segmentEntries.length > 0) {
      const children: ReferenceSidebarNode[] = segmentEntries.map((e) => ({
        type: 'link' as const,
        docParam: e.docParam,
        title: e.title,
      }))
      result.push({
        type: 'section',
        id: `reference-${segment}`,
        title: REFERENCE_SECTION_LABELS[segment] ?? segment,
        indexDocParam: segmentEntries[0].docParam,
        children,
      })
    }
  }

  return result
}

// Reference articles in spec order: index → syntax → fields → modifiers → composition → sorting → special → feedback → scryfall → lists
const REFERENCE_ENTRIES: DocEntry[] = [
  { id: 'reference-index', docParam: 'reference/index', title: 'Reference', quadrant: 'reference', next: 'reference/syntax' },
  { id: 'syntax', docParam: 'reference/syntax', title: 'Syntax Cheat Sheet', quadrant: 'reference', prev: 'reference/index', next: 'reference/fields/index' },
  { id: 'fields-index', docParam: 'reference/fields/index', title: 'Fields Overview', quadrant: 'reference', prev: 'reference/syntax', next: 'reference/fields/face/atag' },
  // Face fields (alphabetically)
  { id: 'atag', docParam: 'reference/fields/face/atag', title: 'atag', quadrant: 'reference', prev: 'reference/fields/index', next: 'reference/fields/face/banned' },
  { id: 'banned', docParam: 'reference/fields/face/banned', title: 'banned', quadrant: 'reference', prev: 'reference/fields/face/atag', next: 'reference/fields/face/color' },
  { id: 'color', docParam: 'reference/fields/face/color', title: 'color', quadrant: 'reference', prev: 'reference/fields/face/banned', next: 'reference/fields/face/defense' },
  { id: 'defense', docParam: 'reference/fields/face/defense', title: 'defense', quadrant: 'reference', prev: 'reference/fields/face/color', next: 'reference/fields/face/edhrec' },
  { id: 'edhrec', docParam: 'reference/fields/face/edhrec', title: 'edhrec', quadrant: 'reference', prev: 'reference/fields/face/defense', next: 'reference/fields/face/identity' },
  { id: 'identity', docParam: 'reference/fields/face/identity', title: 'identity', quadrant: 'reference', prev: 'reference/fields/face/edhrec', next: 'reference/fields/face/is' },
  { id: 'is', docParam: 'reference/fields/face/is', title: 'is', quadrant: 'reference', prev: 'reference/fields/face/identity', next: 'reference/fields/face/kw' },
  { id: 'kw', docParam: 'reference/fields/face/kw', title: 'kw', quadrant: 'reference', prev: 'reference/fields/face/is', next: 'reference/fields/face/legal' },
  { id: 'legal', docParam: 'reference/fields/face/legal', title: 'legal', quadrant: 'reference', prev: 'reference/fields/face/kw', next: 'reference/fields/face/loyalty' },
  { id: 'loyalty', docParam: 'reference/fields/face/loyalty', title: 'loyalty', quadrant: 'reference', prev: 'reference/fields/face/legal', next: 'reference/fields/face/mana' },
  { id: 'mana', docParam: 'reference/fields/face/mana', title: 'mana', quadrant: 'reference', prev: 'reference/fields/face/loyalty', next: 'reference/fields/face/produces' },
  { id: 'produces', docParam: 'reference/fields/face/produces', title: 'produces', quadrant: 'reference', prev: 'reference/fields/face/mana', next: 'reference/fields/face/mana-value' },
  { id: 'mana-value', docParam: 'reference/fields/face/mana-value', title: 'mana value', quadrant: 'reference', prev: 'reference/fields/face/produces', next: 'reference/fields/face/my' },
  { id: 'my', docParam: 'reference/fields/face/my', title: 'my', quadrant: 'reference', prev: 'reference/fields/face/mana-value', next: 'reference/fields/face/name' },
  { id: 'name', docParam: 'reference/fields/face/name', title: 'name', quadrant: 'reference', prev: 'reference/fields/face/my', next: 'reference/fields/face/oracle' },
  { id: 'oracle', docParam: 'reference/fields/face/oracle', title: 'oracle', quadrant: 'reference', prev: 'reference/fields/face/name', next: 'reference/fields/face/otag' },
  { id: 'otag', docParam: 'reference/fields/face/otag', title: 'otag', quadrant: 'reference', prev: 'reference/fields/face/oracle', next: 'reference/fields/face/power' },
  { id: 'power', docParam: 'reference/fields/face/power', title: 'power', quadrant: 'reference', prev: 'reference/fields/face/otag', next: 'reference/fields/face/restricted' },
  { id: 'restricted', docParam: 'reference/fields/face/restricted', title: 'restricted', quadrant: 'reference', prev: 'reference/fields/face/power', next: 'reference/fields/face/salt' },
  { id: 'salt', docParam: 'reference/fields/face/salt', title: 'salt', quadrant: 'reference', prev: 'reference/fields/face/restricted', next: 'reference/fields/face/toughness' },
  { id: 'toughness', docParam: 'reference/fields/face/toughness', title: 'toughness', quadrant: 'reference', prev: 'reference/fields/face/salt', next: 'reference/fields/face/type' },
  { id: 'type', docParam: 'reference/fields/face/type', title: 'type', quadrant: 'reference', prev: 'reference/fields/face/toughness', next: 'reference/fields/printing/collectornumber' },
  // Printing fields (alphabetically)
  { id: 'collectornumber', docParam: 'reference/fields/printing/collectornumber', title: 'collectornumber', quadrant: 'reference', prev: 'reference/fields/face/type', next: 'reference/fields/printing/date' },
  { id: 'date', docParam: 'reference/fields/printing/date', title: 'date', quadrant: 'reference', prev: 'reference/fields/printing/collectornumber', next: 'reference/fields/printing/frame' },
  { id: 'frame', docParam: 'reference/fields/printing/frame', title: 'frame', quadrant: 'reference', prev: 'reference/fields/printing/date', next: 'reference/fields/printing/game' },
  { id: 'game', docParam: 'reference/fields/printing/game', title: 'game', quadrant: 'reference', prev: 'reference/fields/printing/frame', next: 'reference/fields/printing/in' },
  { id: 'in', docParam: 'reference/fields/printing/in', title: 'in', quadrant: 'reference', prev: 'reference/fields/printing/game', next: 'reference/fields/printing/rarity' },
  { id: 'rarity', docParam: 'reference/fields/printing/rarity', title: 'rarity', quadrant: 'reference', prev: 'reference/fields/printing/in', next: 'reference/fields/printing/set' },
  { id: 'set', docParam: 'reference/fields/printing/set', title: 'set', quadrant: 'reference', prev: 'reference/fields/printing/rarity', next: 'reference/fields/printing/usd' },
  { id: 'usd', docParam: 'reference/fields/printing/usd', title: 'usd', quadrant: 'reference', prev: 'reference/fields/printing/set', next: 'reference/fields/printing/year' },
  { id: 'year', docParam: 'reference/fields/printing/year', title: 'year', quadrant: 'reference', prev: 'reference/fields/printing/usd', next: 'reference/modifiers/include-extras' },
  // Modifiers
  { id: 'include-extras', docParam: 'reference/modifiers/include-extras', title: 'include:extras', quadrant: 'reference', prev: 'reference/fields/printing/year', next: 'reference/modifiers/unique' },
  { id: 'unique', docParam: 'reference/modifiers/unique', title: 'unique', quadrant: 'reference', prev: 'reference/modifiers/include-extras', next: 'reference/modifiers/view' },
  { id: 'view', docParam: 'reference/modifiers/view', title: 'view', quadrant: 'reference', prev: 'reference/modifiers/unique', next: 'reference/composition/and-or' },
  // Composition
  { id: 'and-or', docParam: 'reference/composition/and-or', title: 'AND and OR', quadrant: 'reference', prev: 'reference/modifiers/view', next: 'reference/composition/not' },
  { id: 'not', docParam: 'reference/composition/not', title: 'NOT', quadrant: 'reference', prev: 'reference/composition/and-or', next: 'reference/composition/pinned' },
  { id: 'pinned', docParam: 'reference/composition/pinned', title: 'Pinned queries', quadrant: 'reference', prev: 'reference/composition/not', next: 'reference/sorting/overview' },
  // Sorting
  { id: 'overview', docParam: 'reference/sorting/overview', title: 'Sorting Overview', quadrant: 'reference', prev: 'reference/composition/pinned', next: 'reference/sorting/sort-fields' },
  { id: 'sort-fields', docParam: 'reference/sorting/sort-fields', title: 'Sort Fields', quadrant: 'reference', prev: 'reference/sorting/overview', next: 'reference/special/bare-regex' },
  // Special
  { id: 'bare-regex', docParam: 'reference/special/bare-regex', title: 'Bare regex', quadrant: 'reference', prev: 'reference/sorting/sort-fields', next: 'reference/special/my-list' },
  { id: 'my-list', docParam: 'reference/special/my-list', title: 'my:list', quadrant: 'reference', prev: 'reference/special/bare-regex', next: 'reference/special/tag-filter' },
  { id: 'tag-filter', docParam: 'reference/special/tag-filter', title: 'Tag filter', quadrant: 'reference', prev: 'reference/special/my-list', next: 'reference/feedback/query-feedback' },
  // Feedback
  { id: 'query-feedback', docParam: 'reference/feedback/query-feedback', title: 'Query Feedback', quadrant: 'reference', prev: 'reference/special/tag-filter', next: 'reference/scryfall/differences' },
  // Scryfall
  { id: 'differences', docParam: 'reference/scryfall/differences', title: 'Scryfall Differences', quadrant: 'reference', prev: 'reference/feedback/query-feedback', next: 'reference/scryfall/gaps' },
  { id: 'gaps', docParam: 'reference/scryfall/gaps', title: 'Known Gaps', quadrant: 'reference', prev: 'reference/scryfall/differences', next: 'reference/lists/index' },
  // Lists
  { id: 'lists-index', docParam: 'reference/lists/index', title: 'Deck Lists', quadrant: 'reference', prev: 'reference/scryfall/gaps' },
]

export const DOC_INDEX: DocEntry[] = [
  { id: 'getting-started', docParam: 'tutorials/getting-started', title: 'Getting Started', quadrant: 'tutorials' },
  { id: 'budget-alternatives', docParam: 'how-to/budget-alternatives', title: 'Find Budget Alternatives', quadrant: 'how-to' },
  ...REFERENCE_ENTRIES,
  { id: 'engine-overview', docParam: 'explanation/engine-overview', title: 'Query Engine Overview', quadrant: 'explanation' },
]
