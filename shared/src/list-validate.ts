// SPDX-License-Identifier: Apache-2.0
import { PrintingFlag, PROMO_TYPE_FLAGS } from "./bits";
import { computeCombinedNames } from "./search/combined-names";
import { lexDeckList, ListTokenType } from "./list-lexer";
import type { ListToken } from "./list-lexer";
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

/** Normalize user input for name match; treats Moxfield " / " as equivalent to " // ". */
function normalizeForNameMatch(s: string): string {
  return normalize(s).replace(/ \/ /g, " // ");
}

function findCardByName(
  name: string,
  display: DisplayColumns,
  combinedNames: string[]
): { faceIndex: number; oracleId: string; canonicalFace: number; resolvedViaAlternateName?: boolean } | null {
  const normalized = normalizeForNameMatch(name);
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
  const normalized = normalizeForNameMatch(name);
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

/** Get the primary display name for a canonical face (first face with that canonical_face). */
function getDisplayNameForCanonicalFace(
  canonicalFace: number,
  display: DisplayColumns
): string | undefined {
  for (let i = 0; i < display.canonical_face.length; i++) {
    if ((display.canonical_face[i] ?? i) === canonicalFace) {
      return display.names[i];
    }
  }
  return undefined;
}

/**
 * Reconstruct the line without set/collector (or variant+set for MTGGoldfish).
 * Preserves quantity, name, foil markers, tags, etc. Returns line without trailing newline.
 */
function reconstructLineWithoutSet(
  line: string,
  setTok: ListToken | undefined,
  collectorTok: ListToken | undefined,
  variantTok?: ListToken,
  setCodeBracketTok?: ListToken
): string {
  const tokensToRemove: ListToken[] = [];
  if (variantTok && setCodeBracketTok) {
    tokensToRemove.push(variantTok, setCodeBracketTok);
  } else if (setTok) {
    tokensToRemove.push(setTok);
    if (collectorTok) tokensToRemove.push(collectorTok);
  }
  if (tokensToRemove.length === 0) return line.trimEnd();

  const minStart = Math.min(...tokensToRemove.map((t) => t.start));
  const maxEnd = Math.max(...tokensToRemove.map((t) => t.end));

  let start = minStart;
  let end = maxEnd;
  while (start > 0 && /[\s(\[<]/.test(line[start - 1]!)) start--;
  while (end < line.length && /[\s):\]>]/.test(line[end]!)) end++;

  return (line.slice(0, start) + line.slice(end)).trimEnd();
}

/** Human-readable variant label from printing flags (e.g. "extended art", "borderless"). */
function variantLabelForPrinting(
  printing: PrintingDisplayColumns,
  rowIndex: number
): string {
  const pf = printing.printing_flags ?? [];
  const pt0 = printing.promo_types_flags_0 ?? [];
  const pt1 = printing.promo_types_flags_1 ?? [];
  const flags = pf[rowIndex] ?? 0;
  const promo0 = pt0[rowIndex] ?? 0;
  const promo1 = pt1[rowIndex] ?? 0;

  const labels: string[] = [];
  if (flags & PrintingFlag.ExtendedArt) labels.push("extended art");
  if (flags & PrintingFlag.Borderless) labels.push("borderless");
  if (flags & PrintingFlag.Showcase) labels.push("showcase");
  if (flags & PrintingFlag.FullArt) labels.push("full art");
  const prerelease = PROMO_TYPE_FLAGS.prerelease;
  if (prerelease && ((prerelease.column === 0 ? promo0 : promo1) & (1 << prerelease.bit))) {
    labels.push("prerelease");
  }
  return labels.length > 0 ? ` (${labels[0]})` : "";
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

/** All printing row indices for a card in a set (for Case 1 quick fixes). */
function findPrintingsInSet(
  setCode: string,
  canonicalFace: number,
  printing: PrintingDisplayColumns
): number[] {
  const setLower = setCode.toLowerCase();
  const rows: number[] = [];
  for (let i = 0; i < printing.set_codes.length; i++) {
    if (
      printing.set_codes[i]!.toLowerCase() === setLower &&
      printing.canonical_face_ref[i] === canonicalFace
    ) {
      rows.push(i);
    }
  }
  return rows;
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
    const foilPrereleaseMarkerTok = tokens.find(
      (t) => t.type === ListTokenType.FOIL_PRERELEASE_MARKER
    );

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
      // Case 3: Card name not recognized, but set+collector may point to a known printing
      const setTokForCase3 =
        tokens.find((t) => t.type === ListTokenType.SET_CODE) ??
        tokens.find((t) => t.type === ListTokenType.SET_CODE_BRACKET);
      const collectorTokForCase3 = tokens.find((t) => t.type === ListTokenType.COLLECTOR_NUMBER);
      const variantTokForCase3 = tokens.find((t) => t.type === ListTokenType.VARIANT);
      const collectorOrVariant =
        collectorTokForCase3?.value ?? (variantTokForCase3 && isNumericCollectorNumber(variantTokForCase3.value) ? variantTokForCase3.value : null);
      if (
        setTokForCase3 &&
        collectorOrVariant &&
        printingDisplay
      ) {
        const pi = findPrintingRow(setTokForCase3.value, collectorOrVariant, printingDisplay);
        if (pi >= 0) {
          const printingCanonicalFace = printingDisplay.canonical_face_ref[pi];
          const correctName = getDisplayNameForCanonicalFace(printingCanonicalFace, display);
          if (correctName) {
            const replacement = line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end);
            lines.push({
              lineIndex,
              lineStart,
              lineEnd,
              kind: "error",
              span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
              message: `Card name not recognized; set+collector point to "${correctName}"`,
              quickFixes: [{ label: `Use "${correctName}"`, replacement: replacement.trimEnd() }],
            });
            offset = lineEnd + (lineIndex < lineStrings.length - 1 ? 1 : 0);
            if (lineIndex < lineStrings.length - 1 && offset < text.length) {
              if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
              else if (text[offset] === "\n") offset += 1;
            }
            continue;
          }
        }
      }
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "error",
        span: { start: lineStart + nameTok.start, end: lineStart + nameTok.end },
        message: `Unknown card — "${nameTok.value}"`,
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
    let errorQuickFixes: { label: string; replacement: string }[] | undefined;
    let hasVariantWarning = false;
    let warningSpan: { start: number; end: number } | undefined;
    let warningMessage: string | undefined;
    const preferFoil = !!(
      foilParenTok ||
      foilMarkerTok ||
      foilPrereleaseMarkerTok
    );
    let finish: "foil" | "etched" | null = null;
    if (etchedMarkerTok || etchedParenTok) finish = "etched";
    else if (foilParenTok || foilMarkerTok || foilPrereleaseMarkerTok) finish = "foil";

    if (setTok && printingDisplay) {
      const setCode = setTok.value;
      const setCodes = printingDisplay.set_codes;
      const setLower = setCode.toLowerCase();
      const setExists = setCodes.some((s) => s.toLowerCase() === setLower);
      if (!setExists) {
        hasPrintingError = true;
        errorSpan = { start: lineStart + setTok.start, end: lineStart + setTok.end };
        errorMessage = `Unknown set — \`${setCode}\``;
        const removeSetReplacement = reconstructLineWithoutSet(
          line,
          setTok,
          collectorTok ?? undefined,
          setTok.type === ListTokenType.SET_CODE_BRACKET ? variantTok : undefined,
          setTok.type === ListTokenType.SET_CODE_BRACKET ? setTok : undefined
        );
        if (removeSetReplacement) {
          errorQuickFixes = [
            { label: "Remove set/collector, use name only", replacement: removeSetReplacement },
          ];
        }
      } else if (variantTok && setTok.type === ListTokenType.SET_CODE_BRACKET) {
        const variant = variantTok.value;
        if (isNumericCollectorNumber(variant)) {
          const pi = findPrintingRow(setCode, variant, printingDisplay);
          if (pi < 0) {
            hasPrintingError = true;
            errorSpan = { start: lineStart + variantTok.start, end: lineStart + variantTok.end };
            errorMessage = `Collector number doesn't match — \`${variant}\` in \`${setCode}\``;
            const printingsInSet = findPrintingsInSet(setCode, card.canonicalFace, printingDisplay);
            if (printingsInSet.length > 0) {
              errorQuickFixes = printingsInSet.map((rowIdx) => {
                const cn = printingDisplay.collector_numbers[rowIdx]!;
                const variantLabel = variantLabelForPrinting(printingDisplay, rowIdx);
                const replacement = line.slice(0, variantTok.start) + cn + line.slice(variantTok.end);
                return { label: `Use ${cn}${variantLabel}`, replacement: replacement.trimEnd() };
              });
            }
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
              errorMessage = `Card name "${nameTok.value}" doesn't match \`${setCode}\` collector number \`${variant}\``;
              const correctName = getDisplayNameForCanonicalFace(printingCanonicalFace, display);
              if (correctName) {
                errorQuickFixes = [
                  {
                    label: "Remove set/collector, use name only",
                    replacement: reconstructLineWithoutSet(line, setTok, undefined, variantTok, setTok).trimEnd(),
                  },
                  {
                    label: `Use "${correctName}"`,
                    replacement: (line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end)).trimEnd(),
                  },
                ];
              }
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
          errorMessage = `Collector number doesn't match — \`${collectorNumber}\` in \`${setCode}\``;
          const printingsInSet = findPrintingsInSet(setCode, card.canonicalFace, printingDisplay);
          if (printingsInSet.length > 0) {
            errorQuickFixes = printingsInSet.map((rowIdx) => {
              const cn = printingDisplay.collector_numbers[rowIdx]!;
              const variantLabel = variantLabelForPrinting(printingDisplay, rowIdx);
              const replacement = line.slice(0, collectorTok.start) + cn + line.slice(collectorTok.end);
              return { label: `Use ${cn}${variantLabel}`, replacement: replacement.trimEnd() };
            });
          }
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
            errorMessage = `Card name "${nameTok.value}" doesn't match \`${setCode}\` collector number \`${collectorNumber}\``;
            const correctName = getDisplayNameForCanonicalFace(printingCanonicalFace, display);
            if (correctName) {
              errorQuickFixes = [
                {
                  label: "Remove set/collector, use name only",
                  replacement: reconstructLineWithoutSet(line, setTok, collectorTok).trimEnd(),
                },
                {
                  label: `Use "${correctName}"`,
                  replacement: (line.slice(0, nameTok.start) + correctName + line.slice(nameTok.end)).trimEnd(),
                },
              ];
            }
          } else {
            card = { ...card, oracleId: printingCard.oracleId, canonicalFace: printingCard.canonicalFace };
            scryfallId = printingDisplay.scryfall_ids[pi] ?? null;
          }
        }
      } else if (foilPrereleaseMarkerTok) {
        // TappedOut *f-pre*: prerelease variant fallback (like MTGGoldfish <prerelease>)
        const fallbackPi = findAnyPrintingInSet(
          setCode,
          card.canonicalFace,
          printingDisplay,
          preferFoil
        );
        if (fallbackPi >= 0) {
          scryfallId = printingDisplay.scryfall_ids[fallbackPi] ?? null;
          hasVariantWarning = true;
          warningSpan = {
            start: lineStart + foilPrereleaseMarkerTok.start,
            end: lineStart + foilPrereleaseMarkerTok.end,
          };
          warningMessage = "Variant resolved approximately";
        } else {
          hasPrintingError = true;
          errorSpan = {
            start: lineStart + foilPrereleaseMarkerTok.start,
            end: lineStart + foilPrereleaseMarkerTok.end,
          };
          errorMessage = "No matching printing";
        }
      } else {
        // TappedOut (SET) without collector: pick any printing in set
        const fallbackPi = findAnyPrintingInSet(
          setCode,
          card.canonicalFace,
          printingDisplay,
          preferFoil
        );
        if (fallbackPi >= 0) {
          scryfallId = printingDisplay.scryfall_ids[fallbackPi] ?? null;
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
        ...(errorQuickFixes && errorQuickFixes.length > 0 ? { quickFixes: errorQuickFixes } : {}),
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
      const variantValue =
        variantTok?.value ?? (foilPrereleaseMarkerTok ? "prerelease" : undefined);
      resolved.push({
        oracle_id: card.oracleId,
        scryfall_id: scryfallId,
        quantity,
        finish: finish ?? undefined,
        variant: variantValue,
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
