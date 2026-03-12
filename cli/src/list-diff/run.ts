// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  parse,
  Finish,
  FINISH_FROM_STRING,
  extractDisplayColumns,
  extractPrintingDisplayColumns,
  buildOracleToCanonicalFaceMap,
  buildPrintingLookup,
} from "@frantic-search/shared";
import type { UniqueMode } from "@frantic-search/shared";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type {
  ColumnarData,
  PrintingColumnarData,
  ParsedEntry,
  PrintingDisplayColumns,
} from "@frantic-search/shared";
import {
  loadListText,
  parseListAndBuildMasks,
  createGetListMask,
} from "../list-utils";
import {
  collectLocalCards,
  normalizeLocalParity,
  compareBySetKeys,
  compareArtByOracleCounts,
  formatEntry,
  type CardEntry,
  type DiffComparison,
  type RawOracleCard,
} from "../diff/run";

function hasMyListInQuery(ast: ReturnType<typeof parse>): boolean {
  if (!ast) return false;
  switch (ast.type) {
    case "FIELD":
      if (ast.field?.toLowerCase() === "my") {
        const v = (ast.value ?? "").toLowerCase();
        return v === "list" || v === "default" || v === "";
      }
      return false;
    case "NOT":
      return hasMyListInQuery(ast.child);
    case "AND":
    case "OR":
      return ast.children?.some(hasMyListInQuery) ?? false;
    default:
      return false;
  }
}

function encodeFinish(finish: string | null | undefined): number {
  if (!finish) return Finish.Nonfoil;
  const n = FINISH_FROM_STRING[finish.toLowerCase()];
  return n !== undefined ? n : Finish.Nonfoil;
}

function buildExpectedFromParsedEntries(
  entries: ParsedEntry[],
  uniqueMode: UniqueMode,
  index: CardIndex,
  data: ColumnarData,
  printingIndex: PrintingIndex | null,
  printingData: PrintingColumnarData | null,
  printingDisplay: PrintingDisplayColumns | null,
  oracleToCanonicalFace: Map<string, number>,
  printingLookup: Map<string, number> | undefined,
): CardEntry[] {
  const result: CardEntry[] = [];

  if (uniqueMode === "cards") {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry.oracle_id || seen.has(entry.oracle_id)) continue;
      seen.add(entry.oracle_id);
      const cf = oracleToCanonicalFace.get(entry.oracle_id);
      if (cf === undefined) continue;
      const name = index.combinedNames?.[cf] ?? data.names[cf] ?? "";
      let id = data.scryfall_ids[cf];
      let set = "—";
      let collectorNumber = "—";
      if (printingIndex && printingData && printingDisplay) {
        const pRows = printingIndex.printingsOf(cf);
        if (pRows.length > 0) {
          const pi = pRows[0];
          id = printingData.scryfall_ids[pi] ?? id;
          const setIdx = printingData.set_indices[pi];
          set = printingData.set_lookup[setIdx]?.code ?? "—";
          collectorNumber = printingData.collector_numbers[pi] ?? "—";
        }
      }
      result.push({ id: id ?? "", name, set, collectorNumber, oracleId: entry.oracle_id });
    }
    return result;
  }

  if (uniqueMode === "art") {
    const byOracle = new Map<string, CardEntry[]>();
    for (const entry of entries) {
      if (!entry.oracle_id) continue;
      const cf = oracleToCanonicalFace.get(entry.oracle_id);
      if (cf === undefined) continue;
      const name = index.combinedNames?.[cf] ?? data.names[cf] ?? "";
      let id = data.scryfall_ids[cf];
      let set = "—";
      let collectorNumber = "—";
      if (printingIndex && printingData && printingDisplay) {
        const pRows = printingIndex.printingsOf(cf);
        const nonfoil = pRows.find((p) => printingIndex!.finish[p] === Finish.Nonfoil) ?? pRows[0];
        if (nonfoil !== undefined) {
          const pi = nonfoil;
          id = printingData.scryfall_ids[pi] ?? id;
          const setIdx = printingData.set_indices[pi];
          set = printingData.set_lookup[setIdx]?.code ?? "—";
          collectorNumber = printingData.collector_numbers[pi] ?? "—";
        }
      }
      const e: CardEntry = { id: id ?? "", name, set, collectorNumber, oracleId: entry.oracle_id };
      const arr = byOracle.get(entry.oracle_id) ?? [];
      arr.push(e);
      byOracle.set(entry.oracle_id, arr);
    }
    return Array.from(byOracle.values()).flat();
  }

  for (const entry of entries) {
    const cf = oracleToCanonicalFace.get(entry.oracle_id);
    if (cf === undefined) continue;
    const name = index.combinedNames?.[cf] ?? data.names[cf] ?? "";

    let id: string;
    let set: string;
    let collectorNumber: string;

    if (entry.scryfall_id && printingLookup && printingData && printingDisplay) {
      const enc = encodeFinish(entry.finish ?? "nonfoil");
      const key = `${entry.scryfall_id}:${enc}`;
      const pi = printingLookup.get(key);
      if (pi === undefined) continue;
      id = printingData.scryfall_ids[pi] ?? "";
      const setIdx = printingData.set_indices[pi];
      set = printingData.set_lookup[setIdx]?.code ?? "—";
      collectorNumber = printingData.collector_numbers[pi] ?? "—";
    } else if (printingIndex && printingData && printingDisplay) {
      const pRows = printingIndex.printingsOf(cf);
      const nonfoil = pRows.find((p) => printingIndex.finish[p] === Finish.Nonfoil) ?? pRows[0];
      if (nonfoil === undefined) continue;
      const pi = nonfoil;
      id = printingData.scryfall_ids[pi] ?? "";
      const setIdx = printingData.set_indices[pi];
      set = printingData.set_lookup[setIdx]?.code ?? "—";
      collectorNumber = printingData.collector_numbers[pi] ?? "—";
    } else {
      continue;
    }

    for (let q = 0; q < (entry.quantity ?? 1); q++) {
      result.push({
        id,
        name,
        set,
        collectorNumber,
        oracleId: entry.oracle_id,
      });
    }
  }

  return result;
}

export interface ListDiffOptions {
  dataPath: string;
  printingsPath: string;
  listPath: string;
  rawPath?: string;
  verbose: boolean;
}

export function runListDiff(
  query: string,
  options: ListDiffOptions,
): void {
  const { dataPath, printingsPath, listPath, rawPath, verbose } = options;

  const ast = parse(query);
  if (!hasMyListInQuery(ast)) {
    process.stderr.write(
      "Error: Query must contain my:list or my:default. Add my:list to the query.\n",
    );
    process.exit(1);
  }

  if (!fs.existsSync(dataPath)) {
    process.stderr.write(
      `Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`,
    );
    process.exit(1);
  }

  const data: ColumnarData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const index = new CardIndex(data);

  let printingData: PrintingColumnarData | null = null;
  let printingIndex: PrintingIndex | null = null;
  if (fs.existsSync(printingsPath)) {
    printingData = JSON.parse(
      fs.readFileSync(printingsPath, "utf-8"),
    ) as PrintingColumnarData;
    printingIndex = new PrintingIndex(printingData, data.scryfall_ids);
  }

  const listText = loadListText(listPath);
  const { resolved, faceMask, printingMask, validationLines } =
    parseListAndBuildMasks(listText, data, printingData, index, printingIndex);

  for (const line of validationLines) {
    if (line.kind === "error" && line.message) {
      process.stderr.write(`Validation: ${line.message}\n`);
    }
  }

  const display = extractDisplayColumns(data);
  const printingDisplay = printingData
    ? extractPrintingDisplayColumns(printingData)
    : null;
  const oracleToCanonicalFace = buildOracleToCanonicalFaceMap(display);
  const printingLookup = printingDisplay
    ? buildPrintingLookup(printingDisplay)
    : undefined;

  const getListMask = createGetListMask(faceMask, printingMask);
  const cache = new NodeCache(index, printingIndex, getListMask);
  const evalOut = cache.evaluate(ast);

  const normalized = normalizeLocalParity(data, printingData, printingIndex, {
    indices: evalOut.indices,
    printingIndices: evalOut.printingIndices,
    uniqueMode: evalOut.uniqueMode,
    hasPrintingConditions: evalOut.hasPrintingConditions,
    includeExtras: evalOut.includeExtras,
  });

  let rawOracleCards: RawOracleCard[] | undefined;
  if (rawPath && fs.existsSync(rawPath)) {
    rawOracleCards = JSON.parse(
      fs.readFileSync(rawPath, "utf-8"),
    ) as RawOracleCard[];
  }

  const actualCards = collectLocalCards(
    index,
    data,
    printingData,
    printingIndex,
    new Uint32Array(normalized.indices),
    normalized.printingIndices
      ? new Uint32Array(normalized.printingIndices)
      : undefined,
    rawOracleCards,
  );

  const expectedCards = buildExpectedFromParsedEntries(
    resolved,
    normalized.uniqueMode,
    index,
    data,
    printingIndex,
    printingData,
    printingDisplay,
    oracleToCanonicalFace,
    printingLookup,
  );

  let comparison: DiffComparison;
  if (normalized.uniqueMode === "prints") {
    comparison = compareBySetKeys(
      expectedCards,
      actualCards,
      (e) => e.id,
      "prints",
    );
  } else if (normalized.uniqueMode === "cards") {
    comparison = compareBySetKeys(
      expectedCards,
      actualCards,
      (e) => e.oracleId ?? e.id,
      "cards",
    );
  } else {
    comparison = compareArtByOracleCounts(expectedCards, actualCards);
  }

  const sep = "--------------------------------------------------";
  process.stdout.write(`\nList Diff Summary: "${query}"\n`);
  process.stdout.write(`${sep}\n`);
  process.stdout.write(`Comparison mode: ${comparison.mode}\n`);
  process.stdout.write(`Expected (from list): ${expectedCards.length}\n`);
  process.stdout.write(`Actual (from search): ${actualCards.length}\n`);
  process.stdout.write(`In Both: ${comparison.inBoth}\n`);
  process.stdout.write(`Only in List: ${comparison.onlyLocal}\n`);
  process.stdout.write(`Only in Search: ${comparison.onlyScryfall}\n`);

  if (comparison.onlyLocal > 0 || comparison.onlyScryfall > 0) {
    process.stdout.write(`\nDiscrepancies:\n`);
    process.stdout.write(`${sep}\n`);

    if (comparison.onlyLocal > 0) {
      process.stdout.write(`\n[List Only — not in search]\n`);
      for (const e of comparison.localOnlyEntries) {
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }

    if (comparison.onlyScryfall > 0) {
      process.stdout.write(`\n[Search Only — not in list]\n`);
      for (const e of comparison.scryfallOnlyEntries) {
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }
  }
}
