// SPDX-License-Identifier: Apache-2.0

import type { JSX } from 'solid-js'

export const CHIP_CLASSES: Record<'neutral' | 'positive' | 'negative' | 'alt-negative', string> = {
  neutral: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300',
  positive: 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500',
  negative: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 line-through hover:bg-red-200 dark:hover:bg-red-900/60',
  'alt-negative': 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60',
}

export function ChipButton(props: {
  /** Visual state for tri-state chips (neutral/positive/negative). 'alt-negative' = purple (SortChip descending). */
  state?: 'neutral' | 'positive' | 'negative' | 'alt-negative'
  /** Alternative to state: binary active/inactive for ViewChip, UniqueChip, IncludeExtrasChip. */
  active?: boolean
  /** Layout: 'row' (default) or 'col' for two-line content (e.g. oracle hint). */
  layout?: 'row' | 'col'
  /** Override base size. 'compact' uses min-h-8 (for future DeckEditorStatus use). */
  size?: 'default' | 'compact'
  /** Additional class names. Merged after base + state classes. */
  class?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  /** Accessibility. Omit for default button role. */
  role?: JSX.AriaAttributes['role']
  /** For pressed-state chips. */
  'aria-pressed'?: boolean
  children: JSX.Element
}) {
  const stateClass = () => {
    if (props.state !== undefined) return CHIP_CLASSES[props.state]
    if (props.active !== undefined) return props.active ? CHIP_CLASSES.positive : CHIP_CLASSES.neutral
    return CHIP_CLASSES.neutral
  }

  const sizeClass = () => (props.size === 'compact' ? 'min-h-8 min-w-8' : 'min-h-11 min-w-11')
  const layoutClass = () =>
    props.layout === 'col' ? 'flex-col items-start text-left' : 'items-center justify-center'

  const baseClass = 'inline-flex px-2 py-2 rounded text-xs font-mono cursor-pointer transition-colors'
  const classes = () =>
    [baseClass, sizeClass(), layoutClass(), stateClass(), props.class].filter(Boolean).join(' ')

  return (
    <button
      type={props.type ?? 'button'}
      {...(props.role !== undefined && { role: props.role })}
      class={classes()}
      onClick={props.onClick}
      aria-pressed={props['aria-pressed']}
    >
      {props.children}
    </button>
  )
}
