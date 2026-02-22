// SPDX-License-Identifier: Apache-2.0
import cac from "cac";
import { fetchMetadata, type OracleCardsEntry } from "./scryfall";
import { downloadToFile } from "./download";
import {
  readLocalMeta,
  writeLocalMeta,
  ensureDataDir,
  RAW_DIR,
  ORACLE_CARDS_PATH,
  META_PATH,
} from "./paths";
import { log } from "./log";
import { processCards } from "./process";
import { generateThumbHashes } from "./thumbhash";
import { restoreManifest } from "./restore";

const cli = cac("etl");

cli
  .command("download", "Download Oracle Cards bulk data from Scryfall")
  .option("--force", "Download even if local data is up to date", {
    default: false,
  })
  .option("--verbose", "Print detailed progress", { default: false })
  .action(async (options: { force: boolean; verbose: boolean }) => {
    const { force, verbose } = options;

    try {
      log("Fetching Scryfall bulk-data metadata…", verbose);
      const entry = await fetchMetadata(verbose);

      if (!force) {
        const local = readLocalMeta();
        if (local && local.updated_at >= entry.updated_at) {
          log("Up to date", true);
          return;
        }
      }

      ensureDataDir();
      await downloadToFile(entry.download_uri, ORACLE_CARDS_PATH, verbose);

      writeLocalMeta({
        updated_at: entry.updated_at,
        download_uri: entry.download_uri,
        size: entry.size,
        type: entry.type,
      });

      log(`Download complete → ${ORACLE_CARDS_PATH}`, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });

cli
  .command("process", "Extract searchable fields into a columnar JSON file")
  .option("--verbose", "Print detailed progress", { default: false })
  .action((options: { verbose: boolean }) => {
    try {
      processCards(options.verbose);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  });

cli
  .command("thumbhash", "Generate ThumbHash placeholders for card art crops")
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
    "Restore ThumbHash manifest from previous deployment or local columns data",
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
