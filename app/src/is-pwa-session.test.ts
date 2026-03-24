// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPwaSession } from './is-pwa-session'

function stubWindow(opts: { standaloneDisplay?: boolean; iosStandalone?: boolean }): void {
  const { standaloneDisplay = false, iosStandalone = false } = opts
  vi.stubGlobal(
    'window',
    {
      matchMedia: (query: string) => {
        const matches = standaloneDisplay && query === '(display-mode: standalone)'
        return {
          matches,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        } as MediaQueryList
      },
      navigator: { standalone: iosStandalone ? true : undefined },
    } as unknown as Window,
  )
}

describe('isPwaSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is true when display-mode standalone matches', () => {
    stubWindow({ standaloneDisplay: true })
    expect(isPwaSession()).toBe(true)
  })

  it('is true when navigator.standalone is true (iOS Safari)', () => {
    stubWindow({ iosStandalone: true })
    expect(isPwaSession()).toBe(true)
  })

  it('is false in a normal browser tab', () => {
    stubWindow({})
    expect(isPwaSession()).toBe(false)
  })
})
