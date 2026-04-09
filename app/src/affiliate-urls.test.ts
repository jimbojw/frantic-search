// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  appendManaPoolRefToUrl,
  buildManapoolCardOrSearchUrlWithRef,
  buildTcgplayerPartnerUrlWithConfig,
  buildTcgplayerProductPageUrl,
  slugifyCardNameForManapool,
} from './affiliate-urls'

describe('buildTcgplayerProductPageUrl', () => {
  it('returns null for non-positive ids', () => {
    expect(buildTcgplayerProductPageUrl(0)).toBeNull()
    expect(buildTcgplayerProductPageUrl(-1)).toBeNull()
  })

  it('builds product URL with page=1', () => {
    expect(buildTcgplayerProductPageUrl(190753)).toBe('https://www.tcgplayer.com/product/190753?page=1')
  })
})

describe('buildTcgplayerPartnerUrlWithConfig', () => {
  const cfg = { impact: 'IMP', ad: 'AD', segment: '21018' }

  it('returns null when any piece missing', () => {
    expect(buildTcgplayerPartnerUrlWithConfig('https://x.test/', 'sub', { impact: '', ad: 'a', segment: 's' })).toBeNull()
    expect(buildTcgplayerPartnerUrlWithConfig('', 'sub', cfg)).toBeNull()
  })

  it('encodes u and sets subId1', () => {
    const u = 'https://www.tcgplayer.com/product/190753?page=1'
    const out = buildTcgplayerPartnerUrlWithConfig(u, 'card-detail-page', cfg)
    expect(out).toContain('https://partner.tcgplayer.com/c/IMP/AD/21018?')
    expect(out).toContain('subId1=card-detail-page')
    expect(out).toContain(`u=${encodeURIComponent(u)}`)
  })
})

describe('slugifyCardNameForManapool', () => {
  it('collapses double-face delimiter', () => {
    expect(slugifyCardNameForManapool('Claim // Fame')).toBe('claim-fame')
  })
})

describe('buildManapoolCardOrSearchUrlWithRef', () => {
  it('builds card path when set, collector, slug present', () => {
    const url = buildManapoolCardOrSearchUrlWithRef(
      {
        cardNameForSearch: 'Abominable Treefolk',
        setCode: 'MH1',
        collectorNumber: '194',
        cardNameForSlug: 'Abominable Treefolk',
      },
      'myref',
    )
    expect(url).toBe('https://manapool.com/card/mh1/194/abominable-treefolk?ref=myref')
  })

  it('falls back to search when incomplete', () => {
    const url = buildManapoolCardOrSearchUrlWithRef({ cardNameForSearch: 'Bolt' }, undefined)
    expect(url).toBe('https://manapool.com/search?q=Bolt')
  })

  it('appendManaPoolRefToUrl adds ref with ? or &', () => {
    expect(appendManaPoolRefToUrl('https://manapool.com/x', 'r')).toBe('https://manapool.com/x?ref=r')
    expect(appendManaPoolRefToUrl('https://manapool.com/x?a=1', 'r')).toBe('https://manapool.com/x?a=1&ref=r')
  })
})
