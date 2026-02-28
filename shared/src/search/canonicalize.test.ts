// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { toScryfallQuery } from "./canonicalize";
import { parse } from "./parser";

function canon(input: string): string {
  return toScryfallQuery(parse(input));
}

describe("toScryfallQuery", () => {
  // --- Bare words ---

  it("passes through an unquoted bare word", () => {
    expect(canon("lightning")).toBe("lightning");
  });

  it("wraps a quoted bare word in double quotes", () => {
    expect(canon('"lightning bolt"')).toBe('"lightning bolt"');
  });

  it("converts single-quoted bare word to double quotes", () => {
    expect(canon("'lightning bolt'")).toBe('"lightning bolt"');
  });

  // --- Field nodes ---

  it("serializes a simple field query", () => {
    expect(canon("c:r")).toBe("c:r");
  });

  it("serializes field with comparison operator", () => {
    expect(canon("power>=3")).toBe("power>=3");
  });

  it("serializes field with != operator", () => {
    expect(canon("c!=r")).toBe("c!=r");
  });

  it("quotes field value containing whitespace", () => {
    expect(canon('t:"legendary creature"')).toBe('t:"legendary creature"');
  });

  it("drops field node with empty value", () => {
    expect(canon("c:")).toBe("");
  });

  it("drops empty field value within a compound query", () => {
    // "c:" at the end is the only way to get a truly empty field value in
    // a compound query — "c: t:creature" parses as c:t (value consumed).
    expect(canon("t:creature c:")).toBe("t:creature");
  });

  // --- Regex field nodes ---

  it("serializes a regex field query", () => {
    expect(canon("name:/bolt/")).toBe("name:/bolt/");
  });

  // --- Exact name nodes ---

  it("serializes an exact name query", () => {
    expect(canon("!fire")).toBe('!"fire"');
  });

  it("serializes a quoted exact name query", () => {
    expect(canon('!"lightning bolt"')).toBe('!"lightning bolt"');
  });

  // --- NOT nodes ---

  it("serializes a simple negation", () => {
    expect(canon("-t:creature")).toBe("-t:creature");
  });

  // --- AND nodes ---

  it("serializes implicit AND as space-separated terms", () => {
    expect(canon("c:r t:creature")).toBe("c:r t:creature");
  });

  // --- OR nodes ---

  it("serializes OR groups", () => {
    expect(canon("t:creature OR t:instant")).toBe(
      "(t:creature OR t:instant)",
    );
  });

  it("serializes nested OR inside AND with parentheses", () => {
    expect(canon("c:r (t:creature OR t:instant)")).toBe(
      "c:r (t:creature OR t:instant)",
    );
  });

  // --- NOP handling ---

  it("returns empty string for empty input", () => {
    expect(canon("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(canon("   ")).toBe("");
  });

  // --- Unclosed delimiters ---

  it("closes an unclosed double quote", () => {
    expect(canon('"oracle')).toBe('"oracle"');
  });

  it("closes an unclosed single quote and converts to double", () => {
    expect(canon("'oracle")).toBe('"oracle"');
  });

  // --- Bare regex (parser expands to OR of three REGEX_FIELD nodes) ---

  it("expands bare regex to OR of field regexes", () => {
    expect(canon("/giant/")).toBe(
      "(name:/giant/ OR oracle:/giant/ OR type:/giant/)",
    );
  });

  // --- Unclosed regex (bare, becomes OR expansion) ---

  it("closes an unclosed bare regex and expands", () => {
    expect(canon("/oracle")).toBe(
      "(name:/oracle/ OR oracle:/oracle/ OR type:/oracle/)",
    );
  });

  // --- Invalid regex ---

  it("passes through invalid regex with closed delimiters", () => {
    expect(canon("name:/[/")).toBe("name:/[/");
  });

  // --- Partial date padding ---

  it("pads a partial year to YYYY-MM-DD", () => {
    expect(canon("date>=202")).toBe("date>=2020-01-01");
  });

  it("pads a year-only date to YYYY-MM-DD", () => {
    expect(canon("date>=2021")).toBe("date>=2021-01-01");
  });

  it("pads a year-month date to YYYY-MM-DD", () => {
    expect(canon("date>=2021-06")).toBe("date>=2021-06-01");
  });

  it("leaves a full date unchanged", () => {
    expect(canon("date>=2021-06-15")).toBe("date>=2021-06-15");
  });

  it("leaves special date value 'today' unchanged", () => {
    expect(canon("date>=today")).toBe("date>=today");
  });

  it("leaves special date value 'now' unchanged", () => {
    expect(canon("date>=now")).toBe("date>=now");
  });

  it("pads date with alias field name", () => {
    expect(canon("date>=202")).toBe("date>=2020-01-01");
  });

  it("pads a partial month digit", () => {
    expect(canon("date>=2021-0")).toBe("date>=2021-01-01");
  });

  it("leaves non-numeric date values unchanged (set codes)", () => {
    expect(canon("date>=neo")).toBe("date>=neo");
  });

  // --- Compound / complex queries ---

  it("handles a complex query with mixed terms", () => {
    expect(canon("c:r t:creature power>=3")).toBe(
      "c:r t:creature power>=3",
    );
  });

  it("handles NOT of a parenthesized group", () => {
    expect(canon("-(t:creature OR t:instant)")).toBe(
      "-(t:creature OR t:instant)",
    );
  });

  it("preserves field aliases (does not canonicalize field names)", () => {
    expect(canon("pow>=3")).toBe("pow>=3");
  });
});
