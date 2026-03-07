// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'solid-js'

/**
 * Opens a URL in a new browser tab/window. Uses window.open() instead of
 * target="_blank" so links escape the PWA webview on iOS (issue #92).
 * Also used for future deep-linking (TCGPlayer, Mana Pool, etc.).
 */
export function openOutlink(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type OutlinkProps = {
  href: string
  class?: string
  children: JSX.Element
  'aria-label'?: string
}

/**
 * External link that uses window.open() on click to escape PWA webview on iOS.
 * Keeps href for accessibility and context-menu "Open in new tab".
 */
export function Outlink(props: OutlinkProps) {
  return (
    <a
      href={props.href}
      class={props.class}
      aria-label={props['aria-label']}
      rel="noopener noreferrer"
      onClick={(e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault()
          openOutlink(props.href)
        }
      }}
    >
      {props.children}
    </a>
  )
}
