// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData } from "../data";
import { normalizeAlphanumeric, buildNormalizedAlternateIndex } from "../normalize";
import { parseManaSymbols, computeCmc } from "./mana";
import { parseStatValue } from "./stats";
import { computeCombinedNames } from "./combined-names";
import { normalizeOracleText } from "./tilde";

const REMINDER_TEXT_RE = /\([^)]*\)/g;

function stripReminderText(text: string): string {
  return text.replace(REMINDER_TEXT_RE, "");
}

function buildSortedNameIndices(
  faceCount: number,
  combinedNamesNormalized: string[],
  canonicalFace: number[],
): Uint32Array {
  const indices = new Uint32Array(faceCount);
  for (let i = 0; i < faceCount; i++) indices[i] = i;
  indices.sort((a, b) => {
    const na = combinedNamesNormalized[canonicalFace[a]];
    const nb = combinedNamesNormalized[canonicalFace[b]];
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });
  return indices;
}

/** Build sorted face indices for EDHREC percentile. Rank inversion: sort descending
 * (highest rank first) so high-index end = most popular. Nulls excluded. */
function buildSortedEdhrecIndices(
  edhrecRank: (number | null)[],
  faceCount: number,
): { indices: Uint32Array; count: number } {
  let count = 0;
  for (let i = 0; i < faceCount; i++) {
    if (edhrecRank[i] != null) count++;
  }
  const indices = new Uint32Array(count);
  let k = 0;
  for (let i = 0; i < faceCount; i++) {
    if (edhrecRank[i] != null) indices[k++] = i;
  }
  indices.sort((a, b) => (edhrecRank[b] ?? 0) - (edhrecRank[a] ?? 0));
  return { indices, count };
}

/** Build sorted face indices for salt percentile. Ascending (lowest salt first, highest last).
 * No inversion: high-index end = saltier. Nulls excluded. */
function buildSortedSaltIndices(
  edhrecSalt: (number | null)[],
  faceCount: number,
): { indices: Uint32Array; count: number } {
  let count = 0;
  for (let i = 0; i < faceCount; i++) {
    if (edhrecSalt[i] != null) count++;
  }
  const indices = new Uint32Array(count);
  let k = 0;
  for (let i = 0; i < faceCount; i++) {
    if (edhrecSalt[i] != null) indices[k++] = i;
  }
  indices.sort((a, b) => (edhrecSalt[a] ?? 0) - (edhrecSalt[b] ?? 0));
  return { indices, count };
}

export class CardIndex {
  readonly faceCount: number;
  readonly namesLower: string[];
  readonly combinedNames: string[];
  readonly combinedNamesLower: string[];
  readonly combinedNamesNormalized: string[];
  readonly oracleTextsLower: string[];
  readonly oracleTextsTildeLower: string[];
  readonly manaCostsLower: string[];
  readonly manaSymbols: Record<string, number>[];
  readonly manaValue: number[];
  readonly colors: number[];
  readonly colorIdentity: number[];
  readonly typeLinesLower: string[];
  readonly powers: number[];
  readonly toughnesses: number[];
  readonly loyalties: number[];
  readonly defenses: number[];
  readonly legalitiesLegal: number[];
  readonly legalitiesBanned: number[];
  readonly legalitiesRestricted: number[];
  readonly cardIndex: number[];
  readonly canonicalFace: number[];
  readonly layouts: string[];
  readonly flags: number[];
  readonly powerLookup: string[];
  readonly toughnessLookup: string[];
  readonly loyaltyLookup: string[];
  readonly defenseLookup: string[];
  readonly numericPowerLookup: number[];
  readonly numericToughnessLookup: number[];
  readonly numericLoyaltyLookup: number[];
  readonly numericDefenseLookup: number[];
  /** Sorted face indices for percentile queries. Ascending by combinedNamesNormalized. */
  readonly sortedNameIndices: Uint32Array;
  /** EDHREC rank per face row (card-level, duplicated across faces). Null when unranked. */
  readonly edhrecRank: (number | null)[];
  /** Sorted face indices for EDHREC percentile. Descending by rank (high-index = most popular). */
  readonly sortedEdhrecIndices: Uint32Array;
  readonly sortedEdhrecCount: number;
  /** EDHREC salt per face row (card-level, duplicated across faces). Null when no salt. */
  readonly edhrecSalt: (number | null)[];
  /** Sorted face indices for salt percentile. Ascending (high-index = saltier). */
  readonly sortedSaltIndices: Uint32Array;
  readonly sortedSaltCount: number;
  /** Alternate name (normalized) → canonical face index. Spec 111. */
  readonly alternateNamesIndex: Record<string, number>;

  private readonly _facesOf: Map<number, number[]>;

  constructor(data: ColumnarData) {
    this.faceCount = data.names.length;

    const combinedNames =
      data.combined_names ??
      computeCombinedNames(data.names, data.canonical_face);
    this.combinedNames = combinedNames;

    const oracleTextsTilde =
      data.oracle_texts_tilde ??
      data.names.map((name, i) =>
        normalizeOracleText(name, data.oracle_texts[i] ?? ""),
      );

    this.namesLower = data.names.map((n) => n.toLowerCase());
    this.combinedNamesLower = combinedNames.map((n) => n.toLowerCase());
    this.combinedNamesNormalized = combinedNames.map((n) =>
      normalizeAlphanumeric(n),
    );
    this.sortedNameIndices = buildSortedNameIndices(
      data.names.length,
      this.combinedNamesNormalized,
      data.canonical_face,
    );
    const edhrecRanks = data.edhrec_ranks;
    this.edhrecRank = edhrecRanks;
    const { indices: sortedEdhrec, count: sortedEdhrecCount } = buildSortedEdhrecIndices(
      edhrecRanks,
      data.names.length,
    );
    this.sortedEdhrecIndices = sortedEdhrec;
    this.sortedEdhrecCount = sortedEdhrecCount;
    const edhrecSalts = data.edhrec_salts;
    this.edhrecSalt = edhrecSalts;
    const { indices: sortedSalt, count: sortedSaltCount } = buildSortedSaltIndices(
      edhrecSalts,
      data.names.length,
    );
    this.sortedSaltIndices = sortedSalt;
    this.sortedSaltCount = sortedSaltCount;
    this.oracleTextsLower = data.oracle_texts.map((t) =>
      stripReminderText(t).toLowerCase(),
    );
    this.oracleTextsTildeLower = oracleTextsTilde.map((t) =>
      stripReminderText(t).toLowerCase(),
    );
    this.manaCostsLower = data.mana_costs.map((m) => m.toLowerCase());
    this.manaSymbols = data.mana_costs.map((m) => parseManaSymbols(m));
    this.manaValue = this.manaSymbols.map(computeCmc);
    this.colors = data.colors;
    this.colorIdentity = data.color_identity;
    this.typeLinesLower = data.type_lines.map((t) => t.toLowerCase());
    this.powers = data.powers;
    this.toughnesses = data.toughnesses;
    this.loyalties = data.loyalties;
    this.defenses = data.defenses;
    this.legalitiesLegal = data.legalities_legal;
    this.legalitiesBanned = data.legalities_banned;
    this.legalitiesRestricted = data.legalities_restricted;
    this.cardIndex = data.card_index;
    this.canonicalFace = data.canonical_face;
    this.layouts = data.layouts;
    this.flags = data.flags;
    this.powerLookup = data.power_lookup;
    this.toughnessLookup = data.toughness_lookup;
    this.loyaltyLookup = data.loyalty_lookup;
    this.defenseLookup = data.defense_lookup;
    this.numericPowerLookup = data.power_lookup.map(parseStatValue);
    this.numericToughnessLookup = data.toughness_lookup.map(parseStatValue);
    this.numericLoyaltyLookup = data.loyalty_lookup.map(parseStatValue);
    this.numericDefenseLookup = data.defense_lookup.map(parseStatValue);

    this.alternateNamesIndex = buildNormalizedAlternateIndex(
      data.alternate_names_index ?? {},
    );

    this._facesOf = new Map();
    for (let i = 0; i < this.faceCount; i++) {
      const cf = data.canonical_face[i];
      let faces = this._facesOf.get(cf);
      if (!faces) {
        faces = [];
        this._facesOf.set(cf, faces);
      }
      faces.push(i);
    }
  }

  facesOf(canonicalIndex: number): number[] {
    return this._facesOf.get(canonicalIndex) ?? [];
  }
}
