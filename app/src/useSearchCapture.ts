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
  /** Spec 184: left-pane breakdown accordion at schedule time. */
  breakdown_expanded: boolean
}

export function useSearchCapture(getEffectiveQuery: () => string) {
  let searchCaptureTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSearchCapture: PendingSearchCapturePayload | null = null
  /** Completions folded into the next emit (superseded debounce batches + coherence drops). Spec 085 §7a. */
  let coalescedForNextEmit = 0
  /** Completions in the current pending debounce batch (always 0 or 1 while a batch is open). */
  let pendingBatchCompletionCount = 0
  let sessionSearchEmissionIndex = 0

  function trySendCapture(pending: PendingSearchCapturePayload): void {
    if (pending.query !== getEffectiveQuery().trim()) {
      coalescedForNextEmit += pendingBatchCompletionCount
      pendingBatchCompletionCount = 0
      return
    }
    const coalesced_prior_search_count =
      coalescedForNextEmit + Math.max(0, pendingBatchCompletionCount - 1)
    coalescedForNextEmit = 0
    pendingBatchCompletionCount = 0
    captureSearchExecuted({
      ...pending,
      session_search_index: sessionSearchEmissionIndex,
      coalesced_prior_search_count,
    })
    sessionSearchEmissionIndex++
  }

  function scheduleSearchCapture(
    query: string,
    usedExtension: boolean,
    resultsCount: number,
    triggeredBy: 'url' | 'user',
    urlSnapshot: string,
    breakdownExpanded: boolean,
  ): void {
    if (!query.trim()) return
    if (searchCaptureTimer !== null || pendingBatchCompletionCount > 0) {
      coalescedForNextEmit += pendingBatchCompletionCount
    }
    pendingBatchCompletionCount = 1
    pendingSearchCapture = {
      query: query.trim(),
      used_extension: usedExtension,
      results_count: resultsCount,
      triggered_by: triggeredBy,
      url_snapshot: urlSnapshot,
      breakdown_expanded: breakdownExpanded,
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
