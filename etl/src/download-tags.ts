// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import fs from "node:fs";
import { z } from "zod";
import { ensureDataDir, ILLUSTRATION_TAGS_PATH, ORACLE_TAGS_PATH } from "./paths";
import { log } from "./log";

const ORACLE_TAGS_URL = "https://api.scryfall.com/private/tags/oracle";
const ILLUSTRATION_TAGS_URL = "https://api.scryfall.com/private/tags/illustration";
const USER_AGENT = "FranticSearch-ETL/1.0 (+https://github.com/jimbojw/frantic-search)";
const FRESHNESS_MS = 24 * 60 * 60 * 1000;

const OracleTagEntrySchema = z.object({
  object: z.literal("tag"),
  id: z.string(),
  label: z.string(),
  type: z.literal("oracle"),
  description: z.string().nullable(),
  oracle_ids: z.array(z.string()),
});

const IllustrationTagEntrySchema = z.object({
  object: z.literal("tag"),
  id: z.string(),
  label: z.string(),
  type: z.literal("illustration"),
  description: z.string().nullable(),
  illustration_ids: z.array(z.string()),
});

const OracleTagResponseSchema = z.object({
  object: z.literal("list"),
  has_more: z.literal(false),
  data: z.array(OracleTagEntrySchema),
});

const IllustrationTagResponseSchema = z.object({
  object: z.literal("list"),
  has_more: z.literal(false),
  data: z.array(IllustrationTagEntrySchema),
});

function isFileFresh(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < FRESHNESS_MS;
  } catch {
    return false;
  }
}

function writeAtomically(filePath: string, data: unknown): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmpPath, filePath);
}

async function downloadTags(
  url: string,
  destPath: string,
  schema: z.ZodType<{ object: "list"; has_more: false; data: unknown[] }>,
  label: string,
  verbose: boolean,
): Promise<boolean> {
  try {
    log(`Downloading ${label}…`, verbose);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      responseType: "json",
    });
    const parsed = schema.parse(response.data);
    writeAtomically(destPath, parsed);
    log(`Download complete → ${destPath}`, true);
    return true;
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(
        `Warning: ${label} schema validation failed: ${err.message}\n`,
      );
    } else if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const msg = status
        ? `HTTP ${status}`
        : err.message || "Network error";
      process.stderr.write(`Warning: ${label} download failed: ${msg}\n`);
    } else {
      process.stderr.write(
        `Warning: ${label} download failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return false;
  }
}

export async function runDownloadTags(options: {
  force: boolean;
  verbose: boolean;
}): Promise<void> {
  const { force, verbose } = options;
  ensureDataDir();

  const endpoints: Array<{
    url: string;
    path: string;
    schema: z.ZodType<{ object: "list"; has_more: false; data: unknown[] }>;
    label: string;
  }> = [
    {
      url: ORACLE_TAGS_URL,
      path: ORACLE_TAGS_PATH,
      schema: OracleTagResponseSchema,
      label: "Oracle tags",
    },
    {
      url: ILLUSTRATION_TAGS_URL,
      path: ILLUSTRATION_TAGS_PATH,
      schema: IllustrationTagResponseSchema,
      label: "Illustration tags",
    },
  ];

  for (const { url, path, schema, label } of endpoints) {
    const shouldDownload = force || !isFileFresh(path);
    if (shouldDownload) {
      await downloadTags(url, path, schema, label, verbose);
    } else {
      log(`${label} up to date`, true);
    }
  }
}
