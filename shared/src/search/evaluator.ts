// SPDX-License-Identifier: Apache-2.0
import {
  type ASTNode,
  type EvalResult,
  type EvalOutput,
  type FieldNode,
  type ExactNameNode,
} from "./ast";
import type { CardIndex } from "./card-index";
import { BufferPool } from "./pool";
import { COLOR_FROM_LETTER, CARD_TYPE_NAMES, SUPERTYPE_NAMES } from "../bits";

const FIELD_ALIASES: Record<string, string> = {
  name: "name", n: "name",
  oracle: "oracle", o: "oracle",
  color: "color", c: "color",
  identity: "identity", id: "identity",
  type: "type", t: "type",
  power: "power", pow: "power",
  toughness: "toughness", tou: "toughness",
  loyalty: "loyalty", loy: "loyalty",
  defense: "defense", def: "defense",
  mana: "mana", m: "mana",
};

function popcount(buf: Uint8Array, len: number): number {
  let count = 0;
  for (let i = 0; i < len; i++) count += buf[i];
  return count;
}

function parseColorValue(value: string): number {
  let mask = 0;
  for (const ch of value.toUpperCase()) {
    mask |= COLOR_FROM_LETTER[ch] ?? 0;
  }
  return mask;
}

function resolveTypeBit(value: string): number | null {
  const capitalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return CARD_TYPE_NAMES[capitalized] ?? SUPERTYPE_NAMES[capitalized] ?? null;
}

function evalLeafField(
  node: FieldNode,
  index: CardIndex,
  buf: Uint8Array,
): void {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.cardCount;
  const op = node.operator;
  const val = node.value;

  if (val === "") {
    buf.fill(1, 0, n);
    return;
  }
  if (!canonical) {
    buf.fill(0, 0, n);
    return;
  }

  const valLower = val.toLowerCase();

  switch (canonical) {
    case "name": {
      for (let i = 0; i < n; i++) {
        buf[i] = op === ":" || op === "!="
          ? index.namesLower[i].includes(valLower) ? 1 : 0
          : index.namesLower[i] === valLower ? 1 : 0;
      }
      if (op === "!=") {
        for (let i = 0; i < n; i++) buf[i] ^= 1;
      }
      break;
    }
    case "oracle": {
      for (let i = 0; i < n; i++) {
        buf[i] = index.oracleTextsLower[i].includes(valLower) ? 1 : 0;
      }
      break;
    }
    case "color":
    case "identity": {
      const col = canonical === "color" ? index.colors : index.colorIdentity;
      const queryMask = parseColorValue(val);
      switch (op) {
        case ":":
        case ">=":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & queryMask) === queryMask ? 1 : 0;
          break;
        case "=":
          for (let i = 0; i < n; i++) buf[i] = col[i] === queryMask ? 1 : 0;
          break;
        case "<=":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & ~queryMask) === 0 ? 1 : 0;
          break;
        case "!=":
          for (let i = 0; i < n; i++) buf[i] = col[i] !== queryMask ? 1 : 0;
          break;
        case ">":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & queryMask) === queryMask && col[i] !== queryMask ? 1 : 0;
          break;
        case "<":
          for (let i = 0; i < n; i++) buf[i] = (col[i] & ~queryMask) === 0 && col[i] !== queryMask ? 1 : 0;
          break;
        default:
          buf.fill(0, 0, n);
      }
      break;
    }
    case "type": {
      const bit = resolveTypeBit(val);
      if (bit !== null) {
        const isSuper = SUPERTYPE_NAMES[val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()] !== undefined;
        const col = isSuper ? index.supertypes : index.types;
        for (let i = 0; i < n; i++) buf[i] = (col[i] & bit) !== 0 ? 1 : 0;
      } else {
        for (let i = 0; i < n; i++) buf[i] = index.subtypesLower[i].includes(valLower) ? 1 : 0;
      }
      break;
    }
    case "power":
    case "toughness":
    case "loyalty":
    case "defense": {
      const lookup = canonical === "power" ? index.powerLookup
        : canonical === "toughness" ? index.toughnessLookup
        : canonical === "loyalty" ? index.loyaltyLookup
        : index.defenseLookup;
      const indices = canonical === "power" ? index.powers
        : canonical === "toughness" ? index.toughnesses
        : canonical === "loyalty" ? index.loyalties
        : index.defenses;
      const queryNum = Number(val);
      if (isNaN(queryNum)) {
        buf.fill(0, 0, n);
        break;
      }
      for (let i = 0; i < n; i++) {
        const raw = lookup[indices[i]];
        if (!raw) { buf[i] = 0; continue; }
        const cardNum = Number(raw);
        if (isNaN(cardNum)) { buf[i] = 0; continue; }
        switch (op) {
          case ":": case "=": buf[i] = cardNum === queryNum ? 1 : 0; break;
          case "!=": buf[i] = cardNum !== queryNum ? 1 : 0; break;
          case ">":  buf[i] = cardNum > queryNum ? 1 : 0; break;
          case "<":  buf[i] = cardNum < queryNum ? 1 : 0; break;
          case ">=": buf[i] = cardNum >= queryNum ? 1 : 0; break;
          case "<=": buf[i] = cardNum <= queryNum ? 1 : 0; break;
          default: buf[i] = 0;
        }
      }
      break;
    }
    case "mana": {
      for (let i = 0; i < n; i++) {
        buf[i] = index.manaCosts[i].includes(val) ? 1 : 0;
      }
      break;
    }
    default:
      buf.fill(0, 0, n);
  }
}

function evalLeafBareWord(value: string, index: CardIndex, buf: Uint8Array): void {
  const valLower = value.toLowerCase();
  for (let i = 0; i < index.cardCount; i++) {
    buf[i] = index.namesLower[i].includes(valLower) ? 1 : 0;
  }
}

function evalLeafExact(node: ExactNameNode, index: CardIndex, buf: Uint8Array): void {
  const valLower = node.value.toLowerCase();
  for (let i = 0; i < index.cardCount; i++) {
    buf[i] = index.namesLower[i] === valLower ? 1 : 0;
  }
}

function evalNode(
  ast: ASTNode,
  index: CardIndex,
  pool: BufferPool,
): { result: EvalResult; buf: Uint8Array } {
  const n = index.cardCount;

  switch (ast.type) {
    case "FIELD": {
      const buf = pool.acquire();
      evalLeafField(ast, index, buf);
      return {
        result: { node: ast, matchCount: popcount(buf, n) },
        buf,
      };
    }
    case "BARE": {
      const buf = pool.acquire();
      evalLeafBareWord(ast.value, index, buf);
      return {
        result: { node: ast, matchCount: popcount(buf, n) },
        buf,
      };
    }
    case "EXACT": {
      const buf = pool.acquire();
      evalLeafExact(ast, index, buf);
      return {
        result: { node: ast, matchCount: popcount(buf, n) },
        buf,
      };
    }
    case "REGEX_FIELD": {
      const buf = pool.acquire();
      buf.fill(0, 0, n);
      return {
        result: { node: ast, matchCount: 0 },
        buf,
      };
    }
    case "NOT": {
      const child = evalNode(ast.child, index, pool);
      const buf = pool.acquire();
      for (let i = 0; i < n; i++) buf[i] = child.buf[i] ^ 1;
      pool.release(child.buf);
      return {
        result: { node: ast, matchCount: popcount(buf, n), children: [child.result] },
        buf,
      };
    }
    case "AND": {
      if (ast.children.length === 0) {
        const buf = pool.acquire();
        buf.fill(1, 0, n);
        return {
          result: { node: ast, matchCount: n },
          buf,
        };
      }
      const childResults: { result: EvalResult; buf: Uint8Array }[] = [];
      for (const child of ast.children) {
        childResults.push(evalNode(child, index, pool));
      }
      const buf = pool.acquire();
      const first = childResults[0].buf;
      for (let i = 0; i < n; i++) buf[i] = first[i];
      for (let c = 1; c < childResults.length; c++) {
        const cb = childResults[c].buf;
        for (let i = 0; i < n; i++) buf[i] &= cb[i];
      }
      for (const cr of childResults) pool.release(cr.buf);
      return {
        result: {
          node: ast,
          matchCount: popcount(buf, n),
          children: childResults.map((cr) => cr.result),
        },
        buf,
      };
    }
    case "OR": {
      const childResults: { result: EvalResult; buf: Uint8Array }[] = [];
      for (const child of ast.children) {
        childResults.push(evalNode(child, index, pool));
      }
      const buf = pool.acquire();
      buf.fill(0, 0, n);
      for (const cr of childResults) {
        for (let i = 0; i < n; i++) buf[i] |= cr.buf[i];
      }
      for (const cr of childResults) pool.release(cr.buf);
      return {
        result: {
          node: ast,
          matchCount: popcount(buf, n),
          children: childResults.map((cr) => cr.result),
        },
        buf,
      };
    }
  }
}

export function evaluate(ast: ASTNode, index: CardIndex): EvalOutput {
  const pool = new BufferPool(index.cardCount);
  const { result, buf } = evalNode(ast, index, pool);
  const matchingIndices: number[] = [];
  for (let i = 0; i < index.cardCount; i++) {
    if (buf[i]) matchingIndices.push(i);
  }
  pool.release(buf);
  return { result, matchingIndices };
}
