// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const captureSearchExecuted = vi.fn()
vi.mock('./analytics', () => ({
  captureSearchExecuted: (...args: unknown[]) => captureSearchExecuted(...args),
}))

import { useSearchCapture } from './useSearchCapture'

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
    scheduleSearchCapture('lightning', false, 12, 'user', '/?q=lightning')
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
    })
  })

  it('drops pending when effective query changes before debounce completes', () => {
    let eq = 'a'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('a', false, 1, 'user', '/')
    eq = 'b'
    vi.advanceTimersByTime(750)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
  })

  it('flush sends only when query still matches', () => {
    let eq = 'x'
    const { scheduleSearchCapture, flushSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('x', true, 3, 'user', '/?q=x')
    eq = 'y'
    flushSearchCapture()
    expect(captureSearchExecuted).not.toHaveBeenCalled()

    eq = 'z'
    scheduleSearchCapture('z', false, 0, 'user', '/p')
    flushSearchCapture()
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: 'z' }),
    )
  })

  it('resets debounce when scheduling again', () => {
    let eq = 'q'
    const { scheduleSearchCapture } = useSearchCapture(() => eq)
    scheduleSearchCapture('q', false, 1, 'user', '/1')
    vi.advanceTimersByTime(400)
    scheduleSearchCapture('q', false, 2, 'user', '/2')
    vi.advanceTimersByTime(400)
    expect(captureSearchExecuted).not.toHaveBeenCalled()
    vi.advanceTimersByTime(350)
    expect(captureSearchExecuted).toHaveBeenCalledTimes(1)
    expect(captureSearchExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ results_count: 2, url_snapshot: '/2' }),
    )
  })
})
