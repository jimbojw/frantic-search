// SPDX-License-Identifier: Apache-2.0

const HISTORY_DEBOUNCE_MS = 2000
let needsPush = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function clearDebounceTimer() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

export function saveScrollPosition() {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, '')
}

export function pushIfNeeded() {
  if (!needsPush) return
  needsPush = false
  saveScrollPosition()
  history.pushState(history.state, '', location.href)
}

export function scheduleDebouncedCommit() {
  clearDebounceTimer()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    needsPush = true
  }, HISTORY_DEBOUNCE_MS)
}

export function flushPendingCommit() {
  clearDebounceTimer()
  needsPush = true
}

export function cancelPendingCommit() {
  clearDebounceTimer()
  needsPush = false
}
