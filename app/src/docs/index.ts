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

export const DOC_INDEX: DocEntry[] = [
  { id: 'getting-started', docParam: 'tutorials/getting-started', title: 'Getting Started', quadrant: 'tutorials' },
  { id: 'budget-alternatives', docParam: 'how-to/budget-alternatives', title: 'Find Budget Alternatives', quadrant: 'how-to' },
  { id: 'syntax', docParam: 'reference/syntax', title: 'Syntax Guide', quadrant: 'reference' },
  { id: 'engine-overview', docParam: 'explanation/engine-overview', title: 'Query Engine Overview', quadrant: 'explanation' },
]
