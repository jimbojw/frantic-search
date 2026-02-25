// SPDX-License-Identifier: Apache-2.0
import { createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { imageLoadQueue } from './ImageLoadQueue'
import type { QueueEntry } from './ImageLoadQueue'

const VIEWPORT_MARGIN = '400px'

export default function createQueuedImage(): {
  ref: (el: Element) => void
  nearViewport: Accessor<boolean>
  shouldLoad: Accessor<boolean>
  onLoad: () => void
  onError: () => void
} {
  const [nearViewport, setNearViewport] = createSignal(false)
  const [shouldLoad, setShouldLoad] = createSignal(false)
  let observer: IntersectionObserver | undefined
  let queued = false
  let active = false

  const entry: QueueEntry = {
    visible: false,
    start() {
      queued = false
      active = true
      setShouldLoad(true)
      observer?.disconnect()
    },
  }

  function done() {
    if (!active) return
    active = false
    imageLoadQueue.onLoadComplete()
  }

  function ref(element: Element) {
    observer = new IntersectionObserver(
      ([e]) => {
        if (shouldLoad()) return
        if (e.isIntersecting) {
          entry.visible = true
          setNearViewport(true)
          if (!queued) {
            queued = true
            imageLoadQueue.enqueue(entry)
          }
        } else {
          entry.visible = false
          if (queued) {
            queued = false
            imageLoadQueue.dequeue(entry)
          }
        }
      },
      { rootMargin: VIEWPORT_MARGIN },
    )
    observer.observe(element)
    onCleanup(() => {
      observer?.disconnect()
      if (queued) imageLoadQueue.dequeue(entry)
      if (active) done()
    })
  }

  return { ref, nearViewport, shouldLoad, onLoad: done, onError: done }
}
