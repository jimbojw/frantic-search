// SPDX-License-Identifier: Apache-2.0
import { createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export default function createInView(rootMargin = '200px'): {
  ref: (el: Element) => void
  inView: Accessor<boolean>
} {
  const [inView, setInView] = createSignal(false)
  let observer: IntersectionObserver | undefined

  function ref(el: Element) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer!.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    onCleanup(() => observer?.disconnect())
  }

  return { ref, inView }
}
