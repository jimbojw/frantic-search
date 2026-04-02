// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { parse, toScryfallQuery, EXTRAS_LAYOUT_SET, DEFAULT_OMIT_SET_CODES, CardFlag, PrintingFlag } from "@frantic-search/shared";
import type { UniqueMode } from "@frantic-search/shared";
import { NodeCache } from "@frantic-search/shared/src/search/evaluator";
import { CardIndex } from "@frantic-search/shared/src/search/card-index";
import { PrintingIndex } from "@frantic-search/shared/src/search/printing-index";
import type { ColumnarData, PrintingColumnarData } from "@frantic-search/shared/src/data";
import { buildCliEvalRefs } from "../cli-eval-refs";
import type { SupplementalDistPaths } from "../cli-eval-refs";

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
  oracleId?: string;
  key?: string;
}

interface ScryfallCardData {
  id: string;
  oracle_id?: string;
  illustration_id?: string | null;
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
    oracleId: c.oracle_id,
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
        oracleId: c.oracle_id,
      });
    }
    nextPage = pageResult.has_more ? pageResult.next_page : undefined;
  }

  return cards;
}

export function collectLocalCards(
  index: CardIndex,
  data: ColumnarData,
  printingData: PrintingColumnarData | null,
  printingIndex: PrintingIndex | null,
  indices: Uint32Array,
  printingIndices: Uint32Array | undefined,
  rawOracleCards?: RawOracleCard[],
): CardEntry[] {
  const entries: CardEntry[] = [];
  const seen = new Set<string>();

  if (printingIndices && printingIndex && printingData) {
    for (const pi of printingIndices) {
      const id = printingData.scryfall_ids[pi];
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const cf: number = printingData.canonical_face_ref[pi];
      const name = index.combinedNames[cf] ?? data.names[cf] ?? "";
      const setIdx = printingData.set_indices[pi];
      const set = printingData.set_lookup[setIdx]?.code ?? "—";
      const collectorNumber = printingData.collector_numbers[pi] ?? "—";
      const cardIdx = data.card_index[cf];
      const oracleId = rawOracleCards?.[cardIdx]?.oracle_id;

      entries.push({ id, name, set, collectorNumber, oracleId });
    }
  } else {
    for (const fi of indices) {
      const id = data.scryfall_ids[fi];
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const ci = data.card_index[fi];
      const name = index.combinedNames[fi] ?? data.names[fi] ?? "";
      const oracleId = rawOracleCards?.[ci]?.oracle_id;
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

      entries.push({ id, name, set, collectorNumber, oracleId });
    }
  }

  return entries;
}

export interface RawOracleCard {
  id?: string;
  oracle_id?: string;
}

interface NormalizedLocalResult {
  uniqueMode: UniqueMode;
  indices: number[];
  printingIndices?: number[];
  hasPrintingConditions: boolean;
  includeExtras: boolean;
}

function firstPrintingByFace(printingIndices: number[], pData: PrintingColumnarData): Map<number, number> {
  const out = new Map<number, number>();
  for (const pi of printingIndices) {
    const cf = pData.canonical_face_ref[pi];
    if (!out.has(cf)) out.set(cf, pi);
  }
  return out;
}

function dedupeArtPrintingIndices(printingIndices: number[], pData: PrintingColumnarData): number[] {
  const ill = pData.illustration_id_index;
  if (!ill) return [...printingIndices];
  const sentinel = 0xffffffff;
  const byFace = new Map<number, number[]>();
  for (const idx of printingIndices) {
    const cf = pData.canonical_face_ref[idx];
    let arr = byFace.get(cf);
    if (!arr) {
      arr = [];
      byFace.set(cf, arr);
    }
    arr.push(idx);
  }
  const out: number[] = [];
  for (const [, group] of byFace) {
    let maxIdx = 0;
    for (const idx of group) {
      if (ill[idx] > maxIdx) maxIdx = ill[idx];
    }
    const slots = new Uint32Array(maxIdx + 1);
    slots.fill(sentinel);
    for (const idx of group) {
      const art = ill[idx];
      if (slots[art] === sentinel) slots[art] = idx;
    }
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== sentinel) out.push(slots[i]);
    }
  }
  return out;
}

export function normalizeLocalParity(
  _data: ColumnarData,
  printingData: PrintingColumnarData | null,
  printingIndex: PrintingIndex | null,
  index: CardIndex,
  evalOut: {
    indices: Uint32Array;
    printingIndices?: Uint32Array;
    uniqueMode: UniqueMode;
    hasPrintingConditions: boolean;
    includeExtras: boolean;
    widenExtrasLayout: boolean;
    widenContentWarning: boolean;
    widenPlaytest: boolean;
    widenOversized: boolean;
    positiveSetPrefixes: string[];
  },
): NormalizedLocalResult {
  let deduped = Array.from(evalOut.indices);
  let rawPrintingIndices = evalOut.printingIndices
    ? Array.from(evalOut.printingIndices)
    : undefined;

  if (!evalOut.includeExtras) {
    const { widenExtrasLayout, widenContentWarning, widenPlaytest, widenOversized, positiveSetPrefixes } = evalOut;
    const isSetWidened = (setCode: string): boolean => {
      for (let i = 0; i < positiveSetPrefixes.length; i++) {
        if (setCode.startsWith(positiveSetPrefixes[i])) return true;
      }
      return false;
    };

    if (evalOut.hasPrintingConditions && rawPrintingIndices && printingIndex && printingData) {
      const filtered: number[] = [];
      for (const p of rawPrintingIndices) {
        const cf = printingIndex.canonicalFaceRef[p];
        const setCode = printingIndex.setCodesLower[p];
        const setWide = isSetWidened(setCode);

        if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue;
        if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue;
        if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue;
        if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue;
        if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue;

        filtered.push(p);
      }
      rawPrintingIndices = filtered;
      const seen = new Set<number>();
      const derived: number[] = [];
      for (const p of filtered) {
        const cf = printingIndex.canonicalFaceRef[p];
        if (!seen.has(cf)) {
          seen.add(cf);
          derived.push(cf);
        }
      }
      deduped = derived;
    } else if (printingIndex) {
      const survivingFaces: number[] = [];
      for (const fi of deduped) {
        if (!widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[fi])) continue;
        if (!widenContentWarning && (index.flags[fi] & CardFlag.ContentWarning) !== 0) continue;

        const printings = printingIndex.printingsOf(fi);
        let hasSurvivor = printings.length === 0;
        for (const p of printings) {
          const setCode = printingIndex.setCodesLower[p];
          const setWide = isSetWidened(setCode);
          if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue;
          if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue;
          if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue;
          hasSurvivor = true;
          break;
        }
        if (hasSurvivor) survivingFaces.push(fi);
      }
      deduped = survivingFaces;

      if (rawPrintingIndices) {
        const filtered: number[] = [];
        for (const p of rawPrintingIndices) {
          const cf = printingIndex.canonicalFaceRef[p];
          const setCode = printingIndex.setCodesLower[p];
          const setWide = isSetWidened(setCode);
          if (!setWide && !widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[cf])) continue;
          if (!setWide && !widenPlaytest && (printingIndex.promoTypesFlags1[p] & 1) !== 0) continue;
          if (!setWide && DEFAULT_OMIT_SET_CODES.has(setCode)) continue;
          if (!setWide && !widenContentWarning && (index.flags[cf] & CardFlag.ContentWarning) !== 0) continue;
          if (!setWide && !widenOversized && (printingIndex.printingFlags[p] & PrintingFlag.Oversized) !== 0) continue;
          filtered.push(p);
        }
        rawPrintingIndices = filtered;
      }
    } else {
      deduped = deduped.filter((fi) => {
        if (!widenExtrasLayout && EXTRAS_LAYOUT_SET.has(index.layouts[fi])) return false;
        if (!widenContentWarning && (index.flags[fi] & CardFlag.ContentWarning) !== 0) return false;
        return true;
      });
    }
  }

  let normalizedPrinting = rawPrintingIndices;
  if (normalizedPrinting && printingData) {
    if (evalOut.uniqueMode === "cards") {
      // For cards mode, printing rows are display metadata only; keep first match per card.
      normalizedPrinting = Array.from(firstPrintingByFace(normalizedPrinting, printingData).values());
    } else if (evalOut.uniqueMode === "art") {
      normalizedPrinting = dedupeArtPrintingIndices(normalizedPrinting, printingData);
    }
  }

  return {
    uniqueMode: evalOut.uniqueMode,
    indices: deduped,
    printingIndices: normalizedPrinting,
    hasPrintingConditions: evalOut.hasPrintingConditions,
    includeExtras: evalOut.includeExtras,
  };
}

export type ComparisonMode = "cards" | "prints" | "art";

export interface DiffComparison {
  mode: ComparisonMode;
  inBoth: number;
  onlyLocal: number;
  onlyScryfall: number;
  localOnlyEntries: CardEntry[];
  scryfallOnlyEntries: CardEntry[];
  note?: string;
}

function groupCountBy<T>(entries: T[], keyFn: (e: T) => string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = keyFn(e);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function compareBySetKeys(local: CardEntry[], scryfall: CardEntry[], keyFn: (e: CardEntry) => string | undefined, mode: ComparisonMode): DiffComparison {
  const localByKey = new Map<string, CardEntry>();
  for (const e of local) {
    const k = keyFn(e);
    if (!k || localByKey.has(k)) continue;
    localByKey.set(k, { ...e, key: k });
  }
  const scryByKey = new Map<string, CardEntry>();
  for (const e of scryfall) {
    const k = keyFn(e);
    if (!k || scryByKey.has(k)) continue;
    scryByKey.set(k, { ...e, key: k });
  }
  const localKeys = new Set(localByKey.keys());
  const scryKeys = new Set(scryByKey.keys());

  const inBothKeys = [...localKeys].filter((k) => scryKeys.has(k));
  const onlyLocalKeys = [...localKeys].filter((k) => !scryKeys.has(k));
  const onlyScryKeys = [...scryKeys].filter((k) => !localKeys.has(k));

  return {
    mode,
    inBoth: inBothKeys.length,
    onlyLocal: onlyLocalKeys.length,
    onlyScryfall: onlyScryKeys.length,
    localOnlyEntries: onlyLocalKeys.sort().map((k) => localByKey.get(k)!),
    scryfallOnlyEntries: onlyScryKeys.sort().map((k) => scryByKey.get(k)!),
  };
}

export function compareArtByOracleCounts(local: CardEntry[], scryfall: CardEntry[]): DiffComparison {
  const localCounts = groupCountBy(local, (e) => e.oracleId);
  const scryCounts = groupCountBy(scryfall, (e) => e.oracleId);
  const allOracleIds = new Set<string>([
    ...localCounts.keys(),
    ...scryCounts.keys(),
  ]);

  let inBoth = 0;
  let onlyLocal = 0;
  let onlyScryfall = 0;
  const localOnlyEntries: CardEntry[] = [];
  const scryfallOnlyEntries: CardEntry[] = [];

  for (const oid of allOracleIds) {
    const l = localCounts.get(oid) ?? 0;
    const s = scryCounts.get(oid) ?? 0;
    inBoth += Math.min(l, s);
    if (l > s) {
      onlyLocal += l - s;
      const sample = local.find((e) => e.oracleId === oid);
      if (sample) {
        localOnlyEntries.push({
          ...sample,
          key: `${oid} (+${l - s} art variants local)`,
        });
      }
    } else if (s > l) {
      onlyScryfall += s - l;
      const sample = scryfall.find((e) => e.oracleId === oid);
      if (sample) {
        scryfallOnlyEntries.push({
          ...sample,
          key: `${oid} (+${s - l} art variants scryfall)`,
        });
      }
    }
  }

  return {
    mode: "art",
    inBoth,
    onlyLocal,
    onlyScryfall,
    localOnlyEntries: localOnlyEntries.sort((a, b) => (a.key ?? "").localeCompare(b.key ?? "")),
    scryfallOnlyEntries: scryfallOnlyEntries.sort((a, b) => (a.key ?? "").localeCompare(b.key ?? "")),
    note: "Compared by oracle-level artwork counts (avoids false diffs from representative printing choice).",
  };
}

export function formatEntry(e: CardEntry, verbose: boolean): string {
  if (!verbose) return `  ${e.key ?? e.id}`;
  const extra = e.oracleId ? ` [oracle:${e.oracleId}]` : "";
  const keyInfo = e.key ? ` {key:${e.key}}` : "";
  return `  ${e.name} (${e.set}/${e.collectorNumber}) — ${e.id}${extra}${keyInfo}`;
}

export interface DiffOptions {
  dataPath: string;
  printingsPath: string;
  rawPath?: string;
  verbose: boolean;
  noSupplemental?: boolean;
  supplementalPaths?: Partial<SupplementalDistPaths>;
}

export async function runDiff(
  query: string,
  options: DiffOptions,
): Promise<void> {
  const { dataPath, printingsPath, rawPath, verbose, noSupplemental, supplementalPaths } = options;

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
    const pData = JSON.parse(fs.readFileSync(printingsPath, "utf-8")) as PrintingColumnarData;
    printingData = pData;
    printingIndex = new PrintingIndex(pData, data.scryfall_ids);
  }
  let rawOracleCards: RawOracleCard[] | undefined;
  if (rawPath && fs.existsSync(rawPath)) {
    rawOracleCards = JSON.parse(fs.readFileSync(rawPath, "utf-8")) as RawOracleCard[];
  }

  const distDir = path.dirname(dataPath);
  const { tagDataRef, keywordDataRef } = buildCliEvalRefs(data, printingData, distDir, {
    noSupplemental: !!noSupplemental,
    supplementalPaths,
  });
  const cache = new NodeCache(index, printingIndex, null, tagDataRef, keywordDataRef);
  const ast = parse(query);
  const evalOut = cache.evaluate(ast);
  const normalized = normalizeLocalParity(data, printingData, printingIndex, index, {
    indices: evalOut.indices,
    printingIndices: evalOut.printingIndices,
    uniqueMode: evalOut.uniqueMode,
    hasPrintingConditions: evalOut.hasPrintingConditions,
    includeExtras: evalOut.includeExtras,
    widenExtrasLayout: evalOut.widenExtrasLayout,
    widenContentWarning: evalOut.widenContentWarning,
    widenPlaytest: evalOut.widenPlaytest,
    widenOversized: evalOut.widenOversized,
    positiveSetPrefixes: evalOut.positiveSetPrefixes,
  });

  const localCards = collectLocalCards(
    index,
    data,
    printingData,
    printingIndex,
    new Uint32Array(normalized.indices),
    normalized.printingIndices ? new Uint32Array(normalized.printingIndices) : undefined,
    rawOracleCards,
  );

  const scryfallQuery = toScryfallQuery(ast);
  if (!scryfallQuery.trim()) {
    process.stderr.write("Error: Query could not be converted to Scryfall syntax.\n");
    process.exit(1);
  }

  process.stderr.write(`Fetching Scryfall results for: ${scryfallQuery}\n`);
  const scryfallCards = await fetchScryfallCards(scryfallQuery);

  let comparison: DiffComparison;
  if (normalized.uniqueMode === "prints") {
    comparison = compareBySetKeys(localCards, scryfallCards, (e) => e.id, "prints");
  } else if (normalized.uniqueMode === "cards") {
    comparison = compareBySetKeys(
      localCards,
      scryfallCards,
      (e) => e.oracleId ?? e.id,
      "cards",
    );
  } else {
    comparison = compareArtByOracleCounts(localCards, scryfallCards);
  }

  const sep = "--------------------------------------------------";
  process.stdout.write(`\nDiff Summary: "${query}"\n`);
  process.stdout.write(`${sep}\n`);
  process.stdout.write(`Comparison mode: ${comparison.mode}\n`);
  process.stdout.write(`Local unique mode: ${normalized.uniqueMode}\n`);
  process.stdout.write(`Local include:extras: ${normalized.includeExtras ? "yes" : "no"}\n`);
  process.stdout.write(`In Both: ${comparison.inBoth}\n`);
  process.stdout.write(`Only in Frantic Search: ${comparison.onlyLocal}\n`);
  process.stdout.write(`Only in Scryfall: ${comparison.onlyScryfall}\n`);
  if (comparison.note) process.stdout.write(`Note: ${comparison.note}\n`);

  if (comparison.onlyLocal > 0 || comparison.onlyScryfall > 0) {
    process.stdout.write(`\nDiscrepancies:\n`);
    process.stdout.write(`${sep}\n`);

    if (comparison.onlyLocal > 0) {
      process.stdout.write(`\n[Frantic Search Only]\n`);
      for (const e of comparison.localOnlyEntries) {
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }

    if (comparison.onlyScryfall > 0) {
      process.stdout.write(`\n[Scryfall Only]\n`);
      for (const e of comparison.scryfallOnlyEntries) {
        process.stdout.write(formatEntry(e, verbose) + "\n");
      }
    }
  }
}
