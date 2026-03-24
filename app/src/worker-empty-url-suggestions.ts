// SPDX-License-Identifier: Apache-2.0
import type { Suggestion } from '@frantic-search/shared'

/** How many starter chips to show (Spec 155). */
export const EMPTY_URL_LIVE_QUERY_SHOWN = 3

/** XOR mixed into `sessionSalt` so this sampler is isolated from other seeded logic. */
const EMPTY_URL_SAMPLE_KEY = 0x155ea155

function createRng(seed: number) {
  let s = seed >>> 0
  if (s === 0) s = 0xdeadbeef
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return (s >>> 0) * (1 / 0x1_0000_0000)
  }
}

/** Fisher–Yates shuffle of [0..n-1], return first k indices (deterministic from seed). */
function pickKIndices(n: number, k: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i)
  const rnd = createRng(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = idx[i]!
    idx[i] = idx[j]!
    idx[j] = t
  }
  return idx.slice(0, Math.min(k, n))
}

function queryLength(s: Suggestion): number {
  return (s.query ?? s.label).length
}

/** Full pool before sampling (tests, docs). */
export function emptyUrlLiveQuerySuggestionPool(): Suggestion[] {
  const year = new Date().getFullYear()
  const dateQuery = `date=${year} -is:reprint`
  return [
    {
      id: 'example-query',
      label: 'is:ub',
      query: 'is:ub',
      explain: 'Universes Beyond cards.',
      priority: 0,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: 'salt>99%',
      query: 'salt>99%',
      explain: 'Top 1% saltiest cards by EDHREC salt score.',
      priority: 1,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: 'edhrec>99%',
      query: 'edhrec>99%',
      explain: 'Top 1% most used cards by EDHREC rank.',
      priority: 2,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: 'unique:prints is:borderless',
      query: 'unique:prints is:borderless',
      explain: 'Borderless printings, one row each.',
      priority: 3,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: 'o:"enters the battlefield"',
      query: 'o:"enters the battlefield"',
      explain: 'Oracle text phrase search.',
      priority: 4,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: dateQuery,
      query: dateQuery,
      explain: `Cards first printed in ${year}.`,
      priority: 5,
      variant: 'rewrite',
    },
    {
      id: 'example-query',
      label: 'include:extras is:token',
      query: 'include:extras is:token',
      explain: 'Token cards including extras.',
      priority: 6,
      variant: 'rewrite',
    },
  ]
}

/**
 * Spec 155: pick `EMPTY_URL_LIVE_QUERY_SHOWN` starters from the pool (seeded by `sessionSalt`),
 * then order by query string length (shortest first); ties break on `label`.
 */
export function buildEmptyUrlLiveQuerySuggestions(sessionSalt: number): Suggestion[] {
  const pool = emptyUrlLiveQuerySuggestionPool()
  const seed = sessionSalt ^ EMPTY_URL_SAMPLE_KEY
  const picked = pickKIndices(pool.length, EMPTY_URL_LIVE_QUERY_SHOWN, seed).map((i) => pool[i]!)
  picked.sort((a, b) => {
    const d = queryLength(a) - queryLength(b)
    return d !== 0 ? d : a.label.localeCompare(b.label)
  })
  return picked.map((s, i) => ({ ...s, priority: i }))
}
