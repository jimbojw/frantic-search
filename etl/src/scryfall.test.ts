// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { fetchBulkMetadata } from "./scryfall";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BulkDataEntrySchema = z.object({
  type: z.string(),
  updated_at: z.string(),
  jsonl_download_uri: z.string().url(),
  compressed_size: z.number(),
});

const BulkDataResponseSchema = z.object({
  data: z.array(BulkDataEntrySchema),
});

describe("Scryfall bulk-data schema", () => {
  test("parses current API response fixture", () => {
    const raw = readFileSync(
      join(__dirname, "../fixtures/bulk-data-response.json"),
      "utf-8",
    );
    const parsed = BulkDataResponseSchema.parse(JSON.parse(raw));
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].type).toBe("oracle_cards");
    expect(parsed.data[1].type).toBe("default_cards");
  });
});

describe("fetchBulkMetadata", () => {
  test("finds oracle_cards and default_cards from pre-fetched list", async () => {
    const raw = readFileSync(
      join(__dirname, "../fixtures/bulk-data-response.json"),
      "utf-8",
    );
    const { data } = BulkDataResponseSchema.parse(JSON.parse(raw));

    const oracle = await fetchBulkMetadata("oracle_cards", false, data);
    expect(oracle.jsonl_download_uri).toContain("oracle-cards");
    expect(oracle.compressed_size).toBe(24443680);

    const defaults = await fetchBulkMetadata("default_cards", false, data);
    expect(defaults.jsonl_download_uri).toContain("default-cards");
    expect(defaults.compressed_size).toBe(77332681);
  });

  test("throws when bulk type is missing", async () => {
    const raw = readFileSync(
      join(__dirname, "../fixtures/bulk-data-response.json"),
      "utf-8",
    );
    const { data } = BulkDataResponseSchema.parse(JSON.parse(raw));

    await expect(
      fetchBulkMetadata("all_cards", false, data),
    ).rejects.toThrow(/no "all_cards" entry/);
  });
});
