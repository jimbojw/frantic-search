// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import fs from "node:fs";
import {
  ensureDataDir,
  TCGCSV_GROUPS_PATH,
  TCGCSV_PRODUCTS_DIR,
  TCGCSV_META_PATH,
} from "./paths";
import { log } from "./log";

const BASE_URL = "https://tcgcsv.com";
const LAST_UPDATED_URL = `${BASE_URL}/last-updated.txt`;
const GROUPS_URL = `${BASE_URL}/tcgplayer/1/groups`;
const USER_AGENT = "FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)";
const FRESHNESS_MS = 24 * 60 * 60 * 1000;
const PRODUCT_FETCH_DELAY_MS = 150;

interface TcgcsvMeta {
  lastUpdated: string;
  groupsEtag?: string;
  groupIds?: number[];
  groupAbbrevs?: Record<string, string>;
  etags?: Record<string, string>;
}

interface TcgcsvGroupResult {
  groupId: number;
  abbreviation?: string;
}

interface TcgcsvGroupsResponse {
  success?: boolean;
  results?: TcgcsvGroupResult[];
}

function isFileFresh(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < FRESHNESS_MS;
  } catch {
    return false;
  }
}

function readMeta(): TcgcsvMeta | null {
  try {
    const raw = fs.readFileSync(TCGCSV_META_PATH, "utf-8");
    return JSON.parse(raw) as TcgcsvMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: TcgcsvMeta): void {
  const tmpPath = TCGCSV_META_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2) + "\n");
  fs.renameSync(tmpPath, TCGCSV_META_PATH);
}

function writeAtomically(filePath: string, content: string): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

async function fetchLastUpdated(): Promise<string | null> {
  try {
    const response = await axios.get(LAST_UPDATED_URL, {
      headers: { "User-Agent": USER_AGENT },
      responseType: "text",
      validateStatus: (s) => s === 200,
    });
    if (response.status !== 200) return null;
    const trimmed = (response.data as string).trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/** Normalize ETag for storage: strip outer quotes to avoid escaped quotes in JSON. */
function normalizeEtagForStorage(etag: string): string {
  if (etag.length >= 2 && etag.startsWith('"') && etag.endsWith('"')) {
    return etag.slice(1, -1);
  }
  return etag;
}

/** Format ETag for If-None-Match header: add quotes for strong ETags if not already quoted. */
function formatEtagForHeader(etag: string): string {
  if (etag.startsWith("W/")) return etag;
  if (etag.startsWith('"') && etag.endsWith('"')) return etag;
  return `"${etag}"`;
}

function parseGroupsResponse(body: string): { groupIds: number[]; groupAbbrevs: Record<string, string> } {
  const data = JSON.parse(body) as TcgcsvGroupsResponse;
  const groupIds: number[] = [];
  const groupAbbrevs: Record<string, string> = {};
  const results = data.results ?? [];
  for (const g of results) {
    if (g.groupId != null) {
      groupIds.push(g.groupId);
      if (g.abbreviation != null && g.abbreviation !== "") {
        groupAbbrevs[String(g.groupId)] = g.abbreviation;
      }
    }
  }
  return { groupIds, groupAbbrevs };
}

export async function runDownloadTcgcsv(options: {
  force: boolean;
  verbose: boolean;
}): Promise<void> {
  const { force, verbose } = options;
  ensureDataDir();
  fs.mkdirSync(TCGCSV_PRODUCTS_DIR, { recursive: true });

  let lastUpdated: string | null = await fetchLastUpdated();

  if (!lastUpdated) {
    if (!force && isFileFresh(TCGCSV_GROUPS_PATH)) {
      log("TCGCSV up to date (mtime fallback)", true);
      return;
    }
    log("TCGCSV last-updated.txt fetch failed; attempting download with mtime fallback", verbose);
    lastUpdated = new Date().toISOString().replace(/\.\d{3}Z$/, "+0000");
  } else if (!force) {
    const meta = readMeta();
    if (meta && meta.lastUpdated === lastUpdated) {
      log("TCGCSV up to date", true);
      return;
    }
  }

  const meta = readMeta() ?? { lastUpdated };
  meta.lastUpdated = lastUpdated;

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (!force && meta.groupsEtag) {
    headers["If-None-Match"] = formatEtagForHeader(meta.groupsEtag);
  }

  let groupIds: number[];
  let groupAbbrevs: Record<string, string>;

  try {
    log("Fetching TCGCSV groups…", verbose);
    const groupsResponse = await axios.get(GROUPS_URL, {
      headers,
      responseType: "text",
      validateStatus: (s) => s === 200 || s === 304,
    });

    if (groupsResponse.status === 304) {
      if (meta.groupIds && meta.groupAbbrevs) {
        groupIds = meta.groupIds;
        groupAbbrevs = meta.groupAbbrevs;
        log("Groups unchanged (304)", verbose);
      } else {
        process.stderr.write("Warning: TCGCSV groups returned 304 but meta has no groupIds; skipping\n");
        return;
      }
    } else {
      const body = groupsResponse.data as string;
      writeAtomically(TCGCSV_GROUPS_PATH, body);
      const parsed = parseGroupsResponse(body);
      groupIds = parsed.groupIds;
      groupAbbrevs = parsed.groupAbbrevs;
      meta.groupIds = groupIds;
      meta.groupAbbrevs = groupAbbrevs;
      const etag = groupsResponse.headers["etag"];
      if (etag != null) meta.groupsEtag = normalizeEtagForStorage(String(etag));
      log(`Groups: ${groupIds.length} groups`, verbose);
    }
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? `HTTP ${err.response?.status ?? "error"}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
    process.stderr.write(`Warning: TCGCSV groups fetch failed: ${msg}\n`);
    return;
  }

  meta.etags = meta.etags ?? {};
  let productCount = 0;

  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    const productUrl = `${BASE_URL}/tcgplayer/1/${groupId}/products`;

    const productHeaders: Record<string, string> = { "User-Agent": USER_AGENT };
    const storedEtag = meta.etags[String(groupId)];
    if (!force && storedEtag) {
      productHeaders["If-None-Match"] = formatEtagForHeader(storedEtag);
    }

    try {
      const productResponse = await axios.get(productUrl, {
        headers: productHeaders,
        responseType: "text",
        validateStatus: (s) => s === 200 || s === 304,
      });

      if (productResponse.status === 304) {
        if (verbose && (i + 1) % 50 === 0) {
          log(`Products: ${i + 1}/${groupIds.length} groups checked`, verbose);
        }
      } else {
        const body = productResponse.data as string;
        const destPath = `${TCGCSV_PRODUCTS_DIR}/${groupId}.json`;
        writeAtomically(destPath, body);
        const etag = productResponse.headers["etag"];
        if (etag != null) meta.etags[String(groupId)] = normalizeEtagForStorage(String(etag));
        productCount++;
      }
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? "error"}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
      process.stderr.write(`Warning: TCGCSV products for group ${groupId} failed: ${msg}\n`);
    }

    if (i < groupIds.length - 1) {
      await new Promise((r) => setTimeout(r, PRODUCT_FETCH_DELAY_MS));
    }
  }

  writeMeta(meta);
  log(`TCGCSV download complete: ${productCount} product files updated`, true);
}
