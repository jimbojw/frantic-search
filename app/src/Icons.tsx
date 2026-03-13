// SPDX-License-Identifier: Apache-2.0
/**
 * Shared icon components (Heroicons outline, 24x24).
 * Reusable across the app to avoid duplicating SVG markup.
 */

const SVG_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  'stroke-width': '2',
  stroke: 'currentColor',
} as const

export function IconBug(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082"
      />
    </svg>
  )
}

export function IconInfoCircle(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
      />
    </svg>
  )
}

/** Pencil-square icon (same as Edit button in deck editor). Used for List to signify editable list. */
export function IconList(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </svg>
  )
}

export function IconChevronLeft(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  )
}

export function IconChevronRight(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M8 5l8 7-8 7z" />
    </svg>
  )
}

export function IconXMark(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function IconBars3(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

export function IconMagnifyingGlass(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  )
}

export function IconAdjustmentsHorizontal(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"
      />
    </svg>
  )
}

export function IconClipboardDocument(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
      />
    </svg>
  )
}

export function IconCheck(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

export function IconMinus(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
    </svg>
  )
}

export function IconPlus(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

/** Vertical bar (|) for use between plus/minus in list controls trigger. */
export function IconVerticalBar(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16" />
    </svg>
  )
}

export function IconArrowTopRightOnSquare(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  )
}

export function IconEye(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

export function IconArrowPath(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
      />
    </svg>
  )
}

export function IconArrowRight(props: { class?: string }) {
  return (
    <svg {...SVG_PROPS} class={props.class ?? 'size-4'} aria-hidden>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  )
}

export function IconPin(props: { class?: string; pinned: boolean }) {
  return (
    <svg
      {...SVG_PROPS}
      class={`${props.class ?? 'size-3'} shrink-0 ${props.pinned ? 'text-blue-500 dark:text-blue-400' : 'opacity-40'}`}
      fill={props.pinned ? 'currentColor' : 'none'}
      aria-hidden
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 17v5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"
      />
    </svg>
  )
}
