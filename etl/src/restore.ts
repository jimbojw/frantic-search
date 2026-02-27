// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import axios from "axios";
import { COLUMNS_PATH, THUMBS_PATH } from "./paths";
import {
  loadArtCropManifest,
  loadCardManifest,
  saveArtCropManifest,
  saveCardManifest,
  type Manifest,
} from "./thumbhash";
import { log } from "./log";

export function reconstructManifest(
  scryfallIds: string[],
  thumbHashes: string[],
): Manifest {
  const manifest: Manifest = {};
  const len = Math.min(scryfallIds.length, thumbHashes.length);
  for (let i = 0; i < len; i++) {
    const id = scryfallIds[i];
    const hash = thumbHashes[i];
    if (id && hash) {
      manifest[id] = hash;
    }
  }
  return manifest;
}

export function mergeManifests(
  existing: Manifest,
  restored: Manifest,
): Manifest {
  return { ...restored, ...existing };
}

interface ColumnsData {
  scryfall_ids?: string[];
  // Pre-split format: thumb hashes inline in columns.json
  art_crop_thumb_hashes?: string[];
  card_thumb_hashes?: string[];
  thumb_hashes?: string[];
}

interface ThumbHashData {
  art_crop?: string[];
  card?: string[];
}

async function fetchJson<T>(url: string, verbose: boolean): Promise<T | null> {
  log(`Fetching ${url}…`, verbose);
  try {
    const response = await axios.get<T>(url, { timeout: 30_000 });
    return response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Warning: could not fetch ${url} — ${msg}`, verbose);
    return null;
  }
}

function readLocalJson<T>(filePath: string, verbose: boolean): T | null {
  log(`Reading local ${filePath}…`, verbose);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    log(`${filePath} not found — skipping`, verbose);
    return null;
  }
}

function restoreOneManifest(
  label: string,
  scryfallIds: string[],
  hashes: string[] | undefined,
  loadExisting: () => Manifest,
  save: (m: Manifest) => void,
  verbose: boolean,
): void {
  if (!Array.isArray(hashes)) {
    log(`No ${label} column found — skipping`, verbose);
    return;
  }

  const restored = reconstructManifest(scryfallIds, hashes);
  const restoredCount = Object.keys(restored).length;
  log(`Reconstructed ${restoredCount} ${label} entries from columns data`, verbose);

  if (restoredCount === 0) {
    log(`No ${label} entries to restore`, true);
    return;
  }

  const existing = loadExisting();
  const existingCount = Object.keys(existing).length;
  log(`Existing ${label} manifest has ${existingCount} entries`, verbose);

  const merged = mergeManifests(existing, restored);
  const mergedCount = Object.keys(merged).length;
  const added = mergedCount - existingCount;

  save(merged);
  log(
    `Restored ${label} manifest: ${mergedCount} total entries` +
      (added > 0 ? ` (${added} new from previous deployment)` : " (no new entries)"),
    true,
  );
}

export interface RestoreOptions {
  siteUrl?: string;
  verbose: boolean;
}

export async function restoreManifest(options: RestoreOptions): Promise<void> {
  const { siteUrl, verbose } = options;

  const columnsData = siteUrl
    ? await fetchJson<ColumnsData>(siteUrl.replace(/\/+$/, "") + "/columns.json", verbose)
    : readLocalJson<ColumnsData>(COLUMNS_PATH, verbose);

  if (!columnsData) {
    return;
  }

  const { scryfall_ids } = columnsData;
  if (!Array.isArray(scryfall_ids)) {
    log("Warning: columns data missing scryfall_ids — skipping restore", true);
    return;
  }

  // Try the separate thumb-hashes.json first (post-split format)
  const thumbsData = siteUrl
    ? await fetchJson<ThumbHashData>(siteUrl.replace(/\/+$/, "") + "/thumb-hashes.json", verbose)
    : readLocalJson<ThumbHashData>(THUMBS_PATH, verbose);

  // Resolve art crop hashes: thumb-hashes.json > inline column > legacy column name
  const artCropHashes =
    thumbsData?.art_crop ??
    columnsData.art_crop_thumb_hashes ??
    columnsData.thumb_hashes;

  // Resolve card hashes: thumb-hashes.json > inline column
  const cardHashes =
    thumbsData?.card ??
    columnsData.card_thumb_hashes;

  restoreOneManifest(
    "art crop",
    scryfall_ids,
    artCropHashes,
    loadArtCropManifest,
    saveArtCropManifest,
    verbose,
  );

  restoreOneManifest(
    "card image",
    scryfall_ids,
    cardHashes,
    loadCardManifest,
    saveCardManifest,
    verbose,
  );
}
