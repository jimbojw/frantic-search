// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  NodeCache,
  CardIndex,
  PrintingIndex,
  validateDeckListWithEngine,
  extractDisplayColumns,
  extractPrintingDisplayColumns,
  buildOracleToCanonicalFaceMap,
  buildPrintingLookup,
  buildCanonicalPrintingPerFace,
  buildMasksFromParsedEntries,
} from "@frantic-search/shared";
import type {
  ColumnarData,
  PrintingColumnarData,
  ParsedEntry,
} from "@frantic-search/shared";

export function loadListText(path: string): string {
  if (path === "-") {
    return fs.readFileSync(0, "utf-8");
  }
  if (!fs.existsSync(path)) {
    process.stderr.write(`Error: List file not found: ${path}\n`);
    process.exit(1);
  }
  return fs.readFileSync(path, "utf-8");
}

export interface ParseListResult {
  resolved: ParsedEntry[];
  faceMask: Uint8Array;
  printingMask?: Uint8Array;
  validationLines: { kind: string; message?: string }[];
}

export function parseListAndBuildMasks(
  listText: string,
  data: ColumnarData,
  printingData: PrintingColumnarData | null,
  index: CardIndex,
  printingIndex: PrintingIndex | null,
): ParseListResult {
  const display = extractDisplayColumns(data);
  const printingDisplay = printingData
    ? extractPrintingDisplayColumns(printingData)
    : null;

  const validationCache = new NodeCache(index, printingIndex);
  const validationResult = validateDeckListWithEngine(
    listText,
    index,
    printingIndex,
    display,
    printingDisplay,
    validationCache,
  );

  const resolved = validationResult.resolved ?? [];
  const validationLines = validationResult.lines.map((l) => ({
    kind: l.kind,
    message: l.message,
  }));

  const faceCount = data.names.length;
  const printingCount = printingData?.canonical_face_ref?.length ?? 0;
  const oracleToCanonicalFace = buildOracleToCanonicalFaceMap(display);
  const printingLookup = printingDisplay
    ? buildPrintingLookup(printingDisplay)
    : undefined;
  const canonicalPrintingPerFace = printingDisplay
    ? buildCanonicalPrintingPerFace(printingDisplay)
    : undefined;

  const { faceMask, printingMask } = buildMasksFromParsedEntries(resolved, {
    faceCount,
    printingCount: printingCount > 0 ? printingCount : undefined,
    oracleToCanonicalFace,
    printingLookup,
    canonicalPrintingPerFace,
  });

  return {
    resolved,
    faceMask,
    printingMask,
    validationLines,
  };
}

export function createGetListMask(
  faceMask: Uint8Array,
  printingMask?: Uint8Array,
): (listId: string) => { faceMask: Uint8Array; printingMask?: Uint8Array } | null {
  return (listId: string) => {
    if (listId !== "default") return null;
    return { faceMask, printingMask };
  };
}
