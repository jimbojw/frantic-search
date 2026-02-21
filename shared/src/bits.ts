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
  edh: Format.Commander,
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
