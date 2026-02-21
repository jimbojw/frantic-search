// SPDX-License-Identifier: Apache-2.0
import cac from "cac";
import { parse } from "@frantic-search/shared/src/search/parser";

const cli = cac("frantic-search");

cli
  .command("parse <query>", "Parse a Scryfall query and print its AST as JSON")
  .action((query: string) => {
    const ast = parse(query);
    process.stdout.write(JSON.stringify(ast, null, 2) + "\n");
  });

cli.help();
cli.parse();
