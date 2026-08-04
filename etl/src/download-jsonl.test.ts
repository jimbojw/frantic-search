// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { convertJsonlGzToJsonArray } from "./download";

describe("convertJsonlGzToJsonArray", () => {
  test("converts gzipped JSONL fixture to valid JSON array", async () => {
    const fixturePath = join(import.meta.dirname, "../fixtures/minimal.jsonl.gz");
    const outDir = fs.mkdtempSync(join(os.tmpdir(), "etl-jsonl-test-"));
    const destPath = join(outDir, "output.json");

    await convertJsonlGzToJsonArray(
      fs.createReadStream(fixturePath),
      destPath,
    );

    const parsed = JSON.parse(fs.readFileSync(destPath, "utf-8"));
    expect(parsed).toEqual([
      { id: "a", name: "Card A" },
      { id: "b", name: "Card B" },
    ]);
  });

  test("does not leave corrupt final file on conversion failure", async () => {
    const outDir = fs.mkdtempSync(join(os.tmpdir(), "etl-jsonl-fail-"));
    const destPath = join(outDir, "output.json");
    const badGzPath = join(outDir, "bad.gz");
    fs.writeFileSync(badGzPath, "not gzip content");

    await expect(
      convertJsonlGzToJsonArray(
        fs.createReadStream(badGzPath),
        destPath,
      ),
    ).rejects.toThrow();

    expect(fs.existsSync(destPath)).toBe(false);
    expect(fs.existsSync(destPath + ".tmp")).toBe(false);
  });
});
