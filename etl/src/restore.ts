// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import axios from "axios";
import { COLUMNS_PATH } from "./paths";
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
  art_crop_thumb_hashes?: string[];
  card_thumb_hashes?: string[];
  // Migration fallback: old column name
  thumb_hashes?: string[];
}

async function fetchColumnsData(
  siteUrl: string,
  verbose: boolean,
): Promise<ColumnsData | null> {
  const url = siteUrl.replace(/\/+$/, "") + "/columns.json";
  log(`Fetching ${url}…`, verbose);
  try {
    const response = await axios.get<ColumnsData>(url, { timeout: 30_000 });
    return response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Warning: could not fetch from site — ${msg}`, true);
    return null;
  }
}

function readLocalColumnsData(verbose: boolean): ColumnsData | null {
  log(`Reading local ${COLUMNS_PATH}…`, verbose);
  try {
    const raw = fs.readFileSync(COLUMNS_PATH, "utf-8");
    return JSON.parse(raw) as ColumnsData;
  } catch {
    log("No local columns.json found — skipping restore", true);
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
    ? await fetchColumnsData(siteUrl, verbose)
    : readLocalColumnsData(verbose);

  if (!columnsData) {
    return;
  }

  const { scryfall_ids } = columnsData;
  if (!Array.isArray(scryfall_ids)) {
    log("Warning: columns data missing scryfall_ids — skipping restore", true);
    return;
  }

  // Art crop: prefer new column name, fall back to old name
  const artCropHashes = columnsData.art_crop_thumb_hashes ?? columnsData.thumb_hashes;

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
    columnsData.card_thumb_hashes,
    loadCardManifest,
    saveCardManifest,
    verbose,
  );
}
