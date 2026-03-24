// SPDX-License-Identifier: Apache-2.0
import { captureSearchExecuted } from './analytics'

const DEBOUNCE_MS = 750

export type PendingSearchCapturePayload = {
  query: string
  used_extension: boolean
  results_count: number
  triggered_by: 'url' | 'user'
  /** `pathname` + `search` when the worker result was handled (GitHub #184). */
  url_snapshot: string
}

export function useSearchCapture(getEffectiveQuery: () => string) {
  let searchCaptureTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSearchCapture: PendingSearchCapturePayload | null = null

  function trySendCapture(pending: PendingSearchCapturePayload): void {
    if (pending.query !== getEffectiveQuery().trim()) return
    captureSearchExecuted(pending)
  }

  function scheduleSearchCapture(
    query: string,
    usedExtension: boolean,
    resultsCount: number,
    triggeredBy: 'url' | 'user',
    urlSnapshot: string
  ): void {
    if (!query.trim()) return
    pendingSearchCapture = {
      query: query.trim(),
      used_extension: usedExtension,
      results_count: resultsCount,
      triggered_by: triggeredBy,
      url_snapshot: urlSnapshot,
    }
    if (searchCaptureTimer) clearTimeout(searchCaptureTimer)
    searchCaptureTimer = setTimeout(() => {
      searchCaptureTimer = null
      const p = pendingSearchCapture
      pendingSearchCapture = null
      if (p) trySendCapture(p)
    }, DEBOUNCE_MS)
  }

  function flushSearchCapture(): void {
    if (searchCaptureTimer) {
      clearTimeout(searchCaptureTimer)
      searchCaptureTimer = null
    }
    const p = pendingSearchCapture
    pendingSearchCapture = null
    if (p) trySendCapture(p)
  }

  return { scheduleSearchCapture, flushSearchCapture }
}
