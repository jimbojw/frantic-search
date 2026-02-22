// SPDX-License-Identifier: Apache-2.0
import { createSignal } from 'solid-js'
import { thumbHashToDataURL } from 'thumbhash'
import { artCropUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export default function ArtCrop(props: { scryfallId: string; colorIdentity: number; thumbHash: string }) {
  const [loaded, setLoaded] = createSignal(false)

  const gradient = () => CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS

  const background = () => {
    if (props.thumbHash) {
      const bytes = base64ToBytes(props.thumbHash)
      return `url(${thumbHashToDataURL(bytes)}) center/cover, ${gradient()}`
    }
    return gradient()
  }

  return (
    <div
      class="w-[3em] pb-1 rounded-sm overflow-hidden shrink-0 mt-0.5"
      style={{
        background: background(),
        'background-origin': props.thumbHash ? 'content-box, border-box' : undefined,
        'background-clip': props.thumbHash ? 'content-box, border-box' : undefined,
      }}
    >
      <img
        src={artCropUrl(props.scryfallId)}
        loading="lazy"
        alt=""
        onLoad={() => setLoaded(true)}
        class="w-full aspect-[4/3] object-cover"
        classList={{ 'opacity-0': !loaded(), 'opacity-100': loaded() }}
        style="transition: opacity 300ms ease-in"
      />
    </div>
  )
}
