// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type { ColumnarData, PrintingColumnarData } from "@frantic-search/shared/src/data";
import { loadAllSuites } from "./loader";
import { runLocalTest } from "./local";
import { buildCliEvalRefs } from "../cli-eval-refs";
import type { SupplementalDistPaths } from "../cli-eval-refs";
import { runScryfallTest } from "./scryfall";
import {
  reportLocalResults,
  reportVerifyResults,
  type SuiteSummary,
  type VerifySuiteSummary,
} from "./reporter";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const COLUMNS_PATH = path.join(PROJECT_ROOT, "data", "dist", "columns.json");
const SUITES_DIR = path.join(PROJECT_ROOT, "cli", "suites");

export async function runCompliance(options: {
  verify: boolean;
  data?: string;
  noSupplemental?: boolean;
  supplementalPaths?: Partial<SupplementalDistPaths>;
}): Promise<void> {
  const suitesDir = SUITES_DIR;
  const suites = loadAllSuites(suitesDir);

  if (options.verify) {
    await runVerifyMode(suites.flatMap(s => s.cases.map(c => ({ suite: s.file, case: c }))));
  } else {
    runLocalMode(suites, options.data ?? COLUMNS_PATH, {
      noSupplemental: options.noSupplemental,
      supplementalPaths: options.supplementalPaths,
    });
  }
}

interface TaggedCase {
  suite: string;
  case: import("./loader").TestCase;
}

function runLocalMode(
  suites: ReturnType<typeof loadAllSuites>,
  dataPath: string,
  evalOpts?: { noSupplemental?: boolean; supplementalPaths?: Partial<SupplementalDistPaths> },
): void {
  if (!fs.existsSync(dataPath)) {
    process.stderr.write(
      `Error: ${dataPath} not found.\nRun 'npm run etl -- download' and 'npm run etl -- process' first.\n`,
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ColumnarData = JSON.parse(raw);
  const index = new CardIndex(data);

  const printingsPath = path.join(path.dirname(dataPath), "printings.json");
  let printingIndex: PrintingIndex | null = null;
  let printingData: PrintingColumnarData | null = null;
  if (fs.existsSync(printingsPath)) {
    printingData = JSON.parse(fs.readFileSync(printingsPath, "utf-8")) as PrintingColumnarData;
    printingIndex = new PrintingIndex(printingData, data.scryfall_ids);
  } else {
    process.stderr.write(`Warning: ${printingsPath} not found. Printing-domain queries will not work.\n`);
  }

  const distDir = path.dirname(dataPath);
  const { tagDataRef, keywordDataRef } = buildCliEvalRefs(data, printingData, distDir, {
    noSupplemental: !!evalOpts?.noSupplemental,
    supplementalPaths: evalOpts?.supplementalPaths,
  });

  const summaries: SuiteSummary[] = [];
  for (const suite of suites) {
    const results = suite.cases.map((tc) =>
      runLocalTest(tc, index, printingIndex, tagDataRef, keywordDataRef),
    );
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
