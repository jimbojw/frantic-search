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

// --- Format Legality (21 bits) ---
export const Format = {
  Standard: 1 << 0,
  Future: 1 << 1,
  Historic: 1 << 2,
  Timeless: 1 << 3,
  Gladiator: 1 << 4,
  Pioneer: 1 << 5,
  Modern: 1 << 6,
  Legacy: 1 << 7,
  Pauper: 1 << 8,
  Vintage: 1 << 9,
  Penny: 1 << 10,
  Commander: 1 << 11,
  Oathbreaker: 1 << 12,
  StandardBrawl: 1 << 13,
  Brawl: 1 << 14,
  Alchemy: 1 << 15,
  PauperCommander: 1 << 16,
  Duel: 1 << 17,
  OldSchool: 1 << 18,
  Premodern: 1 << 19,
  Predh: 1 << 20,
} as const;

export const FORMAT_NAMES: Record<string, number> = {
  standard: Format.Standard,
  future: Format.Future,
  historic: Format.Historic,
  timeless: Format.Timeless,
  gladiator: Format.Gladiator,
  pioneer: Format.Pioneer,
  modern: Format.Modern,
  legacy: Format.Legacy,
  pauper: Format.Pauper,
  vintage: Format.Vintage,
  penny: Format.Penny,
  commander: Format.Commander,
  oathbreaker: Format.Oathbreaker,
  standardbrawl: Format.StandardBrawl,
  brawl: Format.Brawl,
  alchemy: Format.Alchemy,
  paupercommander: Format.PauperCommander,
  duel: Format.Duel,
  oldschool: Format.OldSchool,
  premodern: Format.Premodern,
  predh: Format.Predh,
};
