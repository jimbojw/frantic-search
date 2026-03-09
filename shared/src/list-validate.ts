// SPDX-License-Identifier: Apache-2.0
import { lexDeckList, ListTokenType } from "./list-lexer";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

export type { LineValidation, ListValidationResult } from "./list-lexer";

export interface ParsedEntry {
  oracle_id: string;
  scryfall_id: string | null;
  quantity: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCardByName(
  name: string,
  display: DisplayColumns
): { faceIndex: number; oracleId: string; canonicalFace: number } | null {
  const normalized = normalize(name);
  if (!normalized) return null;

  const names = display.names;
  for (let i = 0; i < names.length; i++) {
    if (normalize(names[i]!) === normalized) {
      const oracleId = display.oracle_ids[i] ?? "";
      const canonicalFace = display.canonical_face[i] ?? i;
      return { faceIndex: i, oracleId, canonicalFace };
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

  const lineStrings = text.split(/\r?\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex++) {
    const line = lineStrings[lineIndex]!;
    const lineStart = offset;
    const lineEnd = offset + line.length;

    const tokens = lexDeckList(line);
    const quantityTok = tokens.find((t) => t.type === ListTokenType.QUANTITY);
    const nameTok = tokens.find((t) => t.type === ListTokenType.CARD_NAME);
    const setTok = tokens.find((t) => t.type === ListTokenType.SET_CODE);
    const collectorTok = tokens.find((t) => t.type === ListTokenType.COLLECTOR_NUMBER);

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

    const card = findCardByName(nameTok.value, display);
    if (!card) {
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "error",
        span: { start: nameTok.start, end: nameTok.end },
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

    if (setTok && collectorTok && printingDisplay) {
      const setCode = setTok.value;
      const collectorNumber = collectorTok.value;

      const setCodes = printingDisplay.set_codes;
      const setLower = setCode.toLowerCase();
      const setExists = setCodes.some(
        (s) => s.toLowerCase() === setLower
      );
      if (!setExists) {
        hasPrintingError = true;
        errorSpan = { start: setTok.start, end: setTok.end };
        errorMessage = "Unknown set";
      } else {
        const pi = findPrintingRow(setCode, collectorNumber, printingDisplay);
        if (pi < 0) {
          hasPrintingError = true;
          errorSpan = { start: collectorTok.start, end: collectorTok.end };
          errorMessage = "Collector number doesn't match";
        } else {
          const printingCanonicalFace = printingDisplay.canonical_face_ref[pi];
          if (printingCanonicalFace !== card.canonicalFace) {
            hasPrintingError = true;
            errorSpan = { start: collectorTok.start, end: collectorTok.end };
            errorMessage = "Collector number doesn't match";
          } else {
            scryfallId = printingDisplay.scryfall_ids[pi] ?? null;
          }
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
      lines.push({
        lineIndex,
        lineStart,
        lineEnd,
        kind: "ok",
      });
      const qtyStr = quantityTok.value.replace(/x$/i, "");
      const quantity = parseInt(qtyStr, 10) || 1;
      resolved.push({
        oracle_id: card.oracleId,
        scryfall_id: scryfallId,
        quantity,
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
