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

function loadIndex(dataPath: string): { data: ColumnarData; index: CardIndex; printingIndex: PrintingIndex | null } {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(`Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`);
    process.exit(1);
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  let printingIndex: PrintingIndex | null = null;
  if (fs.existsSync(PRINTINGS_PATH)) {
    const printingData: PrintingColumnarData = JSON.parse(fs.readFileSync(PRINTINGS_PATH, "utf-8"));
    printingIndex = new PrintingIndex(printingData);
  }
  return { data, index: new CardIndex(data), printingIndex };
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
  .option("--raw <path>", "Path to oracle-cards.json (for --output cards)", { default: ORACLE_CARDS_PATH })
  .option("--output <format>", "Output format: tree, names, cards", { default: "tree" })
  .action((query: string, options: { data: string; raw: string; output: string }) => {
    const { data, index, printingIndex } = loadIndex(options.data);
    const cache = new NodeCache(index, printingIndex);
    const ast = parse(query);
    const { result, indices } = cache.evaluate(ast);
    const cardFaces = Array.from(indices);

    switch (options.output) {
      case "names":
        for (const i of cardFaces) {
          process.stdout.write(data.names[i] + "\n");
        }
        break;
      case "cards": {
        const rawCards = loadRawCards(options.raw);
        const seen = new Set<number>();
        const cards: unknown[] = [];
        for (const i of cardFaces) {
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

cli.help();
cli.parse();
