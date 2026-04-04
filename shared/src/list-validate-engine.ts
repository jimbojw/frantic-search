// SPDX-License-Identifier: Apache-2.0
import type { ASTNode } from "./search/ast";
import type { CardIndex } from "./search/card-index";
import type { PrintingIndex } from "./search/printing-index";
import type { NodeCache } from "./search/evaluator";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";
import type {
  ParsedEntry,
  LineValidation,
  LineValidationResult,
  ValidationResult,
  QuickFix,
} from "./list-lexer";
import type { ListToken } from "./list-lexer";
import { lexDeckList, ListTokenType } from "./list-lexer";
import {
  reconstructLineWithoutSet,
  variantLabelForPrinting,
  isKnownGoldfishVariant,
} from "./list-validate";
import { tcgplayerToScryfallSetCode } from "./list-serialize";
import { levenshteinDistance } from "./levenshtein";
import { normalizeAlphanumeric, normalizeForLookalikes } from "./normalize";
import { normalizeForResolution } from "./search/categorical-resolve";

/** Deck list validation needs strict AND on collector; query AND elides error leaves (Spec 039). */
function filterPrintingIndicesByExactCollector(
  indices: Uint32Array | undefined,
  collectorNum: string,
  pIdx: PrintingIndex,
): Uint32Array {
  if (!indices || indices.length === 0) return new Uint32Array(0);
  const u = normalizeForResolution(collectorNum.trim());
  const out: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const pi = indices[i]!;
    if (pIdx.collectorNumbersNormResolved[pi] === u) out.push(pi);
  }
  return new Uint32Array(out);
}

function isNumericCollectorNumber(v: string): boolean {
  return /^\d+[a-zA-Z]*$/.test(v.trim());
}

function getDisplayNameForCanonicalFace(
  canonicalFace: number,
  display: DisplayColumns,
): string | undefined {
  for (let i = 0; i < display.canonical_face.length; i++) {
    if ((display.canonical_face[i] ?? i) === canonicalFace) {
      return display.names[i];
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// AST construction helpers — builds trees directly (Spec 114 § 1a)
// ---------------------------------------------------------------------------

function exactNode(name: string): ASTNode {
  return { type: "EXACT", value: name.toLowerCase() };
}

/** Moxfield uses single slash for DFCs; Scryfall uses double. Accept both. */
function normalizeDfcNameForLookup(name: string): string {
  return name.replace(/ \/ /g, " // ");
}

function fieldNode(field: string, value: string): ASTNode {
  return { type: "FIELD", field, operator: ":", value };
}

function andNode(children: ASTNode[]): ASTNode {
  if (children.length === 1) return children[0]!;
  return { type: "AND", children };
}

/**
 * Map a MTGGoldfish variant string to an `is:` keyword for the evaluator.
 * Returns null when the variant cannot be mapped to a single is: keyword
 * (known-but-unresolvable variants like "promo pack").
 */
function variantToIsKeyword(variant: string): string | null {
  const v = variant.toLowerCase().trim();
  const dashIdx = v.indexOf(" - ");
  const flagPart = dashIdx >= 0 ? v.slice(dashIdx + 3) : v;
  switch (flagPart) {
    case "extended": return "extended";
    case "borderless": return "borderless";
    case "showcase": return "showcase";
    case "prerelease": return "prerelease";
    case "buy-a-box": case "buyabox": return "buyabox";
    case "brawl_deck": case "brawldeck": return "brawldeck";
    case "pw_deck": case "planeswalkerdeck": return "planeswalkerdeck";
    case "stamped": case "planeswalker stamp": return "stamped";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Per-line memoization — same line content always yields same result
// ---------------------------------------------------------------------------

interface CachedLineResult {
  kind: LineValidation["kind"];
  message?: string;
  quickFixes?: QuickFix[];
  spanRel?: { start: number; end: number };
  entry?: ParsedEntry;
  /** Spec 116: indices for worker→main transfer. -1 for invalid. */
  oracleIndex?: number;
  scryfallIndex?: number;
}

const lineResultCache = new Map<string, CachedLineResult>();

function toCacheable(
  line: LineValidation,
  entry: ParsedEntry | undefined,
  lineStart: number,
  oracleIndex?: number,
  scryfallIndex?: number,
): CachedLineResult {
  const cached: CachedLineResult = { kind: line.kind };
  if (line.message) cached.message = line.message;
  if (line.quickFixes) cached.quickFixes = line.quickFixes;
  if (line.span)
    cached.spanRel = {
      start: line.span.start - lineStart,
      end: line.span.end - lineStart,
    };
  if (entry) cached.entry = entry;
  if (oracleIndex !== undefined) cached.oracleIndex = oracleIndex;
  if (scryfallIndex !== undefined) cached.scryfallIndex = scryfallIndex;
  return cached;
}

function fromCacheable(
  cached: CachedLineResult,
  lineIndex: number,
  lineStart: number,
  lineEnd: number,
): LineValidation {
  const line: LineValidation = {
    lineIndex,
    lineStart,
    lineEnd,
    kind: cached.kind,
  };
  if (cached.message) line.message = cached.message;
  if (cached.quickFixes) line.quickFixes = cached.quickFixes;
  if (cached.spanRel)
    line.span = {
      start: lineStart + cached.spanRel.start,
      end: lineStart + cached.spanRel.end,
    };
  return line;
}

// ---------------------------------------------------------------------------
// Engine-based validation (Spec 114)
// ---------------------------------------------------------------------------

/** Spec 116: per-line indices for Transferable. Stride 2: [oracleIndex, scryfallIndex]. */
export type ValidationIndices = Int32Array;

export function validateDeckListWithEngine(
  text: string,
  cardIndex: CardIndex,
  printingIndex: PrintingIndex | null,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  cache: NodeCache,
): ValidationResult & { indices: ValidationIndices } {
  const lines: LineValidation[] = [];
  const resolved: ParsedEntry[] = [];
  const lineIndices: number[] = [];

  const lineStrings = text.split(/\r?\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex++) {
    const line = lineStrings[lineIndex]!;
    const lineStart = offset;
    const lineEnd = offset + line.length;

    const cacheKey = line.trim();
    const cached = lineResultCache.get(cacheKey);
    if (cached !== undefined) {
      lines.push(fromCacheable(cached, lineIndex, lineStart, lineEnd));
      if (cached.entry) resolved.push(cached.entry);
      lineIndices.push(
        cached.oracleIndex ?? -1,
        cached.scryfallIndex ?? -1,
      );
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    const tokens = lexDeckList(line);
    const quantityTok = tokens.find((t) => t.type === ListTokenType.QUANTITY);
    const nameTok = tokens.find((t) => t.type === ListTokenType.CARD_NAME);
    const setTok =
      tokens.find((t) => t.type === ListTokenType.SET_CODE) ??
      tokens.find((t) => t.type === ListTokenType.SET_CODE_BRACKET);
    const collectorTok = tokens.find((t) => t.type === ListTokenType.COLLECTOR_NUMBER);
    const variantTok = tokens.find((t) => t.type === ListTokenType.VARIANT);
    const foilParenTok = tokens.find((t) => t.type === ListTokenType.FOIL_PAREN);
    const foilMarkerTok = tokens.find((t) => t.type === ListTokenType.FOIL_MARKER);
    const etchedMarkerTok = tokens.find((t) => t.type === ListTokenType.ETCHED_MARKER);
    const etchedParenTok = tokens.find((t) => t.type === ListTokenType.ETCHED_PAREN);
    const foilPrereleaseMarkerTok = tokens.find(
      (t) => t.type === ListTokenType.FOIL_PRERELEASE_MARKER,
    );
    const alterMarkerTok = tokens.find((t) => t.type === ListTokenType.ALTER_MARKER);

    if (tokens.some((t) => t.type === ListTokenType.COMMENT)) {
      const lineResult = { lineIndex, lineStart, lineEnd, kind: "ok" as const };
      lines.push(lineResult);
      lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
      lineIndices.push(-1, -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    if (quantityTok && !nameTok) {
      const lineResult = {
        lineIndex, lineStart, lineEnd, kind: "error" as const,
        span: { start: lineStart, end: lineEnd },
        message: "Missing card name",
      };
      lines.push(lineResult);
      lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
      lineIndices.push(-1, -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    if (!quantityTok || !nameTok) {
      lines.push({ lineIndex, lineStart, lineEnd, kind: "ok" as const });
      lineIndices.push(-1, -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    let finish: "foil" | "etched" | null = null;
    if (etchedMarkerTok || etchedParenTok) finish = "etched";
    else if (foilParenTok || foilMarkerTok || foilPrereleaseMarkerTok) finish = "foil";

    const preferFoil = !!(foilParenTok || foilMarkerTok || foilPrereleaseMarkerTok);

    const setCode = setTok?.value;
    const effectiveSetCode = setCode ? tcgplayerToScryfallSetCode(setCode) : "";
    let collectorNum: string | undefined;
    let isVariantCollector = false;
    if (collectorTok) {
      collectorNum = collectorTok.value;
    } else if (variantTok && isNumericCollectorNumber(variantTok.value)) {
      collectorNum = variantTok.value;
      isVariantCollector = true;
    }

    // Build variant is: nodes for non-numeric variants
    const variantIsNodes: ASTNode[] = [];
    const hasNonNumericVariant = variantTok && !isVariantCollector;
    let variantFallbackMode: "known" | "unknown" | null = null;
    if (hasNonNumericVariant) {
      const isKw = variantToIsKeyword(variantTok!.value);
      if (isKw) {
        variantIsNodes.push(fieldNode("is", isKw));
      } else if (isKnownGoldfishVariant(variantTok!.value)) {
        variantFallbackMode = "known";
      } else {
        variantFallbackMode = "unknown";
      }
    }
    if (foilPrereleaseMarkerTok && !variantTok) {
      variantFallbackMode = "known";
    }

    const finishNodes: ASTNode[] = [];
    if (finish === "foil") finishNodes.push(fieldNode("is", "foil"));
    else if (finish === "etched") finishNodes.push(fieldNode("is", "etched"));

    const hasPrintingParts = !!(setCode && printingIndex && printingDisplay);

    // § 3e: Name-only lines (no set/collector/printing data)
    if (!setCode || !hasPrintingParts) {
      const result = resolveNameOnly(
        nameTok, cardIndex, cache, display, printingDisplay,
        quantityTok, finish, lineIndex, lineStart, lineEnd,
        variantTok, foilPrereleaseMarkerTok,
      );
      lines.push(result.line);
      if (result.entry) resolved.push(result.entry);
      lineResultCache.set(cacheKey, toCacheable(result.line, result.entry, lineStart, result.oracleIndex, result.scryfallIndex));
      lineIndices.push(result.oracleIndex ?? -1, result.scryfallIndex ?? -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // Check set existence (use effectiveSetCode for lookup; TCGPlayer codes map to Scryfall)
    if (!printingIndex!.knownSetCodes.has(effectiveSetCode)) {
      const finishToks = [
        foilParenTok, foilMarkerTok, etchedMarkerTok, etchedParenTok,
        foilPrereleaseMarkerTok, alterMarkerTok,
      ].filter((t): t is ListToken => t != null);
      const removeSetReplacement = reconstructLineWithoutSet(
        line, setTok!, collectorTok ?? undefined,
        setTok!.type === ListTokenType.SET_CODE_BRACKET ? variantTok : undefined,
        setTok!.type === ListTokenType.SET_CODE_BRACKET ? setTok : undefined,
        finishToks,
      );

      const NO_SET_PLACEHOLDER = "000";
      const isNoSetPlaceholder = effectiveSetCode === NO_SET_PLACEHOLDER;

      // § 3d.0: Unknown set — try name+collector before falling back
      if (collectorNum) {
        const nameExact = exactNode(normalizeDfcNameForLookup(nameTok.value));
        const uniquePrints = fieldNode("unique", "prints");
        const nameCnChildren: ASTNode[] = [
          nameExact,
          ...finishNodes,
          ...variantIsNodes,
          uniquePrints,
        ];
        const nameCnResult = cache.evaluate(andNode(nameCnChildren));
        const nameCnPis = filterPrintingIndicesByExactCollector(
          nameCnResult.printingIndices,
          collectorNum,
          printingIndex!,
        );
        if (nameCnPis.length > 0) {
          // Disaggregate by set code — foil/non-foil share set+cn, count as one match
          const bySet = new Map<string, number[]>();
          for (let i = 0; i < nameCnPis.length; i++) {
            const idx = nameCnPis[i]!;
            const sc = printingDisplay!.set_codes[idx] ?? "";
            const arr = bySet.get(sc) ?? [];
            arr.push(idx);
            bySet.set(sc, arr);
          }
          const uniqueSetCount = bySet.size;

          if (uniqueSetCount === 1) {
            const indices = bySet.values().next().value as number[];
            let pi = indices[0]!;
            if (indices.length > 1) {
              const wantFoil = preferFoil ? 1 : 0;
              const match = indices.find((i) => printingDisplay!.finish[i] === wantFoil);
              if (match !== undefined) pi = match;
            }
            const resolvedSet = printingDisplay!.set_codes[pi] ?? "";
            const success = makeSuccess(
              pi,
              display,
              printingDisplay!,
              quantityTok,
              finish,
              lineIndex,
              lineStart,
              lineEnd,
              variantTok,
              foilPrereleaseMarkerTok,
            );
            const warningLine: LineValidation = {
              ...success.line,
              kind: "warning",
              span: { start: lineStart + setTok!.start, end: lineStart + setTok!.end },
              message: `Set resolved to ${resolvedSet}`,
            };
            lines.push(warningLine);
            if (success.entry) resolved.push(success.entry);
            lineResultCache.set(cacheKey, toCacheable(warningLine, success.entry, lineStart, success.oracleIndex, success.scryfallIndex));
            lineIndices.push(success.oracleIndex, success.scryfallIndex);
            offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
            continue;
          }
          // 2+ matches: if 000, resolve by name; else error with Use + Remove
          if (isNoSetPlaceholder) {
            const result = resolveNameOnly(
              nameTok, cardIndex, cache, display, printingDisplay!,
              quantityTok, finish, lineIndex, lineStart, lineEnd,
              variantTok, foilPrereleaseMarkerTok,
            );
            lines.push(result.line);
            if (result.entry) resolved.push(result.entry);
            lineResultCache.set(cacheKey, toCacheable(result.line, result.entry, lineStart, result.oracleIndex, result.scryfallIndex));
            lineIndices.push(result.oracleIndex ?? -1, result.scryfallIndex ?? -1);
            offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
            continue;
          }
          const seen = new Set<string>();
          const useFixes: { label: string; replacement: string }[] = [];
          const setCodes = Array.from(bySet.keys());
          for (let i = 0; i < Math.min(2, setCodes.length); i++) {
            const correctSet = setCodes[i]!;
            const replacement = line.slice(0, setTok!.start) + correctSet + line.slice(setTok!.end);
            if (!seen.has(replacement)) {
              seen.add(replacement);
              useFixes.push({ label: `Use ${correctSet}`, replacement: replacement.trimEnd() });
            }
          }
          const quickFixes: { label: string; replacement: string }[] = [
            ...useFixes,
            ...(removeSetReplacement ? [{ label: "Remove set/collector, use name only", replacement: removeSetReplacement }] : []),
          ];
          const lineResult = {
            lineIndex, lineStart, lineEnd, kind: "error" as const,
            span: { start: lineStart + setTok!.start, end: lineStart + setTok!.end },
            message: `Unknown set — \`${setCode}\``,
            quickFixes,
          };
          lines.push(lineResult);
          lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
          lineIndices.push(-1, -1);
          offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
          continue;
        }

        // § 3d.0 Levenshtein-on-set: 0 name+collector matches, try set typo resolution
        const effectiveCollectorTok = isVariantCollector ? variantTok : collectorTok;
        const setLower = effectiveSetCode.toLowerCase();
        const levSets: string[] = [];
        for (const known of printingIndex!.knownSetCodes) {
          if (levenshteinDistance(setLower, known, 1) <= 1) levSets.push(known);
        }

        if (levSets.length === 1) {
          const resolvedSet = levSets[0]!;
          const setField = fieldNode("set", resolvedSet);
          const dropCnChildren: ASTNode[] = [
            nameExact,
            setField,
            ...finishNodes,
            ...variantIsNodes,
            uniquePrints,
          ];
          const dropCnResult = cache.evaluate(andNode(dropCnChildren));
          if (dropCnResult.printingIndices && dropCnResult.printingIndices.length > 0) {
            const withDistance = Array.from(dropCnResult.printingIndices).map((rowIdx) => {
              const cn = printingDisplay!.collector_numbers[rowIdx]!;
              const dist = levenshteinDistance(collectorNum!, cn);
              return { rowIdx, cn, dist };
            });
            const distanceOneCns = new Set(
              withDistance.filter((x) => x.dist === 1).map((x) => x.cn),
            );
            if (distanceOneCns.size === 1) {
              const resolvedCn = distanceOneCns.values().next().value!;
              const candidates = withDistance.filter((x) => x.cn === resolvedCn);
              let pi = candidates[0]!.rowIdx;
              if (candidates.length > 1) {
                const wantFoil = preferFoil ? 1 : 0;
                const match = candidates.find(
                  (c) => printingDisplay!.finish[c.rowIdx] === wantFoil,
                );
                if (match !== undefined) pi = match.rowIdx;
              }
              const success = makeSuccess(
                pi,
                display,
                printingDisplay!,
                quantityTok,
                finish,
                lineIndex,
                lineStart,
                lineEnd,
                variantTok,
                foilPrereleaseMarkerTok,
              );
              const resolvedCnDisplay = printingDisplay!.collector_numbers[pi]!;
              const resolvedSetDisplay = printingDisplay!.set_codes[pi] ?? resolvedSet;
              const warningLine: LineValidation = {
                ...success.line,
                kind: "warning",
                span: {
                  start: lineStart + setTok!.start,
                  end: lineStart + effectiveCollectorTok!.end,
                },
                message: `Set and collector number resolved to ${resolvedSetDisplay} ${resolvedCnDisplay}`,
              };
              lines.push(warningLine);
              if (success.entry) resolved.push(success.entry);
              lineResultCache.set(cacheKey, toCacheable(warningLine, success.entry, lineStart, success.oracleIndex, success.scryfallIndex));
              lineIndices.push(success.oracleIndex, success.scryfallIndex);
              offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
              continue;
            }
            withDistance.sort((a, b) => a.dist - b.dist || a.cn.localeCompare(b.cn));
            const quickFixes: { label: string; replacement: string }[] = [];
            const setDisplay = printingDisplay!.set_codes.find((sc) => sc.toLowerCase() === resolvedSet) ?? resolvedSet;
            for (const { rowIdx, cn } of withDistance) {
              const variantLabel = variantLabelForPrinting(printingDisplay!, rowIdx);
              const replacement =
                line.slice(0, setTok!.start) + setDisplay +
                line.slice(setTok!.end, effectiveCollectorTok!.start) + cn +
                line.slice(effectiveCollectorTok!.end);
              quickFixes.push({
                label: `Use ${setDisplay} ${cn}${variantLabel}`,
                replacement: replacement.trimEnd(),
              });
            }
            const lineResult = {
              lineIndex, lineStart, lineEnd, kind: "error" as const,
              span: { start: lineStart + setTok!.start, end: lineStart + setTok!.end },
              message: `Unknown set — \`${setCode}\``,
              quickFixes,
            };
            lines.push(lineResult);
            lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
            lineIndices.push(-1, -1);
            offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
            continue;
          }
        }

        if (levSets.length >= 2) {
          const seen = new Set<string>();
          const useFixes: { label: string; replacement: string }[] = [];
          for (let i = 0; i < Math.min(2, levSets.length); i++) {
            const correctSet = printingDisplay!.set_codes.find(
              (sc) => sc.toLowerCase() === levSets[i],
            ) ?? levSets[i]!;
            const replacement = line.slice(0, setTok!.start) + correctSet + line.slice(setTok!.end);
            if (!seen.has(replacement)) {
              seen.add(replacement);
              useFixes.push({ label: `Use ${correctSet}`, replacement: replacement.trimEnd() });
            }
          }
          const quickFixes: { label: string; replacement: string }[] = [
            ...useFixes,
            ...(removeSetReplacement ? [{ label: "Remove set/collector, use name only", replacement: removeSetReplacement }] : []),
          ];
          const lineResult = {
            lineIndex, lineStart, lineEnd, kind: "error" as const,
            span: { start: lineStart + setTok!.start, end: lineStart + setTok!.end },
            message: `Unknown set — \`${setCode}\``,
            quickFixes,
          };
          lines.push(lineResult);
          lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
          lineIndices.push(-1, -1);
          offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
          continue;
        }
      }

      // 0 matches or no collector: if 000, resolve by name; else error
      if (isNoSetPlaceholder) {
        const result = resolveNameOnly(
          nameTok, cardIndex, cache, display, printingDisplay!,
          quantityTok, finish, lineIndex, lineStart, lineEnd,
          variantTok, foilPrereleaseMarkerTok,
        );
        lines.push(result.line);
        if (result.entry) resolved.push(result.entry);
        lineResultCache.set(cacheKey, toCacheable(result.line, result.entry, lineStart, result.oracleIndex, result.scryfallIndex));
        lineIndices.push(result.oracleIndex ?? -1, result.scryfallIndex ?? -1);
        offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
        continue;
      }

      const lineResult = {
        lineIndex, lineStart, lineEnd, kind: "error" as const,
        span: { start: lineStart + setTok!.start, end: lineStart + setTok!.end },
        message: `Unknown set — \`${setCode}\``,
        ...(removeSetReplacement
          ? { quickFixes: [{ label: "Remove set/collector, use name only", replacement: removeSetReplacement }] }
          : {}),
      };
      lines.push(lineResult);
      lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
      lineIndices.push(-1, -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // Unknown variant → error
    if (variantFallbackMode === "unknown") {
      const lineResult = {
        lineIndex, lineStart, lineEnd, kind: "error" as const,
        span: { start: lineStart + variantTok!.start, end: lineStart + variantTok!.end },
        message: "No matching printing",
      };
      lines.push(lineResult);
      lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
      lineIndices.push(-1, -1);
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // Known-but-unresolvable variant fallback (prerelease, promo pack, etc.)
    if (variantFallbackMode === "known") {
      const nameResult = cache.evaluate(exactNode(normalizeDfcNameForLookup(nameTok.value)));
      if (nameResult.indices.length === 0) {
        const lineResult = {
          lineIndex, lineStart, lineEnd, kind: "error" as const,
          span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
          message: `Unknown card — "${nameTok.value}"`,
        };
        lines.push(lineResult);
        lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
        lineIndices.push(-1, -1);
        offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
        continue;
      }
      const faceIdx = nameResult.indices[0]!;
      const canonicalFace = display.canonical_face[faceIdx] ?? faceIdx;
      const fallbackPi = findAnyPrintingInSetEngine(
        effectiveSetCode, canonicalFace, printingDisplay!, preferFoil,
      );
      const variantMarkerTok = variantTok ?? foilPrereleaseMarkerTok;
      if (fallbackPi >= 0) {
        const scryfallId = printingDisplay!.scryfall_ids[fallbackPi] ?? null;
        const qtyStr = quantityTok.value.replace(/x$/i, "");
        const quantity = parseInt(qtyStr, 10) || 1;
        const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
        const entry: ParsedEntry = {
          oracle_id: display.oracle_ids[faceIdx] ?? "",
          scryfall_id: scryfallId,
          quantity,
          finish: finish ?? undefined,
          variant: variantValue,
        };
        const lineResult = {
          lineIndex, lineStart, lineEnd, kind: "warning" as const,
          span: { start: lineStart + variantMarkerTok!.start, end: lineStart + variantMarkerTok!.end },
          message: "Variant resolved approximately",
        };
        lines.push(lineResult);
        resolved.push(entry);
        lineResultCache.set(cacheKey, toCacheable(lineResult, entry, lineStart, canonicalFace, fallbackPi));
        lineIndices.push(canonicalFace, fallbackPi);
      } else {
        const lineResult = {
          lineIndex, lineStart, lineEnd, kind: "error" as const,
          span: { start: lineStart + variantMarkerTok!.start, end: lineStart + variantMarkerTok!.end },
          message: "No matching printing",
        };
        lines.push(lineResult);
        lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
        lineIndices.push(-1, -1);
      }
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // § 3a–3d: Cascading resolution (effectiveSetCode for lookup; setCode for error messages)
    const cascadeResult = resolveCascade(
      nameTok, effectiveSetCode, setCode, collectorNum, finish, finishNodes, variantIsNodes,
      cardIndex, printingIndex!, cache, display, printingDisplay!,
      line, lineIndex, lineStart, lineEnd,
      quantityTok, setTok!, collectorTok, variantTok, isVariantCollector,
      foilParenTok, foilMarkerTok, etchedMarkerTok, etchedParenTok,
      foilPrereleaseMarkerTok, alterMarkerTok, preferFoil,
    );
    lines.push(cascadeResult.line);
    if (cascadeResult.entry) resolved.push(cascadeResult.entry);
    lineResultCache.set(cacheKey, toCacheable(cascadeResult.line, cascadeResult.entry, lineStart, cascadeResult.oracleIndex, cascadeResult.scryfallIndex));
    lineIndices.push(cascadeResult.oracleIndex ?? -1, cascadeResult.scryfallIndex ?? -1);

    offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
  }

  const indices = new Int32Array(lineIndices);
  return { lines, resolved, indices };
}

// ---------------------------------------------------------------------------
// Line-centric validation (Spec 115) — validates only requested lines
// ---------------------------------------------------------------------------

export function validateLines(
  lines: string[],
  cardIndex: CardIndex,
  printingIndex: PrintingIndex | null,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  cache: NodeCache,
): { result: LineValidationResult[]; indices: Int32Array } {
  if (lines.length === 0) return { result: [], indices: new Int32Array(0) };

  const text = lines.join("\n");
  const fullResult = validateDeckListWithEngine(
    text,
    cardIndex,
    printingIndex,
    display,
    printingDisplay,
    cache,
  );

  const result: LineValidationResult[] = [];
  for (let i = 0; i < fullResult.lines.length; i++) {
    const l = fullResult.lines[i]!;
    if (l.kind === "error" || l.kind === "warning") {
      const spanRel = l.span
        ? { start: l.span.start - l.lineStart, end: l.span.end - l.lineStart }
        : undefined;
      result.push({
        lineIndex: i,
        kind: l.kind,
        message: l.message,
        quickFixes: l.quickFixes,
        spanRel,
      });
    }
  }

  return { result, indices: fullResult.indices };
}

// ---------------------------------------------------------------------------
// Name-only resolution (§ 3e + § 3g approximate match)
// ---------------------------------------------------------------------------

function resolveNameOnly(
  nameTok: ListToken,
  cardIndex: CardIndex,
  cache: NodeCache,
  display: DisplayColumns,
  _printingDisplay: PrintingDisplayColumns | null,
  quantityTok: ListToken,
  finish: "foil" | "etched" | null,
  lineIndex: number,
  lineStart: number,
  lineEnd: number,
  variantTok: ListToken | undefined,
  foilPrereleaseMarkerTok: ListToken | undefined,
): { line: LineValidation; entry?: ParsedEntry; oracleIndex?: number; scryfallIndex?: number } {
  const evalResult = cache.evaluate(exactNode(normalizeDfcNameForLookup(nameTok.value)));

  if (evalResult.indices.length > 0) {
    const faceIdx = evalResult.indices[0]!;
    const oracleId = display.oracle_ids[faceIdx] ?? "";
    const qtyStr = quantityTok.value.replace(/x$/i, "");
    const quantity = parseInt(qtyStr, 10) || 1;
    const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
    return {
      line: { lineIndex, lineStart, lineEnd, kind: "ok" },
      entry: {
        oracle_id: oracleId,
        scryfall_id: null,
        quantity,
        finish: finish ?? undefined,
        variant: variantValue,
      },
      oracleIndex: faceIdx,
      scryfallIndex: -1,
    };
  }

  // § 3g: Approximate name match — auto-resolve with warning (Spec 114)
  const approx = tryApproximateNameMatch(nameTok.value, cardIndex, display);
  if (approx) {
    const { canonicalFace, displayName } = approx;
    const oracleId = display.oracle_ids[canonicalFace] ?? "";
    const qtyStr = quantityTok.value.replace(/x$/i, "");
    const quantity = parseInt(qtyStr, 10) || 1;
    const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
    return {
      line: {
        lineIndex, lineStart, lineEnd, kind: "warning",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: `Name resolved to "${displayName}"`,
      },
      entry: {
        oracle_id: oracleId,
        scryfall_id: null,
        quantity,
        finish: finish ?? undefined,
        variant: variantValue,
      },
      oracleIndex: canonicalFace,
      scryfallIndex: -1,
    };
  }

  return {
    line: {
      lineIndex, lineStart, lineEnd, kind: "error",
      span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
      message: `Unknown card — "${nameTok.value}"`,
    },
    oracleIndex: -1,
    scryfallIndex: -1,
  };
}

// ---------------------------------------------------------------------------
// § 3g: Approximate name match (punctuation/whitespace normalization)
// ---------------------------------------------------------------------------

function tryApproximateNameMatch(
  inputName: string,
  cardIndex: CardIndex,
  display: DisplayColumns,
): { canonicalFace: number; displayName: string } | null {
  const normalized = normalizeAlphanumeric(normalizeForLookalikes(inputName));
  if (!normalized) return null;

  let bestFace = -1;
  let bestLen = Infinity;

  for (let i = 0; i < cardIndex.faceCount; i++) {
    const cn = cardIndex.combinedNamesNormalized[i]!;
    if (cn === normalized && cn.length < bestLen) {
      bestLen = cn.length;
      bestFace = display.canonical_face[i] ?? i;
    }
  }

  const altMatch = cardIndex.alternateNamesIndex[normalized];
  if (altMatch !== undefined) {
    bestFace = altMatch;
  }

  if (bestFace >= 0) {
    const displayName = getDisplayNameForCanonicalFace(bestFace, display);
    return displayName ? { canonicalFace: bestFace, displayName } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cascade resolution (§ 3a–3d)
// ---------------------------------------------------------------------------

function resolveCascade(
  nameTok: ListToken,
  setCodeForLookup: string,
  setCodeForDisplay: string,
  collectorNum: string | undefined,
  finish: "foil" | "etched" | null,
  finishNodes: ASTNode[],
  variantIsNodes: ASTNode[],
  _cardIndex: CardIndex,
  _printingIndex: PrintingIndex,
  cache: NodeCache,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns,
  line: string,
  lineIndex: number,
  lineStart: number,
  lineEnd: number,
  quantityTok: ListToken,
  setTok: ListToken,
  collectorTok: ListToken | undefined,
  variantTok: ListToken | undefined,
  isVariantCollector: boolean,
  foilParenTok: ListToken | undefined,
  foilMarkerTok: ListToken | undefined,
  etchedMarkerTok: ListToken | undefined,
  etchedParenTok: ListToken | undefined,
  foilPrereleaseMarkerTok: ListToken | undefined,
  alterMarkerTok: ListToken | undefined,
  preferFoil: boolean,
): { line: LineValidation; entry?: ParsedEntry; oracleIndex?: number; scryfallIndex?: number } {
  const nameExact = exactNode(normalizeDfcNameForLookup(nameTok.value));
  const setField = fieldNode("set", setCodeForLookup.toLowerCase());
  const uniquePrints = fieldNode("unique", "prints");
  const effectiveCollectorTok = isVariantCollector ? variantTok : collectorTok;

  // § 3a: Full match (name + set + cn + finish + variant)
  // Collector is applied via filterPrintingIndicesByExactCollector — not cn in AST — so AND is not weakened by Spec 039 passthrough elision of unknown-collector errors.
  if (collectorNum) {
    const fullChildren: ASTNode[] = [nameExact, setField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const fullResult = cache.evaluate(andNode(fullChildren));
    const fullPis = filterPrintingIndicesByExactCollector(
      fullResult.printingIndices,
      collectorNum,
      _printingIndex,
    );
    if (fullPis.length > 0) {
      let pi = fullPis[0]!;
      if (fullPis.length > 1) {
        const wantFoil = preferFoil ? 1 : 0;
        const match = Array.from(fullPis).find((idx) => printingDisplay.finish[idx] === wantFoil);
        if (match !== undefined) pi = match;
      }
      return makeSuccess(
        pi, display, printingDisplay, quantityTok, finish,
        lineIndex, lineStart, lineEnd, variantTok, foilPrereleaseMarkerTok,
      );
    }

    // § 3b: Drop collector number
    const dropCnChildren: ASTNode[] = [nameExact, setField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropCnResult = cache.evaluate(andNode(dropCnChildren));
    if (dropCnResult.printingIndices && dropCnResult.printingIndices.length > 0) {
      const withDistance = Array.from(dropCnResult.printingIndices).map((rowIdx) => {
        const cn = printingDisplay.collector_numbers[rowIdx]!;
        const dist = levenshteinDistance(collectorNum!, cn);
        return { rowIdx, cn, dist };
      });
      const distanceOneCns = new Set(
        withDistance.filter((x) => x.dist === 1).map((x) => x.cn),
      );
      if (distanceOneCns.size === 1) {
        const resolvedCn = distanceOneCns.values().next().value!;
        const candidates = withDistance.filter((x) => x.cn === resolvedCn);
        let pi = candidates[0]!.rowIdx;
        if (candidates.length > 1) {
          const wantFoil = preferFoil ? 1 : 0;
          const match = candidates.find(
            (c) => printingDisplay.finish[c.rowIdx] === wantFoil,
          );
          if (match !== undefined) pi = match.rowIdx;
        }
        const success = makeSuccess(
          pi,
          display,
          printingDisplay,
          quantityTok,
          finish,
          lineIndex,
          lineStart,
          lineEnd,
          variantTok,
          foilPrereleaseMarkerTok,
        );
        const resolvedCnDisplay = printingDisplay.collector_numbers[pi]!;
        const warningLine: LineValidation = {
          ...success.line,
          kind: "warning",
          span: {
            start: lineStart + effectiveCollectorTok!.start,
            end: lineStart + effectiveCollectorTok!.end,
          },
          message: `Collector number resolved to ${resolvedCnDisplay}`,
        };
        return {
          line: warningLine,
          entry: success.entry,
          oracleIndex: success.oracleIndex,
          scryfallIndex: success.scryfallIndex,
        };
      }
      withDistance.sort((a, b) => a.dist - b.dist || a.cn.localeCompare(b.cn));
      const quickFixes = withDistance.map(({ rowIdx, cn }) => {
        const variantLabel = variantLabelForPrinting(printingDisplay, rowIdx);
        const tok = effectiveCollectorTok!;
        const replacement = line.slice(0, tok.start) + cn + line.slice(tok.end);
        return {
          label: `Use ${cn}${variantLabel}`,
          replacement: replacement.trimEnd(),
        };
      });
      return {
        line: {
          lineIndex,
          lineStart,
          lineEnd,
          kind: "error",
          span: {
            start: lineStart + effectiveCollectorTok!.start,
            end: lineStart + effectiveCollectorTok!.end,
          },
          message: `Collector number doesn't match — \`${collectorNum}\` in \`${setCodeForDisplay}\``,
          quickFixes,
        },
        oracleIndex: -1,
        scryfallIndex: -1,
      };
    }

    // § 3c: Drop name
    const dropNameChildren: ASTNode[] = [setField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropNameResult = cache.evaluate(andNode(dropNameChildren));
    const dropNamePis = filterPrintingIndicesByExactCollector(
      dropNameResult.printingIndices,
      collectorNum,
      _printingIndex,
    );
    if (dropNamePis.length > 0) {
      let pi = dropNamePis[0]!;
      if (dropNamePis.length > 1) {
        const wantFoil = preferFoil ? 1 : 0;
        const match = Array.from(dropNamePis).find((idx) => printingDisplay.finish[idx] === wantFoil);
        if (match !== undefined) pi = match;
      }
      const printingCanonicalFace = printingDisplay.canonical_face_ref[pi]!;
      const correctName = getDisplayNameForCanonicalFace(printingCanonicalFace, display);
      if (correctName) {
        const nameResult = cache.evaluate(nameExact);
        if (nameResult.indices.length === 0) {
          // Case 3: name not recognized, set+collector valid
          const replacement = line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end);
          return {
            line: {
              lineIndex, lineStart, lineEnd, kind: "error",
              span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
              message: `Card name not recognized; set+collector point to "${correctName}"`,
              quickFixes: [{ label: `Use "${correctName}"`, replacement: replacement.trimEnd() }],
            },
            oracleIndex: -1,
            scryfallIndex: -1,
          };
        }
        // Case 2: name valid but doesn't match set+collector
        const finishToks = [
          foilParenTok, foilMarkerTok, etchedMarkerTok, etchedParenTok,
          foilPrereleaseMarkerTok, alterMarkerTok,
        ].filter((t): t is ListToken => t != null);
        const removeSetReplacement = reconstructLineWithoutSet(
          line, setTok,
          isVariantCollector ? undefined : collectorTok,
          setTok.type === ListTokenType.SET_CODE_BRACKET ? variantTok : undefined,
          setTok.type === ListTokenType.SET_CODE_BRACKET ? setTok : undefined,
          finishToks,
        );
        return {
          line: {
            lineIndex, lineStart, lineEnd, kind: "error",
            span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
            message: `Card name "${nameTok.value}" doesn't match \`${setCodeForDisplay}\` collector number \`${collectorNum}\``,
            quickFixes: [
              { label: "Remove set/collector, use name only", replacement: removeSetReplacement.trimEnd() },
              { label: `Use "${correctName}"`, replacement: (line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end)).trimEnd() },
            ],
          },
          oracleIndex: -1,
          scryfallIndex: -1,
        };
      }
    }
  }

  // § 3d: Name only — card exists but set combo failed
  const nameResult = cache.evaluate(nameExact);
  if (nameResult.indices.length > 0) {
    const faceIdx = nameResult.indices[0]!;
    const canonicalFace = display.canonical_face[faceIdx] ?? faceIdx;

    if (!collectorNum) {
      // Set present but no collector (TappedOut format)
      const fallbackPi = findAnyPrintingInSetEngine(
        setCodeForLookup, canonicalFace, printingDisplay, preferFoil,
      );
      if (fallbackPi >= 0) {
        return makeSuccess(
          fallbackPi, display, printingDisplay, quantityTok, finish,
          lineIndex, lineStart, lineEnd, variantTok, foilPrereleaseMarkerTok,
        );
      }
    }

    // Card valid by name but couldn't resolve printing — succeed with name only
    const qtyStr = quantityTok.value.replace(/x$/i, "");
    const quantity = parseInt(qtyStr, 10) || 1;
    const oracleId = display.oracle_ids[faceIdx] ?? "";
    const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
    return {
      line: { lineIndex, lineStart, lineEnd, kind: "ok" },
      entry: {
        oracle_id: oracleId,
        scryfall_id: null,
        quantity,
        finish: finish ?? undefined,
        variant: variantValue,
      },
      oracleIndex: faceIdx,
      scryfallIndex: -1,
    };
  }

  // Name unknown — try set+collector to offer Case 3 quick fix
  if (collectorNum) {
    const dropNameChildrenNc: ASTNode[] = [setField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropNameResultNc = cache.evaluate(andNode(dropNameChildrenNc));
    const dnpNc = filterPrintingIndicesByExactCollector(
      dropNameResultNc.printingIndices,
      collectorNum,
      _printingIndex,
    );
    if (dnpNc.length > 0) {
      let pi = dnpNc[0]!;
      if (dnpNc.length > 1) {
        const wantFoil = preferFoil ? 1 : 0;
        const match = Array.from(dnpNc).find((idx) => printingDisplay.finish[idx] === wantFoil);
        if (match !== undefined) pi = match;
      }
      const printingCanonicalFace = printingDisplay.canonical_face_ref[pi]!;
      const correctName = getDisplayNameForCanonicalFace(printingCanonicalFace, display);
      if (correctName) {
        const replacement = line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end);
        return {
          line: {
            lineIndex, lineStart, lineEnd, kind: "error",
            span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
            message: `Card name not recognized; set+collector point to "${correctName}"`,
            quickFixes: [{ label: `Use "${correctName}"`, replacement: replacement.trimEnd() }],
          },
          oracleIndex: -1,
          scryfallIndex: -1,
        };
      }
    }
  }

  // § 3g: Approximate match — auto-resolve with warning (Spec 114)
  const approx = tryApproximateNameMatch(nameTok.value, _cardIndex, display);
  if (approx) {
    const { canonicalFace, displayName } = approx;
    const oracleId = display.oracle_ids[canonicalFace] ?? "";
    let scryfallIdx = -1;
    const pi = findAnyPrintingInSetEngine(
      setCodeForLookup,
      canonicalFace,
      printingDisplay,
      preferFoil,
    );
    if (pi >= 0) scryfallIdx = pi;
    const scryfallId = scryfallIdx >= 0 ? printingDisplay.scryfall_ids[scryfallIdx] ?? null : null;
    const qtyStr = quantityTok.value.replace(/x$/i, "");
    const quantity = parseInt(qtyStr, 10) || 1;
    const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
    return {
      line: {
        lineIndex, lineStart, lineEnd, kind: "warning",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: `Name resolved to "${displayName}"`,
      },
      entry: {
        oracle_id: oracleId,
        scryfall_id: scryfallId,
        quantity,
        finish: finish ?? undefined,
        variant: variantValue,
      },
      oracleIndex: canonicalFace,
      scryfallIndex: scryfallIdx,
    };
  }

  return {
    line: {
      lineIndex, lineStart, lineEnd, kind: "error",
      span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
      message: `Unknown card — "${nameTok.value}"`,
    },
    oracleIndex: -1,
    scryfallIndex: -1,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccess(
  printingRow: number,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns,
  quantityTok: ListToken,
  finish: "foil" | "etched" | null,
  lineIndex: number,
  lineStart: number,
  lineEnd: number,
  variantTok: ListToken | undefined,
  foilPrereleaseMarkerTok: ListToken | undefined,
): { line: LineValidation; entry: ParsedEntry; oracleIndex: number; scryfallIndex: number } {
  const canonicalFace = printingDisplay.canonical_face_ref[printingRow]!;
  const oracleId = display.oracle_ids[canonicalFace] ?? "";
  const scryfallId = printingDisplay.scryfall_ids[printingRow] ?? null;
  const qtyStr = quantityTok.value.replace(/x$/i, "");
  const quantity = parseInt(qtyStr, 10) || 1;
  const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
  return {
    line: { lineIndex, lineStart, lineEnd, kind: "ok" },
    entry: {
      oracle_id: oracleId,
      scryfall_id: scryfallId,
      quantity,
      finish: finish ?? undefined,
      variant: variantValue,
    },
    oracleIndex: canonicalFace,
    scryfallIndex: printingRow,
  };
}

function findAnyPrintingInSetEngine(
  setCode: string,
  canonicalFace: number,
  printing: PrintingDisplayColumns,
  preferFoil: boolean,
): number {
  const setLower = setCode.toLowerCase();
  let first = -1;
  for (let i = 0; i < printing.set_codes.length; i++) {
    if (printing.set_codes[i]!.toLowerCase() !== setLower) continue;
    if (printing.canonical_face_ref[i] !== canonicalFace) continue;
    if (first < 0) first = i;
    if (preferFoil && printing.finish[i] === 1) return i;
  }
  return first;
}

function advanceOffset(
  text: string,
  lineEnd: number,
  lineIndex: number,
  totalLines: number,
): number {
  let offset = lineEnd + (lineIndex < totalLines - 1 ? 1 : 0);
  if (lineIndex < totalLines - 1 && offset < text.length) {
    if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
    else if (text[offset] === "\n") offset += 1;
  }
  return offset;
}
