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
}

const lineResultCache = new Map<string, CachedLineResult>();

function toCacheable(
  line: LineValidation,
  entry: ParsedEntry | undefined,
  lineStart: number,
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

export function validateDeckListWithEngine(
  text: string,
  cardIndex: CardIndex,
  printingIndex: PrintingIndex | null,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  cache: NodeCache,
): ValidationResult {
  const lines: LineValidation[] = [];
  const resolved: ParsedEntry[] = [];

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
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    if (!quantityTok || !nameTok) {
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    let finish: "foil" | "etched" | null = null;
    if (etchedMarkerTok || etchedParenTok) finish = "etched";
    else if (foilParenTok || foilMarkerTok || foilPrereleaseMarkerTok) finish = "foil";

    const preferFoil = !!(foilParenTok || foilMarkerTok || foilPrereleaseMarkerTok);

    const setCode = setTok?.value;
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
      lineResultCache.set(cacheKey, toCacheable(result.line, result.entry, lineStart));
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // Check set existence
    if (!printingIndex!.knownSetCodes.has(setCode.toLowerCase())) {
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
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // Known-but-unresolvable variant fallback (prerelease, promo pack, etc.)
    if (variantFallbackMode === "known") {
      const nameResult = cache.evaluate(exactNode(nameTok.value));
      if (nameResult.indices.length === 0) {
        const lineResult = {
          lineIndex, lineStart, lineEnd, kind: "error" as const,
          span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
          message: `Unknown card — "${nameTok.value}"`,
        };
        lines.push(lineResult);
        lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
        offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
        continue;
      }
      const canonicalFace = display.canonical_face[nameResult.indices[0]!] ?? nameResult.indices[0]!;
      const fallbackPi = findAnyPrintingInSetEngine(
        setCode, canonicalFace, printingDisplay!, preferFoil,
      );
      const variantMarkerTok = variantTok ?? foilPrereleaseMarkerTok;
      if (fallbackPi >= 0) {
        const scryfallId = printingDisplay!.scryfall_ids[fallbackPi] ?? null;
        const qtyStr = quantityTok.value.replace(/x$/i, "");
        const quantity = parseInt(qtyStr, 10) || 1;
        const variantValue = variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
        const entry: ParsedEntry = {
          oracle_id: display.oracle_ids[nameResult.indices[0]!] ?? "",
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
        lineResultCache.set(cacheKey, toCacheable(lineResult, entry, lineStart));
      } else {
        const lineResult = {
          lineIndex, lineStart, lineEnd, kind: "error" as const,
          span: { start: lineStart + variantMarkerTok!.start, end: lineStart + variantMarkerTok!.end },
          message: "No matching printing",
        };
        lines.push(lineResult);
        lineResultCache.set(cacheKey, toCacheable(lineResult, undefined, lineStart));
      }
      offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
      continue;
    }

    // § 3a–3d: Cascading resolution
    const cascadeResult = resolveCascade(
      nameTok, setCode, collectorNum, finish, finishNodes, variantIsNodes,
      cardIndex, printingIndex!, cache, display, printingDisplay!,
      line, lineIndex, lineStart, lineEnd,
      quantityTok, setTok!, collectorTok, variantTok, isVariantCollector,
      foilParenTok, foilMarkerTok, etchedMarkerTok, etchedParenTok,
      foilPrereleaseMarkerTok, alterMarkerTok, preferFoil,
    );
    lines.push(cascadeResult.line);
    if (cascadeResult.entry) resolved.push(cascadeResult.entry);
    lineResultCache.set(cacheKey, toCacheable(cascadeResult.line, cascadeResult.entry, lineStart));

    offset = advanceOffset(text, lineEnd, lineIndex, lineStrings.length);
  }

  return { lines, resolved };
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
): { result: LineValidationResult[]; resolved: (ParsedEntry | null)[] } {
  if (lines.length === 0) return { result: [], resolved: [] };

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
  const resolved: (ParsedEntry | null)[] = new Array(lines.length).fill(null);
  let resolvedIdx = 0;

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
    } else if (l.kind === "ok" && fullResult.resolved && resolvedIdx < fullResult.resolved.length) {
      resolved[l.lineIndex] = fullResult.resolved[resolvedIdx]!;
      resolvedIdx++;
    }
  }

  return { result, resolved };
}

// ---------------------------------------------------------------------------
// Name-only resolution (§ 3e + § 3g approximate match)
// ---------------------------------------------------------------------------

function resolveNameOnly(
  nameTok: ListToken,
  cardIndex: CardIndex,
  cache: NodeCache,
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  quantityTok: ListToken,
  finish: "foil" | "etched" | null,
  lineIndex: number,
  lineStart: number,
  lineEnd: number,
  variantTok: ListToken | undefined,
  foilPrereleaseMarkerTok: ListToken | undefined,
): { line: LineValidation; entry?: ParsedEntry } {
  const evalResult = cache.evaluate(exactNode(nameTok.value));

  if (evalResult.indices.length > 0) {
    const faceIdx = evalResult.indices[0]!;
    const oracleId = display.oracle_ids[faceIdx] ?? "";
    let scryfallId: string | null = null;

    if (printingDisplay?.alternate_name_to_printing_indices) {
      const altNorm = nameTok.value.toLowerCase().replace(/\s+/g, " ").trim().replace(/[^a-z0-9]/g, "");
      const pis = printingDisplay.alternate_name_to_printing_indices[altNorm];
      if (pis && pis.length > 0) {
        scryfallId = printingDisplay.scryfall_ids[pis[0]!] ?? null;
      }
    }

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
    };
  }

  // § 3g: Approximate name match
  const approxName = tryApproximateNameMatch(nameTok.value, cardIndex, display);
  if (approxName) {
    return {
      line: {
        lineIndex, lineStart, lineEnd, kind: "error",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: `Unknown card — "${nameTok.value}"`,
        quickFixes: [{ label: `Use "${approxName}"`, replacement: `${quantityTok.value} ${approxName}` }],
      },
    };
  }

  return {
    line: {
      lineIndex, lineStart, lineEnd, kind: "error",
      span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
      message: `Unknown card — "${nameTok.value}"`,
    },
  };
}

// ---------------------------------------------------------------------------
// § 3g: Approximate name match (punctuation/whitespace normalization)
// ---------------------------------------------------------------------------

function tryApproximateNameMatch(
  inputName: string,
  cardIndex: CardIndex,
  display: DisplayColumns,
): string | null {
  const normalized = inputName.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    return getDisplayNameForCanonicalFace(bestFace, display) ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cascade resolution (§ 3a–3d)
// ---------------------------------------------------------------------------

function resolveCascade(
  nameTok: ListToken,
  setCode: string,
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
): { line: LineValidation; entry?: ParsedEntry } {
  const nameExact = exactNode(nameTok.value);
  const setField = fieldNode("set", setCode.toLowerCase());
  const collectorField = collectorNum ? fieldNode("cn", collectorNum) : null;
  const uniquePrints = fieldNode("unique", "prints");
  const effectiveCollectorTok = isVariantCollector ? variantTok : collectorTok;

  // § 3a: Full match (name + set + cn + finish + variant)
  if (collectorField) {
    const fullChildren: ASTNode[] = [nameExact, setField, collectorField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const fullResult = cache.evaluate(andNode(fullChildren));
    if (fullResult.printingIndices && fullResult.printingIndices.length > 0) {
      const pi = fullResult.printingIndices[0]!;
      return makeSuccess(
        pi, display, printingDisplay, quantityTok, finish,
        lineIndex, lineStart, lineEnd, variantTok, foilPrereleaseMarkerTok,
      );
    }

    // § 3b: Drop collector number
    const dropCnChildren: ASTNode[] = [nameExact, setField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropCnResult = cache.evaluate(andNode(dropCnChildren));
    if (dropCnResult.printingIndices && dropCnResult.printingIndices.length > 0) {
      const quickFixes = Array.from(dropCnResult.printingIndices).map((rowIdx) => {
        const cn = printingDisplay.collector_numbers[rowIdx]!;
        const variantLabel = variantLabelForPrinting(printingDisplay, rowIdx);
        const tok = effectiveCollectorTok!;
        const replacement = line.slice(0, tok.start) + cn + line.slice(tok.end);
        return { label: `Use ${cn}${variantLabel}`, replacement: replacement.trimEnd() };
      });
      return {
        line: {
          lineIndex, lineStart, lineEnd, kind: "error",
          span: { start: lineStart + effectiveCollectorTok!.start, end: lineStart + effectiveCollectorTok!.end },
          message: `Collector number doesn't match — \`${collectorNum}\` in \`${setCode}\``,
          ...(quickFixes.length > 0 ? { quickFixes } : {}),
        },
      };
    }

    // § 3c: Drop name
    const dropNameChildren: ASTNode[] = [setField, collectorField, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropNameResult = cache.evaluate(andNode(dropNameChildren));
    if (dropNameResult.printingIndices && dropNameResult.printingIndices.length > 0) {
      const pi = dropNameResult.printingIndices[0]!;
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
            message: `Card name "${nameTok.value}" doesn't match \`${setCode}\` collector number \`${collectorNum}\``,
            quickFixes: [
              { label: "Remove set/collector, use name only", replacement: removeSetReplacement.trimEnd() },
              { label: `Use "${correctName}"`, replacement: (line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end)).trimEnd() },
            ],
          },
        };
      }
    }
  }

  // § 3d: Name only — card exists but set combo failed
  const nameResult = cache.evaluate(nameExact);
  if (nameResult.indices.length > 0) {
    const faceIdx = nameResult.indices[0]!;
    const canonicalFace = display.canonical_face[faceIdx] ?? faceIdx;

    if (!collectorField) {
      // Set present but no collector (TappedOut format)
      const fallbackPi = findAnyPrintingInSetEngine(
        setCode, canonicalFace, printingDisplay, preferFoil,
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
    };
  }

  // Name unknown — try set+collector to offer Case 3 quick fix
  if (collectorField) {
    const dropNameChildren: ASTNode[] = [setField, collectorField!, ...finishNodes, ...variantIsNodes, uniquePrints];
    const dropNameResult = cache.evaluate(andNode(dropNameChildren));
    if (dropNameResult.printingIndices && dropNameResult.printingIndices.length > 0) {
      const pi = dropNameResult.printingIndices[0]!;
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
        };
      }
    }
  }

  // § 3g: Approximate match
  const approxName = tryApproximateNameMatch(nameTok.value, _cardIndex, display);
  if (approxName) {
    return {
      line: {
        lineIndex, lineStart, lineEnd, kind: "error",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: `Unknown card — "${nameTok.value}"`,
        quickFixes: [{ label: `Use "${approxName}"`, replacement: (line.slice(0, nameTok.start) + approxName + line.slice(nameTok.end)).trimEnd() }],
      },
    };
  }

  return {
    line: {
      lineIndex, lineStart, lineEnd, kind: "error",
      span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
      message: `Unknown card — "${nameTok.value}"`,
    },
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
): { line: LineValidation; entry: ParsedEntry } {
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
