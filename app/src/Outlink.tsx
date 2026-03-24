// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'solid-js'

/**
 * Opens a URL in a new tab. Used for programmatic opens (e.g. BugReport button)
 * where the URL is built dynamically and an anchor with href is not feasible.
 */
export function openOutlink(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type OutlinkProps = {
  href: string
  class?: string
  children: JSX.Element
  'aria-label'?: string
  onClick?: (e: MouseEvent) => void
}

/**
 * External link that opens in a new tab. Uses target="_blank" for native
 * behavior; programmatic window.open() does not escape PWA webview on iOS/Android.
 */
export function Outlink(props: OutlinkProps) {
  return (
    <a
      href={props.href}
      class={props.class}
      aria-label={props['aria-label']}
      target="_blank"
      rel="noopener noreferrer"
      onClick={props.onClick}
    >
      {props.children}
    </a>
  )
}
