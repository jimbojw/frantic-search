// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evalOracleTag, evalIllustrationTag, buildOracleTagEvalIndex } from "./eval-tags";
import type { OracleTagData } from "../data";

describe("evalOracleTag", () => {
  test("returns error when oracle tags not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "ramp", null, null, buf)).toBe("oracle tags not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("unknown oracle tag for prefix matching no key", () => {
    const oracle: OracleTagData = { ramp: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "nonexistent", oracle, null, buf)).toBe('unknown oracle tag "nonexistent"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("prefix sets buffer for matching face indices", () => {
    const oracle: OracleTagData = { ramp: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "ramp", oracle, null, buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  test("exact = does not widen to longer normalized key", () => {
    const oracle: OracleTagData = { "mana-rock": [7] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("=", "mana", oracle, null, buf)).toBe('unknown oracle tag "mana"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("prefix unions multiple keys (Spec 174)", () => {
    const oracle: OracleTagData = {
      ramp: [0, 1],
      "ramp-artifact": [2, 3],
      removal: [9],
    };
    const buf = new Uint8Array(12);
    expect(evalOracleTag(":", "ramp", oracle, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[9]).toBe(0);
  });

  test("= exact matches only that normalized key", () => {
    const oracle: OracleTagData = {
      ramp: [0, 1],
      "ramp-artifact": [2, 3],
    };
    const buf = new Uint8Array(12);
    expect(evalOracleTag("=", "ramp", oracle, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(0);
  });

  test("!= inverts exact = mask", () => {
    const oracle: OracleTagData = { ramp: [1, 3], removal: [2] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag("!=", "ramp", oracle, null, buf)).toBe(null);
    expect(buf[1]).toBe(0);
    expect(buf[3]).toBe(0);
    expect(buf[2]).toBe(1);
    expect(buf[0]).toBe(1);
    expect(buf[4]).toBe(1);
  });

  test("!= unknown when no exact key", () => {
    const oracle: OracleTagData = { ramp: [1] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag("!=", "zzz", oracle, null, buf)).toBe('unknown oracle tag "zzz"');
  });

  test("empty value unions all tagged faces (Spec 174)", () => {
    const oracle: OracleTagData = {
      ramp: [0, 1],
      removal: [2],
    };
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "", oracle, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(0);
  });

  test("empty != inverts union of all keys", () => {
    const oracle: OracleTagData = {
      ramp: [0, 1],
      removal: [2],
    };
    const buf = new Uint8Array(8);
    expect(evalOracleTag("!=", "", oracle, null, buf)).toBe(null);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(1);
    expect(buf[4]).toBe(1);
  });

  test("empty value with whitespace-only unions all tagged faces", () => {
    const oracle: OracleTagData = { a: [4] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag("=", "   ", oracle, null, buf)).toBe(null);
    expect(buf[4]).toBe(1);
  });

  test("label is case-insensitive via normalization", () => {
    const oracle: OracleTagData = { ramp: [2] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "RAMP", oracle, null, buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("hyphenated key: mana matches mana-rock at boundary i=0 (Spec 174)", () => {
    const oracle: OracleTagData = { "mana-rock": [7] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "mana", oracle, null, buf)).toBe(null);
    expect(buf[7]).toBe(1);
  });

  test("Spec 174: mana-r matches mana-ramp; mana alone does not match mana-r prefix", () => {
    const oracle: OracleTagData = { mana: [1], "mana-ramp": [2] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "mana-r", oracle, null, buf)).toBe(null);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1);
  });

  test("Spec 174: trigger matches death-trigger at segment boundary", () => {
    const oracle: OracleTagData = { "death-trigger": [3] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "trigger", oracle, null, buf)).toBe(null);
    expect(buf[3]).toBe(1);
  });

  test("Spec 174: ana does not match mana", () => {
    const oracle: OracleTagData = { mana: [0] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "ana", oracle, null, buf)).toBe('unknown oracle tag "ana"');
  });

  test("Spec 174 #253: on- does not spuriously match one-off", () => {
    const oracle: OracleTagData = { "one-off": [1], "one-sided-fight": [2] };
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "on-", oracle, null, buf)).toBe('unknown oracle tag "on-"');
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  test("skips indices beyond buffer length", () => {
    const oracle: OracleTagData = { ramp: [0, 15, 20] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "ramp", oracle, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[15]).toBeUndefined();
  });

  test("tag with empty array sets no bits for :", () => {
    const oracle: OracleTagData = { empty: [] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag(":", "empty", oracle, null, buf)).toBe(null);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("uses precomputed rows when provided", () => {
    const oracle: OracleTagData = { ramp: [1] };
    const rows = buildOracleTagEvalIndex(oracle);
    const buf = new Uint8Array(8);
    expect(evalOracleTag(":", "ramp", oracle, rows, buf)).toBe(null);
    expect(buf[1]).toBe(1);
  });
});

describe("evalIllustrationTag", () => {
  test("returns error when illustration tags not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag(":", "chair", null, null, buf)).toBe("illustration tags not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("unknown illustration tag for prefix matching no key", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([2, 4, 6])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag(":", "nonexistent", illustration, null, buf)).toBe('unknown illustration tag "nonexistent"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("sets buffer for matching printing row indices", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([1, 3, 5])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag(":", "chair", illustration, null, buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
  });

  test("prefix unions multiple illustration keys", () => {
    const illustration = new Map<string, Uint32Array>([
      ["bolt", new Uint32Array([0])],
      ["bolt-storm", new Uint32Array([1, 2])],
    ]);
    const buf = new Uint8Array(8);
    expect(evalIllustrationTag(":", "bolt", illustration, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
    expect(buf[2]).toBe(1);
  });

  test("empty value unions all tagged printings", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([0])],
      ["foot", new Uint32Array([1])],
    ]);
    const buf = new Uint8Array(8);
    expect(evalIllustrationTag(":", "", illustration, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(1);
  });

  test("label is case-insensitive via normalization", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([2])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag(":", "CHAIR", illustration, null, buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("skips indices beyond buffer length", () => {
    const illustration = new Map<string, Uint32Array>([
      ["foot", new Uint32Array([0, 15, 20])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag(":", "foot", illustration, null, buf)).toBe(null);
    expect(buf[0]).toBe(1);
  });

  test("!= inverts exact match", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([0, 1])],
      ["foot", new Uint32Array([2])],
    ]);
    const buf = new Uint8Array(8);
    expect(evalIllustrationTag("!=", "chair", illustration, null, buf)).toBe(null);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(1);
  });
});
