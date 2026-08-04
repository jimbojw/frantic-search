// SPDX-License-Identifier: Apache-2.0
import cac from "cac";
import { fetchBulkDataList } from "./scryfall";
import { downloadJsonlBulkToJsonArray } from "./download";
import {
  readLocalMeta,
  writeLocalMeta,
  readLocalMetaFor,
  writeLocalMetaFor,
  ensureDataDir,
  ORACLE_CARDS_PATH,
  DEFAULT_CARDS_PATH,
  DEFAULT_CARDS_META_PATH,
} from "./paths";
import { log } from "./log";
import { processCards } from "./process";
import { processPrintings } from "./process-printings";
import { processTags } from "./process-tags";
import { generateThumbHashes } from "./thumbhash";
import { restoreManifest } from "./restore";
import { runDownloadTags } from "./download-tags";
import { runDownloadMtGjson } from "./download-mtgjson";
import { runDownloadTcgcsv } from "./download-tcgcsv";
import { processTcgcsv } from "./process-tcgcsv";

const cli = cac("etl");

cli
  .command("download", "Download Oracle Cards and Default Cards bulk data from Scryfall")
  .option("--force", "Download even if local data is up to date", {
    default: false,
  })
  .option("--verbose", "Print detailed progress", { default: false })
  .action(async (options: { force: boolean; verbose: boolean }) => {
    const { force, verbose } = options;

    try {
      log("Fetching Scryfall bulk-data metadata…", verbose);
      const bulkData = await fetchBulkDataList(verbose);
      const oracleEntry = bulkData.find((e) => e.type === "oracle_cards");
      const defaultEntry = bulkData.find((e) => e.type === "default_cards");
      if (!oracleEntry) {
        throw new Error(
          'Scryfall API returned no "oracle_cards" entry in bulk-data list',
        );
      }
      if (!defaultEntry) {
        throw new Error(
          'Scryfall API returned no "default_cards" entry in bulk-data list',
        );
      }

      ensureDataDir();

      // Oracle cards
      const oracleLocal = readLocalMeta();
      if (force || !oracleLocal || oracleLocal.updated_at < oracleEntry.updated_at) {
        await downloadJsonlBulkToJsonArray(
          oracleEntry.jsonl_download_uri,
          ORACLE_CARDS_PATH,
          verbose,
        );
        writeLocalMeta({
          updated_at: oracleEntry.updated_at,
          jsonl_download_uri: oracleEntry.jsonl_download_uri,
          compressed_size: oracleEntry.compressed_size,
          type: oracleEntry.type,
        });
        log(`Download complete → ${ORACLE_CARDS_PATH}`, true);
      } else {
        log("Oracle cards up to date", true);
      }

      // Default cards (printings)
      const defaultLocal = readLocalMetaFor(DEFAULT_CARDS_META_PATH);
      if (force || !defaultLocal || defaultLocal.updated_at < defaultEntry.updated_at) {
        await downloadJsonlBulkToJsonArray(
          defaultEntry.jsonl_download_uri,
          DEFAULT_CARDS_PATH,
          verbose,
        );
        writeLocalMetaFor(DEFAULT_CARDS_META_PATH, {
          updated_at: defaultEntry.updated_at,
          jsonl_download_uri: defaultEntry.jsonl_download_uri,
          compressed_size: defaultEntry.compressed_size,
          type: defaultEntry.type,
        });
        log(`Download complete → ${DEFAULT_CARDS_PATH}`, true);
      } else {
        log("Default cards up to date", true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });

cli
  .command("download-tags", "Download Scryfall oracle and illustration tags from private API")
  .option("--force", "Download even if cached files exist and are recent", {
    default: false,
  })
  .option("--verbose", "Print detailed progress", { default: false })
  .action(async (options: { force: boolean; verbose: boolean }) => {
    try {
      await runDownloadTags(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: ${msg}\n`);
    }
    // Always exit 0 — tag data is optional, must not block CI
  });

cli
  .command("download-mtgjson", "Download MTGJSON AtomicCards for EDHREC salt data")
  .option("--force", "Download even if local data is up to date", {
    default: false,
  })
  .option("--verbose", "Print detailed progress", { default: false })
  .action(async (options: { force: boolean; verbose: boolean }) => {
    try {
      await runDownloadMtGjson(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: ${msg}\n`);
    }
    // Always exit 0 — MTGJSON data is optional, must not block CI
  });

cli
  .command("download-tcgcsv", "Download TCGCSV Magic product and group data for TCGPlayer Mass Entry")
  .option("--force", "Download even if local data is up to date", {
    default: false,
  })
  .option("--verbose", "Print detailed progress (group count, product count)", { default: false })
  .action(async (options: { force: boolean; verbose: boolean }) => {
    try {
      await runDownloadTcgcsv(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: TCGCSV download failed: ${msg}\n`);
    }
    // Always exit 0 — TCGCSV data is optional, must not block CI
  });

cli
  .command("process", "Extract searchable fields into columnar JSON files")
  .option("--verbose", "Print detailed progress", { default: false })
  .action(async (options: { verbose: boolean }) => {
    try {
      await processCards(options.verbose);
      processTcgcsv(options.verbose);
      await processPrintings(options.verbose);
      await processTags(options.verbose);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });

cli
  .command("thumbhash", "Generate ThumbHash placeholders for art crops and card images")
  .option("--timeout <seconds>", "Maximum seconds to spend downloading", {
    default: 500,
  })
  .option("--delay <ms>", "Milliseconds between downloads", { default: 100 })
  .option("--verbose", "Print detailed progress", { default: false })
  .action(
    async (options: { timeout: number; delay: number; verbose: boolean }) => {
      try {
        await generateThumbHashes(options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
    },
  );

cli
  .command(
    "restore",
    "Restore ThumbHash manifests from previous deployment or local columns data",
  )
  .option("--site-url <url>", "URL of the deployed site to fetch columns.json from")
  .option("--verbose", "Print detailed progress", { default: false })
  .action(
    async (options: { siteUrl?: string; verbose: boolean }) => {
      try {
        await restoreManifest(options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
    },
  );

cli.help();
cli.parse();
