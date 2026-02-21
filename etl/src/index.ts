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

cli.help();
cli.parse();
