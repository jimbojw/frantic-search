// SPDX-License-Identifier: Apache-2.0
import type { TestCase, Assertions } from "./loader";
import type { AssertionFailure } from "./local";

export interface VerifyResult {
  name: string;
  query: string;
  passed: boolean;
  failures: AssertionFailure[];
  error?: string;
  count: number;
}

const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";
const MIN_DELAY_MS = 100;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url);
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await rateLimitedFetch(url);
    if (response.status !== 429) return response;

    if (attempt === MAX_RETRIES) return response;

    const retryAfter = response.headers.get("Retry-After");
    const delayMs = retryAfter ? Number(retryAfter) * 1000 : 1000;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error("unreachable");
}

interface ScryfallCard {
  name: string;
}

interface ScryfallSearchResponse {
  object: string;
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: ScryfallCard[];
}

async function scryfallSearch(query: string): Promise<{ names: string[]; totalCards: number }> {
  const url = `${SCRYFALL_SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Scryfall API ${response.status}: ${body}`);
  }

  const result: ScryfallSearchResponse = await response.json();
  const names: string[] = result.data.map(c => c.name);

  let nextPage = result.has_more ? result.next_page : undefined;
  while (nextPage) {
    const pageResponse = await fetchWithRetry(nextPage);
    if (!pageResponse.ok) {
      const body = await pageResponse.text();
      throw new Error(`Scryfall API ${pageResponse.status} (pagination): ${body}`);
    }
    const pageResult: ScryfallSearchResponse = await pageResponse.json();
    for (const c of pageResult.data) names.push(c.name);
    nextPage = pageResult.has_more ? pageResult.next_page : undefined;
  }

  return { names, totalCards: result.total_cards };
}

function checkAssertionsScryfall(
  assertions: Assertions,
  cardNames: string[],
  totalCards: number,
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const namesLower = new Set(cardNames.map(n => n.toLowerCase()));

  if (assertions.contains) {
    for (const name of assertions.contains) {
      if (!namesLower.has(name.toLowerCase())) {
        failures.push({
          assertion: "contains",
          expected: `"${name}" in Scryfall results`,
          actual: "not found",
        });
      }
    }
  }

  if (assertions.excludes) {
    for (const name of assertions.excludes) {
      if (namesLower.has(name.toLowerCase())) {
        failures.push({
          assertion: "excludes",
          expected: `"${name}" not in Scryfall results`,
          actual: "found",
        });
      }
    }
  }

  if (assertions.count !== undefined && totalCards !== assertions.count) {
    failures.push({
      assertion: "count",
      expected: `exactly ${assertions.count}`,
      actual: `${totalCards}`,
    });
  }

  if (assertions.count_min !== undefined && totalCards < assertions.count_min) {
    failures.push({
      assertion: "count_min",
      expected: `>= ${assertions.count_min}`,
      actual: `${totalCards}`,
    });
  }

  if (assertions.count_max !== undefined && totalCards > assertions.count_max) {
    failures.push({
      assertion: "count_max",
      expected: `<= ${assertions.count_max}`,
      actual: `${totalCards}`,
    });
  }

  return failures;
}

export async function runScryfallTest(tc: TestCase): Promise<VerifyResult> {
  const query = tc.scryfall_query ?? tc.query;

  try {
    const { names, totalCards } = await scryfallSearch(query);
    const failures = checkAssertionsScryfall(tc.assertions, names, totalCards);

    return {
      name: tc.name,
      query,
      passed: failures.length === 0,
      failures,
      count: totalCards,
    };
  } catch (e) {
    return {
      name: tc.name,
      query,
      passed: false,
      failures: [],
      error: e instanceof Error ? e.message : String(e),
      count: 0,
    };
  }
}
