// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import cac from "cac";
import { parse } from "@frantic-search/shared/src/search/parser";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import type { ColumnarData } from "@frantic-search/shared/src/data";

process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "intermediate", "columns.json");
const ORACLE_CARDS_PATH = path.join(PROJECT_ROOT, "data", "raw", "oracle-cards.json");

function loadIndex(dataPath: string): { data: ColumnarData; index: CardIndex } {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(`Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`);
    process.exit(1);
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  return { data, index: new CardIndex(data) };
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
    const { data, index } = loadIndex(options.data);
    const cache = new NodeCache(index);
    const ast = parse(query);
    const { result, matchingIndices } = cache.evaluate(ast);
    const cardFaces = index.deduplicateMatches(matchingIndices);

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

cli.help();
cli.parse();
