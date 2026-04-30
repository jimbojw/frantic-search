// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadRootJsonArray } from "./load-json-array";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("loadRootJsonArray", () => {
  test("parses minimal root array fixture", async () => {
    const path = join(__dirname, "../fixtures/minimal-root-array.json");
    const rows = await loadRootJsonArray<{ id: string; n: number; nested?: { x: boolean } }>(path);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "a", n: 1 });
    expect(rows[1]).toEqual({ id: "b", n: 2, nested: { x: true } });
  });

  test("rejects non-array root document", async () => {
    const path = join(__dirname, "../fixtures/not-array-root.json");
    await expect(loadRootJsonArray(path)).rejects.toThrow(/array/i);
  });
});
