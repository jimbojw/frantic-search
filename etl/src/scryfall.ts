// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import { z } from "zod";
import { log } from "./log";

const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";

const BulkDataEntrySchema = z.object({
  type: z.string(),
  updated_at: z.string(),
  download_uri: z.string().url(),
  size: z.number(),
  content_encoding: z.string().optional(),
});

const BulkDataResponseSchema = z.object({
  data: z.array(BulkDataEntrySchema),
});

export type BulkDataEntry = z.infer<typeof BulkDataEntrySchema>;

/** @deprecated Use fetchBulkMetadata("oracle_cards", verbose) instead. */
export type OracleCardsEntry = BulkDataEntry;

export async function fetchBulkMetadata(
  bulkType: string,
  verbose: boolean,
): Promise<BulkDataEntry> {
  log(`GET ${BULK_DATA_URL}`, verbose);

  const response = await axios.get(BULK_DATA_URL, {
    headers: { Accept: "application/json" },
  });

  const parsed = BulkDataResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(
      `Scryfall API response failed schema validation: ${parsed.error.message}`,
    );
  }

  const entry = parsed.data.data.find((e) => e.type === bulkType);
  if (!entry) {
    throw new Error(
      `Scryfall API returned no "${bulkType}" entry in bulk-data list`,
    );
  }

  log(
    `Found ${bulkType}: updated_at=${entry.updated_at}, size=${entry.size}`,
    verbose,
  );

  return entry;
}

export async function fetchMetadata(
  verbose: boolean,
): Promise<BulkDataEntry> {
  return fetchBulkMetadata("oracle_cards", verbose);
}
