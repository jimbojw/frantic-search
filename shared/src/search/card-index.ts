// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData } from "../data";
import { parseManaSymbols, computeCmc } from "./mana";

export class CardIndex {
  readonly faceCount: number;
  readonly namesLower: string[];
  readonly oracleTextsLower: string[];
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
  readonly powerLookup: string[];
  readonly toughnessLookup: string[];
  readonly loyaltyLookup: string[];
  readonly defenseLookup: string[];

  constructor(data: ColumnarData) {
    this.faceCount = data.names.length;
    this.namesLower = data.names.map((n) => n.toLowerCase());
    this.oracleTextsLower = data.oracle_texts.map((t) => t.toLowerCase());
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
    this.powerLookup = data.power_lookup;
    this.toughnessLookup = data.toughness_lookup;
    this.loyaltyLookup = data.loyalty_lookup;
    this.defenseLookup = data.defense_lookup;
  }

  deduplicateMatches(faceIndices: number[]): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    for (const fi of faceIndices) {
      const cf = this.canonicalFace[fi];
      if (!seen.has(cf)) {
        seen.add(cf);
        result.push(cf);
      }
    }
    return result;
  }
}
