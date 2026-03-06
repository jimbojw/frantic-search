// SPDX-License-Identifier: Apache-2.0
import {
  type ASTNode,
  type QueryNodeResult,
  type EvalOutput,
  type SortDirective,
  type UniqueMode,
} from "./ast";
import type { CardIndex } from "./card-index";
import type { PrintingIndex } from "./printing-index";
import { PRINTING_IS_KEYWORDS, FACE_FALLBACK_IS_KEYWORDS, evalPrintingIsKeyword } from "./eval-is";
import { isPrintingField, evalPrintingField, promotePrintingToFace, promoteFaceToPrinting, promoteFaceToPrintingCanonicalNonfoil, FACE_FALLBACK_PRINTING_FIELDS } from "./eval-printing";
import { FIELD_ALIASES, fillCanonical, evalLeafField, evalLeafRegex, evalLeafBareWord, evalLeafExact } from "./eval-leaves";
import { SORT_FIELDS } from "./sort-fields";
import { parse } from "./parser";

export { FIELD_ALIASES } from "./eval-leaves";

/** Extract effective unique mode from AST (last legal unique: term wins). */
export function getUniqueModeFromAst(ast: ASTNode): "cards" | "prints" | "art" {
  const LEGAL = new Set(["cards", "prints", "art"]);
  const collected: string[] = [];
  function walk(n: ASTNode): void {
    switch (n.type) {
      case "FIELD":
        if (n.field.toLowerCase() === "unique" && LEGAL.has(n.value.toLowerCase())) {
          collected.push(n.value.toLowerCase());
        }
        return;
      case "NOT":
        walk(n.child);
        return;
      case "AND":
      case "OR":
        for (const c of n.children) walk(c);
        return;
      default:
        return;
    }
  }
  walk(ast);
  return (collected.length > 0 ? collected[collected.length - 1] : "cards") as "cards" | "prints" | "art";
}

/** Extract effective unique mode from query string (last legal unique: term wins). */
export function getUniqueModeFromQuery(query: string): "cards" | "prints" | "art" {
  return getUniqueModeFromAst(parse(query));
}

const SEP = "\x1E";

function popcount(buf: Uint8Array, len: number): number {
  let count = 0;
  for (let i = 0; i < len; i++) count += buf[i];
  return count;
}

// ---------------------------------------------------------------------------
// Printing-domain evaluation
// ---------------------------------------------------------------------------

export type EvalDomain = "face" | "printing";

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
  domain: EvalDomain;
  matchCount: number;
  productionMs: number;
  error?: string;
}

export function nodeKey(ast: ASTNode): string {
  switch (ast.type) {
    case "FIELD": {
      const sourceText = (ast as { sourceText?: string }).sourceText ?? "";
      return `FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.value}${SEP}${sourceText}`;
    }
    case "BARE":
      return `BARE${SEP}${ast.quoted ? "Q" : "U"}${SEP}${ast.value}`;
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
    case "NOP":
      return "NOP";
  }
}

export type GetListMask = (listId: string) => { faceMask: Uint8Array; printingMask?: Uint8Array } | null;

export class NodeCache {
  private nodes: Map<string, InternedNode> = new Map();
  readonly index: CardIndex;
  private _printingIndex: PrintingIndex | null = null;
  private _getListMask: GetListMask | null = null;
  /** Root AST during evaluate(); used for my: + unique:prints override. */
  private _rootAstForOverride: ASTNode | undefined = undefined;

  constructor(index: CardIndex, printingIndex?: PrintingIndex | null, getListMask?: GetListMask | null) {
    this.index = index;
    this._printingIndex = printingIndex ?? null;
    this._getListMask = getListMask ?? null;
  }

  /** Maps query value to protocol listId. MVP: "list", "default", "" → "default". */
  private _resolveListId(value: string): string {
    const v = (value || "list").toLowerCase();
    if (v === "list" || v === "default") return "default";
    return value;
  }

  get printingIndex(): PrintingIndex | null {
    return this._printingIndex;
  }

  setPrintingIndex(pIdx: PrintingIndex): void {
    this._printingIndex = pIdx;
    // Invalidate all cached results: printing-domain nodes need new data,
    // and face-fallback fields (legal/banned/restricted) must re-evaluate
    // in the printing domain now that printing data is available.
    this.clearAllComputed();
  }

  /** Clears all cached results on interned nodes. Used on list-update (Spec 076). */
  clearAllComputed(): void {
    for (const [, interned] of this.nodes) {
      if (interned.computed) {
        interned.computed = undefined;
      }
    }
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
    this._rootAstForOverride = ast;
    this.computeTree(root, timings);
    const result = this.buildResult(root, timings);

    const uniqueMode = this._getUniqueMode(ast);
    const includeExtras = this._hasIncludeExtras(ast);
    const sortBy = this._findSortDirective(ast);
    const hasPrintingConditions = this._hasPrintingLeaves(ast);
    const printingsUnavailable = hasPrintingConditions && !this._printingIndex;

    if (ast.type === "NOP" || root.computed!.matchCount === -1) {
      return { result, indices: new Uint32Array(0), hasPrintingConditions, printingsUnavailable, uniqueMode, includeExtras, sortBy };
    }

    // Root buffer may be printing-domain if all conditions are printing-level.
    // Promote to face domain for the card-level index output.
    let faceBuf: Uint8Array;
    if (root.computed!.domain === "printing" && this._printingIndex) {
      faceBuf = new Uint8Array(this.index.faceCount);
      promotePrintingToFace(
        root.computed!.buf, faceBuf,
        this._printingIndex.canonicalFaceRef, this._printingIndex.printingCount,
      );
    } else {
      faceBuf = root.computed!.buf;
    }

    const count = popcount(faceBuf, this.index.faceCount);
    const indices = new Uint32Array(count);
    let j = 0;
    for (let i = 0; i < this.index.faceCount; i++) {
      if (faceBuf[i]) indices[j++] = i;
    }

    let printingIndices: Uint32Array | undefined;

    const needsPrintingExpansion = (uniqueMode === "prints" || uniqueMode === "art") && !hasPrintingConditions;
    if (needsPrintingExpansion && this._printingIndex) {
      // unique:prints or unique:art without printing conditions: expand all printings of
      // matching cards. When printing conditions ARE present, fall through to
      // the hasPrintingConditions branch which intersects with printing-domain
      // leaf buffers — unique mode then only controls display-layer dedup.
      let total = 0;
      for (const fi of indices) total += this._printingIndex.printingsOf(fi).length;
      printingIndices = new Uint32Array(total);
      let k = 0;
      for (const fi of indices) {
        const pRows = this._printingIndex.printingsOf(fi);
        for (const p of pRows) printingIndices[k++] = p;
      }
    } else if (hasPrintingConditions && this._printingIndex) {
      let printBuf: Uint8Array;
      if (root.computed!.domain === "printing") {
        printBuf = root.computed!.buf;
      } else {
        // Root is face-domain but had printing leaves promoted into it.
        // Expand the face result back to printing domain, then intersect
        // with any printing-domain leaf buffers.
        printBuf = new Uint8Array(this._printingIndex.printingCount);
        promoteFaceToPrinting(faceBuf, printBuf, this._printingIndex);
        this._intersectPrintingLeaves(ast, printBuf);
      }
      const pCount = popcount(printBuf, this._printingIndex.printingCount);
      printingIndices = new Uint32Array(pCount);
      let k = 0;
      for (const fi of indices) {
        const pRows = this._printingIndex.printingsOf(fi);
        for (const p of pRows) {
          if (printBuf[p]) printingIndices[k++] = p;
        }
      }
    }

    return { result, indices, printingIndices, hasPrintingConditions, printingsUnavailable, uniqueMode, includeExtras, sortBy };
  }

  private _getUniqueMode(ast: ASTNode): UniqueMode {
    return getUniqueModeFromAst(ast);
  }

  private _hasPrintingLeaves(ast: ASTNode): boolean {
    switch (ast.type) {
      case "FIELD": {
        if (ast.field.toLowerCase() === "unique") return false;
        const canonical = FIELD_ALIASES[ast.field.toLowerCase()];
        if (canonical === "my") {
          const listId = this._resolveListId(ast.value || "list");
          const masks = this._getListMask?.(listId) ?? null;
          if (masks === null) return false;
          const pm = masks.printingMask;
          return pm !== undefined && popcount(pm, pm.length) > 0;
        }
        if (canonical === "is") {
          if (!PRINTING_IS_KEYWORDS.has(ast.value.toLowerCase())) return false;
          // Face-fallback is: keywords only count as printing leaves when
          // printing data is available; otherwise they evaluate in face domain.
          if (FACE_FALLBACK_IS_KEYWORDS.has(ast.value.toLowerCase())) {
            return this._printingIndex !== null;
          }
          return true;
        }
        if (canonical !== undefined && isPrintingField(canonical)) {
          // Face-fallback fields only count as printing leaves when
          // printing data is actually available; otherwise they evaluate
          // in the face domain and should not trigger hasPrintingConditions.
          if (FACE_FALLBACK_PRINTING_FIELDS.has(canonical)) {
            return this._printingIndex !== null;
          }
          return true;
        }
        return false;
      }
      case "NOT": return this._hasPrintingLeaves(ast.child);
      case "AND": case "OR": return ast.children.some(c => this._hasPrintingLeaves(c));
      default: return false;
    }
  }

  private _hasIncludeExtras(ast: ASTNode): boolean {
    switch (ast.type) {
      case "FIELD":
        return ast.field.toLowerCase() === "include" && ast.value.toLowerCase() === "extras";
      case "NOT": return this._hasIncludeExtras(ast.child);
      case "AND": case "OR": return ast.children.some(c => this._hasIncludeExtras(c));
      default: return false;
    }
  }

  /** AND the printing-domain leaf buffers into printBuf to refine the expansion. */
  private _intersectPrintingLeaves(ast: ASTNode, printBuf: Uint8Array): void {
    switch (ast.type) {
      case "FIELD": {
        const canonical = FIELD_ALIASES[ast.field.toLowerCase()];
        const isPrinting = (canonical === "is" && PRINTING_IS_KEYWORDS.has(ast.value.toLowerCase()))
          || (canonical !== undefined && isPrintingField(canonical))
          || (canonical === "my");
        if (isPrinting) {
          const interned = this.intern(ast);
          if (interned.computed && interned.computed.domain === "printing") {
            const lb = interned.computed.buf;
            for (let i = 0; i < printBuf.length; i++) printBuf[i] &= lb[i];
          }
        }
        break;
      }
      case "AND":
        for (const child of ast.children) this._intersectPrintingLeaves(child, printBuf);
        break;
      case "NOT": {
        const notInterned = this.intern(ast);
        if (notInterned.computed && notInterned.computed.domain === "printing") {
          const lb = notInterned.computed.buf;
          for (let i = 0; i < printBuf.length; i++) printBuf[i] &= lb[i];
        }
        break;
      }
      case "OR": {
        const orInterned = this.intern(ast);
        if (orInterned.computed && orInterned.computed.domain === "printing") {
          const lb = orInterned.computed.buf;
          for (let i = 0; i < printBuf.length; i++) printBuf[i] &= lb[i];
        }
        break;
      }
    }
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
      case "NOP":
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
      case "NOP":
        break;
    }
  }

  private _promoteBufToFace(printingBuf: Uint8Array): Uint8Array {
    const pIdx = this._printingIndex!;
    const faceBuf = new Uint8Array(this.index.faceCount);
    promotePrintingToFace(printingBuf, faceBuf, pIdx.canonicalFaceRef, pIdx.printingCount);
    return faceBuf;
  }

  /** Get a face-domain buffer from an InternedNode, promoting if needed. */
  private _faceBuf(ci: InternedNode): Uint8Array {
    const c = ci.computed!;
    if (c.domain === "printing" && this._printingIndex) {
      return this._promoteBufToFace(c.buf);
    }
    return c.buf;
  }

  private computeTree(interned: InternedNode, timings: Map<string, EvalTiming>): void {
    const ast = interned.ast;
    if (interned.computed) {
      if (ast.type === "FIELD" && FIELD_ALIASES[ast.field?.toLowerCase()] === "my" && this._rootAstForOverride && getUniqueModeFromAst(this._rootAstForOverride) === "prints") {
        const masks = this._getListMask?.(this._resolveListId(ast.value || "list")) ?? null;
        if (masks?.faceMask && masks?.printingMask) {
          const fBits = popcount(masks.faceMask, Math.min(masks.faceMask.length, this.index.faceCount));
          const pBits = popcount(masks.printingMask, masks.printingMask.length);
          if (fBits > 0 && pBits > 0) interned.computed = undefined;
        }
      }
      if (interned.computed) {
        this.markCached(interned, timings);
        return;
      }
    }
    const n = this.index.faceCount;

    switch (ast.type) {
      case "NOP": {
        interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0 };
        timings.set(interned.key, { cached: false, evalMs: 0 });
        break;
      }
      case "FIELD": {
        if (ast.field.toLowerCase() === "unique") {
          const buf = new Uint8Array(n);
          fillCanonical(buf, this.index.canonicalFace, n);
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        if (ast.field.toLowerCase() === "include") {
          const val = ast.value.toLowerCase();
          if (val === "extras") {
            const buf = new Uint8Array(n);
            fillCanonical(buf, this.index.canonicalFace, n);
            interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: 0 };
          } else {
            interned.computed = { buf: new Uint8Array(n), domain: "face", matchCount: -1, productionMs: 0, error: `unknown include value "${ast.value}"` };
          }
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        const viewField = ast.field.toLowerCase();
        if (viewField === "view" || viewField === "v") {
          // Display modifier only — does not filter. Valid or invalid, treat as
          // match-all so view:/v: terms have no effect on results (Spec 058, Spec 083).
          const buf = new Uint8Array(n);
          fillCanonical(buf, this.index.canonicalFace, n);
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        if (ast.field.toLowerCase() === "sort") {
          const buf = new Uint8Array(n);
          fillCanonical(buf, this.index.canonicalFace, n);
          const mc = popcount(buf, n);
          const val = ast.value.toLowerCase();
          if (val !== "" && !SORT_FIELDS[val]) {
            interned.computed = { buf, domain: "face", matchCount: mc, productionMs: 0, error: `unknown sort field "${ast.value}"` };
          } else {
            interned.computed = { buf, domain: "face", matchCount: mc, productionMs: 0 };
          }
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        if (ast.field.toLowerCase() === "my") {
          if (ast.operator !== ":" && ast.operator !== "=") {
            interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error: `my: requires : or = operator` };
            timings.set(interned.key, { cached: false, evalMs: 0 });
            break;
          }
          const listId = this._resolveListId(ast.value || "list");
          const masks = this._getListMask?.(listId) ?? null;
          if (masks === null) {
            interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error: `unknown list "${listId}"` };
            timings.set(interned.key, { cached: false, evalMs: 0 });
            break;
          }
          const faceMask = masks.faceMask;
          const printingMask = masks.printingMask;
          const faceHasBits = popcount(faceMask, Math.min(faceMask.length, n)) > 0;
          const printingHasBits = printingMask !== undefined && popcount(printingMask, printingMask.length) > 0;

          if (faceHasBits && !printingHasBits) {
            const t0 = performance.now();
            const buf = new Uint8Array(n);
            const len = Math.min(faceMask.length, n);
            for (let i = 0; i < len; i++) buf[i] = faceMask[i];
            const ms = performance.now() - t0;
            interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
            timings.set(interned.key, { cached: false, evalMs: ms });
            break;
          }
          if (!faceHasBits && printingHasBits && this._printingIndex) {
            const t0 = performance.now();
            const pIdx = this._printingIndex;
            const pn = pIdx.printingCount;
            const buf = new Uint8Array(pn);
            const copyLen = Math.min(printingMask!.length, pn);
            for (let i = 0; i < copyLen; i++) buf[i] = printingMask![i];
            const ms = performance.now() - t0;
            interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
            timings.set(interned.key, { cached: false, evalMs: ms });
            break;
          }
          if (faceHasBits && printingHasBits && this._printingIndex) {
            const t0 = performance.now();
            const pIdx = this._printingIndex;
            const pn = pIdx.printingCount;
            const buf = new Uint8Array(pn);
            const useMatchesOverride = this._rootAstForOverride && getUniqueModeFromAst(this._rootAstForOverride) === "prints";
            if (useMatchesOverride) {
              promoteFaceToPrintingCanonicalNonfoil(faceMask, buf, pIdx);
            } else {
              promoteFaceToPrinting(faceMask, buf, pIdx);
            }
            const copyLen = Math.min(printingMask!.length, pn);
            for (let i = 0; i < copyLen; i++) buf[i] |= printingMask![i];
            const ms = performance.now() - t0;
            interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
            timings.set(interned.key, { cached: false, evalMs: ms });
            break;
          }
          if (!faceHasBits && !printingHasBits) {
            const buf = new Uint8Array(n);
            interned.computed = { buf, domain: "face", matchCount: 0, productionMs: 0 };
            timings.set(interned.key, { cached: false, evalMs: 0 });
            break;
          }
          if (!faceHasBits && printingHasBits && !this._printingIndex) {
            interned.computed = {
              buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0,
              error: "printing data not loaded",
            };
            timings.set(interned.key, { cached: false, evalMs: 0 });
            break;
          }
          break;
        }

        const canonical = FIELD_ALIASES[ast.field.toLowerCase()];

        // Check if this is a printing-domain field or is: keyword
        const isPrintingIs = canonical === "is"
          && PRINTING_IS_KEYWORDS.has(ast.value.toLowerCase());
        const isPrintingDomain = isPrintingIs
          || (canonical !== undefined && isPrintingField(canonical));

        if (isPrintingDomain && this._printingIndex) {
          const pIdx = this._printingIndex;
          const pn = pIdx.printingCount;
          const buf = new Uint8Array(pn);
          const t0 = performance.now();
          let error: string | null = null;

          if (isPrintingIs) {
            if (ast.operator !== ":" && ast.operator !== "=") {
              error = null; // silently ignore non-colon operators on is:
            } else {
              const status = evalPrintingIsKeyword(
                ast.value.toLowerCase(), pIdx, buf, pn,
              );
              if (status === "unknown") error = `unknown keyword "${ast.value}"`;
            }
          } else if (canonical && ast.value !== "") {
            error = evalPrintingField(canonical, ast.operator, ast.value, pIdx, buf, this.index);
          }

          const ms = performance.now() - t0;
          if (error) {
            interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error };
          } else if (canonical === "in") {
            // in: is card-level: "has ≥1 printing matching X". Promote to face so
            // in:mh2 in:a25 combines at card level (cards in both sets), not printing level.
            const faceBuf = new Uint8Array(n);
            promotePrintingToFace(buf, faceBuf, pIdx.canonicalFaceRef, pn);
            interned.computed = { buf: faceBuf, domain: "face", matchCount: popcount(faceBuf, n), productionMs: ms };
          } else {
            interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
          }
          timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
          break;
        }

        if (isPrintingDomain && !this._printingIndex) {
          // Face-fallback fields (legal/banned/restricted) and is: keywords
          // (universesbeyond/ub) fall through to face-domain evaluation when
          // printing data is not yet loaded.
          const isFaceFallbackField = canonical && FACE_FALLBACK_PRINTING_FIELDS.has(canonical);
          const isFaceFallbackIs = isPrintingIs && FACE_FALLBACK_IS_KEYWORDS.has(ast.value.toLowerCase());
          if (isFaceFallbackField || isFaceFallbackIs) {
            // Fall through to face-domain evaluation below.
          } else {
            interned.computed = {
              buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0,
              error: `printing data not loaded`,
            };
            timings.set(interned.key, { cached: false, evalMs: 0 });
            break;
          }
        }

        // Face-domain evaluation (existing logic)
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        const error = evalLeafField(ast, this.index, buf);
        const ms = performance.now() - t0;
        if (error) {
          interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error };
        } else {
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        }
        timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
        break;
      }
      case "BARE": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        evalLeafBareWord(ast.value, ast.quoted, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
        break;
      }
      case "EXACT": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        const error = evalLeafExact(ast, this.index, buf);
        const ms = performance.now() - t0;
        if (error) {
          interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error };
        } else {
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        }
        timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
        break;
      }
      case "REGEX_FIELD": {
        const buf = new Uint8Array(n);
        const t0 = performance.now();
        const error = evalLeafRegex(ast, this.index, buf);
        const ms = performance.now() - t0;
        if (error) {
          interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error };
        } else {
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        }
        timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
        break;
      }
      case "NOT": {
        const childInterned = this.intern(ast.child);
        this.computeTree(childInterned, timings);

        // Sort modifiers under NOT: preserve match-all (direction extracted separately).
        // Don't copy error — it belongs on the child node for breakdown display.
        if (ast.child.type === "FIELD" && ast.child.field.toLowerCase() === "sort") {
          const cc = childInterned.computed!;
          interned.computed = { buf: cc.buf, domain: cc.domain, matchCount: cc.matchCount, productionMs: cc.productionMs };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        if (childInterned.computed!.error) {
          interned.computed = {
            buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0,
            error: childInterned.computed!.error,
          };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        if (childInterned.computed!.domain === "printing" && this._printingIndex) {
          // Spec 080: Negated usd with non-null value → operator inversion (excludes nulls).
          // -usd>100 = usd<=100; -usd=null uses normal buffer invert.
          const childField = ast.child.type === "FIELD" ? ast.child : null;
          const isUsdField = childField
            && FIELD_ALIASES[childField.field.toLowerCase()] === "usd"
            && childField.value.toLowerCase() !== "null";
          if (isUsdField && childField) {
            const invOp: Record<string, string> = { ">": "<=", ">=": "<", "<": ">=", "<=": ">", "=": "!=", ":": "!=", "!=": "=" };
            const op = childField.operator;
            const invertedOp = invOp[op] ?? op;
            const pn = this._printingIndex.printingCount;
            const buf = new Uint8Array(pn);
            const t0 = performance.now();
            const err = evalPrintingField("usd", invertedOp, childField.value, this._printingIndex, buf, this.index);
            const ms = performance.now() - t0;
            if (err) {
              interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error: err };
            } else {
              interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
            }
            timings.set(interned.key, { cached: false, evalMs: ms });
            break;
          }
          // Stay in printing domain: invert the printing buffer row-wise.
          // -is:foil = "printing rows that are not foil" (Scryfall semantics).
          const pn = this._printingIndex.printingCount;
          const childBuf = childInterned.computed!.buf;
          const buf = new Uint8Array(pn);
          const t0 = performance.now();
          for (let i = 0; i < pn; i++) buf[i] = childBuf[i] ^ 1;
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        } else {
          // Face-domain NOT: promote if needed, then invert at card level.
          const childFaceBuf = this._faceBuf(childInterned);
          const buf = new Uint8Array(n);
          const cf = this.index.canonicalFace;
          const t0 = performance.now();
          for (let i = 0; i < n; i++) buf[i] = (cf[i] === i) ? (childFaceBuf[i] ^ 1) : 0;
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        }
        break;
      }
      case "AND": {
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const live = childInterneds.filter(ci =>
          ci.ast.type !== "NOP" && !ci.computed?.error
        );
        if (live.length === 0) {
          const buf = new Uint8Array(n);
          const cf = this.index.canonicalFace;
          fillCanonical(buf, cf, n);
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        if (live.length === 1) {
          interned.computed = live[0].computed!;
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        // Determine combined domain: if ALL live children share a domain, stay in it.
        // Otherwise promote everything to face domain.
        const allPrinting = live.every(ci => ci.computed!.domain === "printing");
        const hasPrinting = live.some(ci => ci.computed!.domain === "printing");

        if (allPrinting && this._printingIndex) {
          const pn = this._printingIndex.printingCount;
          const buf = new Uint8Array(pn);
          const t0 = performance.now();
          const first = live[0].computed!.buf;
          for (let i = 0; i < pn; i++) buf[i] = first[i];
          for (let c = 1; c < live.length; c++) {
            const cb = live[c].computed!.buf;
            for (let i = 0; i < pn; i++) buf[i] &= cb[i];
          }
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        } else {
          // Mixed or all-face: combine in face domain
          const buf = new Uint8Array(n);
          const t0 = performance.now();
          const firstBuf = hasPrinting ? this._faceBuf(live[0]) : live[0].computed!.buf;
          for (let i = 0; i < n; i++) buf[i] = firstBuf[i];
          for (let c = 1; c < live.length; c++) {
            const cb = hasPrinting ? this._faceBuf(live[c]) : live[c].computed!.buf;
            for (let i = 0; i < n; i++) buf[i] &= cb[i];
          }
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        }
        break;
      }
      case "OR": {
        const childInterneds = ast.children.map(c => {
          const ci = this.intern(c);
          this.computeTree(ci, timings);
          return ci;
        });
        const live = childInterneds.filter(ci =>
          ci.ast.type !== "NOP" && !ci.computed?.error
        );
        if (live.length === 0) {
          interned.computed = { buf: new Uint8Array(n), domain: "face", matchCount: 0, productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        if (live.length === 1) {
          interned.computed = live[0].computed!;
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }

        const allPrinting = live.every(ci => ci.computed!.domain === "printing");
        const hasPrinting = live.some(ci => ci.computed!.domain === "printing");

        if (allPrinting && this._printingIndex) {
          const pn = this._printingIndex.printingCount;
          const buf = new Uint8Array(pn);
          const t0 = performance.now();
          for (const ci of live) {
            const cb = ci.computed!.buf;
            for (let i = 0; i < pn; i++) buf[i] |= cb[i];
          }
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        } else {
          const buf = new Uint8Array(n);
          const t0 = performance.now();
          for (const ci of live) {
            const cb = hasPrinting ? this._faceBuf(ci) : ci.computed!.buf;
            for (let i = 0; i < n; i++) buf[i] |= cb[i];
          }
          const ms = performance.now() - t0;
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
          timings.set(interned.key, { cached: false, evalMs: ms });
        }
        break;
      }
    }
  }

  private _findSortDirective(ast: ASTNode, negated = false): SortDirective | null {
    switch (ast.type) {
      case "FIELD": {
        if (ast.field.toLowerCase() !== "sort") return null;
        const entry = SORT_FIELDS[ast.value.toLowerCase()];
        if (!entry) return null;
        const direction = negated
          ? (entry.defaultDir === "asc" ? "desc" : "asc")
          : entry.defaultDir;
        return { field: entry.canonical, direction, isPrintingDomain: entry.isPrintingDomain };
      }
      case "NOT":
        return this._findSortDirective(ast.child, !negated);
      case "AND":
      case "OR": {
        for (let i = ast.children.length - 1; i >= 0; i--) {
          const found = this._findSortDirective(ast.children[i], negated);
          if (found) return found;
        }
        return null;
      }
      default:
        return null;
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
    if (computed.error) result.error = computed.error;

    // Dual counts (Spec 082): when PrintingIndex available and node is valid
    if (!computed.error && computed.matchCount !== -1 && this._printingIndex) {
      const pIdx = this._printingIndex;
      const n = this.index.faceCount;
      if (computed.domain === "face") {
        result.matchCountCards = computed.matchCount;
        if (this._hasPrintingLeaves(ast)) {
          // Cross-domain: refine by intersecting with printing-domain leaves
          const printBuf = new Uint8Array(pIdx.printingCount);
          promoteFaceToPrinting(computed.buf, printBuf, pIdx);
          this._intersectPrintingLeaves(ast, printBuf);
          result.matchCountPrints = popcount(printBuf, pIdx.printingCount);
        } else {
          let sum = 0;
          for (let i = 0; i < n && i < computed.buf.length; i++) {
            if (computed.buf[i]) sum += pIdx.printingsOf(i).length;
          }
          result.matchCountPrints = sum;
        }
      } else {
        result.matchCountPrints = computed.matchCount;
        const faceBuf = this._promoteBufToFace(computed.buf);
        result.matchCountCards = popcount(faceBuf, n);
      }
    }

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
