// SPDX-License-Identifier: Apache-2.0

/** True when the app is running as an installed PWA (standalone) or iOS “Add to Home Screen”. */
export function isPwaSession(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}
