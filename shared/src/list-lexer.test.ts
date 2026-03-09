// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { lexDeckList, buildListSpans } from "./list-lexer";

describe("lexDeckList", () => {
  test("empty string produces no tokens", () => {
    expect(lexDeckList("")).toEqual([]);
  });

  test("simple card line: quantity and name", () => {
    const tokens = lexDeckList("1 Lightning Bolt");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Lightning Bolt", start: 2, end: 16 },
    ]);
  });

  test("card line with x suffix", () => {
    const tokens = lexDeckList("4x Birds of Paradise");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "4x", start: 0, end: 2 },
      { type: "CARD_NAME", value: "Birds of Paradise", start: 3, end: 20 },
    ]);
  });

  test("card line with set and collector number", () => {
    const tokens = lexDeckList("1 Shock (M21) 159");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Shock", start: 2, end: 7 },
      { type: "SET_CODE", value: "M21", start: 9, end: 12 },
      { type: "COLLECTOR_NUMBER", value: "159", start: 14, end: 17 },
    ]);
  });

  test("comment line with //", () => {
    const tokens = lexDeckList("// Sideboard");
    expect(tokens).toMatchObject([
      { type: "COMMENT", value: "// Sideboard", start: 0, end: 12 },
    ]);
  });

  test("comment line with #", () => {
    const tokens = lexDeckList("# Maybeboard");
    expect(tokens).toMatchObject([
      { type: "COMMENT", value: "# Maybeboard", start: 0, end: 12 },
    ]);
  });

  test("comment with leading whitespace", () => {
    const tokens = lexDeckList("  // Creatures");
    expect(tokens).toMatchObject([
      { type: "COMMENT", value: "  // Creatures", start: 0, end: 14 },
    ]);
  });

  test("empty line produces no tokens", () => {
    expect(lexDeckList("\n")).toEqual([]);
  });

  test("multiple lines", () => {
    const tokens = lexDeckList("1 Sol Ring\n4 Lightning Bolt");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Sol Ring", start: 2, end: 10 },
      { type: "QUANTITY", value: "4", start: 11, end: 12 },
      { type: "CARD_NAME", value: "Lightning Bolt", start: 13, end: 27 },
    ]);
  });

  test("set code with digits", () => {
    const tokens = lexDeckList("1 Lightning Bolt (2XM) 42");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Lightning Bolt", start: 2, end: 16 },
      { type: "SET_CODE", value: "2XM", start: 18, end: 21 },
      { type: "COLLECTOR_NUMBER", value: "42", start: 23, end: 25 },
    ]);
  });

  test("collector number with letter suffix", () => {
    const tokens = lexDeckList("1 Forest (DMU) 273a");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Forest", start: 2, end: 8 },
      { type: "SET_CODE", value: "DMU", start: 10, end: 13 },
      { type: "COLLECTOR_NUMBER", value: "273a", start: 15, end: 19 },
    ]);
  });

  test("quantity only - malformed (no card name)", () => {
    const tokens = lexDeckList("4x");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "4x", start: 0, end: 2 },
    ]);
  });

  test("quantity only - malformed (no card name)", () => {
    const tokens = lexDeckList("1 ");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
    ]);
  });

  test("card line with trailing category bracket", () => {
    const tokens = lexDeckList("1x Access Tunnel (tdc) 337 [Land]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1x", start: 0, end: 2 },
      { type: "CARD_NAME", value: "Access Tunnel", start: 3, end: 16 },
      { type: "SET_CODE", value: "tdc", start: 18, end: 21 },
      { type: "COLLECTOR_NUMBER", value: "337", start: 23, end: 26 },
    ]);
  });

  test("card name with parentheses in it", () => {
    const tokens = lexDeckList("1 Lightning Bolt (M21) 159");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Lightning Bolt", start: 2, end: 16 },
      { type: "SET_CODE", value: "M21", start: 18, end: 21 },
      { type: "COLLECTOR_NUMBER", value: "159", start: 23, end: 26 },
    ]);
  });
});

describe("buildListSpans", () => {
  test("empty string produces no spans", () => {
    expect(buildListSpans("")).toEqual([]);
  });

  test("simple card line produces quantity and card-name spans", () => {
    const spans = buildListSpans("1 Lightning Bolt");
    expect(spans).toMatchObject([
      { text: "1", role: "quantity", start: 0, end: 1 },
      { text: " ", role: null, start: 1, end: 2 },
      { text: "Lightning Bolt", role: "card-name", start: 2, end: 16 },
    ]);
  });

  test("card line with set and collector number", () => {
    const spans = buildListSpans("1 Shock (M21) 159");
    expect(spans).toMatchObject([
      { text: "1", role: "quantity", start: 0, end: 1 },
      { text: " ", role: null, start: 1, end: 2 },
      { text: "Shock", role: "card-name", start: 2, end: 7 },
      { text: " (", role: null, start: 7, end: 9 },
      { text: "M21", role: "set-code", start: 9, end: 12 },
      { text: ") ", role: null, start: 12, end: 14 },
      { text: "159", role: "collector-number", start: 14, end: 17 },
    ]);
  });

  test("comment line produces comment span", () => {
    const spans = buildListSpans("// Sideboard");
    expect(spans).toMatchObject([
      { text: "// Sideboard", role: "comment", start: 0, end: 12 },
    ]);
  });

  test("validation error overrides role for overlapping span", () => {
    const spans = buildListSpans("1 UnknownCard", {
      lines: [
        {
          lineIndex: 0,
          lineStart: 0,
          lineEnd: 13,
          kind: "error",
          span: { start: 2, end: 13 },
          message: "Unknown card",
        },
      ],
    });
    const cardNameSpan = spans.find((s) => s.start === 2 && s.text === "UnknownCard");
    expect(cardNameSpan?.role).toBe("error");
  });
});
