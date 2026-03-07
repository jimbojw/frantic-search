// SPDX-License-Identifier: Apache-2.0
import { captureSearchExecuted } from './analytics'

const DEBOUNCE_MS = 750

export function useSearchCapture() {
  let searchCaptureTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSearchCapture: { query: string; used_extension: boolean; results_count: number } | null = null

  function scheduleSearchCapture(
    query: string,
    usedExtension: boolean,
    resultsCount: number
  ): void {
    if (!query.trim()) return
    pendingSearchCapture = { query: query.trim(), used_extension: usedExtension, results_count: resultsCount }
    if (searchCaptureTimer) clearTimeout(searchCaptureTimer)
    searchCaptureTimer = setTimeout(() => {
      if (pendingSearchCapture) {
        captureSearchExecuted(pendingSearchCapture)
        pendingSearchCapture = null
      }
      searchCaptureTimer = null
    }, DEBOUNCE_MS)
  }

  function flushSearchCapture(): void {
    if (searchCaptureTimer) {
      clearTimeout(searchCaptureTimer)
      searchCaptureTimer = null
    }
    if (pendingSearchCapture) {
      captureSearchExecuted(pendingSearchCapture)
      pendingSearchCapture = null
    }
  }

  return { scheduleSearchCapture, flushSearchCapture }
}
