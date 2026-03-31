// SPDX-License-Identifier: Apache-2.0
/**
 * One-line intros and doc deep links for MenuDrawer (Spec 083, #231).
 * Keys must match every id in MenuDrawer `ALL_SECTIONS`.
 */
export type MenuDrawerIntroSectionId =
  | 'mylist'
  | 'views'
  | 'formats'
  | 'color'
  | 'types'
  | 'mana'
  | 'layouts'
  | 'roles'
  | 'rarities'
  | 'printings'
  | 'prices'
  | 'popularity'
  | 'salt'
  | 'sort'

export const MENU_DRAWER_SECTION_INTROS: Record<
  MenuDrawerIntroSectionId,
  { description: string; docParam: string }
> = {
  mylist: {
    description: 'Restrict results to your list and deck tags.',
    docParam: 'reference/special/my-list',
  },
  views: {
    description: 'Row layout, unique prints, and whether extras count.',
    docParam: 'reference/modifiers/view',
  },
  formats: {
    description: 'Legality in Commander, Modern, Standard, and other formats.',
    docParam: 'reference/fields/card/legal',
  },
  color: {
    description: 'Include or exclude colors in a card’s color identity.',
    docParam: 'reference/fields/card/identity',
  },
  types: {
    description: 'Filter by card type line (creature, instant, land, and more).',
    docParam: 'reference/fields/face/type',
  },
  mana: {
    description: 'Match mana value (converted mana cost) with one active bound.',
    docParam: 'reference/fields/face/mana-value',
  },
  layouts: {
    description: 'Double-faced and multipart card layouts (DFC, MDFC, split, …).',
    docParam: 'reference/fields/face/is',
  },
  roles: {
    description: 'Commander roles, reserved list, and spell classification.',
    docParam: 'reference/fields/face/is',
  },
  rarities: {
    description: 'Printing rarity (common through mythic and special).',
    docParam: 'reference/fields/printing/rarity',
  },
  printings: {
    description: 'Physical and promo traits (foil, borderless, reprint, …).',
    docParam: 'reference/fields/face/is',
  },
  prices: {
    description: 'Upper bound on marketplace price in USD.',
    docParam: 'reference/fields/printing/usd',
  },
  popularity: {
    description: 'EDHREC popularity percentiles.',
    docParam: 'reference/fields/card/edhrec',
  },
  salt: {
    description: 'EDHREC saltiness percentiles.',
    docParam: 'reference/fields/card/salt',
  },
  sort: {
    description: 'Ordering of results.',
    docParam: 'reference/sorting/overview',
  },
}

/** Intro under the Mana cost `<h3>` inside the mana section. */
export const MENU_DRAWER_MANA_COST_INTRO = {
  description: 'Match colored, X, and generic symbols in mana cost.',
  docParam: 'reference/fields/face/mana',
} as const
