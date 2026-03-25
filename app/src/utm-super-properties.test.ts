// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { utmSuperPropertiesFromSearch } from './utm-super-properties'

describe('utmSuperPropertiesFromSearch', () => {
  it('maps all five standard utm keys to $-prefixed properties', () => {
    const search =
      '?utm_campaign=instant-speed&utm_source=reddit&utm_medium=social&utm_content=hero&utm_term=mtg'
    expect(utmSuperPropertiesFromSearch(search)).toEqual({
      $utm_campaign: 'instant-speed',
      $utm_source: 'reddit',
      $utm_medium: 'social',
      $utm_content: 'hero',
      $utm_term: 'mtg',
    })
  })

  it('returns a partial object when only some utm keys are present', () => {
    expect(utmSuperPropertiesFromSearch('?utm_source=reddit&utm_campaign=launch')).toEqual({
      $utm_source: 'reddit',
      $utm_campaign: 'launch',
    })
  })

  it('returns {} for empty or missing search', () => {
    expect(utmSuperPropertiesFromSearch('')).toEqual({})
    expect(utmSuperPropertiesFromSearch('?q=foo')).toEqual({})
  })

  it('ignores non-standard params including custom utm_*', () => {
    const search = '?utm_source=x&utm_custom=foo&rdt_cid=abc&q=bar'
    expect(utmSuperPropertiesFromSearch(search)).toEqual({
      $utm_source: 'x',
    })
  })

  it('omits keys with empty values', () => {
    expect(utmSuperPropertiesFromSearch('?utm_source=reddit&utm_campaign=&utm_medium=social')).toEqual({
      $utm_source: 'reddit',
      $utm_medium: 'social',
    })
  })

  it('accepts search without leading ?', () => {
    expect(utmSuperPropertiesFromSearch('utm_medium=email')).toEqual({
      $utm_medium: 'email',
    })
  })
})
