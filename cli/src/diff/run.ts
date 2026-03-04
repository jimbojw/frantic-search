// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { parse, toScryfallQuery } from "@frantic-search/shared";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type { ColumnarData, PrintingColumnarData } from "@frantic-search/shared/src/data";

const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";
const MIN_DELAY_MS = 100;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
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
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("unreachable");
}

export interface CardEntry {
  id: string;
  name: string;
  set: string;
  collectorNumber: string;
}

interface ScryfallCardData {
  id: string;
  name: string;
  set: string;
  collector_number: string;
}

interface ScryfallSearchResponse {
  object: string;
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: ScryfallCardData[];
}

/** Fetch all cards from Scryfall for a query. 404 = zero results per docs/guides/scryfall-comparison.md */
async function fetchScryfallCards(query: string): Promise<CardEntry[]> {
  const url = `${SCRYFALL_SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Scryfall API ${response.status}: ${body}`);
  }

  const result: ScryfallSearchResponse = await response.json();
  const cards: CardEntry[] = result.data.map((c) => ({
    id: c.id,
    name: c.name,
    set: c.set,
    collectorNumber: c.collector_number,
  }));

  let nextPage = result.has_more ? result.next_page : undefined;
  while (nextPage) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS));
    const pageResponse = await fetchWithRetry(nextPage);
    if (!pageResponse.ok) {
      const body = await pageResponse.text();
      throw new Error(`Scryfall API ${pageResponse.status} (pagination): ${body}`);
    }
    const pageResult: ScryfallSearchResponse = await pageResponse.json();
    for (const c of pageResult.data) {
      cards.push({
        id: c.id,
        name: c.name,
        set: c.set,
        collectorNumber: c.collector_number,
      });
    }
    nextPage = pageResult.has_more ? pageResult.next_page : undefined;
  }

  return cards;
}

function collectLocalCards(
  data: ColumnarData,
  printingData: PrintingColumnarData | null,
  printingIndex: PrintingIndex | null,
  indices: Uint32Array,
  printingIndices: Uint32Array | undefined,
): CardEntry[] {
  const entries: CardEntry[] = [];
  const seen = new Set<string>();

  if (printingIndices && printingIndex && printingData) {
    for (const pi of printingIndices) {
      const id = printingData.scryfall_ids[pi];
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const cf = printingData.canonical_face_ref[pi];
      const name = data.combined_names[data.card_index[cf]] ?? data.names[cf] ?? "";
      const setIdx = printingData.set_indices[pi];
      const set = printingData.set_lookup[setIdx]?.code ?? "—";
      const collectorNumber = printingData.collector_numbers[pi] ?? "—";

      entries.push({ id, name, set, collectorNumber });
    }
  } else {
    for (const fi of indices) {
      const id = data.scryfall_ids[fi];
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const ci = data.card_index[fi];
      const name = data.combined_names[ci] ?? data.names[fi] ?? "";
      let set = "—";
      let collectorNumber = "—";

      if (printingIndex && printingData) {
        const pRows = printingIndex.printingsOf(fi);
        if (pRows.length > 0) {
          const pi = pRows[0];
          const setIdx = printingData.set_indices[pi];
          set = printingData.set_lookup[setIdx]?.code ?? "—";
          collectorNumber = printingData.collector_numbers[pi] ?? "—";
        }
      }

      entries.push({ id, name, set, collectorNumber });
    }
  }

  return entries;
}

function formatEntry(e: CardEntry, verbose: boolean): string {
  if (!verbose) return `  ${e.id}`;
  return `  ${e.name} (${e.set}/${e.collectorNumber}) — ${e.id}`;
}

export interface DiffOptions {
  dataPath: string;
  printingsPath: string;
  verbose: boolean;
}

export async function runDiff(
  query: string,
  options: DiffOptions,
): Promise<void> {
  const { dataPath, printingsPath, verbose } = options;

  if (!fs.existsSync(dataPath)) {
    process.stderr.write(
      `Error: ${dataPath} not found. Run 'npm run etl -- download' and 'npm run etl -- process' first.\n`,
    );
    process.exit(1);
  }

  const data: ColumnarData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const index = new CardIndex(data);

  let printingData: PrintingColumnarData | null = null;
  let printingIndex: PrintingIndex | null = null;
  if (fs.existsSync(printingsPath)) {
    printingData = JSON.parse(fs.readFileSync(printingsPath, "utf-8"));
    printingIndex = new PrintingIndex(printingData, data.scryfall_ids);
  }

  const cache = new NodeCache(index, printingIndex);
  const ast = parse(query);
  const { indices, printingIndices } = cache.evaluate(ast);

  const localCards = collectLocalCards(
    data,
    printingData,
    printingIndex,
    indices,
    printingIndices,
  );

  const scryfallQuery = toScryfallQuery(ast);
  if (!scryfallQuery.trim()) {
    process.stderr.write("Error: Query could not be converted to Scryfall syntax.\n");
    process.exit(1);
  }

  process.stderr.write(`Fetching Scryfall results for: ${scryfallQuery}\n`);
  const scryfallCards = await fetchScryfallCards(scryfallQuery);

  const localById = new Map(localCards.map((c) => [c.id, c]));
  const scryfallById = new Map(scryfallCards.map((c) => [c.id, c]));

  const localIds = new Set(localById.keys());
  const scryfallIds = new Set(scryfallById.keys());

  const inBoth = [...localIds].filter((id) => scryfallIds.has(id));
  const onlyLocal = [...localIds].filter((id) => !scryfallIds.has(id));
  const onlyScryfall = [...scryfallIds].filter((id) => !localIds.has(id));

  const sep = "--------------------------------------------------";
  process.stdout.write(`\nDiff Summary: "${query}"\n`);
  process.stdout.write(`${sep}\n`);
  process.stdout.write(`In Both: ${inBoth.length}\n`);
  process.stdout.write(`Only in Frantic Search: ${onlyLocal.length}\n`);
  process.stdout.write(`Only in Scryfall: ${onlyScryfall.length}\n`);

  if (onlyLocal.length > 0 || onlyScryfall.length > 0) {
    process.stdout.write(`\nDiscrepancies:\n`);
    process.stdout.write(`${sep}\n`);

    if (onlyLocal.length > 0) {
      process.stdout.write(`\n[Frantic Search Only]\n`);
      for (const id of onlyLocal.sort()) {
        const e = localById.get(id)!;
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }

    if (onlyScryfall.length > 0) {
      process.stdout.write(`\n[Scryfall Only]\n`);
      for (const id of onlyScryfall.sort()) {
        const e = scryfallById.get(id)!;
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }
  }
}
