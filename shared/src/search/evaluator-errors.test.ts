// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache } from "./evaluator";
import { parse } from "./parser";
import type { FieldNode } from "./ast";
import { index, matchCount } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Colorless+color contradiction (Spec 039, GitHub issue #17)
// ---------------------------------------------------------------------------

describe("colorless+color contradiction", () => {
  function getResult(query: string) {
    const cache = new NodeCache(index);
    return cache.evaluate(parse(query)).result;
  }

  test("ci:cb produces error (colorless + blue)", () => {
    const result = getResult("ci:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("c:cb produces error (color field, same contradiction)", () => {
    const result = getResult("c:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:cw produces error", () => {
    const result = getResult("ci:cw");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:cwubrg produces error", () => {
    const result = getResult("ci:cwubrg");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("c:cr produces error", () => {
    const result = getResult("c:cr");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:c (just colorless) is NOT an error", () => {
    const result = getResult("ci:c");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(1); // Sol Ring
  });

  test("ci:colorless is NOT an error", () => {
    const result = getResult("ci:colorless");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(1);
  });

  test("ci:wu (no colorless) is NOT an error", () => {
    const result = getResult("ci:wu");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  test("error node in AND is skipped — t:creature ci:cb matches same as t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    const withError = matchCount("t:creature ci:cb");
    expect(withError).toBe(creatureOnly);
  });

  test("error node child in AND carries error field", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("t:creature ci:cb"));
    const ciChild = result.children!.find(
      c => c.node.type === "FIELD" && (c.node as FieldNode).field === "ci"
    );
    expect(ciChild).toBeDefined();
    expect(ciChild!.error).toBe("a card cannot be both colored and colorless");
    expect(ciChild!.matchCount).toBe(-1);
  });

  test("error node in OR is skipped — t:creature OR ci:cb matches same as t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    const withError = matchCount("t:creature OR ci:cb");
    expect(withError).toBe(creatureOnly);
  });

  test("NOT of error propagates error — -ci:cb", () => {
    const result = getResult("-ci:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("error node produces zero indices", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("ci:cb"));
    expect(indices.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Non-destructive error handling (Spec 039)
// ---------------------------------------------------------------------------

describe("non-destructive error handling", () => {
  function getResult(query: string) {
    const cache = new NodeCache(index);
    return cache.evaluate(parse(query));
  }

  // --- Error detection ---

  test("foo:bar produces unknown field error", () => {
    const { result } = getResult("foo:bar");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("foo: (unknown field, empty value) produces error", () => {
    const { result } = getResult("foo:");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("o:/[/ produces invalid regex error", () => {
    const { result } = getResult("o:/[/");
    expect(result.error).toBe("invalid regex");
    expect(result.matchCount).toBe(-1);
  });

  test("f:comma produces unknown format error", () => {
    const { result } = getResult("f:comma");
    expect(result.error).toBe('unknown format "comma"');
    expect(result.matchCount).toBe(-1);
  });

  test("is:xyz produces unknown keyword error", () => {
    const { result } = getResult("is:xyz");
    expect(result.error).toBe('unknown keyword "xyz"');
    expect(result.matchCount).toBe(-1);
  });

  test("is:foil without printing index produces printing data not loaded error", () => {
    const { result } = getResult("is:foil");
    expect(result.error).toBe("printing data not loaded");
    expect(result.matchCount).toBe(-1);
  });

  test("error nodes produce zero indices", () => {
    expect(getResult("foo:bar").indices.length).toBe(0);
    expect(getResult("o:/[/").indices.length).toBe(0);
    expect(getResult("f:comma").indices.length).toBe(0);
    expect(getResult("is:xyz").indices.length).toBe(0);
  });

  // --- Non-errors (should NOT produce errors) ---

  test("ci: (known field, empty value) is not an error", () => {
    const { result } = getResult("ci:");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(9);
  });

  test("t:xyz (open-ended field, zero results) is not an error", () => {
    const { result } = getResult("t:notavalidtype");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
  });

  test("f:commander (known format) is not an error", () => {
    const { result } = getResult("f:commander");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  test("is:permanent (supported keyword) is not an error", () => {
    const { result } = getResult("is:permanent");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  // --- AND with error children ---

  test("error child is skipped in AND — t:creature foo:bar", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature foo:bar")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — t:creature o:/[/", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature o:/[/")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — f:comma t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("f:comma t:creature")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — is:xyz t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("is:xyz t:creature")).toBe(creatureOnly);
  });

  test("all-error AND is vacuous conjunction (all cards)", () => {
    expect(matchCount("foo:bar baz:qux")).toBe(9);
  });

  test("AND error child carries error field", () => {
    const { result } = getResult("t:creature foo:bar");
    const errorChild = result.children!.find(
      c => c.node.type === "FIELD" && (c.node as FieldNode).field === "foo"
    );
    expect(errorChild).toBeDefined();
    expect(errorChild!.error).toBe('unknown field "foo"');
    expect(errorChild!.matchCount).toBe(-1);
  });

  // --- OR with error children ---

  test("error child is skipped in OR — t:creature OR foo:bar", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature OR foo:bar")).toBe(creatureOnly);
  });

  test("all-error OR is vacuous disjunction (empty set)", () => {
    expect(matchCount("foo:bar OR baz:qux")).toBe(0);
  });

  // --- NOT with error child ---

  test("-foo:bar propagates error", () => {
    const { result } = getResult("-foo:bar");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("-f:comma propagates error", () => {
    const { result } = getResult("-f:comma");
    expect(result.error).toBe('unknown format "comma"');
    expect(result.matchCount).toBe(-1);
  });
});
