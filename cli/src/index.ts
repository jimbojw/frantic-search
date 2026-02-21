// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import cac from "cac";
import { parse } from "@frantic-search/shared/src/search/parser";
import { evaluate } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import type { ColumnarData } from "@frantic-search/shared/src/data";

process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "intermediate", "columns.json");

function loadIndex(dataPath: string): { data: ColumnarData; index: CardIndex } {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(`Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`);
    process.exit(1);
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  return { data, index: new CardIndex(data) };
}

function cardToObject(data: ColumnarData, i: number): Record<string, unknown> {
  return {
    name: data.names[i],
    mana_cost: data.mana_costs[i],
    oracle_text: data.oracle_texts[i],
    colors: data.colors[i],
    color_identity: data.color_identity[i],
    types: data.types[i],
    supertypes: data.supertypes[i],
    subtypes: data.subtypes[i],
    power: data.power_lookup[data.powers[i]] || null,
    toughness: data.toughness_lookup[data.toughnesses[i]] || null,
    loyalty: data.loyalty_lookup[data.loyalties[i]] || null,
    defense: data.defense_lookup[data.defenses[i]] || null,
  };
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
  .option("--output <format>", "Output format: tree, names, cards", { default: "tree" })
  .action((query: string, options: { data: string; output: string }) => {
    const { data, index } = loadIndex(options.data);
    const ast = parse(query);
    const { result, matchingIndices } = evaluate(ast, index);

    switch (options.output) {
      case "names":
        for (const i of matchingIndices) {
          process.stdout.write(data.names[i] + "\n");
        }
        break;
      case "cards":
        process.stdout.write(JSON.stringify(
          matchingIndices.map((i) => cardToObject(data, i)),
          null, 2,
        ) + "\n");
        break;
      case "tree":
      default:
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        break;
    }
  });

cli.help();
cli.parse();
