// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { evalOracleTag, evalIllustrationTag } from "./eval-tags";
import type { OracleTagData } from "../data";

describe("evalOracleTag", () => {
  test("returns error when oracle tags not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalOracleTag("ramp", null, buf)).toBe("oracle tags not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("returns error for unknown tag", () => {
    const oracle: OracleTagData = { ramp: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("nonexistent", oracle, buf)).toBe('unknown tag "nonexistent"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("sets buffer for matching face indices", () => {
    const oracle: OracleTagData = { ramp: [1, 3, 5] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("ramp", oracle, buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
    expect(buf[2]).toBe(0);
  });

  test("label is case-insensitive", () => {
    const oracle: OracleTagData = { ramp: [2] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("RAMP", oracle, buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("skips indices beyond buffer length", () => {
    const oracle: OracleTagData = { ramp: [0, 15, 20] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("ramp", oracle, buf)).toBe(null);
    expect(buf[0]).toBe(1);
    expect(buf[15]).toBeUndefined();
  });

  test("tag with empty array sets no bits", () => {
    const oracle: OracleTagData = { empty: [] };
    const buf = new Uint8Array(10);
    expect(evalOracleTag("empty", oracle, buf)).toBe(null);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});

describe("evalIllustrationTag", () => {
  test("returns error when illustration tags not loaded", () => {
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag("chair", null, buf)).toBe("illustration tags not loaded");
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("returns error for unknown tag", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([2, 4, 6])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag("nonexistent", illustration, buf)).toBe('unknown tag "nonexistent"');
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  test("sets buffer for matching printing row indices", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([1, 3, 5])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag("chair", illustration, buf)).toBe(null);
    expect(buf[1]).toBe(1);
    expect(buf[3]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[0]).toBe(0);
  });

  test("label is case-insensitive", () => {
    const illustration = new Map<string, Uint32Array>([
      ["chair", new Uint32Array([2])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag("CHAIR", illustration, buf)).toBe(null);
    expect(buf[2]).toBe(1);
  });

  test("skips indices beyond buffer length", () => {
    const illustration = new Map<string, Uint32Array>([
      ["foot", new Uint32Array([0, 15, 20])],
    ]);
    const buf = new Uint8Array(10);
    expect(evalIllustrationTag("foot", illustration, buf)).toBe(null);
    expect(buf[0]).toBe(1);
  });
});
