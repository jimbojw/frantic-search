// SPDX-License-Identifier: Apache-2.0

export interface SortFieldEntry {
  canonical: string;
  defaultDir: "asc" | "desc";
  isPrintingDomain: boolean;
}

export const SORT_FIELDS: Record<string, SortFieldEntry> = {
  // Face-domain fields
  name: { canonical: "name", defaultDir: "asc", isPrintingDomain: false },
  mv: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  cmc: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  manavalue: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  color: { canonical: "color", defaultDir: "asc", isPrintingDomain: false },
  c: { canonical: "color", defaultDir: "asc", isPrintingDomain: false },
  power: { canonical: "power", defaultDir: "desc", isPrintingDomain: false },
  pow: { canonical: "power", defaultDir: "desc", isPrintingDomain: false },
  toughness: {
    canonical: "toughness",
    defaultDir: "desc",
    isPrintingDomain: false,
  },
  tou: { canonical: "toughness", defaultDir: "desc", isPrintingDomain: false },

  // Printing-domain fields
  price: { canonical: "price", defaultDir: "asc", isPrintingDomain: true },
  usd: { canonical: "price", defaultDir: "asc", isPrintingDomain: true },
  date: { canonical: "date", defaultDir: "desc", isPrintingDomain: true },
  released: { canonical: "date", defaultDir: "desc", isPrintingDomain: true },
  year: { canonical: "date", defaultDir: "desc", isPrintingDomain: true },
  rarity: { canonical: "rarity", defaultDir: "desc", isPrintingDomain: true },
};
