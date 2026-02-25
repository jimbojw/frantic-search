# Spec 042: Image Load Queue

**Status:** Implemented

**Depends on:** Spec 041 (Result Display Modes)

## Goal

Prevent wasted bandwidth and network contention when a user flings (momentum scrolls) through image-heavy result views (Images, Full). A cooperative load queue limits concurrent image loads and cancels queued requests for elements that have left the viewport before their turn.

## Background

### Problem

Spec 041 introduced Images and Full views, which render card face images from Scryfall's CDN. Each `CardImage` uses `createInView` — a one-shot `IntersectionObserver` that sets the `<img>` `src` the moment the element enters a 400px margin around the viewport. The observer disconnects immediately after.

During normal scrolling this works well. But during a fast fling:

1. Dozens of `CardImage` elements enter and exit the 400px zone in rapid succession.
2. Each one gets `src` set, firing an HTTP request.
3. Most of these elements are off-screen by the time the response arrives.
4. The browser has no reason to deprioritize or cancel these requests — `src` was set, so the fetch proceeds.
5. Network bandwidth is consumed by images the user will never see (until they scroll back), delaying images the user *did* stop at.

On mobile connections, this manifests as a long wait staring at ThumbHash placeholders for the cards actually in view.

### Non-goals

- **Art crop thumbnails** (`ArtCrop` component) are exempt. They are ~5–10 KB each and load near-instantly. The queue overhead would hurt more than help.
- **Cancelling in-flight HTTP requests.** Once `src` is set on an `<img>`, the browser owns the request. We don't attempt `AbortController`-style cancellation — we just avoid setting `src` in the first place for elements that are no longer visible.

## Design

### Architecture

Two new primitives replace `createInView` inside `CardImage`:

1. **`ImageLoadQueue`** — a singleton that manages a fixed-size pool of "loading slots." Components request a slot; the queue grants them in FIFO order when a slot is available, but only if the element is still near the viewport at grant time.

2. **`createQueuedImage`** — a per-component hook that integrates a persistent `IntersectionObserver` with the queue. It replaces both `createInView` and the `src` logic inside `CardImage`.

### ImageLoadQueue

```typescript
class ImageLoadQueue {
  private maxConcurrent: number
  private active: number
  private queue: QueueEntry[]

  enqueue(entry: QueueEntry): void
  dequeue(entry: QueueEntry): void
  onLoadComplete(): void
}
```

- **`maxConcurrent`**: Default 12. This is the number of images that can have `src` set simultaneously (in-flight HTTP requests). Chosen to balance browser connection limits (~6 per hostname for HTTP/2 multiplexing to `cards.scryfall.io`) with a buffer for fast connections.
- **`active`**: Count of images currently loading (src set, awaiting load/error).
- **`queue`**: FIFO list of elements waiting for a slot.

#### `enqueue(entry)`

Adds an entry to the back of the queue. Schedules a batched flush via `queueMicrotask`.

#### `dequeue(entry)`

Removes an entry from the queue without granting a slot. Called when an element exits the viewport zone before its turn. No-op if the entry is already active (src was set).

#### `onLoadComplete()`

Decrements `active` and schedules a batched flush.

#### Processing (flush)

Flush is batched via `queueMicrotask` — multiple `enqueue`/`onLoadComplete` calls in the same microtask tick coalesce into a single flush. This is critical: when 60 images mount and enqueue in one frame, the queue flushes once at the end rather than 60 times.

When flush runs, the queue pops entries from the front. For each entry, it checks the `visible` boolean flag (set by the observer — see below). If `visible` is true, the slot is granted (entry's `start` callback fires, which sets `src`). If false, the entry is discarded. This continues until all slots are filled or the queue is empty.

**No DOM measurement at grant time.** An earlier design used `getBoundingClientRect()` as a belt-and-suspenders visibility check. Profiling revealed this caused severe layout thrashing — each call forces a synchronous reflow, and calling it N times in a `flush` loop produced O(N) forced reflows. The observer-maintained `visible` flag is sufficient: the observer already dequeues exited entries, and the flag catches any timing edge cases without touching the DOM.

### createQueuedImage

```typescript
function createQueuedImage(rootMargin = '400px'): {
  ref: (el: Element) => void
  shouldLoad: Accessor<boolean>
  onLoad: () => void
  onError: () => void
}
```

Lifecycle:

1. **Element mounts** → `ref` is called. A persistent `IntersectionObserver` begins tracking the element.
2. **Element enters zone** → The hook enqueues itself with the `ImageLoadQueue`.
3. **Element exits zone** (before slot granted) → The hook dequeues itself.
4. **Slot granted** → The queue calls the entry's `start` callback. The hook sets `shouldLoad` to `true`, which the component uses to set `src`. The observer disconnects — no further tracking needed.
5. **Image loads or errors** → Component calls `onLoad`/`onError`, which calls `queue.onLoadComplete()` to free the slot.
6. **Element unmounts** (before slot granted) → `onCleanup` dequeues the entry and disconnects the observer.

The persistent observer (steps 2–3) is what distinguishes this from `createInView`. It tracks both intersection and non-intersection states, enabling the queue to cancel entries that have scrolled away. The observer also maintains a `visible` boolean on the queue entry, which the queue checks at grant time without any DOM measurement.

### Integration with CardImage

`CardImage` replaces `createInView` with `createQueuedImage`:

```typescript
const { ref, shouldLoad, onLoad, onError } = createQueuedImage()

// src is set only when the queue grants a slot
<img src={shouldLoad() && !failed() ? normalImageUrl(...) : undefined}
     onLoad={onLoad}
     onError={onError} />
```

### ArtCrop is unchanged

`ArtCrop` continues to use `createInView`. Art crops are tiny thumbnails (~5–10 KB) that load near-instantly. Queuing them would add latency without meaningful bandwidth savings.

### createInView is retained

`createInView` remains in the codebase for `ArtCrop` and any future lightweight image use cases. It is not modified.

## Scope of changes

| File | Change |
|---|---|
| `app/src/ImageLoadQueue.ts` (new) | Singleton queue class with `enqueue`, `dequeue`, `onLoadComplete`. |
| `app/src/createQueuedImage.ts` (new) | Per-component hook: persistent observer + queue integration. |
| `app/src/CardImage.tsx` | Replace `createInView` with `createQueuedImage`. Wire `onLoad`/`onError` to free slots. |

## Edge cases

### View mode switch while images are queued

When the user switches from Images/Full to Slim/Detail, SolidJS unmounts `CardImage` components. Each component's `onCleanup` calls `dequeue`, removing it from the queue. Active loads (src already set) will complete naturally — the browser finishes the request, but the component is gone so `onLoad` never fires. The `onCleanup` handler also calls `onLoadComplete` for active entries to free the slot.

### New search results

When `indices` changes (new query), SolidJS replaces the `<For>` children. Old `CardImage` components unmount (cleanup dequeues), new ones mount (fresh enqueue cycle). The queue resets naturally.

### Element re-enters viewport

If a user scrolls past an image (it exits the zone and is dequeued), then scrolls back, the persistent observer fires another intersection event and re-enqueues the element. This is handled naturally by the observer staying active until the slot is granted.

### Queue drains to empty

When all queued entries have been processed or dequeued, the queue simply sits idle with available slots. New `enqueue` calls are granted immediately.

### Rapid successive flings

Each fling enqueues and dequeues entries rapidly. The queue's FIFO order means the most recently visible entries (at the end of the queue) are more likely to still be visible when their turn comes. In practice, entries from earlier fling positions will have been dequeued by their exit observer before reaching the front.

## Acceptance criteria

1. `CardImage` components do not set `src` until granted a slot by the `ImageLoadQueue`.
2. No more than 12 images are simultaneously loading (src set, awaiting load/error) at any time.
3. When a `CardImage` exits the viewport zone before its slot is granted, it is removed from the queue.
4. When a `CardImage` re-enters the viewport zone, it is re-enqueued.
5. `onLoad` and `onError` on the `<img>` free the loading slot, allowing the next queued image to proceed.
6. Component unmount (view mode switch, new search results) cleans up: dequeues pending entries and frees active slots.
7. `ArtCrop` is unaffected — it continues to use `createInView`.
8. Normal (non-fling) scrolling behavior is indistinguishable from before: images near the viewport begin loading promptly.

## Implementation Notes

- 2026-02-25: Removed `getBoundingClientRect` visibility check from queue
  flush. Chromium profiling showed 540ms (20%) spent in forced reflows
  from calling `getBoundingClientRect` in a tight loop during flush.
  Replaced with an observer-maintained `visible` boolean flag — zero DOM
  measurement at grant time. Also batched `flush` via `queueMicrotask`
  to coalesce multiple enqueue calls per frame into a single pass.
