// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCapture = vi.fn()
vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => mockCapture(...args),
    init: vi.fn(),
    register: vi.fn(),
  },
}))

import { captureCardDetailInteracted } from './analytics'

describe('captureCardDetailInteracted', () => {
  beforeEach(() => {
    mockCapture.mockClear()
  })

  it('captures set_unique_prints with set_code', () => {
    captureCardDetailInteracted({ control: 'set_unique_prints', set_code: 'mh3' })
    expect(mockCapture).toHaveBeenCalledWith('card_detail_interacted', {
      control: 'set_unique_prints',
      set_code: 'mh3',
    })
  })

  it('captures tag_nav with tag_label', () => {
    captureCardDetailInteracted({ control: 'otag_nav', tag_label: 'mana-rock' })
    expect(mockCapture).toHaveBeenCalledWith('card_detail_interacted', {
      control: 'otag_nav',
      tag_label: 'mana-rock',
    })
  })

  it('captures list_add for printing scope with ids and finish', () => {
    captureCardDetailInteracted({
      control: 'list_add',
      list_scope: 'printing',
      oracle_id: 'abc-uuid',
      finish: 'foil',
      scryfall_id: 'xyz-id',
    })
    expect(mockCapture).toHaveBeenCalledWith('card_detail_interacted', {
      control: 'list_add',
      list_scope: 'printing',
      oracle_id: 'abc-uuid',
      finish: 'foil',
      scryfall_id: 'xyz-id',
    })
  })

  it('captures list_remove for oracle scope with oracle_id and nonfoil finish', () => {
    captureCardDetailInteracted({
      control: 'list_remove',
      list_scope: 'oracle',
      oracle_id: 'abc-uuid',
      finish: 'nonfoil',
    })
    expect(mockCapture).toHaveBeenCalledWith('card_detail_interacted', {
      control: 'list_remove',
      list_scope: 'oracle',
      oracle_id: 'abc-uuid',
      finish: 'nonfoil',
    })
  })

  it('captures minimal controls', () => {
    captureCardDetailInteracted({ control: 'all_prints' })
    expect(mockCapture).toHaveBeenCalledWith('card_detail_interacted', { control: 'all_prints' })
  })
})
