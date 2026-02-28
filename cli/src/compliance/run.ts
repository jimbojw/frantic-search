// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type { ColumnarData, PrintingColumnarData } from "@frantic-search/shared/src/data";
import { loadAllSuites } from "./loader";
import { runLocalTest } from "./local";
import { runScryfallTest } from "./scryfall";
import {
  reportLocalResults,
  reportVerifyResults,
  type SuiteSummary,
  type VerifySuiteSummary,
} from "./reporter";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "dist", "columns.json");
const PRINTINGS_PATH = path.join(PROJECT_ROOT, "data", "dist", "printings.json");
const SUITES_DIR = path.join(PROJECT_ROOT, "cli", "suites");

export async function runCompliance(options: { verify: boolean; data?: string }): Promise<void> {
  const suitesDir = SUITES_DIR;
  const suites = loadAllSuites(suitesDir);

  if (options.verify) {
    await runVerifyMode(suites.flatMap(s => s.cases.map(c => ({ suite: s.file, case: c }))));
  } else {
    runLocalMode(suites, options.data ?? COLUMNS_PATH);
  }
}

interface TaggedCase {
  suite: string;
  case: import("./loader").TestCase;
}

function runLocalMode(suites: ReturnType<typeof loadAllSuites>, dataPath: string): void {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(
      `Error: ${dataPath} not found.\nRun 'npm run etl -- download' and 'npm run etl -- process' first.\n`,
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  const index = new CardIndex(data);

  let printingIndex: PrintingIndex | null = null;
  if (fs.existsSync(PRINTINGS_PATH)) {
    const printingData: PrintingColumnarData = JSON.parse(fs.readFileSync(PRINTINGS_PATH, "utf-8"));
    printingIndex = new PrintingIndex(printingData);
  } else {
    process.stderr.write(`Warning: ${PRINTINGS_PATH} not found. Printing-domain queries will not work.\n`);
  }

  const summaries: SuiteSummary[] = [];
  for (const suite of suites) {
    const results = suite.cases.map(tc => runLocalTest(tc, data, index, printingIndex));
    summaries.push({ file: suite.file, results });
  }

  const allPassed = reportLocalResults(summaries);
  process.exit(allPassed ? 0 : 1);
}

async function runVerifyMode(tagged: TaggedCase[]): Promise<void> {
  const byFile = new Map<string, { cases: TaggedCase[]; skipped: string[] }>();
  for (const t of tagged) {
    let entry = byFile.get(t.suite);
    if (!entry) {
      entry = { cases: [], skipped: [] };
      byFile.set(t.suite, entry);
    }
    if (t.case.divergence) {
      entry.skipped.push(t.case.name);
    } else {
      entry.cases.push(t);
    }
  }

  const summaries: VerifySuiteSummary[] = [];
  for (const [file, entry] of byFile) {
    const results = [];
    for (const t of entry.cases) {
      results.push(await runScryfallTest(t.case));
    }
    summaries.push({ file, results, skipped: entry.skipped });
  }

  const allPassed = reportVerifyResults(summaries);
  process.exit(allPassed ? 0 : 1);
}
