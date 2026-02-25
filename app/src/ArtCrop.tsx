// SPDX-License-Identifier: Apache-2.0
import { createSignal } from 'solid-js'
import { thumbHashToDataURL } from 'thumbhash'
import { artCropUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'
import createInView from './createInView'

const thumbHashCache = new Map<string, string>()

export function cachedThumbHashURL(b64: string): string {
  let url = thumbHashCache.get(b64)
  if (url) return url
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  url = thumbHashToDataURL(bytes)
  thumbHashCache.set(b64, url)
  return url
}

export default function ArtCrop(props: { scryfallId: string; colorIdentity: number; thumbHash: string }) {
  const { ref, inView } = createInView()
  const [loaded, setLoaded] = createSignal(false)

  const gradient = () => CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS

  const background = () => {
    if (!inView() || !props.thumbHash) return gradient()
    return `url(${cachedThumbHashURL(props.thumbHash)}) center/cover, ${gradient()}`
  }

  return (
    <div
      ref={ref}
      class="w-[3em] pb-1 rounded-sm overflow-hidden shrink-0 mt-0.5"
      style={{
        background: background(),
        'background-origin': inView() && props.thumbHash ? 'content-box, border-box' : undefined,
        'background-clip': inView() && props.thumbHash ? 'content-box, border-box' : undefined,
      }}
    >
      <img
        src={inView() ? artCropUrl(props.scryfallId) : undefined}
        alt=""
        onLoad={() => setLoaded(true)}
        class="w-full aspect-[4/3] object-cover"
        classList={{ 'opacity-0': !loaded(), 'opacity-100': loaded() }}
        style="transition: opacity 300ms ease-in"
      />
    </div>
  )
}
