// SPDX-License-Identifier: Apache-2.0
import {
  type ASTNode,
  type QueryNodeResult,
  type EvalOutput,
} from "./ast";
import type { CardIndex } from "./card-index";
import type { PrintingIndex } from "./printing-index";
import { PRINTING_IS_KEYWORDS, evalPrintingIsKeyword } from "./eval-is";
import { isPrintingField, evalPrintingField, promotePrintingToFace, promoteFaceToPrinting } from "./eval-printing";
import { FIELD_ALIASES, fillCanonical, evalLeafField, evalLeafRegex, evalLeafBareWord, evalLeafExact } from "./eval-leaves";

export { FIELD_ALIASES } from "./eval-leaves";

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
    case "FIELD":
      return `FIELD${SEP}${ast.field}${SEP}${ast.operator}${SEP}${ast.value}`;
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

export class NodeCache {
  private nodes: Map<string, InternedNode> = new Map();
  readonly index: CardIndex;
  private _printingIndex: PrintingIndex | null = null;

  constructor(index: CardIndex, printingIndex?: PrintingIndex | null) {
    this.index = index;
    this._printingIndex = printingIndex ?? null;
  }

  get printingIndex(): PrintingIndex | null {
    return this._printingIndex;
  }

  setPrintingIndex(pIdx: PrintingIndex): void {
    this._printingIndex = pIdx;
    // Invalidate any cached printing-domain results since the data changed.
    for (const [, interned] of this.nodes) {
      if (interned.computed?.domain === "printing") {
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
    this.computeTree(root, timings);
    const result = this.buildResult(root, timings);

    const uniquePrints = this._hasUniquePrints(ast);
    const hasPrintingConditions = this._hasPrintingLeaves(ast);
    const printingsUnavailable = hasPrintingConditions && !this._printingIndex;

    if (ast.type === "NOP" || root.computed!.error) {
      return { result, indices: new Uint32Array(0), hasPrintingConditions, printingsUnavailable, uniquePrints };
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

    if (uniquePrints && this._printingIndex) {
      // unique:prints expands ALL matching cards to ALL their printing rows,
      // regardless of whether printing conditions also exist.
      const rows: number[] = [];
      for (const fi of indices) {
        const pRows = this._printingIndex.printingsOf(fi);
        for (const p of pRows) rows.push(p);
      }
      printingIndices = new Uint32Array(rows);
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
      for (let i = 0; i < this._printingIndex.printingCount; i++) {
        if (printBuf[i]) printingIndices[k++] = i;
      }
    }

    return { result, indices, printingIndices, hasPrintingConditions, printingsUnavailable, uniquePrints };
  }

  private _hasPrintingLeaves(ast: ASTNode): boolean {
    switch (ast.type) {
      case "FIELD": {
        if (ast.field.toLowerCase() === "unique") return false;
        const canonical = FIELD_ALIASES[ast.field.toLowerCase()];
        if (canonical === "is") {
          return PRINTING_IS_KEYWORDS.has(ast.value.toLowerCase());
        }
        return canonical !== undefined && isPrintingField(canonical);
      }
      case "NOT": return this._hasPrintingLeaves(ast.child);
      case "AND": case "OR": return ast.children.some(c => this._hasPrintingLeaves(c));
      default: return false;
    }
  }

  private _hasUniquePrints(ast: ASTNode): boolean {
    switch (ast.type) {
      case "FIELD":
        return ast.field.toLowerCase() === "unique" && ast.value.toLowerCase() === "prints";
      case "NOT": return this._hasUniquePrints(ast.child);
      case "AND": case "OR": return ast.children.some(c => this._hasUniquePrints(c));
      default: return false;
    }
  }

  /** AND the printing-domain leaf buffers into printBuf to refine the expansion. */
  private _intersectPrintingLeaves(ast: ASTNode, printBuf: Uint8Array): void {
    switch (ast.type) {
      case "FIELD": {
        const canonical = FIELD_ALIASES[ast.field.toLowerCase()];
        const isPrinting = (canonical === "is" && PRINTING_IS_KEYWORDS.has(ast.value.toLowerCase()))
          || (canonical !== undefined && isPrintingField(canonical));
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
      case "NOT":
        // NOT of a printing leaf is complex — skip refinement for correctness.
        break;
      case "OR":
        // OR children are alternatives — skip refinement for correctness.
        break;
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
    if (interned.computed) {
      this.markCached(interned, timings);
      return;
    }

    const ast = interned.ast;
    const n = this.index.faceCount;

    switch (ast.type) {
      case "NOP": {
        interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0 };
        timings.set(interned.key, { cached: false, evalMs: 0 });
        break;
      }
      case "FIELD": {
        if (ast.field.toLowerCase() === "unique" && ast.value.toLowerCase() === "prints") {
          const buf = new Uint8Array(n);
          fillCanonical(buf, this.index.canonicalFace, n);
          interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: 0 };
          timings.set(interned.key, { cached: false, evalMs: 0 });
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
            error = evalPrintingField(canonical, ast.operator, ast.value, pIdx, buf);
          }

          const ms = performance.now() - t0;
          if (error) {
            interned.computed = { buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0, error };
          } else {
            interned.computed = { buf, domain: "printing", matchCount: popcount(buf, pn), productionMs: ms };
          }
          timings.set(interned.key, { cached: false, evalMs: error ? 0 : ms });
          break;
        }

        if (isPrintingDomain && !this._printingIndex) {
          // Printing data not loaded yet — return error-like result
          interned.computed = {
            buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0,
            error: `printing data not loaded`,
          };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
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
        evalLeafExact(ast, this.index, buf);
        const ms = performance.now() - t0;
        interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
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
        if (childInterned.computed!.error) {
          interned.computed = {
            buf: new Uint8Array(0), domain: "face", matchCount: -1, productionMs: 0,
            error: childInterned.computed!.error,
          };
          timings.set(interned.key, { cached: false, evalMs: 0 });
          break;
        }
        // NOT always produces face-domain. If child is printing, promote first.
        // -set:mh2 = "cards with NO MH2 printing"
        const childFaceBuf = this._faceBuf(childInterned);
        const buf = new Uint8Array(n);
        const cf = this.index.canonicalFace;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) buf[i] = (cf[i] === i) ? (childFaceBuf[i] ^ 1) : 0;
        const ms = performance.now() - t0;
        interned.computed = { buf, domain: "face", matchCount: popcount(buf, n), productionMs: ms };
        timings.set(interned.key, { cached: false, evalMs: ms });
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
