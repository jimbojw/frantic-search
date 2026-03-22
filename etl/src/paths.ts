// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

export const RAW_DIR = path.join(PROJECT_ROOT, "data", "raw");
export const DIST_DIR = path.join(PROJECT_ROOT, "data", "dist");
export const ORACLE_CARDS_PATH = path.join(RAW_DIR, "oracle-cards.json");
export const DEFAULT_CARDS_PATH = path.join(RAW_DIR, "default-cards.json");
export const ORACLE_TAGS_PATH = path.join(RAW_DIR, "oracle-tags.json");
export const ILLUSTRATION_TAGS_PATH = path.join(RAW_DIR, "illustration-tags.json");
export const ATOMIC_CARDS_PATH = path.join(RAW_DIR, "atomic-cards.json");
export const ATOMIC_CARDS_META_PATH = path.join(RAW_DIR, "atomic-cards-meta.json");
export const META_PATH = path.join(RAW_DIR, "meta.json");
export const DEFAULT_CARDS_META_PATH = path.join(RAW_DIR, "default-cards-meta.json");
export const COLUMNS_PATH = path.join(DIST_DIR, "columns.json");
export const THUMBS_PATH = path.join(DIST_DIR, "thumb-hashes.json");
export const PRINTINGS_PATH = path.join(DIST_DIR, "printings.json");
export const OTAGS_PATH = path.join(DIST_DIR, "otags.json");
export const ATAGS_PATH = path.join(DIST_DIR, "atags.json");
export const FLAVOR_INDEX_PATH = path.join(DIST_DIR, "flavor-index.json");
export const ARTIST_INDEX_PATH = path.join(DIST_DIR, "artist-index.json");
export const THUMBHASH_DIR = path.join(PROJECT_ROOT, "data", "thumbhash");
export const ART_CROP_MANIFEST_PATH = path.join(THUMBHASH_DIR, "art-crop-thumbhash-manifest.json");
export const CARD_MANIFEST_PATH = path.join(THUMBHASH_DIR, "card-thumbhash-manifest.json");
export const LEGACY_MANIFEST_PATH = path.join(THUMBHASH_DIR, "manifest.json");
export const TCGCSV_GROUPS_PATH = path.join(RAW_DIR, "tcgcsv-groups.json");
export const TCGCSV_PRODUCTS_DIR = path.join(RAW_DIR, "tcgcsv-products");
export const TCGCSV_META_PATH = path.join(RAW_DIR, "tcgcsv-meta.json");
export const TCGCSV_PRODUCT_MAP_PATH = path.join(DIST_DIR, "tcgcsv-product-map.json");

const LocalMetaSchema = z.object({
  updated_at: z.string(),
  download_uri: z.string(),
  size: z.number(),
  type: z.string(),
});

export type LocalMeta = z.infer<typeof LocalMetaSchema>;

export function ensureDataDir(): void {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

export function ensureDistDir(): void {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

export function readLocalMeta(): LocalMeta | null {
  return readLocalMetaFor(META_PATH);
}

export function writeLocalMeta(meta: LocalMeta): void {
  writeLocalMetaFor(META_PATH, meta);
}

export function readLocalMetaFor(metaPath: string): LocalMeta | null {
  try {
    const raw = fs.readFileSync(metaPath, "utf-8");
    return LocalMetaSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalMetaFor(metaPath: string, meta: LocalMeta): void {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
