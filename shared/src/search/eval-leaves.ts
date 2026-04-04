// SPDX-License-Identifier: Apache-2.0
import type { FieldNode, RegexFieldNode, ExactNameNode } from "./ast";
import type { CardIndex } from "./card-index";
import {
  COLOR_FROM_LETTER, COLOR_NAMES, COLOR_COLORLESS, COLOR_MULTICOLOR, COLOR_IMPOSSIBLE,
  FORMAT_NAMES,
} from "../bits";
import { parseManaSymbols, manaContains, manaEquals } from "./mana";
import { parseStatValue, isPlainNumericStatQueryToken } from "./stats";
import { parsePercentile, applyPercentileSlice, PERCENTILE_RE } from "./eval-printing";
import { normalizeForResolution, type ResolutionContext } from "./categorical-resolve";
import { isEquatableNullLiteral } from "./null-query-literal";
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
  set_type: "set_type", st: "set_type",
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
  a: "artist",
  artist: "artist",
  kw: "keyword",
  keyword: "keyword",
  edhrec: "edhrec",
  edhrecrank: "edhrec",
  salt: "salt",
  edhrecsalt: "salt",
  saltiness: "salt",
  produces: "produces",
};

/** Face-domain legalities: skip global empty fill; case handles empty `:` / `=` / `!=` (Spec 182). */
const LEGALITY_CANONICAL = new Set(["legal", "banned", "restricted"]);

/** Precomputed `normalizeForResolution(FORMAT_NAMES key)` → bit (Spec 182). */
const FORMAT_NORM_BITS: { norm: string; bit: number }[] = Object.entries(FORMAT_NAMES).map(([key, bit]) => ({
  norm: normalizeForResolution(key),
  bit,
}));

function combinedFormatMask(prefixOp: boolean, u: string): number {
  let m = 0;
  for (const row of FORMAT_NORM_BITS) {
    if (prefixOp) {
      if (row.norm.startsWith(u)) m |= row.bit;
    } else if (row.norm === u) {
      m |= row.bit;
    }
  }
  return m;
}

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

function popcountByte(v: number): number {
  v = (v & 0x55) + ((v >> 1) & 0x55);
  v = (v & 0x33) + ((v >> 2) & 0x33);
  return (v + (v >> 4)) & 0x0f;
}

type ProducesResolution =
  | { type: "count"; n: number }
  | { type: "multicolor" }
  | { type: "mask"; queryMask: number }
  | { type: "error"; msg: string };

function parseProducesValue(
  val: string,
  producesMasks: Record<string, number>,
): ProducesResolution {
  if (/^\d+$/.test(val)) {
    const n = Number(val);
    if (Number.isInteger(n) && n >= 0) return { type: "count", n };
  }
  const named = COLOR_NAMES[val.toLowerCase()];
  if (named !== undefined) {
    if (named === COLOR_MULTICOLOR) return { type: "multicolor" };
    if (named === COLOR_COLORLESS) {
      const mask = producesMasks["C"] ?? 0;
      if (mask === 0) return { type: "error", msg: `unknown symbol "C"` };
      return { type: "mask", queryMask: mask };
    }
    let queryMask = 0;
    for (const letter of Object.keys(COLOR_FROM_LETTER)) {
      if ((named & COLOR_FROM_LETTER[letter]!) !== 0) {
        const m = producesMasks[letter];
        if (m !== undefined) queryMask |= m;
      }
    }
    if (queryMask === 0) return { type: "error", msg: "no matching symbol types in data" };
    return { type: "mask", queryMask };
  }
  let queryMask = 0;
  for (const ch of val.toUpperCase()) {
    const m = producesMasks[ch];
    if (m === undefined) return { type: "error", msg: `unknown symbol "${ch}"` };
    queryMask |= m;
  }
  return { type: "mask", queryMask };
}

const NAME_CMP_OPS = new Set([">", "<", ">=", "<="]);

const STAT_RANGE_OPS = new Set([">", ">=", "<", "<="]);

/**
 * Spec 018: unquoted bare / unquoted `name:` substring on normalized combined name + alternates.
 * @param negate false for `:`, `=`; true for `!=` (match faces that do not contain).
 */
function applyUnquotedNameSubstring(
  val: string,
  index: CardIndex,
  buf: Uint8Array,
  negate: boolean,
): void {
  const cf = index.canonicalFace;
  const n = index.faceCount;
  const valNorm = normalizeAlphanumeric(val);
  const altIndex = index.alternateNamesIndex;
  if (!negate) {
    for (let i = 0; i < n; i++) {
      if (index.combinedNamesNormalized[i].includes(valNorm)) buf[cf[i]] = 1;
    }
    for (const altName in altIndex) {
      if (altName.includes(valNorm)) buf[altIndex[altName]] = 1;
    }
  } else {
    const has = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (index.combinedNamesNormalized[i].includes(valNorm)) has[cf[i]] = 1;
    }
    for (const altName in altIndex) {
      if (altName.includes(valNorm)) has[altIndex[altName]] = 1;
    }
    for (let i = 0; i < n; i++) {
      if (!has[cf[i]]) buf[cf[i]] = 1;
    }
  }
}

/** Spec 173 §3.6: trim + ASCII-oriented fold for oracle stat string compare. */
function statStringFold(s: string): string {
  return s.trim().toLowerCase();
}

function statFieldErrorLabel(canonical: string): string {
  switch (canonical) {
    case "power": return "power";
    case "toughness": return "toughness";
    case "loyalty": return "loyalty";
    case "defense": return "defense";
    default: return "stat";
  }
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
  _context?: ResolutionContext,
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
    if (canonical !== "produces" && !LEGALITY_CANONICAL.has(canonical)) {
      fillCanonical(buf, cf, n);
      return null;
    }
    // produces: empty value falls through to case "produces" (same as produces>0)
    // legalities: empty handled in case (Spec 182 — neutral for `:` / `=` / `!=`)
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
        // Substring match (:, =, !=) — Spec 018: unquoted field value matches unquoted bare; quoted matches literal combined name
        const negate = op === "!=";
        if (node.sourceText !== undefined) {
          const col = index.combinedNamesLower;
          if (!negate) {
            for (let i = 0; i < n; i++) {
              if (col[i].includes(valLower)) buf[cf[i]] = 1;
            }
          } else {
            const has = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
              if (col[i].includes(valLower)) has[cf[i]] = 1;
            }
            for (let i = 0; i < n; i++) {
              if (!has[cf[i]]) buf[cf[i]] = 1;
            }
          }
        } else {
          applyUnquotedNameSubstring(val, index, buf, negate);
        }
      }
      break;
    }
    case "edhrec": {
      if (isEquatableNullLiteral(val)) {
        if (op === ":" || op === "=") {
          for (let i = 0; i < n; i++) if (index.edhrecRank[i] === null) buf[cf[i]] = 1;
          break;
        }
        if (op === "!=") {
          for (let i = 0; i < n; i++) if (index.edhrecRank[i] !== null) buf[cf[i]] = 1;
          break;
        }
        if (val.trim().toLowerCase() === "null") {
          return "null cannot be used with comparison operators";
        }
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
      if (!Number.isFinite(queryNum) || !Number.isInteger(queryNum)) {
        return `invalid edhrec rank "${val}"`;
      }
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
      if (isEquatableNullLiteral(val)) {
        if (op === ":" || op === "=") {
          for (let i = 0; i < n; i++) if (index.edhrecSalt[i] === null) buf[cf[i]] = 1;
          break;
        }
        if (op === "!=") {
          for (let i = 0; i < n; i++) if (index.edhrecSalt[i] !== null) buf[cf[i]] = 1;
          break;
        }
        if (val.trim().toLowerCase() === "null") {
          return "null cannot be used with comparison operators";
        }
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
      if (!Number.isFinite(queryNum)) {
        return `invalid salt "${val}"`;
      }
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
      const numericLookup = canonical === "power" ? index.numericPowerLookup
        : canonical === "toughness" ? index.numericToughnessLookup
        : canonical === "loyalty" ? index.numericLoyaltyLookup
        : index.numericDefenseLookup;
      const fieldLabel = statFieldErrorLabel(canonical);
      const isQuoted = node.sourceText !== undefined;
      const trimVal = val.trim();

      // Spec 173 §2: equatable-null prefixes on range ops fail plain-numeric gate, not null semantics.
      if (!isQuoted && isEquatableNullLiteral(val) && !STAT_RANGE_OPS.has(op)) {
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

      if (STAT_RANGE_OPS.has(op)) {
        if (trimVal.toLowerCase() === "null") {
          return "null cannot be used with comparison operators";
        }
        if (!isPlainNumericStatQueryToken(trimVal)) {
          return `invalid ${fieldLabel} value for comparison "${val}"`;
        }
        const queryNum = parseStatValue(trimVal);
        if (!Number.isFinite(queryNum)) {
          return `invalid ${fieldLabel} value "${val}"`;
        }
        for (let i = 0; i < n; i++) {
          const cardNum = numericLookup[idxCol[i]];
          if (isNaN(cardNum)) continue;
          let match = false;
          switch (op) {
            case ">": match = cardNum > queryNum; break;
            case "<": match = cardNum < queryNum; break;
            case ">=": match = cardNum >= queryNum; break;
            case "<=": match = cardNum <= queryNum; break;
            default: break;
          }
          if (match) buf[cf[i]] = 1;
        }
        break;
      }

      if (isQuoted) {
        const qFold = statStringFold(val);
        for (let i = 0; i < n; i++) {
          const raw = strLookup[idxCol[i]];
          const rawFold = statStringFold(raw);
          let match = false;
          switch (op) {
            case ":":
              match = rawFold.includes(qFold);
              break;
            case "=":
              match = rawFold === qFold;
              break;
            case "!=":
              match = raw !== "" && rawFold !== qFold;
              break;
            default:
              break;
          }
          if (match) buf[cf[i]] = 1;
        }
        break;
      }

      if (isPlainNumericStatQueryToken(trimVal)) {
        const queryNum = parseStatValue(trimVal);
        if (!Number.isFinite(queryNum)) {
          return `invalid ${fieldLabel} value "${val}"`;
        }
        for (let i = 0; i < n; i++) {
          const cardNum = numericLookup[idxCol[i]];
          if (isNaN(cardNum)) continue;
          let match = false;
          switch (op) {
            case ":": case "=": match = cardNum === queryNum; break;
            case "!=": match = cardNum !== queryNum; break;
            default: break;
          }
          if (match) buf[cf[i]] = 1;
        }
        break;
      }

      {
        const qFold = statStringFold(val);
        for (let i = 0; i < n; i++) {
          const raw = strLookup[idxCol[i]];
          const rawFold = statStringFold(raw);
          let match = false;
          switch (op) {
            case ":":
              match = rawFold.includes(qFold);
              break;
            case "=":
              match = rawFold === qFold;
              break;
            case "!=":
              match = raw !== "" && rawFold !== qFold;
              break;
            default:
              break;
          }
          if (match) buf[cf[i]] = 1;
        }
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
      if (op !== ":" && op !== "=" && op !== "!=") {
        return `${node.field}: does not support operator "${op}"`;
      }
      const trimmed = val.trim();
      if (trimmed === "") {
        // Empty `=`, `!=`, and `:` are neutral (Spec 182): user still typing; do not error or narrow.
        fillCanonical(buf, cf, n);
        break;
      }
      const u = normalizeForResolution(trimmed);
      if (u === "") {
        return `unknown format "${trimmed}"`;
      }
      const col = canonical === "legal" ? index.legalitiesLegal
        : canonical === "banned" ? index.legalitiesBanned
        : index.legalitiesRestricted;
      if (op === "!=") {
        const combined = combinedFormatMask(false, u);
        if (combined === 0) return `unknown format "${trimmed}"`;
        for (let i = 0; i < n; i++) {
          if ((col[i] & combined) === 0) buf[cf[i]] = 1;
        }
        break;
      }
      const combined = combinedFormatMask(op === ":", u);
      if (combined === 0) return `unknown format "${trimmed}"`;
      for (let i = 0; i < n; i++) {
        if ((col[i] & combined) !== 0) buf[cf[i]] = 1;
      }
      break;
    }
    case "produces": {
      const pd = index.producesData;
      const pm = index.producesMasks;
      if (val === "") {
        for (let i = 0; i < n; i++) if (pd[i] !== 0) buf[cf[i]] = 1;
        break;
      }
      const resolved = parseProducesValue(val, pm);
      if (resolved.type === "error") return resolved.msg;
      const effectiveOp = op === ":" ? ">=" : op;
      if (resolved.type === "count") {
        const qn = resolved.n;
        for (let i = 0; i < n; i++) {
          const c = popcountByte(pd[i]);
          const match =
            effectiveOp === "=" ? c === qn
            : effectiveOp === "!=" ? c !== qn
            : effectiveOp === "<" ? c < qn
            : effectiveOp === "<=" ? c <= qn
            : effectiveOp === ">" ? c > qn
            : effectiveOp === ">=" ? c >= qn
            : false;
          if (match) buf[cf[i]] = 1;
        }
        break;
      }
      if (resolved.type === "multicolor") {
        for (let i = 0; i < n; i++) if (popcountByte(pd[i]) >= 2) buf[cf[i]] = 1;
        break;
      }
      const query = resolved.queryMask;
      for (let i = 0; i < n; i++) {
        const card = pd[i];
        const superset = (card & query) === query;
        const exact = superset && (card & ~query) === 0;
        const subset = (card & ~query) === 0;
        let match = false;
        switch (effectiveOp) {
          case ">=": match = superset; break;
          case "=": match = exact; break;
          case ">": match = superset && !exact; break;
          case "<=": match = subset; break;
          case "<": match = subset && !exact; break;
          case "!=": match = !exact; break;
        }
        if (match) buf[cf[i]] = 1;
      }
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
    applyUnquotedNameSubstring(value, index, buf, false);
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
