// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import {
  EXTERNAL_LIST_ID,
  TRASH_LIST_ID,
  DEFAULT_LIST_ID,
  BROADCAST_CHANNEL_NAME,
} from './card-list'

describe('card-list', () => {
  it('exports reserved list ID constants', () => {
    expect(EXTERNAL_LIST_ID).toBe('external')
    expect(TRASH_LIST_ID).toBe('trash')
    expect(DEFAULT_LIST_ID).toBe('default')
  })

  it('exports broadcast channel name', () => {
    expect(BROADCAST_CHANNEL_NAME).toBe('frantic-search-card-lists')
  })
})
