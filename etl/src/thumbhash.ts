// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import axios from "axios";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import {
  ORACLE_CARDS_PATH,
  THUMBHASH_DIR,
  ART_CROP_MANIFEST_PATH,
  CARD_MANIFEST_PATH,
  LEGACY_MANIFEST_PATH,
} from "./paths";
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

function readManifestFile(filePath: string): Manifest {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Manifest;
    }
  } catch {
    // Missing or corrupt — start fresh
  }
  return {};
}

export function loadArtCropManifest(): Manifest {
  const manifest = readManifestFile(ART_CROP_MANIFEST_PATH);
  if (Object.keys(manifest).length > 0) return manifest;
  // Migration fallback: try old name
  return readManifestFile(LEGACY_MANIFEST_PATH);
}

export function loadCardManifest(): Manifest {
  return readManifestFile(CARD_MANIFEST_PATH);
}

function writeManifestFile(filePath: string, manifest: Manifest): void {
  fs.mkdirSync(THUMBHASH_DIR, { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(manifest) + "\n");
  fs.renameSync(tmp, filePath);
}

export function saveArtCropManifest(manifest: Manifest): void {
  writeManifestFile(ART_CROP_MANIFEST_PATH, manifest);
}

export function saveCardManifest(manifest: Manifest): void {
  writeManifestFile(CARD_MANIFEST_PATH, manifest);
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

function cardImageUrl(id: string): string {
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

async function downloadAndHash(url: string): Promise<string> {
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

interface PhaseResult {
  generated: number;
  errors: number;
}

async function processPhase(
  label: string,
  manifest: Manifest,
  missing: string[],
  urlFn: (id: string) => string,
  deadline: number,
  delay: number,
  verbose: boolean,
): Promise<PhaseResult> {
  let generated = 0;
  let errors = 0;

  for (const id of missing) {
    if (Date.now() >= deadline) {
      log(`${label}: timeout reached`, true);
      break;
    }

    try {
      manifest[id] = await downloadAndHash(urlFn(id));
      generated++;
      if (verbose && generated % 50 === 0) {
        log(`  ${label}: ${generated} hashes generated…`, true);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      log(`  Warning: ${id} — ${msg}`, verbose);
    }

    await sleep(delay);
  }

  return { generated, errors };
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

  const artCropManifest = loadArtCropManifest();
  const cardManifest = loadCardManifest();
  log(`Loaded art crop manifest with ${Object.keys(artCropManifest).length} entries`, verbose);
  log(`Loaded card image manifest with ${Object.keys(cardManifest).length} entries`, verbose);

  const oracleIds = loadOracleIds();
  const validIds = new Set(oracleIds);
  log(`Loaded ${oracleIds.length} oracle card IDs`, verbose);

  const artCropPruned = pruneManifest(artCropManifest, validIds);
  const cardPruned = pruneManifest(cardManifest, validIds);
  if (artCropPruned > 0) log(`Pruned ${artCropPruned} stale art crop entries`, true);
  if (cardPruned > 0) log(`Pruned ${cardPruned} stale card image entries`, true);

  const artCropMissing = oracleIds.filter((id) => !(id in artCropManifest));
  const cardMissing = oracleIds.filter((id) => !(id in cardManifest));
  log(`${artCropMissing.length} cards missing art crop ThumbHashes`, verbose);
  log(`${cardMissing.length} cards missing card image ThumbHashes`, verbose);

  if (artCropMissing.length === 0 && cardMissing.length === 0) {
    log("All cards have ThumbHashes — nothing to do", true);
    saveArtCropManifest(artCropManifest);
    saveCardManifest(cardManifest);
    return;
  }

  const deadline = Date.now() + timeout * 1000;

  const artResult = await processPhase(
    "Art crops", artCropManifest, artCropMissing,
    artCropUrl, deadline, delay, verbose,
  );

  const cardResult = await processPhase(
    "Card images", cardManifest, cardMissing,
    cardImageUrl, deadline, delay, verbose,
  );

  saveArtCropManifest(artCropManifest);
  saveCardManifest(cardManifest);

  const artTotal = Object.keys(artCropManifest).length;
  const cardTotal = Object.keys(cardManifest).length;
  const artRemaining = oracleIds.length - artTotal;
  const cardRemaining = oracleIds.length - cardTotal;
  const totalErrors = artResult.errors + cardResult.errors;

  log(
    `Art crops: ${artResult.generated} new, ${artTotal} total, ${artCropPruned} pruned, ${artRemaining} remaining`,
    true,
  );
  log(
    `Card images: ${cardResult.generated} new, ${cardTotal} total, ${cardPruned} pruned, ${cardRemaining} remaining`,
    true,
  );
  if (totalErrors > 0) {
    log(`${totalErrors} total errors (${artResult.errors} art crop, ${cardResult.errors} card image)`, true);
  }
}
