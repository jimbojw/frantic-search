// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const captureSearchExecuted = vi.fn()
vi.mock('./analytics', () => ({
  captureSearchExecuted: (...args: unknown[]) => captureSearchExecuted(...args),
}))

import { useSearchCapture } from './useSearchCapture'

/** Snapshot value passed through to `search_executed` (Spec 184); tests use a fixed boolean. */
const BD = true

describe('useSearchCapture', () => {
  beforeEach(() => {
    captureSearchExecuted.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires after debounce when effective query still matches', () => {
    let eq = 'lightning'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('lightning', false, 12, 'user', '/?q=lightning', BD)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
    vi.advanceTimersByTime(749)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenCalledWith({
      query: 'lightning',
      used_extension: false,
      results_count: 12,
      triggered_by: 'user',
      url_snapshot: '/?q=lightning',
      session_search_index: 0,
      coalesced_prior_search_count: 0,
      breakdown_expanded: BD,
    })
  })

  it('drops pending when effective query changes before debounce completes', () => {
    let eq = 'a'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('a', false, 1, 'user', '/', BD)
    eq = 'b'
    vi.advanceTimersByTime(750)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
  })

  it('attributes coherence drop to coalesced_prior_search_count on next emit', () => {
    let eq = 'a'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('a', false, 1, 'user', '/a', BD)
    vi.advanceTimersByTime(749)
    eq = 'b'
    vi.advanceTimersByTime(1)
    expect(captureSearchExecuted).not.toHaveBeenCalled()

    scheduleSearchCapture('b', false, 2, 'user', '/b', BD)
    vi.advanceTimersByTime(750)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'b',
        session_search_index: 0,
        coalesced_prior_search_count: 1,
      }),
    )
  })

  it('increments session_search_index on each emission', () => {
    let eq = 'x'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('x', false, 1, 'user', '/x', BD)
    vi.advanceTimersByTime(750)
    eq = 'y'
    scheduleSearchCapture('y', false, 2, 'user', '/y', BD)
    vi.advanceTimersByTime(750)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(2)
    expect(captureSearchExecuted).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ session_search_index: 0, coalesced_prior_search_count: 0 }),
    )
    expect(captureSearchExecuted).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ session_search_index: 1, coalesced_prior_search_count: 0 }),
    )
  })

  it('counts debounce-resets as coalesced on emit', () => {
    let eq = 'q'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('q', false, 1, 'user', '/1', BD)
    vi.advanceTimersByTime(400)
    scheduleSearchCapture('q', false, 2, 'user', '/2', BD)
    vi.advanceTimersByTime(750)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        results_count: 2,
        url_snapshot: '/2',
        session_search_index: 0,
        coalesced_prior_search_count: 1,
      }),
    )
  })

  it('flush sends only when query still matches', () => {
    let eq = 'x'
    const { scheduleSearchCapture, flushSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('x', true, 3, 'user', '/?q=x', BD)
    eq = 'y'
    flushSearchCapture()
    expect(captureSearchExecuted).not.toHaveBeenCalled()

    eq = 'z'
    scheduleSearchCapture('z', false, 0, 'user', '/p', BD)
    flushSearchCapture()
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: 'z',
        session_search_index: 0,
        coalesced_prior_search_count: 1,
      }),
    )
  })

  it('resets debounce when scheduling again', () => {
    let eq = 'q'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('q', false, 1, 'user', '/1', BD)
    vi.advanceTimersByTime(400)
    scheduleSearchCapture('q', false, 2, 'user', '/2', BD)
    vi.advanceTimersByTime(400)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
    vi.advanceTimersByTime(350)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        results_count: 2,
        url_snapshot: '/2',
        session_search_index: 0,
        coalesced_prior_search_count: 1,
      }),
    )
  })
})
