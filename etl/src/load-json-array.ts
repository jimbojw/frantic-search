// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { finished } from "node:stream/promises";
import chain from "stream-chain";
import StreamArray from "stream-json/streamers/stream-array.js";

/**
 * Parse a JSON file whose document root is a single array `[...]`.
 * Does not read the entire file into one string (avoids V8 max string length).
 */
export async function loadRootJsonArray<T>(path: string): Promise<T[]> {
  const result: T[] = [];
  const pipeline = chain([fs.createReadStream(path), StreamArray.withParserAsStream()]);

  pipeline.on("data", (data: { key: number; value: unknown }) => {
    result.push(data.value as T);
  });

  await finished(pipeline);
  return result;
}
