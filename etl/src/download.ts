// SPDX-License-Identifier: Apache-2.0
import axios from "axios";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
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
