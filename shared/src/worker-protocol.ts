// SPDX-License-Identifier: Apache-2.0

export type ToWorker = {
  type: 'search'
  queryId: number
  query: string
}

export type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready' | 'error'; error?: string }
  | { type: 'result'; queryId: number; names: string[]; totalMatches: number }
