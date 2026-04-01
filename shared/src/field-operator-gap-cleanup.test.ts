// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import { parse } from "./search/parser";
import { buildFieldOperatorGapCleanup } from "./field-operator-gap-cleanup";

function cleanup(q: string) {
  const trimmed = q.trim();
  return buildFieldOperatorGapCleanup(trimmed, parse(trimmed));
}

describe("buildFieldOperatorGapCleanup", () => {
  test("ci: blue → single merged clause", () => {
    const r = cleanup("ci: blue");
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe("ci:blue");
    expect(r!.label).toContain("ci:blue");
  });

  test("ancestral ci: blue merges only the field gap", () => {
    const r = cleanup("ancestral ci: blue");
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe("ancestral ci:blue");
  });

  test("quoted bare value preserves quotes in merge", () => {
    const q = 'ci: "u"';
    const r = cleanup(q);
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe('ci:"u"');
  });

  test("comparison operator gap ci> r", () => {
    const r = cleanup("ci> r");
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe("ci>r");
  });

  test("no match when non-whitespace between field span end and bare start", () => {
    const q = "ci:,blue";
    const r = cleanup(q);
    expect(r).toBeNull();
  });

  test("parenthesized AND still finds pair", () => {
    const r = cleanup("(ci: blue)");
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe("(ci:blue)");
  });

  test("two gaps in one query — single cleaned query", () => {
    const r = cleanup("ci: blue o: draw");
    expect(r).not.toBeNull();
    expect(r!.cleanedQuery).toBe("ci:blue o:draw");
    expect(r!.label).toMatch(/ci:blue/);
    expect(r!.label).toMatch(/o:draw/);
  });

  test("no match for adjacent FIELD with value (normal clause)", () => {
    expect(cleanup("ci:u")).toBeNull();
  });

  test("no match for kw :foo (space before operator)", () => {
    expect(cleanup("kw :foo")).toBeNull();
  });

  test("returns null when no empty FIELD + BARE pattern", () => {
    expect(cleanup("t:creature")).toBeNull();
  });
});
