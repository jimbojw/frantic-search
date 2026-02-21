// SPDX-License-Identifier: Apache-2.0
import {
  type ASTNode,
  type QueryNodeResult,
  type EvalOutput,
  type FieldNode,
  type RegexFieldNode,
  type ExactNameNode,
} from "./ast";
import type { CardIndex } from "./card-index";
import { COLOR_FROM_LETTER, FORMAT_NAMES } from "../bits";
import { parseManaSymbols, manaContains } from "./mana";

const SEP = "\x1E";

const FIELD_ALIASES: Record<string, string> = {
  name: "name", n: "name",
  oracle: "oracle", o: "oracle",
  color: "color", c: "color",
  identity: "identity", id: "identity", commander: "identity", cmd: "identity",
  type: "type", t: "type",
  power: "power", pow: "power",
  toughness: "toughness", tou: "toughness",
  loyalty: "loyalty", loy: "loyalty",
  defense: "defense", def: "defense",
  mana: "mana", m: "mana",
  legal: "legal", f: "legal", format: "legal",
  banned: "banned",
  restricted: "restricted",
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

function getStringColumn(canonical: string, index: CardIndex): string[] | null {
  switch (canonical) {
    case "name": return index.namesLower;
    case "oracle": return index.oracleTextsLower;
    case "type": return index.typeLinesLower;
    default: return null;
  }
}

function evalLeafField(
  node: FieldNode,
  index: CardIndex,
  buf: Uint8Array,
): void {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.faceCount;
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
    case "name":
    case "oracle":
    case "type": {
      const col = getStringColumn(canonical, index)!;
      for (let i = 0; i < n; i++) {
        buf[i] = col[i].includes(valLower) ? 1 : 0;
      }
      break;
    }
    case "color":
    case "identity": {
      const col = canonical === "color" ? index.colors : index.colorIdentity;
      const queryMask = parseColorValue(val);
      // color: colon means superset (≥): "has at least these colors"
      // identity: colon means subset (≤): "fits in a deck of these colors"
      const colonOp = canonical === "identity" ? "<=" : ">=";
      const effectiveOp = op === ":" ? colonOp : op;
      switch (effectiveOp) {
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
      const querySymbols = parseManaSymbols(valLower);
      for (let i = 0; i < n; i++) {
        buf[i] = manaContains(index.manaSymbols[i], querySymbols) ? 1 : 0;
      }
      break;
    }
    case "legal":
    case "banned":
    case "restricted": {
      const formatBit = FORMAT_NAMES[valLower];
      if (formatBit === undefined) {
        buf.fill(0, 0, n);
        break;
      }
      const col = canonical === "legal" ? index.legalitiesLegal
        : canonical === "banned" ? index.legalitiesBanned
        : index.legalitiesRestricted;
      for (let i = 0; i < n; i++) {
        buf[i] = (col[i] & formatBit) !== 0 ? 1 : 0;
      }
      break;
    }
    default:
      buf.fill(0, 0, n);
  }
}

function evalLeafRegex(
  node: RegexFieldNode,
  index: CardIndex,
  buf: Uint8Array,
): void {
  const canonical = FIELD_ALIASES[node.field.toLowerCase()];
  const n = index.faceCount;
  const col = canonical ? getStringColumn(canonical, index) : null;

  if (!col) {
    buf.fill(0, 0, n);
    return;
  }

  let re: RegExp;
  try {
    re = new RegExp(node.pattern, "i");
  } catch {
    buf.fill(0, 0, n);
    return;
  }

  for (let i = 0; i < n; i++) {
    buf[i] = re.test(col[i]) ? 1 : 0;
  }
}

function evalLeafBareWord(value: string, index: CardIndex, buf: Uint8Array): void {
  const valLower = value.toLowerCase();
  for (let i = 0; i < index.faceCount; i++) {
    buf[i] = index.namesLower[i].includes(valLower) ? 1 : 0;
  }
}

function evalLeafExact(node: ExactNameNode, index: CardIndex, buf: Uint8Array): void {
  const valLower = node.value.toLowerCase();
  for (let i = 0; i < index.faceCount; i++) {
    buf[i] = index.namesLower[i] === valLower ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// Node interning and evaluation cache
// ---------------------------------------------------------------------------

interface EvalTiming {
  cached: boolean;
  evalMs: number;
}

export interface InternedNode {
  key: string;
  ast: ASTNode;
  computed?: ComputedResult;
}

export interface ComputedResult {
  buf: Uint8Array;
  matchCount: number;
  productionMs: number;
}

export function nodeKey(ast: ASTNode): string {
  switch (ast.type) {
    case "FIELD":
      return `FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.value}`;
    case "BARE":
      return `BARE${SEP}${ast.value}`;
    case "EXACT":
      return `EXACT${SEP}${ast.value}`;
    case "REGEX_FIELD":
      return `REGEX_FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.pattern}`;
    case "NOT":
      return `NOT${SEP}${nodeKey(ast.child)}`;
    case "AND":
      return `AND${SEP}${ast.children.map(nodeKey).join(SEP)}`;
    case "OR":
      return `OR${SEP}${ast.children.map(nodeKey).join(SEP)}`;
  }
}

export class NodeCache {
  private nodes: Map<string, InternedNode> = new Map();
  readonly index: CardIndex;

  constructor(index: CardIndex) {
    this.index = index;
  }

  intern(ast: ASTNode): InternedNode {
    const key = nodeKey(ast);
    let interned = this.nodes.get(key);
    if (!interned) {
      interned = { key, ast };
      this.nodes.set(key, interned);
    }
    return interned;
  }

  evaluate(ast: ASTNode): EvalOutput {
    const timings = new Map<string, EvalTiming>();
    const root = this.internTree(ast);
    this.computeTree(root, timings);
    const result = this.buildResult(root, timings);
    const matchingIndices: number[] = [];
    const buf = root.computed!.buf;
    for (let i = 0; i < this.index.faceCount; i++) {
      if (buf[i]) matchingIndices.push(i);
    }
    return { result, matchingIndices };
  }

  private internTree(ast: ASTNode): InternedNode {
    switch (ast.type) {
      case "AND":
        for (const child of ast.children) this.internTree(child);
        break;
      case "OR":
        for (const child of ast.children) this.internTree(child);
        break;
      case "NOT":
        this.internTree(ast.child);
        break;
    }
    return this.intern(ast);
  }

  private markCached(interned: InternedNode, timings: Map<string, EvalTiming>): void {
    timings.set(interned.key, { cached: true, evalMs: 0 });
    const ast = interned.ast;
    switch (ast.type) {
      case "NOT":
        this.markCached(this.intern(ast.child), timings);
        break;
      case "AND":
      case "OR":
        for (const child of ast.children) {
          this.markCached(this.intern(child), timings);
        }
        break;
    }
  }

  private computeTree(interned: InternedNode, timings: Map<string, EvalTiming>): void {
    if (interned.computed) {
      this.markCached(interned, timings);
      return;
    }

    const ast = interned.ast;
    const n = this.index.faceCount;

    switch (ast.type) {
      case "FIELD": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafField(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "BARE": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafBareWord(ast.value, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "EXACT": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafExact(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "REGEX_FIELD": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafRegex(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "NOT": {
        const childInterned = this.intern(ast.child);
        this.computeTree(childInterned, timings);
        const childBuf = childInterned.computed!.buf;
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) buf[i] = childBuf[i] ^ 1;
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "AND": {
        if (ast.children.length === 0) {
          const buf = new Uint8Array(n);
          buf.fill(1, 0, n);
          interned.computed = { buf, matchCount: n, productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        const first = childInterneds[0].computed!.buf;
        for (let i = 0; i < n; i++) buf[i] = first[i];
        for (let c = 1; c < childInterneds.length; c++) {
          const cb = childInterneds[c].computed!.buf;
          for (let i = 0; i < n; i++) buf[i] &= cb[i];
        }
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "OR": {
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        for (const ci of childInterneds) {
          const cb = ci.computed!.buf;
          for (let i = 0; i < n; i++) buf[i] |= cb[i];
        }
        const ms = performance.now() - t0;
        interned.computed = { buf, matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
    }
  }

  private buildResult(interned: InternedNode, timings: Map<string, EvalTiming>): QueryNodeResult {
    const ast = interned.ast;
    const computed = interned.computed!;
    const timing = timings.get(interned.key)!;

    const result: QueryNodeResult = {
      node: ast,
      matchCount: computed.matchCount,
      cached: timing.cached,
      productionMs: computed.productionMs,
      evalMs: timing.evalMs,
    };

    switch (ast.type) {
      case "NOT":
        result.children = [this.buildResult(this.intern(ast.child), timings)];
        break;
      case "AND":
      case "OR":
        if (ast.children.length > 0) {
          result.children = ast.children.map(c => this.buildResult(this.intern(c), timings));
        }
        break;
    }

    return result;
  }
}
