// SPDX-License-Identifier: Apache-2.0
import type { TestResult } from "./local";
import type { VerifyResult } from "./scryfall";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function statusIcon(passed: boolean): string {
  return passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
}

export interface SuiteSummary {
  file: string;
  results: TestResult[];
}

export function reportLocalResults(suites: SuiteSummary[]): boolean {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalDivergences = 0;

  for (const suite of suites) {
    process.stderr.write(`\n${DIM}── ${suite.file} ──${RESET}\n`);

    for (const r of suite.results) {
      const icon = statusIcon(r.passed);
      const countStr = `${DIM}(${r.count} cards)${RESET}`;
      process.stderr.write(`  ${icon} ${r.name} ${countStr}\n`);
      process.stderr.write(`    ${DIM}query: ${r.query}${RESET}\n`);

      if (r.divergence) {
        process.stderr.write(`    ${YELLOW}divergence: ${r.divergence}${RESET}\n`);
        totalDivergences++;
      }

      if (!r.passed) {
        for (const f of r.failures) {
          process.stderr.write(`    ${RED}${f.assertion}: expected ${f.expected}, got ${f.actual}${RESET}\n`);
        }
      }

      if (r.passed) totalPassed++;
      else totalFailed++;
    }
  }

  process.stderr.write("\n");

  const parts: string[] = [];
  parts.push(`${GREEN}${totalPassed} passed${RESET}`);
  if (totalFailed > 0) parts.push(`${RED}${totalFailed} failed${RESET}`);
  if (totalDivergences > 0) parts.push(`${YELLOW}${totalDivergences} divergences${RESET}`);
  process.stderr.write(`${parts.join(", ")}\n`);

  // Non-divergence failures cause non-zero exit
  const realFailures = suites.flatMap(s =>
    s.results.filter(r => !r.passed && !r.divergence)
  );
  return realFailures.length === 0;
}

export interface VerifySuiteSummary {
  file: string;
  results: VerifyResult[];
  skipped: string[];
}

export function reportVerifyResults(suites: VerifySuiteSummary[]): boolean {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const suite of suites) {
    process.stderr.write(`\n${DIM}── ${suite.file} (Scryfall verify) ──${RESET}\n`);

    for (const name of suite.skipped) {
      process.stderr.write(`  ${YELLOW}⊘ ${name} (divergence — skipped)${RESET}\n`);
      totalSkipped++;
    }

    for (const r of suite.results) {
      if (r.error) {
        process.stderr.write(`  ${RED}⚠ ${r.name}${RESET}\n`);
        process.stderr.write(`    ${DIM}query: ${r.query}${RESET}\n`);
        process.stderr.write(`    ${RED}error: ${r.error}${RESET}\n`);
        totalErrors++;
        continue;
      }

      const icon = statusIcon(r.passed);
      const countStr = `${DIM}(${r.count} cards)${RESET}`;
      process.stderr.write(`  ${icon} ${r.name} ${countStr}\n`);
      process.stderr.write(`    ${DIM}query: ${r.query}${RESET}\n`);

      if (!r.passed) {
        for (const f of r.failures) {
          process.stderr.write(`    ${RED}${f.assertion}: expected ${f.expected}, got ${f.actual}${RESET}\n`);
        }
      }

      if (r.passed) totalPassed++;
      else totalFailed++;
    }
  }

  process.stderr.write("\n");

  const parts: string[] = [];
  parts.push(`${GREEN}${totalPassed} passed${RESET}`);
  if (totalFailed > 0) parts.push(`${RED}${totalFailed} failed${RESET}`);
  if (totalErrors > 0) parts.push(`${RED}${totalErrors} errors${RESET}`);
  if (totalSkipped > 0) parts.push(`${YELLOW}${totalSkipped} skipped (divergences)${RESET}`);
  process.stderr.write(`${parts.join(", ")}\n`);

  return totalFailed === 0 && totalErrors === 0;
}
