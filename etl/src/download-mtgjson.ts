// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import {
  ensureDataDir,
  ATOMIC_CARDS_PATH,
  ATOMIC_CARDS_META_PATH,
} from "./paths";
import { log } from "./log";

const META_URL = "https://mtgjson.com/api/v5/Meta.json";
const ATOMIC_CARDS_URL = "https://mtgjson.com/api/v5/AtomicCards.json.gz";
const USER_AGENT = "FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)";
const FRESHNESS_MS = 24 * 60 * 60 * 1000;

const MtGjsonMetaResponseSchema = z.object({
  meta: z.object({
    date: z.string(),
    version: z.string(),
  }),
});

const MtGjsonStoredMetaSchema = z.object({
  date: z.string(),
  version: z.string(),
});

type MtGjsonMeta = z.infer<typeof MtGjsonStoredMetaSchema>;

function isFileFresh(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < FRESHNESS_MS;
  } catch {
    return false;
  }
}

async function fetchMeta(): Promise<MtGjsonMeta | null> {
  try {
    const response = await axios.get(META_URL, {
      headers: { "User-Agent": USER_AGENT },
      responseType: "json",
    });
    const parsed = MtGjsonMetaResponseSchema.parse(response.data);
    return parsed.meta;
  } catch {
    return null;
  }
}

function readStoredMeta(): MtGjsonMeta | null {
  try {
    const raw = fs.readFileSync(ATOMIC_CARDS_META_PATH, "utf-8");
    return MtGjsonStoredMetaSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredMeta(meta: MtGjsonMeta): void {
  fs.writeFileSync(
    ATOMIC_CARDS_META_PATH,
    JSON.stringify(meta, null, 2) + "\n",
  );
}

export async function runDownloadMtGjson(options: {
  force: boolean;
  verbose: boolean;
}): Promise<void> {
  const { force, verbose } = options;
  ensureDataDir();

  const remoteMeta = await fetchMeta();

  if (!remoteMeta) {
    // Fallback to 24h mtime heuristic
    if (!force && isFileFresh(ATOMIC_CARDS_PATH)) {
      log("MTGJSON AtomicCards up to date (mtime fallback)", true);
      return;
    }
    log("MTGJSON Meta fetch failed; attempting download with mtime fallback", verbose);
  } else if (!force) {
    const storedMeta = readStoredMeta();
    if (storedMeta && remoteMeta.date <= storedMeta.date) {
      log("MTGJSON AtomicCards up to date", true);
      return;
    }
  }

  const tmpPath = ATOMIC_CARDS_PATH + ".tmp";

  try {
    log("Downloading MTGJSON AtomicCards…", verbose);
    const response = await axios.get(ATOMIC_CARDS_URL, {
      headers: { "User-Agent": USER_AGENT },
      responseType: "stream",
    });

    const writer = fs.createWriteStream(tmpPath);
    await pipeline(response.data, createGunzip(), writer);

    fs.renameSync(tmpPath, ATOMIC_CARDS_PATH);

    if (remoteMeta) {
      writeStoredMeta(remoteMeta);
    } else {
      writeStoredMeta({
        date: new Date().toISOString().slice(0, 10),
        version: "unknown",
      });
    }

    log(`Download complete → ${ATOMIC_CARDS_PATH}`, true);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const msg = status ? `HTTP ${status}` : err.message || "Network error";
      process.stderr.write(`Warning: MTGJSON AtomicCards download failed: ${msg}\n`);
    } else {
      process.stderr.write(
        `Warning: MTGJSON AtomicCards download failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
