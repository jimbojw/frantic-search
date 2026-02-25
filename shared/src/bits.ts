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

// Sentinel values for special color predicates (not real bitmasks).
// These are negative to avoid collision with any valid 5-bit color mask.
export const COLOR_COLORLESS = -1;
export const COLOR_MULTICOLOR = -2;
export const COLOR_IMPOSSIBLE = -3;

/**
 * Named color values → bitmask (or sentinel for special predicates).
 * All keys are lowercase. Looked up before the letter-sequence fallback.
 */
export const COLOR_NAMES: Record<string, number> = {
  // Full color names
  white: Color.White,
  blue: Color.Blue,
  black: Color.Black,
  red: Color.Red,
  green: Color.Green,

  // Guilds (2-color)
  azorius: Color.White | Color.Blue,
  dimir: Color.Blue | Color.Black,
  rakdos: Color.Black | Color.Red,
  gruul: Color.Red | Color.Green,
  selesnya: Color.Green | Color.White,
  orzhov: Color.White | Color.Black,
  izzet: Color.Blue | Color.Red,
  golgari: Color.Black | Color.Green,
  boros: Color.Red | Color.White,
  simic: Color.Green | Color.Blue,

  // Shards (3-color)
  bant: Color.Green | Color.White | Color.Blue,
  esper: Color.White | Color.Blue | Color.Black,
  grixis: Color.Blue | Color.Black | Color.Red,
  jund: Color.Black | Color.Red | Color.Green,
  naya: Color.Red | Color.Green | Color.White,

  // Wedges (3-color)
  abzan: Color.White | Color.Black | Color.Green,
  jeskai: Color.Blue | Color.Red | Color.White,
  sultai: Color.Black | Color.Green | Color.Blue,
  mardu: Color.Red | Color.White | Color.Black,
  temur: Color.Green | Color.Blue | Color.Red,

  // Strixhaven colleges (2-color, aliases for guilds)
  silverquill: Color.White | Color.Black,
  prismari: Color.Blue | Color.Red,
  witherbloom: Color.Black | Color.Green,
  lorehold: Color.Red | Color.White,
  quandrix: Color.Green | Color.Blue,

  // Four-color nicknames
  chaos: Color.Blue | Color.Black | Color.Red | Color.Green,
  aggression: Color.White | Color.Black | Color.Red | Color.Green,
  altruism: Color.White | Color.Blue | Color.Red | Color.Green,
  growth: Color.White | Color.Blue | Color.Black | Color.Green,
  artifice: Color.White | Color.Blue | Color.Black | Color.Red,

  // Special predicates
  colorless: COLOR_COLORLESS,
  c: COLOR_COLORLESS,
  multicolor: COLOR_MULTICOLOR,
  m: COLOR_MULTICOLOR,
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

// --- Card Flags (bitmask) ---
export const CardFlag = {
  Reserved: 1 << 0,
  Funny: 1 << 1,
  UniversesBeyond: 1 << 2,
} as const;
