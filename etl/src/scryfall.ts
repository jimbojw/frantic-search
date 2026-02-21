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

export type OracleCardsEntry = z.infer<typeof BulkDataEntrySchema>;

export async function fetchMetadata(
  verbose: boolean,
): Promise<OracleCardsEntry> {
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

  const entry = parsed.data.data.find((e) => e.type === "oracle_cards");
  if (!entry) {
    throw new Error(
      'Scryfall API returned no "oracle_cards" entry in bulk-data list',
    );
  }

  log(
    `Found oracle_cards: updated_at=${entry.updated_at}, size=${entry.size}`,
    verbose,
  );

  return entry;
}
