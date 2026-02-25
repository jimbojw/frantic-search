// SPDX-License-Identifier: Apache-2.0

export interface QueueEntry {
  visible: boolean
  start: () => void
}

const MAX_CONCURRENT = 12

class ImageLoadQueue {
  private active = 0
  private queue: QueueEntry[] = []
  private flushScheduled = false

  enqueue(entry: QueueEntry): void {
    this.queue.push(entry)
    this.scheduleFlush()
  }

  dequeue(entry: QueueEntry): void {
    const idx = this.queue.indexOf(entry)
    if (idx !== -1) this.queue.splice(idx, 1)
  }

  onLoadComplete(): void {
    this.active--
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return
    this.flushScheduled = true
    queueMicrotask(() => {
      this.flushScheduled = false
      this.flush()
    })
  }

  private flush(): void {
    while (this.active < MAX_CONCURRENT && this.queue.length > 0) {
      const entry = this.queue.shift()!
      if (entry.visible) {
        this.active++
        entry.start()
      }
    }
  }
}

export const imageLoadQueue = new ImageLoadQueue()
