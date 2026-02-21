// SPDX-License-Identifier: Apache-2.0

// --- Colors (5 bits) ---
export const Color = {
  White: 1 << 0, // 0b00001
  Blue: 1 << 1, // 0b00010
  Black: 1 << 2, // 0b00100
  Red: 1 << 3, // 0b01000
  Green: 1 << 4, // 0b10000
} as const;

export const COLOR_FROM_LETTER: Record<string, number> = {
  W: Color.White,
  U: Color.Blue,
  B: Color.Black,
  R: Color.Red,
  G: Color.Green,
};

// --- Card Types (8 bits) ---
export const CardType = {
  Artifact: 1 << 0,
  Battle: 1 << 1,
  Creature: 1 << 2,
  Enchantment: 1 << 3,
  Instant: 1 << 4,
  Land: 1 << 5,
  Planeswalker: 1 << 6,
  Sorcery: 1 << 7,
} as const;

export const CARD_TYPE_NAMES: Record<string, number> = {
  Artifact: CardType.Artifact,
  Battle: CardType.Battle,
  Creature: CardType.Creature,
  Enchantment: CardType.Enchantment,
  Instant: CardType.Instant,
  Land: CardType.Land,
  Planeswalker: CardType.Planeswalker,
  Sorcery: CardType.Sorcery,
};

// --- Supertypes (4 bits) ---
export const Supertype = {
  Basic: 1 << 0,
  Legendary: 1 << 1,
  Snow: 1 << 2,
  World: 1 << 3,
} as const;

export const SUPERTYPE_NAMES: Record<string, number> = {
  Basic: Supertype.Basic,
  Legendary: Supertype.Legendary,
  Snow: Supertype.Snow,
  World: Supertype.World,
};
