// SPDX-License-Identifier: Apache-2.0
import { createSignal, onMount } from 'solid-js'

export const DUAL_WIELD_BREAKPOINT = 1024

export function useViewportWide(breakpoint = DUAL_WIELD_BREAKPOINT) {
  const [wide, setWide] = createSignal(
    typeof window !== 'undefined' && window.matchMedia(`(min-width: ${breakpoint}px)`).matches
  )
  onMount(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    setWide(mq.matches)
    const handler = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  })
  return wide
}
