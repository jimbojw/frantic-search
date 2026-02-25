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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbhash-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function helpers(manifestPath: string) {
    return {
      load(): Manifest {
        try {
          const raw = fs.readFileSync(manifestPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Manifest;
          }
        } catch {
          // Missing or corrupt — start fresh
        }
        return {};
      },
      save(manifest: Manifest): void {
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        const tmp = manifestPath + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(manifest) + "\n");
        fs.renameSync(tmp, manifestPath);
      },
    };
  }

  test("save then load preserves data", () => {
    const manifestPath = path.join(tmpDir, "art-crop-thumbhash-manifest.json");
    const { save, load } = helpers(manifestPath);
    const original: Manifest = {
      "abc-123": "dGVzdA==",
      "def-456": "b3RoZXI=",
    };
    save(original);
    const loaded = load();
    expect(loaded).toEqual(original);
  });

  test("load returns empty object when file missing", () => {
    const manifestPath = path.join(tmpDir, "art-crop-thumbhash-manifest.json");
    const { load } = helpers(manifestPath);
    expect(load()).toEqual({});
  });

  test("load returns empty object when file is corrupt", () => {
    const manifestPath = path.join(tmpDir, "art-crop-thumbhash-manifest.json");
    fs.writeFileSync(manifestPath, "not json!!!");
    const { load } = helpers(manifestPath);
    expect(load()).toEqual({});
  });

  test("load returns empty object when file contains an array", () => {
    const manifestPath = path.join(tmpDir, "art-crop-thumbhash-manifest.json");
    fs.writeFileSync(manifestPath, "[1,2,3]");
    const { load } = helpers(manifestPath);
    expect(load()).toEqual({});
  });
});
