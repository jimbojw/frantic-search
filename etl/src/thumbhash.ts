// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { ORACLE_CARDS_PATH, THUMBHASH_DIR, MANIFEST_PATH } from "./paths";
import { log } from "./log";

const FILTERED_LAYOUTS = new Set([
  "art_series",
  "token",
  "double_faced_token",
  "emblem",
  "planar",
  "scheme",
  "vanguard",
  "augment",
  "host",
]);

interface OracleCard {
  id?: string;
  layout?: string;
}

export type Manifest = Record<string, string>;

export function loadManifest(): Manifest {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Manifest;
    }
  } catch {
    // Missing or corrupt — start fresh
  }
  return {};
}

export function saveManifest(manifest: Manifest): void {
  fs.mkdirSync(THUMBHASH_DIR, { recursive: true });
  const tmp = MANIFEST_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(manifest) + "\n");
  fs.renameSync(tmp, MANIFEST_PATH);
}

export function loadOracleIds(): string[] {
  const raw = fs.readFileSync(ORACLE_CARDS_PATH, "utf-8");
  const cards: OracleCard[] = JSON.parse(raw);
  const ids: string[] = [];
  for (const card of cards) {
    if (!card.id) continue;
    if (FILTERED_LAYOUTS.has(card.layout ?? "normal")) continue;
    ids.push(card.id);
  }
  return ids;
}

export function pruneManifest(
  manifest: Manifest,
  validIds: Set<string>,
): number {
  let pruned = 0;
  for (const id of Object.keys(manifest)) {
    if (!validIds.has(id)) {
      delete manifest[id];
      pruned++;
    }
  }
  return pruned;
}

function artCropUrl(id: string): string {
  return `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;
}

async function downloadAndHash(id: string): Promise<string> {
  const url = artCropUrl(id);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
  });
  const { data, info } = await sharp(Buffer.from(response.data))
    .resize(100, 100, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hash = rgbaToThumbHash(info.width, info.height, data);
  return Buffer.from(hash).toString("base64");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ThumbHashOptions {
  timeout: number;
  delay: number;
  verbose: boolean;
}

export async function generateThumbHashes(
  options: ThumbHashOptions,
): Promise<void> {
  const { timeout, delay, verbose } = options;

  const manifest = loadManifest();
  log(`Loaded manifest with ${Object.keys(manifest).length} entries`, verbose);

  const oracleIds = loadOracleIds();
  const validIds = new Set(oracleIds);
  log(`Loaded ${oracleIds.length} oracle card IDs`, verbose);

  const pruned = pruneManifest(manifest, validIds);
  if (pruned > 0) {
    log(`Pruned ${pruned} stale entries`, true);
  }

  const missing = oracleIds.filter((id) => !(id in manifest));
  log(`${missing.length} cards missing ThumbHashes`, verbose);

  if (missing.length === 0) {
    log("All cards have ThumbHashes — nothing to do", true);
    saveManifest(manifest);
    return;
  }

  const deadline = Date.now() + timeout * 1000;
  let generated = 0;
  let errors = 0;

  for (const id of missing) {
    if (Date.now() >= deadline) {
      log(`Timeout reached after ${timeout}s`, true);
      break;
    }

    try {
      manifest[id] = await downloadAndHash(id);
      generated++;
      if (verbose && generated % 50 === 0) {
        log(`  ${generated} hashes generated…`, true);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      log(`  Warning: ${id} — ${msg}`, verbose);
    }

    await sleep(delay);
  }

  saveManifest(manifest);
  const total = Object.keys(manifest).length;
  const remaining = oracleIds.length - total;
  log(
    `Done: ${generated} new, ${total} total, ${pruned} pruned, ${remaining} remaining` +
      (errors > 0 ? `, ${errors} errors` : ""),
    true,
  );
}
