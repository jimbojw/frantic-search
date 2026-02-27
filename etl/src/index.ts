// SPDX-License-Identifier: Apache-2.0
import cac from "cac";
import { fetchMetadata, fetchBulkMetadata } from "./scryfall";
import { downloadToFile } from "./download";
import {
  readLocalMeta,
  writeLocalMeta,
  readLocalMetaFor,
  writeLocalMetaFor,
  ensureDataDir,
  RAW_DIR,
  ORACLE_CARDS_PATH,
  DEFAULT_CARDS_PATH,
  META_PATH,
  DEFAULT_CARDS_META_PATH,
} from "./paths";
import { log } from "./log";
import { processCards } from "./process";
import { processPrintings } from "./process-printings";
import { generateThumbHashes } from "./thumbhash";
import { restoreManifest } from "./restore";

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
      const oracleEntry = await fetchBulkMetadata("oracle_cards", verbose);
      const defaultEntry = await fetchBulkMetadata("default_cards", verbose);

      ensureDataDir();

      // Oracle cards
      const oracleLocal = readLocalMeta();
      if (force || !oracleLocal || oracleLocal.updated_at < oracleEntry.updated_at) {
        await downloadToFile(oracleEntry.download_uri, ORACLE_CARDS_PATH, verbose);
        writeLocalMeta({
          updated_at: oracleEntry.updated_at,
          download_uri: oracleEntry.download_uri,
          size: oracleEntry.size,
          type: oracleEntry.type,
        });
        log(`Download complete → ${ORACLE_CARDS_PATH}`, true);
      } else {
        log("Oracle cards up to date", true);
      }

      // Default cards (printings)
      const defaultLocal = readLocalMetaFor(DEFAULT_CARDS_META_PATH);
      if (force || !defaultLocal || defaultLocal.updated_at < defaultEntry.updated_at) {
        await downloadToFile(defaultEntry.download_uri, DEFAULT_CARDS_PATH, verbose);
        writeLocalMetaFor(DEFAULT_CARDS_META_PATH, {
          updated_at: defaultEntry.updated_at,
          download_uri: defaultEntry.download_uri,
          size: defaultEntry.size,
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
  .command("process", "Extract searchable fields into columnar JSON files")
  .option("--verbose", "Print detailed progress", { default: false })
  .action((options: { verbose: boolean }) => {
    try {
      processCards(options.verbose);
      processPrintings(options.verbose);
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
