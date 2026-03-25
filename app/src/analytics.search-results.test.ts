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

import { captureSearchResultsInteracted } from './analytics'

describe('captureSearchResultsInteracted', () => {
  beforeEach(() => {
    mockCapture.mockClear()
  })

  it('captures open_card with view_mode and row_kind', () => {
    captureSearchResultsInteracted({
      control: 'open_card',
      scryfall_id: 'sf-1',
      view_mode: 'images',
      row_kind: 'cards',
      pane_id: 'left',
    })
    expect(mockCapture).toHaveBeenCalledWith('search_results_interacted', {
      control: 'open_card',
      scryfall_id: 'sf-1',
      view_mode: 'images',
      row_kind: 'cards',
      pane_id: 'left',
    })
  })

  it('captures all_prints without scryfall_id', () => {
    captureSearchResultsInteracted({
      control: 'all_prints',
      view_mode: 'full',
      row_kind: 'printings',
    })
    expect(mockCapture).toHaveBeenCalledWith('search_results_interacted', {
      control: 'all_prints',
      view_mode: 'full',
      row_kind: 'printings',
    })
  })

  it('captures name_copy', () => {
    captureSearchResultsInteracted({
      control: 'name_copy',
      view_mode: 'slim',
      row_kind: 'cards',
    })
    expect(mockCapture).toHaveBeenCalledWith('search_results_interacted', {
      control: 'name_copy',
      view_mode: 'slim',
      row_kind: 'cards',
    })
  })

  it('captures list_add printing scope with list metadata', () => {
    captureSearchResultsInteracted({
      control: 'list_add',
      list_scope: 'printing',
      oracle_id: 'o-1',
      finish: 'etched',
      scryfall_id: 's-1',
      view_mode: 'detail',
      row_kind: 'printings',
    })
    expect(mockCapture).toHaveBeenCalledWith('search_results_interacted', {
      control: 'list_add',
      list_scope: 'printing',
      oracle_id: 'o-1',
      finish: 'etched',
      scryfall_id: 's-1',
      view_mode: 'detail',
      row_kind: 'printings',
    })
  })
})
