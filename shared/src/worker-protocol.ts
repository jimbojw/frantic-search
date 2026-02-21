// SPDX-License-Identifier: Apache-2.0

export type ToWorker = {
  type: 'search'
  queryId: number
  query: string
}

export type CardResult = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
}

export type BreakdownNode = {
  label: string
  matchCount: number
  children?: BreakdownNode[]
}

export type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string }
  | { type: 'result'; queryId: number; cards: CardResult[]; totalMatches: number; breakdown: BreakdownNode }
