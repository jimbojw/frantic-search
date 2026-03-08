// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData } from "../data";
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
      n.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    this.sortedNameIndices = buildSortedNameIndices(
      data.names.length,
      this.combinedNamesNormalized,
      data.canonical_face,
    );
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
