// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parse } from "./parser";
import { getTrailingBareNodes, getBareNodes } from "./oracle-hint";

describe("getTrailingBareNodes", () => {
  test("lightning ci:r deal 3 — trailing bare tokens are deal, 3", () => {
    const ast = parse("lightning ci:r deal 3");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    expect(trailing!.length).toBe(2);
    expect(trailing!.map((n) => n.value)).toEqual(["deal", "3"]);
  });

  test('"deal 3" — single quoted BARE is trailing set', () => {
    const ast = parse('"deal 3"');
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    expect(trailing!.length).toBe(1);
    expect(trailing![0].value).toBe("deal 3");
    expect(trailing![0].quoted).toBe(true);
  });

  test("lightning bolt — both words are trailing", () => {
    const ast = parse("lightning bolt");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    expect(trailing!.length).toBe(2);
    expect(trailing!.map((n) => n.value)).toEqual(["lightning", "bolt"]);
  });

  test("(xyc OR abc) — root is OR, returns null", () => {
    const ast = parse("(xyc OR abc)");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).toBeNull();
  });

  test("single bare word — returns that node", () => {
    const ast = parse("damage");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    expect(trailing!.length).toBe(1);
    expect(trailing![0].value).toBe("damage");
  });

  test("ci:r t:creature — no bare tokens, returns null", () => {
    const ast = parse("ci:r t:creature");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).toBeNull();
  });

  test("lightning -deal 3 — negated deal excluded, trailing is just 3", () => {
    const ast = parse("lightning -deal 3");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    expect(trailing!.length).toBe(1);
    expect(trailing![0].value).toBe("3");
  });

  test("lightning deal -3 — last child is NOT, no trailing BARE suffix", () => {
    const ast = parse("lightning deal -3");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).toBeNull();
  });

  test("all nodes have spans", () => {
    const ast = parse("lightning ci:r deal 3");
    const trailing = getTrailingBareNodes(ast);
    expect(trailing).not.toBeNull();
    for (const n of trailing!) {
      expect(n.span).toBeDefined();
      expect(n.span!.start).toBeLessThan(n.span!.end);
    }
  });
});

describe("getBareNodes", () => {
  test("lightning ci:r landfall — returns lightning and landfall (bare terms anywhere)", () => {
    const ast = parse("lightning ci:r landfall");
    const bare = getBareNodes(ast);
    expect(bare.map((n) => n.value)).toEqual(["lightning", "landfall"]);
  });

  test("landfall f:commander — returns landfall only", () => {
    const ast = parse("landfall f:commander");
    const bare = getBareNodes(ast);
    expect(bare.map((n) => n.value)).toEqual(["landfall"]);
  });

  test("single bare word — returns that node", () => {
    const ast = parse("elf");
    const bare = getBareNodes(ast);
    expect(bare.map((n) => n.value)).toEqual(["elf"]);
  });

  test("(xyc OR abc) — root is OR, returns empty", () => {
    const ast = parse("(xyc OR abc)");
    const bare = getBareNodes(ast);
    expect(bare).toEqual([]);
  });

  test("lightning -deal 3 — excludes negated deal, returns lightning and 3", () => {
    const ast = parse("lightning -deal 3");
    const bare = getBareNodes(ast);
    expect(bare.map((n) => n.value)).toEqual(["lightning", "3"]);
  });

  test("ci:r t:creature — no bare tokens, returns empty", () => {
    const ast = parse("ci:r t:creature");
    const bare = getBareNodes(ast);
    expect(bare).toEqual([]);
  });
});
