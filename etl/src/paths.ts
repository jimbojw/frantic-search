// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

export const RAW_DIR = path.join(PROJECT_ROOT, "data", "raw");
export const INTERMEDIATE_DIR = path.join(PROJECT_ROOT, "data", "intermediate");
export const ORACLE_CARDS_PATH = path.join(RAW_DIR, "oracle-cards.json");
export const META_PATH = path.join(RAW_DIR, "meta.json");
export const COLUMNS_PATH = path.join(INTERMEDIATE_DIR, "columns.json");

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

export function ensureIntermediateDir(): void {
  fs.mkdirSync(INTERMEDIATE_DIR, { recursive: true });
}

export function readLocalMeta(): LocalMeta | null {
  try {
    const raw = fs.readFileSync(META_PATH, "utf-8");
    return LocalMetaSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalMeta(meta: LocalMeta): void {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
}
