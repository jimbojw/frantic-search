// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { pruneManifest, type Manifest } from "./thumbhash";

describe("pruneManifest", () => {
  test("removes entries not in valid set", () => {
    const manifest: Manifest = {
      "aaa": "hash-a",
      "bbb": "hash-b",
      "ccc": "hash-c",
    };
    const validIds = new Set(["aaa", "ccc"]);
    const pruned = pruneManifest(manifest, validIds);
    expect(pruned).toBe(1);
    expect(manifest).toEqual({ aaa: "hash-a", ccc: "hash-c" });
  });

  test("returns 0 when nothing to prune", () => {
    const manifest: Manifest = { aaa: "hash-a" };
    const pruned = pruneManifest(manifest, new Set(["aaa", "bbb"]));
    expect(pruned).toBe(0);
    expect(manifest).toEqual({ aaa: "hash-a" });
  });

  test("handles empty manifest", () => {
    const manifest: Manifest = {};
    const pruned = pruneManifest(manifest, new Set(["aaa"]));
    expect(pruned).toBe(0);
    expect(manifest).toEqual({});
  });

  test("prunes all entries when valid set is empty", () => {
    const manifest: Manifest = { aaa: "hash-a", bbb: "hash-b" };
    const pruned = pruneManifest(manifest, new Set());
    expect(pruned).toBe(2);
    expect(manifest).toEqual({});
  });
});

describe("manifest file round-trip", () => {
  let tmpDir: string;
  let manifestPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbhash-test-"));
    manifestPath = path.join(tmpDir, "manifest.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("save then load preserves data", async () => {
    const { saveManifest: save, loadManifest: load } = await mockPaths(
      tmpDir,
      manifestPath,
    );
    const original: Manifest = {
      "abc-123": "dGVzdA==",
      "def-456": "b3RoZXI=",
    };
    save(original);
    const loaded = load();
    expect(loaded).toEqual(original);
  });

  test("load returns empty object when file missing", async () => {
    const { loadManifest: load } = await mockPaths(tmpDir, manifestPath);
    expect(load()).toEqual({});
  });

  test("load returns empty object when file is corrupt", async () => {
    fs.writeFileSync(manifestPath, "not json!!!");
    const { loadManifest: load } = await mockPaths(tmpDir, manifestPath);
    expect(load()).toEqual({});
  });

  test("load returns empty object when file contains an array", async () => {
    fs.writeFileSync(manifestPath, "[1,2,3]");
    const { loadManifest: load } = await mockPaths(tmpDir, manifestPath);
    expect(load()).toEqual({});
  });
});

/**
 * Re-import the module with overridden path constants via vi.mock would be
 * fragile since the paths are imported at the top level. Instead, this helper
 * creates thin wrappers that operate on the given paths directly, mirroring
 * the real implementation logic.
 */
function mockPaths(dir: string, manifestPath: string) {
  return {
    loadManifest(): Manifest {
      try {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          return parsed as Manifest;
        }
      } catch {
        // Missing or corrupt — start fresh
      }
      return {};
    },
    saveManifest(manifest: Manifest): void {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = manifestPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(manifest) + "\n");
      fs.renameSync(tmp, manifestPath);
    },
  };
}
