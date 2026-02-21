// SPDX-License-Identifier: Apache-2.0
import type { ColumnarData } from "../data";

export class CardIndex {
  readonly cardCount: number;
  readonly namesLower: string[];
  readonly oracleTextsLower: string[];
  readonly manaCosts: string[];
  readonly colors: number[];
  readonly colorIdentity: number[];
  readonly types: number[];
  readonly supertypes: number[];
  readonly subtypesLower: string[];
  readonly powers: number[];
  readonly toughnesses: number[];
  readonly loyalties: number[];
  readonly defenses: number[];
  readonly legalitiesLegal: number[];
  readonly legalitiesBanned: number[];
  readonly legalitiesRestricted: number[];
  readonly powerLookup: string[];
  readonly toughnessLookup: string[];
  readonly loyaltyLookup: string[];
  readonly defenseLookup: string[];

  constructor(data: ColumnarData) {
    this.cardCount = data.names.length;
    this.namesLower = data.names.map((n) => n.toLowerCase());
    this.oracleTextsLower = data.oracle_texts.map((t) => t.toLowerCase());
    this.manaCosts = data.mana_costs;
    this.colors = data.colors;
    this.colorIdentity = data.color_identity;
    this.types = data.types;
    this.supertypes = data.supertypes;
    this.subtypesLower = data.subtypes.map((s) => s.toLowerCase());
    this.powers = data.powers;
    this.toughnesses = data.toughnesses;
    this.loyalties = data.loyalties;
    this.defenses = data.defenses;
    this.legalitiesLegal = data.legalities_legal;
    this.legalitiesBanned = data.legalities_banned;
    this.legalitiesRestricted = data.legalities_restricted;
    this.powerLookup = data.power_lookup;
    this.toughnessLookup = data.toughness_lookup;
    this.loyaltyLookup = data.loyalty_lookup;
    this.defenseLookup = data.defense_lookup;
  }
}
