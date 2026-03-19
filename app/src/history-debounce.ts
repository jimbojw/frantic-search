// SPDX-License-Identifier: Apache-2.0
import { capturePageview } from './analytics'

const HISTORY_DEBOUNCE_MS = 2000
const REPLACE_DEBOUNCE_MS = 200
let needsPush = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let replaceDebounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingReplaceUrl: string | null = null

function clearDebounceTimer() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

function clearReplaceDebounce() {
  if (replaceDebounceTimer) {
    clearTimeout(replaceDebounceTimer)
    replaceDebounceTimer = null
  }
  pendingReplaceUrl = null
}

export function saveScrollPosition() {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, '')
}

export function pushStateAndCapturePageview(url: string, state?: object | null): void {
  history.pushState(state ?? null, '', url)
  capturePageview()
}

export function pushIfNeeded() {
  if (!needsPush) return
  needsPush = false
  clearReplaceDebounce()
  saveScrollPosition()
  pushStateAndCapturePageview(location.href, history.state)
}

export function scheduleReplaceState(url: string) {
  clearReplaceDebounce()
  pendingReplaceUrl = url
  replaceDebounceTimer = setTimeout(() => {
    replaceDebounceTimer = null
    const toReplace = pendingReplaceUrl
    pendingReplaceUrl = null
    if (toReplace !== null) {
      history.replaceState(history.state, '', toReplace)
      scheduleDebouncedCommit()
    }
  }, REPLACE_DEBOUNCE_MS)
}

function flushReplaceState() {
  if (pendingReplaceUrl !== null) {
    const url = pendingReplaceUrl
    pendingReplaceUrl = null
    if (replaceDebounceTimer) {
      clearTimeout(replaceDebounceTimer)
      replaceDebounceTimer = null
    }
    history.replaceState(history.state, '', url)
  } else {
    clearReplaceDebounce()
  }
}

export function scheduleDebouncedCommit() {
  clearDebounceTimer()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    needsPush = true
  }, HISTORY_DEBOUNCE_MS)
}

export function flushPendingCommit() {
  flushReplaceState()
  clearDebounceTimer()
  needsPush = true
}

export function cancelPendingCommit() {
  clearReplaceDebounce()
  clearDebounceTimer()
  needsPush = false
}
