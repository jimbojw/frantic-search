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

import { captureMyListInteracted, toMyListListId } from './analytics'
import { DEFAULT_LIST_ID, TRASH_LIST_ID } from '@frantic-search/shared'

describe('toMyListListId', () => {
  it('maps default and trash', () => {
    expect(toMyListListId(DEFAULT_LIST_ID)).toBe('default')
    expect(toMyListListId(TRASH_LIST_ID)).toBe('trash')
  })
})

describe('captureMyListInteracted', () => {
  beforeEach(() => {
    mockCapture.mockClear()
  })

  it('captures back with base fields', () => {
    captureMyListInteracted({
      control: 'back',
      list_id: 'default',
      editor_mode: 'display',
    })
    expect(mockCapture).toHaveBeenCalledWith('my_list_interacted', {
      control: 'back',
      list_id: 'default',
      editor_mode: 'display',
    })
  })

  it('captures save_committed with review editor_mode', () => {
    captureMyListInteracted({
      control: 'save_committed',
      list_id: 'default',
      editor_mode: 'review',
      additions_count: 2,
      removals_count: 1,
      metadata_updated: true,
      format_persisted: false,
    })
    expect(mockCapture).toHaveBeenCalledWith('my_list_interacted', {
      control: 'save_committed',
      list_id: 'default',
      editor_mode: 'review',
      additions_count: 2,
      removals_count: 1,
      metadata_updated: true,
      format_persisted: false,
    })
  })

  it('captures export_outlink', () => {
    captureMyListInteracted({
      control: 'export_outlink',
      list_id: 'default',
      editor_mode: 'review',
      deck_format: 'moxfield',
      outlink_id: 'moxfield_personal_decks',
    })
    expect(mockCapture).toHaveBeenCalledWith('my_list_interacted', {
      control: 'export_outlink',
      list_id: 'default',
      editor_mode: 'review',
      deck_format: 'moxfield',
      outlink_id: 'moxfield_personal_decks',
    })
  })

  it('captures format_select with previous_format', () => {
    captureMyListInteracted({
      control: 'format_select',
      list_id: 'default',
      editor_mode: 'display',
      deck_format: 'arena',
      previous_format: 'moxfield',
    })
    expect(mockCapture).toHaveBeenCalledWith('my_list_interacted', {
      control: 'format_select',
      list_id: 'default',
      editor_mode: 'display',
      deck_format: 'arena',
      previous_format: 'moxfield',
    })
  })
})
