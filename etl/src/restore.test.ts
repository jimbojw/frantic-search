// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { reconstructManifest, mergeManifests } from "./restore";
import type { Manifest } from "./thumbhash";

describe("reconstructManifest", () => {
  test("builds manifest from aligned arrays", () => {
    const result = reconstructManifest(
      ["id-a", "id-b", "id-c"],
      ["hash-a", "hash-b", "hash-c"],
    );
    expect(result).toEqual({
      "id-a": "hash-a",
      "id-b": "hash-b",
      "id-c": "hash-c",
    });
  });

  test("skips entries with empty hashes", () => {
    const result = reconstructManifest(
      ["id-a", "id-b", "id-c"],
      ["hash-a", "", "hash-c"],
    );
    expect(result).toEqual({
      "id-a": "hash-a",
      "id-c": "hash-c",
    });
  });

  test("skips entries with empty scryfall_ids", () => {
    const result = reconstructManifest(
      ["id-a", "", "id-c"],
      ["hash-a", "hash-b", "hash-c"],
    );
    expect(result).toEqual({
      "id-a": "hash-a",
      "id-c": "hash-c",
    });
  });

  test("handles mismatched array lengths (hashes shorter)", () => {
    const result = reconstructManifest(
      ["id-a", "id-b", "id-c"],
      ["hash-a"],
    );
    expect(result).toEqual({ "id-a": "hash-a" });
  });

  test("handles mismatched array lengths (scryfall_ids shorter)", () => {
    const result = reconstructManifest(
      ["id-a"],
      ["hash-a", "hash-b"],
    );
    expect(result).toEqual({ "id-a": "hash-a" });
  });

  test("returns empty object for empty arrays", () => {
    expect(reconstructManifest([], [])).toEqual({});
  });

  test("works for card image hashes same as art crop hashes", () => {
    const result = reconstructManifest(
      ["id-a", "id-b"],
      ["card-hash-a", "card-hash-b"],
    );
    expect(result).toEqual({
      "id-a": "card-hash-a",
      "id-b": "card-hash-b",
    });
  });
});

describe("mergeManifests", () => {
  test("existing manifest entries take precedence", () => {
    const existing: Manifest = { "id-a": "existing-hash" };
    const restored: Manifest = { "id-a": "restored-hash", "id-b": "hash-b" };
    const result = mergeManifests(existing, restored);
    expect(result).toEqual({
      "id-a": "existing-hash",
      "id-b": "hash-b",
    });
  });

  test("adds entries from restored that are missing in existing", () => {
    const existing: Manifest = { "id-a": "hash-a" };
    const restored: Manifest = { "id-b": "hash-b", "id-c": "hash-c" };
    const result = mergeManifests(existing, restored);
    expect(result).toEqual({
      "id-a": "hash-a",
      "id-b": "hash-b",
      "id-c": "hash-c",
    });
  });

  test("returns copy of existing when restored is empty", () => {
    const existing: Manifest = { "id-a": "hash-a" };
    const result = mergeManifests(existing, {});
    expect(result).toEqual({ "id-a": "hash-a" });
  });

  test("returns copy of restored when existing is empty", () => {
    const restored: Manifest = { "id-a": "hash-a" };
    const result = mergeManifests({}, restored);
    expect(result).toEqual({ "id-a": "hash-a" });
  });

  test("returns empty object when both are empty", () => {
    expect(mergeManifests({}, {})).toEqual({});
  });

  test("does not mutate either input", () => {
    const existing: Manifest = { "id-a": "hash-a" };
    const restored: Manifest = { "id-b": "hash-b" };
    mergeManifests(existing, restored);
    expect(existing).toEqual({ "id-a": "hash-a" });
    expect(restored).toEqual({ "id-b": "hash-b" });
  });
});
