// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import cac from "cac";
import { parse } from "@frantic-search/shared/src/search/parser";
import { evaluate } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import type { ColumnarData } from "@frantic-search/shared/src/data";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "intermediate", "columns.json");

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
  .action((query: string, options: { data: string }) => {
    if (!fs.existsSync(options.data)) {
      process.stderr.write(`Error: ${options.data} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`);
      process.exit(1);
    }
    const raw = fs.readFileSync(options.data, "utf-8");
    const data: ColumnarData = JSON.parse(raw);
    const index = new CardIndex(data);
    const ast = parse(query);
    const result = evaluate(ast, index);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  });

cli.help();
cli.parse();
