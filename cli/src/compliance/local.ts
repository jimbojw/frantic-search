// SPDX-License-Identifier: Apache-2.0
import { parse } from "@frantic-search/shared/src/search/parser";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import type { CardIndex } from "@frantic-search/shared/src/search/card-index";
import type { ColumnarData } from "@frantic-search/shared/src/data";
import type { TestCase, Assertions } from "./loader";

export interface AssertionFailure {
  assertion: string;
  expected: string;
  actual: string;
}

export interface TestResult {
  name: string;
  query: string;
  passed: boolean;
  failures: AssertionFailure[];
  divergence?: string;
  count: number;
}

function matchCardName(
  name: string,
  data: ColumnarData,
  matchingIndices: Set<number>,
): boolean {
  const lower = name.toLowerCase();
  for (const i of matchingIndices) {
    if (data.names[i].toLowerCase() === lower) return true;
    if (data.combined_names[i].toLowerCase() === lower) return true;
  }
  return false;
}

function checkAssertions(
  assertions: Assertions,
  data: ColumnarData,
  matchingIndices: Set<number>,
  count: number,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];

  if (assertions.contains) {
    for (const name of assertions.contains) {
      if (!matchCardName(name, data, matchingIndices)) {
        failures.push({
          assertion: "contains",
          expected: `"${name}" in results`,
          actual: "not found",
        });
      }
    }
  }

  if (assertions.excludes) {
    for (const name of assertions.excludes) {
      if (matchCardName(name, data, matchingIndices)) {
        failures.push({
          assertion: "excludes",
          expected: `"${name}" not in results`,
          actual: "found",
        });
      }
    }
  }

  if (assertions.count !== undefined && count !== assertions.count) {
    failures.push({
      assertion: "count",
      expected: `exactly ${assertions.count}`,
      actual: `${count}`,
    });
  }

  if (assertions.count_min !== undefined && count < assertions.count_min) {
    failures.push({
      assertion: "count_min",
      expected: `>= ${assertions.count_min}`,
      actual: `${count}`,
    });
  }

  if (assertions.count_max !== undefined && count > assertions.count_max) {
    failures.push({
      assertion: "count_max",
      expected: `<= ${assertions.count_max}`,
      actual: `${count}`,
    });
  }

  return failures;
}

export function runLocalTest(
  tc: TestCase,
  data: ColumnarData,
  index: CardIndex,
): TestResult {
  const cache = new NodeCache(index);
  const ast = parse(tc.query);
  const { indices } = cache.evaluate(ast);

  const matchingIndices = new Set<number>();
  for (const i of indices) {
    matchingIndices.add(i);
  }

  const count = matchingIndices.size;
  const failures = checkAssertions(tc.assertions, data, matchingIndices, count);

  return {
    name: tc.name,
    query: tc.query,
    passed: failures.length === 0,
    failures,
    divergence: tc.divergence,
    count,
  };
}
