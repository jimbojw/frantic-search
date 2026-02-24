// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface TestCase {
  name: string;
  query: string;
  scryfall_query?: string;
  assertions: Assertions;
  divergence?: string;
}

export interface Assertions {
  contains?: string[];
  excludes?: string[];
  count?: number;
  count_min?: number;
  count_max?: number;
}

export interface Suite {
  file: string;
  cases: TestCase[];
}

function validateTestCase(raw: unknown, file: string, idx: number): TestCase {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${file}: test case ${idx} is not an object`);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new Error(`${file}: test case ${idx} is missing required field "name"`);
  }
  if (typeof obj.query !== "string" || obj.query.length === 0) {
    throw new Error(`${file}: test case ${idx} ("${obj.name}") is missing required field "query"`);
  }

  const assertions = obj.assertions;
  if (typeof assertions !== "object" || assertions === null) {
    throw new Error(`${file}: test case ${idx} ("${obj.name}") is missing required field "assertions"`);
  }
  const a = assertions as Record<string, unknown>;
  const hasAssertion =
    a.contains !== undefined ||
    a.excludes !== undefined ||
    a.count !== undefined ||
    a.count_min !== undefined ||
    a.count_max !== undefined;
  if (!hasAssertion) {
    throw new Error(`${file}: test case ${idx} ("${obj.name}") has empty assertions — at least one is required`);
  }

  return {
    name: obj.name,
    query: obj.query,
    scryfall_query: typeof obj.scryfall_query === "string" ? obj.scryfall_query : undefined,
    assertions: {
      contains: Array.isArray(a.contains) ? a.contains.map(String) : undefined,
      excludes: Array.isArray(a.excludes) ? a.excludes.map(String) : undefined,
      count: typeof a.count === "number" ? a.count : undefined,
      count_min: typeof a.count_min === "number" ? a.count_min : undefined,
      count_max: typeof a.count_max === "number" ? a.count_max : undefined,
    },
    divergence: typeof obj.divergence === "string" ? obj.divergence : undefined,
  };
}

export function loadSuite(filePath: string): Suite {
  const raw = fs.readFileSync(filePath, "utf-8");
  const basename = path.basename(filePath);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${basename}: YAML parse error: ${msg}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${basename}: expected a YAML array of test cases`);
  }

  const cases: TestCase[] = [];
  for (let i = 0; i < parsed.length; i++) {
    cases.push(validateTestCase(parsed[i], basename, i));
  }
  return { file: basename, cases };
}

export function loadAllSuites(suitesDir: string): Suite[] {
  if (!fs.existsSync(suitesDir)) {
    throw new Error(`Suites directory not found: ${suitesDir}`);
  }
  const files = fs.readdirSync(suitesDir)
    .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No suite files found in ${suitesDir}`);
  }
  return files.map(f => loadSuite(path.join(suitesDir, f)));
}
