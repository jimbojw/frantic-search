// SPDX-License-Identifier: Apache-2.0
import { PrintingFlag, PROMO_TYPE_FLAGS } from "./bits";
import { computeCombinedNames } from "./search/combined-names";
import { lexDeckList, ListTokenType } from "./list-lexer";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

export type { LineValidation, ListValidationResult } from "./list-lexer";

export interface ParsedEntry {
  oracle_id: string;
  scryfall_id: string | null;
  quantity: number;
  finish?: "foil" | "etched" | null;
  variant?: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCardByName(
  name: string,
  display: DisplayColumns,
  combinedNames: string[]
): { faceIndex: number; oracleId: string; canonicalFace: number; resolvedViaAlternateName?: boolean } | null {
  const normalized = normalize(name);
  if (!normalized) return null;

  const names = display.names;
  for (let i = 0; i < names.length; i++) {
    const faceName = normalize(names[i]!);
    const combinedName = normalize(combinedNames[i]!);
    if (faceName === normalized || combinedName === normalized) {
      const oracleId = display.oracle_ids[i] ?? "";
      const canonicalFace = display.canonical_face[i] ?? i;
      return { faceIndex: i, oracleId, canonicalFace };
    }
  }

  // Fallback: alternate names (Spec 111)
  const altIndex = display.alternate_name_to_canonical_face;
  if (altIndex) {
    const altNormalized = normalized.replace(/[^a-z0-9]/g, "");
    const canonicalFace = altIndex[altNormalized];
    if (canonicalFace !== undefined) {
      // Find the face row and oracle_id for this canonical face
      for (let i = 0; i < display.canonical_face.length; i++) {
        if (display.canonical_face[i] === canonicalFace) {
          return {
            faceIndex: i,
            oracleId: display.oracle_ids[i] ?? "",
            canonicalFace,
            resolvedViaAlternateName: true,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Resolve card by canonical face (from printing) and verify name matches.
 * Used for printing-first resolution when set+collector are present.
 */
function findCardByCanonicalFace(
  canonicalFace: number,
  name: string,
  display: DisplayColumns,
  combinedNames: string[]
): { oracleId: string; canonicalFace: number } | null {
  const normalized = normalize(name);
  if (!normalized) return null;

  const names = display.names;
  for (let i = 0; i < names.length; i++) {
    if ((display.canonical_face[i] ?? i) !== canonicalFace) continue;
    const faceName = normalize(names[i]!);
    const combinedName = normalize(combinedNames[i]!);
    if (faceName === normalized || combinedName === normalized) {
      const oracleId = display.oracle_ids[i] ?? "";
      return { oracleId, canonicalFace };
    }
  }

  // Fallback: alternate names (Spec 111)
  const altIndex = display.alternate_name_to_canonical_face;
  if (altIndex) {
    const altNormalized = normalized.replace(/[^a-z0-9]/g, "");
    if (altIndex[altNormalized] === canonicalFace) {
      for (let i = 0; i < display.canonical_face.length; i++) {
        if (display.canonical_face[i] === canonicalFace) {
          return {
            oracleId: display.oracle_ids[i] ?? "",
            canonicalFace,
          };
        }
      }
    }
  }

  return null;
}

function findPrintingRow(
  setCode: string,
  collectorNumber: string,
  printing: PrintingDisplayColumns
): number {
  const setLower = setCode.toLowerCase();
  for (let i = 0; i < printing.set_codes.length; i++) {
    if (
      printing.set_codes[i]!.toLowerCase() === setLower &&
      printing.collector_numbers[i] === collectorNumber
    ) {
      return i;
    }
  }
  return -1;
}

/** MTGGoldfish variant string → printing_flags bit or promo_types lookup. */
function variantToFlags(variant: string): { printingFlag?: number; promoCol?: 0 | 1; promoBit?: number } | null {
  const v = variant.toLowerCase().trim();
  // "SetName - variant" format: use the part after " - "
  const dashIdx = v.indexOf(" - ");
  const flagPart = dashIdx >= 0 ? v.slice(dashIdx + 3) : v;
  switch (flagPart) {
    case "extended":
      return { printingFlag: PrintingFlag.ExtendedArt };
    case "borderless":
      return { printingFlag: PrintingFlag.Borderless };
    case "showcase":
      return { printingFlag: PrintingFlag.Showcase };
    case "prerelease": {
      const e = PROMO_TYPE_FLAGS.prerelease;
      return e ? { promoCol: e.column, promoBit: e.bit } : null;
    }
    case "buy-a-box":
    case "buyabox": {
      const e = PROMO_TYPE_FLAGS.buyabox;
      return e ? { promoCol: e.column, promoBit: e.bit } : null;
    }
    case "brawl_deck":
    case "brawldeck": {
      const e = PROMO_TYPE_FLAGS.brawldeck;
      return e ? { promoCol: e.column, promoBit: e.bit } : null;
    }
    case "pw_deck":
    case "planeswalkerdeck": {
      const e = PROMO_TYPE_FLAGS.planeswalkerdeck;
      return e ? { promoCol: e.column, promoBit: e.bit } : null;
    }
    case "stamped":
    case "planeswalker stamp": {
      const e = PROMO_TYPE_FLAGS.stamped;
      return e ? { promoCol: e.column, promoBit: e.bit } : null;
    }
    default:
      return null;
  }
}

/** Canonical MTGGoldfish variation strings (lowercased, after "SetName - " stripping). */
const KNOWN_GOLDFISH_VARIANTS = new Set([
  "showcase", "extended", "borderless", "japanese",
  "planeswalker stamp", "precon", "prerelease",
  "pw_deck", "brawl_deck", "buy-a-box",
  "promo pack", "bundle", "sealed", "timeshifted",
]);

function isKnownGoldfishVariant(variant: string): boolean {
  const v = variant.toLowerCase().trim();
  const dashIdx = v.indexOf(" - ");
  const flagPart = dashIdx >= 0 ? v.slice(dashIdx + 3) : v;
  return KNOWN_GOLDFISH_VARIANTS.has(flagPart);
}

function isNumericCollectorNumber(v: string): boolean {
  return /^\d+[a-zA-Z]*$/.test(v.trim());
}

function findPrintingBySetAndVariant(
  setCode: string,
  variant: string,
  canonicalFace: number,
  printing: PrintingDisplayColumns,
  preferFoil: boolean
): number {
  const setLower = setCode.toLowerCase();
  const flags = variantToFlags(variant);
  if (!flags) return -1;
  const pf = printing.printing_flags ?? [];
  const pt0 = printing.promo_types_flags_0 ?? [];
  const pt1 = printing.promo_types_flags_1 ?? [];

  let candidates: number[] = [];
  for (let i = 0; i < printing.set_codes.length; i++) {
    if (printing.set_codes[i]!.toLowerCase() !== setLower) continue;
    if (printing.canonical_face_ref[i] !== canonicalFace) continue;

    if (flags.printingFlag) {
      if ((pf[i] ?? 0) & flags.printingFlag) candidates.push(i);
    } else if (flags.promoCol !== undefined && flags.promoBit !== undefined) {
      const bit = 1 << flags.promoBit;
      const col = flags.promoCol === 0 ? (pt0[i] ?? 0) : (pt1[i] ?? 0);
      if (col & bit) candidates.push(i);
    }
  }

  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0]!;

  if (preferFoil) {
    const foil = candidates.find((i) => printing.finish[i] === 1);
    if (foil !== undefined) return foil;
  }
  return candidates[0]!;
}

function findAnyPrintingInSet(
  setCode: string,
  canonicalFace: number,
  printing: PrintingDisplayColumns,
  preferFoil: boolean
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

export function validateDeckList(
  text: string,
  display: DisplayColumns | null,
  printingDisplay: PrintingDisplayColumns | null
): { lines: import("./list-lexer").LineValidation[]; resolved?: ParsedEntry[] } {
  const lines: import("./list-lexer").LineValidation[] = [];
  const resolved: ParsedEntry[] = [];

  if (!display) {
    return { lines };
  }

  const combinedNames = computeCombinedNames(display.names, display.canonical_face);
  const lineStrings = text.split(/\r?\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex++) {
    const line = lineStrings[lineIndex]!;
    const lineStart = offset;
    const lineEnd = offset + line.length;

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

    if (tokens.some((t) => t.type === ListTokenType.COMMENT)) {
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "ok",
      });
      offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
      if (lineIndex < lineStrings.length - 1 && offset < text.length) {
        if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
        else if (text[offset] === "\n") offset += 1;
      }
      continue;
    }

    if (quantityTok && !nameTok) {
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "error",
        span: { start: lineStart, end: lineEnd },
        message: "Missing card name",
      });
      offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
      if (lineIndex < lineStrings.length - 1 && offset < text.length) {
        if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
        else if (text[offset] === "\n") offset += 1;
      }
      continue;
    }

    if (!quantityTok || !nameTok) {
      offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
      if (lineIndex < lineStrings.length - 1 && offset < text.length) {
        if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
        else if (text[offset] === "\n") offset += 1;
      }
      continue;
    }

    let card = findCardByName(nameTok.value, display, combinedNames);
    if (!card) {
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "error",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: "Unknown card",
      });
      offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
      if (lineIndex < lineStrings.length - 1 && offset < text.length) {
        if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
        else if (text[offset] === "\n") offset += 1;
      }
      continue;
    }

    let scryfallId: string | null = null;
    let hasPrintingError = false;
    let errorSpan: { start: number; end: number } | undefined;
    let errorMessage: string | undefined;
    let hasVariantWarning = false;
    let warningSpan: { start: number; end: number } | undefined;
    let warningMessage: string | undefined;
    const preferFoil = !!(foilParenTok || foilMarkerTok);
    let finish: "foil" | "etched" | null = null;
    if (etchedMarkerTok || etchedParenTok) finish = "etched";
    else if (foilParenTok || foilMarkerTok) finish = "foil";

    if (setTok && printingDisplay) {
      const setCode = setTok.value;
      const setCodes = printingDisplay.set_codes;
      const setLower = setCode.toLowerCase();
      const setExists = setCodes.some((s) => s.toLowerCase() === setLower);
      if (!setExists) {
        hasPrintingError = true;
        errorSpan = { start: lineStart + setTok.start, end: lineStart + setTok.end };
        errorMessage = "Unknown set";
      } else if (variantTok && setTok.type === ListTokenType.SET_CODE_BRACKET) {
        const variant = variantTok.value;
        if (isNumericCollectorNumber(variant)) {
          const pi = findPrintingRow(setCode, variant, printingDisplay);
          if (pi < 0) {
            hasPrintingError = true;
            errorSpan = { start: lineStart + variantTok.start, end: lineStart + variantTok.end };
            errorMessage = "Collector number doesn't match";
          } else {
            const printingCanonicalFace = printingDisplay.canonical_face_ref[pi];
            const printingCard = findCardByCanonicalFace(
              printingCanonicalFace,
              nameTok.value,
              display,
              combinedNames
            );
            if (!printingCard) {
              hasPrintingError = true;
              errorSpan = { start: lineStart + nameTok.start, end: lineStart + nameTok.end };
              errorMessage = "Card name doesn't match printing";
            } else {
              card = { ...card, oracleId: printingCard.oracleId, canonicalFace: printingCard.canonicalFace };
              scryfallId = printingDisplay.scryfall_ids[pi] ?? null;
            }
          }
        } else {
          const pi = findPrintingBySetAndVariant(
            setCode,
            variant,
            card.canonicalFace,
            printingDisplay,
            preferFoil
          );
          if (pi >= 0) {
            scryfallId = printingDisplay.scryfall_ids[pi] ?? null;
          } else if (isKnownGoldfishVariant(variant)) {
            const fallbackPi = findAnyPrintingInSet(
              setCode, card.canonicalFace, printingDisplay, preferFoil
            );
            if (fallbackPi >= 0) {
              scryfallId = printingDisplay.scryfall_ids[fallbackPi] ?? null;
              hasVariantWarning = true;
              warningSpan = { start: lineStart + variantTok.start, end: lineStart + variantTok.end };
              warningMessage = "Variant resolved approximately";
            } else {
              hasPrintingError = true;
              errorSpan = { start: lineStart + variantTok.start, end: lineStart + variantTok.end };
              errorMessage = "No matching printing";
            }
          } else {
            hasPrintingError = true;
            errorSpan = { start: lineStart + variantTok.start, end: lineStart + variantTok.end };
            errorMessage = "No matching printing";
          }
        }
      } else if (collectorTok) {
        const collectorNumber = collectorTok.value;
        const pi = findPrintingRow(setCode, collectorNumber, printingDisplay);
        if (pi < 0) {
          hasPrintingError = true;
          errorSpan = { start: lineStart + collectorTok.start, end: lineStart + collectorTok.end };
          errorMessage = "Collector number doesn't match";
        } else {
          const printingCanonicalFace = printingDisplay.canonical_face_ref[pi];
          const printingCard = findCardByCanonicalFace(
            printingCanonicalFace,
            nameTok.value,
            display,
            combinedNames
          );
          if (!printingCard) {
            hasPrintingError = true;
            errorSpan = { start: lineStart + nameTok.start, end: lineStart + nameTok.end };
            errorMessage = "Card name doesn't match printing";
          } else {
            card = { ...card, oracleId: printingCard.oracleId, canonicalFace: printingCard.canonicalFace };
            scryfallId = printingDisplay.scryfall_ids[pi] ?? null;
          }
        }
      }
    }

    // Preferred printing for alternate-name resolution (Spec 111)
    if (!scryfallId && !hasPrintingError && card.resolvedViaAlternateName && printingDisplay) {
      const altPrintIndex = printingDisplay.alternate_name_to_printing_indices;
      if (altPrintIndex) {
        const altNorm = normalize(nameTok.value).replace(/[^a-z0-9]/g, "");
        const pis = altPrintIndex[altNorm];
        if (pis && pis.length > 0) {
          scryfallId = printingDisplay.scryfall_ids[pis[0]] ?? null;
        }
      }
    }

    if (hasPrintingError && errorSpan && errorMessage) {
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "error",
        span: errorSpan,
        message: errorMessage,
      });
    } else {
      const qtyStr = quantityTok.value.replace(/x$/i, "");
      const quantity = parseInt(qtyStr, 10) || 1;
      if (hasVariantWarning && warningSpan && warningMessage) {
        lines.push({
          lineIndex,
          lineStart,
          lineEnd,
          kind: "warning",
          span: warningSpan,
          message: warningMessage,
        });
      } else {
        lines.push({
          lineIndex,
          lineStart,
          lineEnd,
          kind: "ok",
        });
      }
      resolved.push({
        oracle_id: card.oracleId,
        scryfall_id: scryfallId,
        quantity,
        finish: finish ?? undefined,
        variant: variantTok?.value,
      });
    }

    offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
    if (lineIndex < lineStrings.length - 1 && offset < text.length) {
      if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
      else if (text[offset] === "\n") offset += 1;
    }
  }

  return { lines, resolved };
}
