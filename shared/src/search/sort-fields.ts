// SPDX-License-Identifier: Apache-2.0

export interface SortFieldEntry {
  canonical: string;
  defaultDir: "asc" | "desc";
  isPrintingDomain: boolean;
  percentileCapable?: boolean;
  invertPercentile?: boolean;
}

export const PERCENTILE_CAPABLE_FIELDS = new Set(["usd", "date", "name", "edhrec", "salt"]);

export const SORT_FIELDS: Record<string, SortFieldEntry> = {
  // Face-domain fields
  name: { canonical: "name", defaultDir: "asc", isPrintingDomain: false, percentileCapable: true },
  mv: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  cmc: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  manavalue: { canonical: "mv", defaultDir: "asc", isPrintingDomain: false },
  color: { canonical: "color", defaultDir: "asc", isPrintingDomain: false },
  c: { canonical: "color", defaultDir: "asc", isPrintingDomain: false },
  identity: { canonical: "identity", defaultDir: "asc", isPrintingDomain: false },
  id: { canonical: "identity", defaultDir: "asc", isPrintingDomain: false },
  ci: { canonical: "identity", defaultDir: "asc", isPrintingDomain: false },
  cmd: { canonical: "identity", defaultDir: "asc", isPrintingDomain: false },
  power: { canonical: "power", defaultDir: "desc", isPrintingDomain: false },
  pow: { canonical: "power", defaultDir: "desc", isPrintingDomain: false },
  toughness: {
    canonical: "toughness",
    defaultDir: "desc",
    isPrintingDomain: false,
  },
  tou: { canonical: "toughness", defaultDir: "desc", isPrintingDomain: false },
  edhrec: { canonical: "edhrec", defaultDir: "asc", isPrintingDomain: false, percentileCapable: true, invertPercentile: true },
  edhrecrank: { canonical: "edhrec", defaultDir: "asc", isPrintingDomain: false, percentileCapable: true, invertPercentile: true },
  salt: { canonical: "salt", defaultDir: "desc", isPrintingDomain: false, percentileCapable: true, invertPercentile: false },
  edhrecsalt: { canonical: "salt", defaultDir: "desc", isPrintingDomain: false, percentileCapable: true, invertPercentile: false },
  saltiness: { canonical: "salt", defaultDir: "desc", isPrintingDomain: false, percentileCapable: true, invertPercentile: false },

  // Printing-domain fields
  usd: { canonical: "usd", defaultDir: "asc", isPrintingDomain: true, percentileCapable: true },
  $: { canonical: "usd", defaultDir: "asc", isPrintingDomain: true, percentileCapable: true },
  date: { canonical: "date", defaultDir: "desc", isPrintingDomain: true, percentileCapable: true },
  released: { canonical: "date", defaultDir: "desc", isPrintingDomain: true },
  year: { canonical: "date", defaultDir: "desc", isPrintingDomain: true },
  rarity: { canonical: "rarity", defaultDir: "desc", isPrintingDomain: true },
  set: { canonical: "set", defaultDir: "asc", isPrintingDomain: true },
};
