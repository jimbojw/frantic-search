// SPDX-License-Identifier: Apache-2.0

/** Single suggestion shown to the user. */
export type Suggestion = {
  /** Unique id for this trigger; used for deduplication and analytics. */
  id:
    | 'empty-list'
    | 'include-extras'
    | 'unique-prints'
    | 'oracle'
    | 'wrong-field'
    | 'nonexistent-field'
    | 'bare-term-upgrade'
    | 'card-type'
    | 'keyword'
    | 'artist-atag'
    | 'name-typo'
    | 'near-miss'
    | 'relaxed'
    | 'stray-comma'
    | 'example-query'
  /** Full query to apply when user taps (rewrite suggestions). Omit for CTA-style (navigate, paste). */
  query?: string
  /** Short label for the chip, e.g. "include:extras", "o:scry". */
  label: string
  /** Optional teaching copy: explains why this helps. */
  explain?: string
  /** Optional doc param for deep-link (e.g. "reference/fields/face/oracle"). Rendered as "Learn more" link when present. */
  docRef?: string
  /** Card count when tapping would change results; for two-line chip display. */
  count?: number
  /** Printing count when relevant. */
  printingCount?: number
  /** 0 = highest; lower values appear first. */
  priority: number
  /** 'rewrite' = setQuery; 'cta' = custom action (navigate, paste). */
  variant: 'rewrite' | 'cta'
  /** For CTA variant: function key to invoke (e.g. 'navigateToLists'). */
  ctaAction?: 'navigateToLists' | 'pasteList'
  /** For empty-list: distinguishes my: vs # for right-column copy. */
  emptyListVariant?: 'my' | 'tag'
}
