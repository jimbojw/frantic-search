// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import cac from "cac";
import { parse } from "@frantic-search/shared/src/search/parser";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type { ColumnarData, PrintingColumnarData } from "@frantic-search/shared/src/data";

process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "dist", "columns.json");
const PRINTINGS_PATH = path.join(PROJECT_ROOT, "data", "dist", "printings.json");
const ORACLE_CARDS_PATH = path.join(PROJECT_ROOT, "data", "raw", "oracle-cards.json");

function loadIndex(
  dataPath: string,
  printingsPath?: string,
): {
  data: ColumnarData;
  index: CardIndex;
  printingIndex: PrintingIndex | null;
  printingData: PrintingColumnarData | null;
} {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(
      `Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`,
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  const path = printingsPath ?? PRINTINGS_PATH;
  let printingIndex: PrintingIndex | null = null;
  let printingData: PrintingColumnarData | null = null;
  if (fs.existsSync(path)) {
    printingData = JSON.parse(fs.readFileSync(path, "utf-8")) as PrintingColumnarData;
    printingIndex = new PrintingIndex(printingData, data.scryfall_ids);
  }
  return { data, index: new CardIndex(data), printingIndex, printingData };
}

function loadRawCards(rawPath: string): unknown[] {
  if (!fs.existsSync(rawPath)) {
    process.stderr.write(`Error: ${rawPath} not found. Run 'npm run etl -- download' first.\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(rawPath, "utf-8"));
}

const cli = cac("frantic-search");

cli
  .command("parse <query>", "Parse a Scryfall query and print its AST as JSON")
  .action((query: string) => {
    const ast = parse(query);
    process.stdout.write(JSON.stringify(ast, null, 2) + "\n");
  });

cli
  .command("search <query>", "Parse and evaluate a Scryfall query against the card dataset")
  .option("--data <path>", "Path to columns.json", { default: COLUMNS_PATH })
  .option("--printings <path>", "Path to printings.json", { default: PRINTINGS_PATH })
  .option("--raw <path>", "Path to oracle-cards.json (for --output cards)", { default: ORACLE_CARDS_PATH })
  .option("--list <path>", "Deck list file (or - for stdin) for my:list queries")
  .option("--output <format>", "Output format: tree, names, cards", { default: "tree" })
  .action(async (query: string, options: { data: string; printings: string; raw: string; list?: string; output: string }) => {
    const { data, index, printingIndex, printingData } = loadIndex(
      options.data,
      options.printings,
    );

    let cache: NodeCache;
    if (options.list) {
      const { loadListText, parseListAndBuildMasks, createGetListMask } =
        await import("./list-utils");
      const listText = loadListText(options.list);
      const { printingIndices, validationLines } = parseListAndBuildMasks(
        listText,
        data,
        printingData,
        index,
        printingIndex,
      );
      for (const line of validationLines) {
        if (line.kind === "error" && line.message) {
          process.stderr.write(`Validation: ${line.message}\n`);
        }
      }
      const getListMask = createGetListMask(printingIndices);
      cache = new NodeCache(index, printingIndex, getListMask);
    } else {
      cache = new NodeCache(index, printingIndex);
    }

    const ast = parse(query);
    const evalOut = cache.evaluate(ast);
    const { result, indices, printingIndices } = evalOut;

    const cardFaces = Array.from(indices);
    const usePrintings = printingIndices && printingIndices.length > 0;

    switch (options.output) {
      case "names": {
        if (usePrintings && printingIndex && printingData) {
          for (const pi of printingIndices!) {
            const cf = printingData.canonical_face_ref[pi];
            const name = index.combinedNames?.[cf] ?? data.names[cf] ?? "";
            process.stdout.write(name + "\n");
          }
        } else {
          for (const i of cardFaces) {
            process.stdout.write(data.names[i] + "\n");
          }
        }
        break;
      }
      case "cards": {
        const rawCards = loadRawCards(options.raw);
        const seen = new Set<number>();
        const cards: unknown[] = [];
        const indicesToUse = usePrintings && printingIndex && printingData
          ? printingIndices!.map((pi) => printingData.canonical_face_ref[pi])
          : cardFaces;
        for (const i of indicesToUse) {
          const ci = data.card_index[i];
          if (!seen.has(ci)) {
            seen.add(ci);
            cards.push(rawCards[ci]);
          }
        }
        process.stdout.write(JSON.stringify(cards, null, 2) + "\n");
        break;
      }
      case "tree":
      default:
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        break;
    }
  });

cli
  .command("compliance", "Run compliance suite against local engine or Scryfall")
  .option("--verify", "Verify assertions against the Scryfall API instead of the local engine")
  .option("--data <path>", "Path to columns.json (local mode only)", { default: COLUMNS_PATH })
  .action(async (options: { verify?: boolean; data: string }) => {
    const { runCompliance } = await import("./compliance/run");
    await runCompliance({ verify: !!options.verify, data: options.data });
  });

cli
  .command("list-diff <query>", "Compare list contents against search results for my:list queries")
  .option("--list <path>", "Deck list file (or - for stdin)")
  .option("--data <path>", "Path to columns.json", { default: COLUMNS_PATH })
  .option("--printings <path>", "Path to printings.json", { default: PRINTINGS_PATH })
  .option("--raw <path>", "Path to oracle-cards.json (improves comparison keys)", { default: ORACLE_CARDS_PATH })
  .option("-q, --quiet", "Show only comparison keys for discrepancies")
  .action(async (query: string, options: { list?: string; data: string; printings: string; raw: string; quiet?: boolean }) => {
    if (!options.list) {
      process.stderr.write("Error: --list is required. Use --list <path> or --list=- for stdin.\n");
      process.exit(1);
    }
    const { runListDiff } = await import("./list-diff/run");
    runListDiff(query, {
      dataPath: options.data,
      printingsPath: options.printings,
      listPath: options.list,
      rawPath: options.raw,
      verbose: !options.quiet,
    });
  });

cli
  .command("diff <query>", "Compare local search results against Scryfall API")
  .option("--data <path>", "Path to columns.json", { default: COLUMNS_PATH })
  .option("--printings <path>", "Path to printings.json", { default: PRINTINGS_PATH })
  .option("--raw <path>", "Path to oracle-cards.json (improves cards/art diff keys)", { default: ORACLE_CARDS_PATH })
  .option("-q, --quiet", "Show only comparison keys for discrepancies (default: include card details)")
  .action(async (query: string, options: { data: string; printings: string; raw: string; quiet?: boolean }) => {
    const { runDiff } = await import("./diff/run");
    await runDiff(query, {
      dataPath: options.data,
      printingsPath: options.printings,
      rawPath: options.raw,
      verbose: !options.quiet,
    });
  });

cli.help();
cli.parse();
