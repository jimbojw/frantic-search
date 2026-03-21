// SPDX-License-Identifier: Apache-2.0
import type { FieldNode, RegexFieldNode, ExactNameNode } from "./ast";
import type { CardIndex } from "./card-index";
import {
  COLOR_FROM_LETTER, COLOR_NAMES, COLOR_COLORLESS, COLOR_MULTICOLOR, COLOR_IMPOSSIBLE,
  FORMAT_NAMES,
} from "../bits";
import { parseManaSymbols, manaContains, manaEquals } from "./mana";
import { parseStatValue } from "./stats";
import { evalIsKeyword } from "./eval-is";
import { parsePercentile, applyPercentileSlice, PERCENTILE_RE } from "./eval-printing";
import { resolveForField, type ResolutionContext } from "./categorical-resolve";
import { normalizeAlphanumeric } from "../normalize";

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
  not: "not",
  set: "set", s: "set", e: "set", edition: "set",
  rarity: "rarity", r: "rarity",
  usd: "usd", $: "usd",
  cn: "collectornumber", number: "collectornumber", collectornumber: "collectornumber",
  frame: "frame",
  year: "year",
  date: "date",
  game: "game",
  in: "in",
  my: "my",
  otag: "otag",
  function: "otag",
  oracletag: "otag",
  atag: "atag",
  art: "atag",
  flavor: "flavor",
  ft: "flavor",
  kw: "keyword",
  keyword: "keyword",
  edhrec: "edhrec",
  edhrecrank: "edhrec",
  salt: "salt",
  edhrecsalt: "salt",
  saltiness: "salt",
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

const NAME_CMP_OPS = new Set([">", "<", ">=", "<="]);

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
  context?: ResolutionContext,
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
    case "name": {
      const namePercentile = parsePercentile(val);
      if (namePercentile !== null) {
        if (!NAME_CMP_OPS.has(op) && op !== "=" && op !== ":" && op !== "!=") break;
        applyPercentileSlice(
          index.sortedNameIndices,
          index.faceCount,
          op,
          namePercentile,
          buf,
        );
        break;
      }
      if (PERCENTILE_RE.test(val)) return `invalid percentile "${val.replace(/%$/, "")}"`;
      if (NAME_CMP_OPS.has(op)) {
        // Lexicographic comparison (Spec 096): same normalization as sort:name
        const valNorm = normalizeAlphanumeric(val);
        const col = index.combinedNamesNormalized;
        for (let i = 0; i < n; i++) {
          const cardNorm = col[cf[i]];
          const cmp = cardNorm.localeCompare(valNorm);
          const match =
            op === ">" ? cmp > 0
            : op === ">=" ? cmp >= 0
            : op === "<" ? cmp < 0
            : op === "<=" ? cmp <= 0
            : false;
          if (match) buf[cf[i]] = 1;
        }
      } else {
        // Substring match (:, =, !=)
        const col = index.combinedNamesLower;
        for (let i = 0; i < n; i++) {
          if (col[cf[i]].includes(valLower)) buf[cf[i]] = 1;
        }
      }
      break;
    }
    case "edhrec": {
      if (valLower === "null") {
        switch (op) {
          case ":": case "=":
            for (let i = 0; i < n; i++) if (index.edhrecRank[i] === null) buf[cf[i]] = 1;
            break;
          case "!=":
            for (let i = 0; i < n; i++) if (index.edhrecRank[i] !== null) buf[cf[i]] = 1;
            break;
          default:
            return "null cannot be used with comparison operators";
        }
        break;
      }
      const edhrecPercentile = parsePercentile(val);
      if (edhrecPercentile !== null) {
        if (!NAME_CMP_OPS.has(op) && op !== "=" && op !== ":" && op !== "!=") break;
        applyPercentileSlice(
          index.sortedEdhrecIndices,
          index.sortedEdhrecCount,
          op,
          edhrecPercentile,
          buf,
        );
        break;
      }
      if (PERCENTILE_RE.test(val)) return `invalid percentile "${val.replace(/%$/, "")}"`;
      const queryNum = Number(val);
      if (isNaN(queryNum) || !Number.isInteger(queryNum)) break;
      const col = index.edhrecRank;
      for (let i = 0; i < n; i++) {
        const r = col[i];
        if (r == null) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = r === queryNum; break;
          case "!=": match = r !== queryNum; break;
          case ">":  match = r > queryNum; break;
          case "<":  match = r < queryNum; break;
          case ">=": match = r >= queryNum; break;
          case "<=": match = r <= queryNum; break;
        }
        if (match) buf[cf[i]] = 1;
      }
      break;
    }
    case "salt": {
      if (valLower === "null") {
        switch (op) {
          case ":": case "=":
            for (let i = 0; i < n; i++) if (index.edhrecSalt[i] === null) buf[cf[i]] = 1;
            break;
          case "!=":
            for (let i = 0; i < n; i++) if (index.edhrecSalt[i] !== null) buf[cf[i]] = 1;
            break;
          default:
            return "null cannot be used with comparison operators";
        }
        break;
      }
      const saltPercentile = parsePercentile(val);
      if (saltPercentile !== null) {
        if (!NAME_CMP_OPS.has(op) && op !== "=" && op !== ":" && op !== "!=") break;
        applyPercentileSlice(
          index.sortedSaltIndices,
          index.sortedSaltCount,
          op,
          saltPercentile,
          buf,
        );
        break;
      }
      if (PERCENTILE_RE.test(val)) return `invalid percentile "${val.replace(/%$/, "")}"`;
      const queryNum = parseFloat(val);
      if (isNaN(queryNum)) break;
      const col = index.edhrecSalt;
      for (let i = 0; i < n; i++) {
        const s = col[i];
        if (s == null) continue;
        let match = false;
        switch (op) {
          case ":": case "=": match = s === queryNum; break;
          case "!=": match = s !== queryNum; break;
          case ">":  match = s > queryNum; break;
          case "<":  match = s < queryNum; break;
          case ">=": match = s >= queryNum; break;
          case "<=": match = s <= queryNum; break;
        }
        if (match) buf[cf[i]] = 1;
      }
      break;
    }
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

      // Numeric value → color count comparison (Spec 055)
      if (/^\d+$/.test(val)) {
        const queryNum = Number(val);
        if (!Number.isInteger(queryNum) || queryNum < 0) break;
        if (queryNum > 5) return "color count must be 0–5";
        for (let i = 0; i < n; i++) {
          let v = col[i];
          v = (v & 0x55) + ((v >> 1) & 0x55);
          v = (v & 0x33) + ((v >> 2) & 0x33);
          const count = (v + (v >> 4)) & 0x0f;
          const match = (op === ":" || op === "=") ? count === queryNum
            : op === "!=" ? count !== queryNum
            : op === ">" ? count > queryNum
            : op === "<" ? count < queryNum
            : op === ">=" ? count >= queryNum
            : op === "<=" ? count <= queryNum
            : false;
          if (match) buf[cf[i]] = 1;
        }
        break;
      }

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
      const strLookup = canonical === "power" ? index.powerLookup
        : canonical === "toughness" ? index.toughnessLookup
        : canonical === "loyalty" ? index.loyaltyLookup
        : index.defenseLookup;
      const idxCol = canonical === "power" ? index.powers
        : canonical === "toughness" ? index.toughnesses
        : canonical === "loyalty" ? index.loyalties
        : index.defenses;
      if (valLower === "null") {
        switch (op) {
          case ":": case "=":
            for (let i = 0; i < n; i++) if (strLookup[idxCol[i]] === "") buf[cf[i]] = 1;
            break;
          case "!=":
            for (let i = 0; i < n; i++) if (strLookup[idxCol[i]] !== "") buf[cf[i]] = 1;
            break;
          default:
            return "null cannot be used with comparison operators";
        }
        break;
      }
      const numericLookup = canonical === "power" ? index.numericPowerLookup
        : canonical === "toughness" ? index.numericToughnessLookup
        : canonical === "loyalty" ? index.numericLoyaltyLookup
        : index.numericDefenseLookup;
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
      if (valLower === "null") {
        switch (op) {
          case ":": case "=":
            for (let i = 0; i < n; i++) if (index.manaCostsLower[i] === "") buf[cf[i]] = 1;
            break;
          case "!=":
            for (let i = 0; i < n; i++) if (index.manaCostsLower[i] !== "") buf[cf[i]] = 1;
            break;
          default:
            return "null cannot be used with comparison operators";
        }
        break;
      }
      const querySymbols = parseManaSymbols(valLower);
      for (let i = 0; i < n; i++) {
        const cardSymbols = index.manaSymbols[i];
        let match = false;
        switch (op) {
          case ":":
          case ">=":
            match = manaContains(cardSymbols, querySymbols);
            break;
          case "=":
            match = manaEquals(cardSymbols, querySymbols);
            break;
          case ">":
            match = manaContains(cardSymbols, querySymbols) && !manaEquals(cardSymbols, querySymbols);
            break;
          case "<=":
            match = manaContains(querySymbols, cardSymbols);
            break;
          case "<":
            match = manaContains(querySymbols, cardSymbols) && !manaEquals(cardSymbols, querySymbols);
            break;
          case "!=":
            match = !manaEquals(cardSymbols, querySymbols);
            break;
        }
        if (match) buf[cf[i]] = 1;
      }
      break;
    }
    case "legal":
    case "banned":
    case "restricted": {
      const formatVal = resolveForField(canonical, val, context);
      const formatBit = FORMAT_NAMES[formatVal.toLowerCase()];
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
      const isVal = resolveForField("is", val, context);
      const status = evalIsKeyword(isVal.toLowerCase(), index, buf, n);
      if (status === "unsupported") return `unsupported keyword "${node.value}"`;
      if (status === "unknown") return `unknown keyword "${node.value}"`;
      break;
    }
    case "not": {
      if (op !== ":" && op !== "=") break;
      const isVal = resolveForField("is", val, context);
      const status = evalIsKeyword(isVal.toLowerCase(), index, buf, n);
      if (status === "unsupported") return `unsupported keyword "${node.value}"`;
      if (status === "unknown") return `unknown keyword "${node.value}"`;
      for (let i = 0; i < n; i++) if (cf[i] === i) buf[i] ^= 1;
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

  if (canonical === "name" && NAME_CMP_OPS.has(node.operator)) {
    return "name field does not support comparison operators with regex; use a literal value (e.g. name>M)";
  }

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

export type GetMetadataIndex = () =>
  | { keys: string[]; indexArrays: Uint32Array[] }
  | null;

/**
 * Evaluates #value metadata tag query. Spec 123.
 * Fills buf with 1 for printing indices matching metadata (zone, tags, collection_status, variant).
 * Naked # (empty value) = union of all indexed printings. No metadata → buf stays zeroed.
 */
export function evalLeafMetadataTag(
  value: string,
  getMetadataIndex: GetMetadataIndex,
  buf: Uint8Array,
): void {
  const idx = getMetadataIndex();
  if (!idx || idx.keys.length === 0) return;

  const queryNorm = normalizeAlphanumeric(value);

  for (let i = 0; i < idx.keys.length; i++) {
    const key = idx.keys[i]!;
    if (!key.includes(queryNorm)) continue;
    const arr = idx.indexArrays[i]!;
    for (let j = 0; j < arr.length; j++) {
      const pi = arr[j]!;
      if (pi < buf.length) buf[pi] = 1;
    }
  }
}

export function evalLeafBareWord(value: string, quoted: boolean, index: CardIndex, buf: Uint8Array): void {
  const cf = index.canonicalFace;
  const altIndex = index.alternateNamesIndex;
  if (quoted) {
    const valLower = value.toLowerCase();
    for (let i = 0; i < index.faceCount; i++) {
      if (index.combinedNamesLower[i].includes(valLower)) buf[cf[i]] = 1;
    }
    const valNorm = normalizeAlphanumeric(value);
    for (const altName in altIndex) {
      if (altName.includes(valNorm)) buf[altIndex[altName]] = 1;
    }
  } else {
    const valNormalized = normalizeAlphanumeric(value);
    for (let i = 0; i < index.faceCount; i++) {
      if (index.combinedNamesNormalized[i].includes(valNormalized)) buf[cf[i]] = 1;
    }
    for (const altName in altIndex) {
      if (altName.includes(valNormalized)) buf[altIndex[altName]] = 1;
    }
  }
}

export function evalLeafExact(node: ExactNameNode, index: CardIndex, buf: Uint8Array): string | null {
  if (node.value === "") return "exact name requires a non-empty value";
  const cf = index.canonicalFace;
  const valLower = node.value.toLowerCase();
  for (let i = 0; i < index.faceCount; i++) {
    if (index.combinedNamesLower[i] === valLower || index.namesLower[i] === valLower) buf[cf[i]] = 1;
  }
  // Alternate names: exact match on normalized value (Spec 111)
  const valNormalized = normalizeAlphanumeric(node.value);
  const altMatch = index.alternateNamesIndex[valNormalized];
  if (altMatch !== undefined) buf[altMatch] = 1;
  return null;
}
