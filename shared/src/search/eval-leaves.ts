// SPDX-License-Identifier: Apache-2.0
import type { FieldNode, RegexFieldNode, ExactNameNode } from "./ast";
import type { CardIndex } from "./card-index";
import {
  COLOR_FROM_LETTER, COLOR_NAMES, COLOR_COLORLESS, COLOR_MULTICOLOR, COLOR_IMPOSSIBLE,
  FORMAT_NAMES,
} from "../bits";
import { parseManaSymbols, manaContains } from "./mana";
import { parseStatValue } from "./stats";
import { evalIsKeyword } from "./eval-is";

export const FIELD_ALIASES: Record<string, string> = {
  name: "name", n: "name",
  oracle: "oracle", o: "oracle",
  color: "color", c: "color",
  identity: "identity", id: "identity", ci: "identity", commander: "identity", cmd: "identity",
  type: "type", t: "type",
  power: "power", pow: "power",
  toughness: "toughness", tou: "toughness",
  loyalty: "loyalty", loy: "loyalty",
  defense: "defense", def: "defense",
  cmc: "manavalue", mv: "manavalue", manavalue: "manavalue",
  mana: "mana", m: "mana",
  legal: "legal", f: "legal", format: "legal",
  banned: "banned",
  restricted: "restricted",
  is: "is",
  set: "set", s: "set", e: "set", edition: "set",
  rarity: "rarity", r: "rarity",
  price: "price", usd: "price",
  cn: "collectornumber", number: "collectornumber", collectornumber: "collectornumber",
  frame: "frame",
  year: "year",
  date: "date",
};

function parseColorValue(value: string): number {
  const named = COLOR_NAMES[value.toLowerCase()];
  if (named !== undefined) return named;
  let mask = 0;
  let hasColorless = false;
  for (const ch of value.toUpperCase()) {
    if (ch === "C") {
      hasColorless = true;
    } else {
      mask |= COLOR_FROM_LETTER[ch] ?? 0;
    }
  }
  if (hasColorless) {
    return mask !== 0 ? COLOR_IMPOSSIBLE : COLOR_COLORLESS;
  }
  return mask;
}

function getStringColumn(canonical: string, index: CardIndex): string[] | null {
  switch (canonical) {
    case "name": return index.combinedNamesLower;
    case "oracle": return index.oracleTextsLower;
    case "type": return index.typeLinesLower;
    default: return null;
  }
}

export function fillCanonical(buf: Uint8Array, cf: number[], n: number): void {
  for (let i = 0; i < n; i++) if (cf[i] === i) buf[i] = 1;
}

export function evalLeafField(
  node: FieldNode,
  index: CardIndex,
  buf: Uint8Array,
): string | null {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.faceCount;
  const cf = index.canonicalFace;
  const op = node.operator;
  const val = node.value;

  if (!canonical) {
    return `unknown field "${node.field}"`;
  }
  if (val === "") {
    fillCanonical(buf, cf, n);
    return null;
  }

  const valLower = val.toLowerCase();

  switch (canonical) {
    case "name":
    case "type": {
      const col = getStringColumn(canonical, index)!;
      for (let i = 0; i < n; i++) {
        if (col[i].includes(valLower)) buf[cf[i]] = 1;
      }
      break;
    }
    case "oracle": {
      const col = valLower.includes("~")
        ? index.oracleTextsTildeLower
        : index.oracleTextsLower;
      for (let i = 0; i < n; i++) {
        if (col[i].includes(valLower)) buf[cf[i]] = 1;
      }
      break;
    }
    case "color":
    case "identity": {
      const col = canonical === "color" ? index.colors : index.colorIdentity;
      const queryMask = parseColorValue(val);

      if (queryMask === COLOR_IMPOSSIBLE) {
        return "a card cannot be both colored and colorless";
      }

      if (queryMask === COLOR_COLORLESS) {
        for (let i = 0; i < n; i++) if (col[i] === 0) buf[cf[i]] = 1;
        break;
      }
      if (queryMask === COLOR_MULTICOLOR) {
        for (let i = 0; i < n; i++) {
          let v = col[i]; v = (v & 0x55) + ((v >> 1) & 0x55);
          v = (v & 0x33) + ((v >> 2) & 0x33); v = (v + (v >> 4)) & 0x0f;
          if (v >= 2) buf[cf[i]] = 1;
        }
        break;
      }

      // color: colon means superset (≥): "has at least these colors"
      // identity: colon means subset (≤): "fits in a deck of these colors"
      const colonOp = canonical === "identity" ? "<=" : ">=";
      const effectiveOp = op === ":" ? colonOp : op;
      switch (effectiveOp) {
        case ">=":
          for (let i = 0; i < n; i++) if ((col[i] & queryMask) === queryMask) buf[cf[i]] = 1;
          break;
        case "=":
          for (let i = 0; i < n; i++) if (col[i] === queryMask) buf[cf[i]] = 1;
          break;
        case "<=":
          for (let i = 0; i < n; i++) if ((col[i] & ~queryMask) === 0) buf[cf[i]] = 1;
          break;
        case "!=":
          for (let i = 0; i < n; i++) if (col[i] !== queryMask) buf[cf[i]] = 1;
          break;
        case ">":
          for (let i = 0; i < n; i++) if ((col[i] & queryMask) === queryMask && col[i] !== queryMask) buf[cf[i]] = 1;
          break;
        case "<":
          for (let i = 0; i < n; i++) if ((col[i] & ~queryMask) === 0 && col[i] !== queryMask) buf[cf[i]] = 1;
          break;
        default:
          break;
      }
      break;
    }
    case "power":
    case "toughness":
    case "loyalty":
    case "defense": {
      const numericLookup = canonical === "power" ? index.numericPowerLookup
        : canonical === "toughness" ? index.numericToughnessLookup
        : canonical === "loyalty" ? index.numericLoyaltyLookup
        : index.numericDefenseLookup;
      const idxCol = canonical === "power" ? index.powers
        : canonical === "toughness" ? index.toughnesses
        : canonical === "loyalty" ? index.loyalties
        : index.defenses;
      const queryNum = parseStatValue(val);
      if (isNaN(queryNum)) break;
      for (let i = 0; i < n; i++) {
        const cardNum = numericLookup[idxCol[i]];
        if (isNaN(cardNum)) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = cardNum === queryNum; break;
          case "!=": match = cardNum !== queryNum; break;
          case ">":  match = cardNum > queryNum; break;
          case "<":  match = cardNum < queryNum; break;
          case ">=": match = cardNum >= queryNum; break;
          case "<=": match = cardNum <= queryNum; break;
        }
        if (match) buf[cf[i]] = 1;
      }
      break;
    }
    case "manavalue": {
      const queryNum = Number(val);
      if (isNaN(queryNum)) break;
      const cmcCol = index.manaValue;
      for (let i = 0; i < n; i++) {
        let match = false;
        switch (op) {
          case ":": case "=": match = cmcCol[i] === queryNum; break;
          case "!=": match = cmcCol[i] !== queryNum; break;
          case ">":  match = cmcCol[i] > queryNum; break;
          case "<":  match = cmcCol[i] < queryNum; break;
          case ">=": match = cmcCol[i] >= queryNum; break;
          case "<=": match = cmcCol[i] <= queryNum; break;
        }
        if (match) buf[cf[i]] = 1;
      }
      break;
    }
    case "mana": {
      const querySymbols = parseManaSymbols(valLower);
      for (let i = 0; i < n; i++) {
        if (manaContains(index.manaSymbols[i], querySymbols)) buf[cf[i]] = 1;
      }
      break;
    }
    case "legal":
    case "banned":
    case "restricted": {
      const formatBit = FORMAT_NAMES[valLower];
      if (formatBit === undefined) return `unknown format "${node.value}"`;
      const col = canonical === "legal" ? index.legalitiesLegal
        : canonical === "banned" ? index.legalitiesBanned
        : index.legalitiesRestricted;
      for (let i = 0; i < n; i++) {
        if ((col[i] & formatBit) !== 0) buf[cf[i]] = 1;
      }
      break;
    }
    case "is": {
      if (op !== ":" && op !== "=") break;
      const status = evalIsKeyword(valLower, index, buf, n);
      if (status === "unsupported") return `unsupported keyword "${node.value}"`;
      if (status === "unknown") return `unknown keyword "${node.value}"`;
      break;
    }
    default:
      break;
  }
  return null;
}

export function evalLeafRegex(
  node: RegexFieldNode,
  index: CardIndex,
  buf: Uint8Array,
): string | null {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  if (!canonical) return `unknown field "${node.field}"`;

  const n = index.faceCount;
  const cf = index.canonicalFace;

  let col: string[] | null;
  if (canonical === "oracle" && node.pattern.includes("~")) {
    col = index.oracleTextsTildeLower;
  } else {
    col = getStringColumn(canonical, index);
  }

  if (!col) return `unknown field "${node.field}"`;

  let re: RegExp;
  try {
    re = new RegExp(node.pattern, "i");
  } catch {
    return "invalid regex";
  }

  for (let i = 0; i < n; i++) {
    if (re.test(col[i])) buf[cf[i]] = 1;
  }
  return null;
}

export function evalLeafBareWord(value: string, quoted: boolean, index: CardIndex, buf: Uint8Array): void {
  const cf = index.canonicalFace;
  if (quoted) {
    const valLower = value.toLowerCase();
    for (let i = 0; i < index.faceCount; i++) {
      if (index.combinedNamesLower[i].includes(valLower)) buf[cf[i]] = 1;
    }
  } else {
    const valNormalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (let i = 0; i < index.faceCount; i++) {
      if (index.combinedNamesNormalized[i].includes(valNormalized)) buf[cf[i]] = 1;
    }
  }
}

export function evalLeafExact(node: ExactNameNode, index: CardIndex, buf: Uint8Array): void {
  const cf = index.canonicalFace;
  const valLower = node.value.toLowerCase();
  for (let i = 0; i < index.faceCount; i++) {
    if (index.combinedNamesLower[i] === valLower || index.namesLower[i] === valLower) buf[cf[i]] = 1;
  }
}
