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
  GameChanger: 1 << 3,
  MeldResult: 1 << 4,
} as const;

// --- Rarity (bitmask, 6 bits: common through mythic + special + bonus) ---
export const Rarity = {
  Common: 1 << 0,
  Uncommon: 1 << 1,
  Rare: 1 << 2,
  Mythic: 1 << 3,
  Special: 1 << 4,
  Bonus: 1 << 5,
} as const;

export const RARITY_FROM_STRING: Record<string, number> = {
  common: Rarity.Common,
  uncommon: Rarity.Uncommon,
  rare: Rarity.Rare,
  mythic: Rarity.Mythic,
  special: Rarity.Special,
  bonus: Rarity.Bonus,
};

export const RARITY_NAMES: Record<string, number> = {
  common: Rarity.Common, c: Rarity.Common,
  uncommon: Rarity.Uncommon, u: Rarity.Uncommon,
  rare: Rarity.Rare, r: Rarity.Rare,
  mythic: Rarity.Mythic, m: Rarity.Mythic,
  special: Rarity.Special, s: Rarity.Special,
  bonus: Rarity.Bonus, b: Rarity.Bonus,
};

export const RARITY_ORDER: Record<number, number> = {
  [Rarity.Common]: 0,
  [Rarity.Uncommon]: 1,
  [Rarity.Rare]: 2,
  [Rarity.Special]: 3,
  [Rarity.Mythic]: 4,
  [Rarity.Bonus]: 5,
};

// --- Finish (enum, not bitmask — each printing row has exactly one) ---
export const Finish = {
  Nonfoil: 0,
  Foil: 1,
  Etched: 2,
} as const;

export const FINISH_FROM_STRING: Record<string, number> = {
  nonfoil: Finish.Nonfoil,
  foil: Finish.Foil,
  etched: Finish.Etched,
};

// --- Printing Flags (bitmask, 17 bits) ---
export const PrintingFlag = {
  FullArt: 1 << 0,
  Textless: 1 << 1,
  Reprint: 1 << 2,
  Promo: 1 << 3,
  Digital: 1 << 4,
  HighresImage: 1 << 5,
  Borderless: 1 << 6,
  ExtendedArt: 1 << 7,
  GoldBorder: 1 << 8,
  Oversized: 1 << 9,
  Spotlight: 1 << 10,
  Booster: 1 << 11,
  Masterpiece: 1 << 12,
  Colorshifted: 1 << 13,
  Showcase: 1 << 14,
  Inverted: 1 << 15,
  Nyxtouched: 1 << 16,
} as const;

// --- Frame (bitmask, 5 bits) ---
export const Frame = {
  Y1993: 1 << 0,
  Y1997: 1 << 1,
  Y2003: 1 << 2,
  Y2015: 1 << 3,
  Future: 1 << 4,
} as const;

export const FRAME_FROM_STRING: Record<string, number> = {
  "1993": Frame.Y1993,
  "1997": Frame.Y1997,
  "2003": Frame.Y2003,
  "2015": Frame.Y2015,
  future: Frame.Future,
};

export const FRAME_NAMES: Record<string, number> = {
  ...FRAME_FROM_STRING,
};

// --- Game availability (bitmask, 5 bits) ---
export const Game = {
  Paper: 1 << 0,
  Mtgo: 1 << 1,
  Arena: 1 << 2,
  Astral: 1 << 3,
  Sega: 1 << 4,
} as const;

export const GAME_NAMES: Record<string, number> = {
  paper: Game.Paper,
  mtgo: Game.Mtgo,
  arena: Game.Arena,
  astral: Game.Astral,
  sega: Game.Sega,
};

// --- Promo types (Scryfall promo_types array → bitmask columns) ---
// Column 0: bits 0–31. Column 1: bits 0–18. Alphabetical by promo_types string.
// See Spec 046 for the full bit layout.
export const PROMO_TYPE_FLAGS: Record<string, { column: 0 | 1; bit: number }> = {
  alchemy: { column: 0, bit: 0 },
  beginnerbox: { column: 0, bit: 1 },
  boosterfun: { column: 0, bit: 2 },
  brawldeck: { column: 0, bit: 3 },
  buyabox: { column: 0, bit: 4 },
  chocobotrackfoil: { column: 0, bit: 5 },
  convention: { column: 0, bit: 6 },
  datestamped: { column: 0, bit: 7 },
  event: { column: 0, bit: 8 },
  ffi: { column: 0, bit: 9 },
  ffii: { column: 0, bit: 10 },
  ffiii: { column: 0, bit: 11 },
  ffiv: { column: 0, bit: 12 },
  ffix: { column: 0, bit: 13 },
  ffv: { column: 0, bit: 14 },
  ffvi: { column: 0, bit: 15 },
  ffvii: { column: 0, bit: 16 },
  ffviii: { column: 0, bit: 17 },
  ffx: { column: 0, bit: 18 },
  ffxi: { column: 0, bit: 19 },
  ffxii: { column: 0, bit: 20 },
  ffxiii: { column: 0, bit: 21 },
  ffxiv: { column: 0, bit: 22 },
  ffxv: { column: 0, bit: 23 },
  ffxvi: { column: 0, bit: 24 },
  fnm: { column: 0, bit: 25 },
  instore: { column: 0, bit: 26 },
  league: { column: 0, bit: 27 },
  planeswalkerdeck: { column: 0, bit: 28 },
  plastic: { column: 0, bit: 29 },
  playerrewards: { column: 0, bit: 30 },
  playpromo: { column: 0, bit: 31 },
  playtest: { column: 1, bit: 0 },
  poster: { column: 1, bit: 1 },
  prerelease: { column: 1, bit: 2 },
  rainbowfoil: { column: 1, bit: 3 },
  rebalanced: { column: 1, bit: 4 },
  release: { column: 1, bit: 5 },
  ripplefoil: { column: 1, bit: 6 },
  setpromo: { column: 1, bit: 7 },
  sldbonus: { column: 1, bit: 8 },
  sourcematerial: { column: 1, bit: 9 },
  stamped: { column: 1, bit: 10 },
  startercollection: { column: 1, bit: 11 },
  starterdeck: { column: 1, bit: 12 },
  surgefoil: { column: 1, bit: 13 },
  themepack: { column: 1, bit: 14 },
  tourney: { column: 1, bit: 15 },
  universesbeyond: { column: 1, bit: 16 },
  ub: { column: 1, bit: 16 }, // alias for universesbeyond
  upsidedown: { column: 1, bit: 17 },
  wizardsplaynetwork: { column: 1, bit: 18 },
  glossy: { column: 1, bit: 19 },
};
