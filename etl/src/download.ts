// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import fs from "node:fs";
import readline from "node:readline";
import { finished } from "node:stream/promises";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { log } from "./log";

/**
 * Stream a URL to a file on disk. Writes to a temporary file first,
 * then renames atomically to avoid leaving a corrupt file on failure.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  verbose: boolean,
): Promise<void> {
  const tmpPath = destPath + ".tmp";

  log(`Downloading ${url}`, verbose);

  try {
    const response = await axios.get(url, { responseType: "stream" });

    const writer = fs.createWriteStream(tmpPath);
    await pipeline(response.data, writer);

    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    // Clean up partial file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Gunzip a JSONL stream and write a JSON array to destPath atomically.
 */
export async function convertJsonlGzToJsonArray(
  gzStream: NodeJS.ReadableStream,
  destPath: string,
): Promise<void> {
  const tmpPath = destPath + ".tmp";

  try {
    const writer = fs.createWriteStream(tmpPath);
    const gunzip = createGunzip();
    const input = gzStream.pipe(gunzip);

    const streamError = new Promise<never>((_, reject) => {
      gzStream.on("error", reject);
      gunzip.on("error", reject);
      input.on("error", reject);
    });

    const rl = readline.createInterface({
      input,
      crlfDelay: Infinity,
    });

    const convert = (async () => {
      let first = true;
      writer.write("[");

      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        if (!first) writer.write(",");
        writer.write(trimmed);
        first = false;
      }

      writer.write("]");
      writer.end();
      await finished(writer);
    })();

    await Promise.race([convert, streamError]);
    rl.close();

    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Download a Scryfall gzipped JSONL bulk file, convert to a JSON array,
 * and write atomically to destPath.
 */
export async function downloadJsonlBulkToJsonArray(
  url: string,
  destPath: string,
  verbose: boolean,
): Promise<void> {
  log(`Downloading ${url}`, verbose);

  const response = await axios.get(url, { responseType: "stream" });
  await convertJsonlGzToJsonArray(response.data, destPath);
}
