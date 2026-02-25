// SPDX-License-Identifier: Apache-2.0
import { createSignal } from 'solid-js'
import { normalImageUrl, CI_BACKGROUNDS, CI_COLORLESS } from './color-identity'
import { cachedThumbHashURL } from './ArtCrop'
import createInView from './createInView'

export default function CardImage(props: {
  scryfallId: string
  colorIdentity: number
  thumbHash: string
  class?: string
  onClick?: () => void
  'aria-label'?: string
}) {
  const { ref, inView } = createInView('400px')
  const [loaded, setLoaded] = createSignal(false)
  const [failed, setFailed] = createSignal(false)

  const gradient = () => CI_BACKGROUNDS[props.colorIdentity] ?? CI_COLORLESS

  const thumbBg = () => {
    if (props.thumbHash) {
      return `url(${cachedThumbHashURL(props.thumbHash)}) center/cover`
    }
    return undefined
  }

  return (
    <div
      ref={ref}
      class={`overflow-hidden pb-1 rounded-[4%] ${props.class ?? ''}`}
      style={{ background: gradient() }}
      onClick={props.onClick}
      role={props.onClick ? 'button' : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      aria-label={props['aria-label']}
      onKeyDown={props.onClick ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onClick!() } } : undefined}
    >
      <div
        class="rounded-[4%] overflow-hidden"
        style={{ background: thumbBg() }}
      >
        <img
          src={inView() && !failed() ? normalImageUrl(props.scryfallId) : undefined}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          class="w-full aspect-[488/680] object-cover"
          classList={{ 'opacity-0': !loaded(), 'opacity-100': loaded() }}
          style="transition: opacity 300ms ease-in"
        />
      </div>
    </div>
  )
}
