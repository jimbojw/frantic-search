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
      { type: "CATEGORY", value: "Land", start: 27, end: 33 },
    ]);
  });

  test("card line with category including tag (Archidekt Commander)", () => {
    const tokens = lexDeckList("1x Frodo, Adventurous Hobbit (ltc) 2 [Commander{top}]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1x", start: 0, end: 2 },
      { type: "CARD_NAME", value: "Frodo, Adventurous Hobbit", start: 3, end: 28 },
      { type: "SET_CODE", value: "ltc", start: 30, end: 33 },
      { type: "COLLECTOR_NUMBER", value: "2", start: 35, end: 36 },
      { type: "CATEGORY", value: "Commander", start: 38, end: 47 },
      { type: "CATEGORY_TAG", value: "top", start: 47, end: 52 },
    ]);
  });

  test("card line with Moxfield foil marker", () => {
    const tokens = lexDeckList("1 Anim Pakal (LCI) 223 *F*");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Anim Pakal", start: 2, end: 12 },
      { type: "SET_CODE", value: "LCI", start: 14, end: 17 },
      { type: "COLLECTOR_NUMBER", value: "223", start: 19, end: 22 },
      { type: "FOIL_MARKER", value: "*F*", start: 23, end: 26 },
    ]);
  });

  test("card line with both foil and alter markers", () => {
    const tokens = lexDeckList("1 Card Name (SET) 42 *F* *A*");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Card Name", start: 2, end: 11 },
      { type: "SET_CODE", value: "SET", start: 13, end: 16 },
      { type: "COLLECTOR_NUMBER", value: "42", start: 18, end: 20 },
      { type: "FOIL_MARKER", value: "*F*", start: 21, end: 24 },
      { type: "ALTER_MARKER", value: "*A*", start: 25, end: 28 },
    ]);
  });

  test("card line with Moxfield etched marker", () => {
    const tokens = lexDeckList("1 Brimaz, Blight of Oreskos (MOC) 135 *E*");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Brimaz, Blight of Oreskos", start: 2, end: 27 },
      { type: "SET_CODE", value: "MOC", start: 29, end: 32 },
      { type: "COLLECTOR_NUMBER", value: "135", start: 34, end: 37 },
      { type: "ETCHED_MARKER", value: "*E*", start: 38, end: 41 },
    ]);
  });

  test("Arena section header with colon SIDEBOARD:", () => {
    const tokens = lexDeckList("SIDEBOARD:");
    expect(tokens).toMatchObject([
      { type: "SECTION_HEADER", value: "SIDEBOARD:", start: 0, end: 10 },
    ]);
  });

  test("card line with foil marker and category", () => {
    const tokens = lexDeckList("1 Card (SET) 123 *F* [Land]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Card", start: 2, end: 6 },
      { type: "SET_CODE", value: "SET", start: 8, end: 11 },
      { type: "COLLECTOR_NUMBER", value: "123", start: 13, end: 16 },
      { type: "FOIL_MARKER", value: "*F*", start: 17, end: 20 },
      { type: "CATEGORY", value: "Land", start: 21, end: 27 },
    ]);
  });

  test("Arena section header About produces SECTION_HEADER token", () => {
    const tokens = lexDeckList("About");
    expect(tokens).toMatchObject([
      { type: "SECTION_HEADER", value: "About", start: 0, end: 5 },
    ]);
  });

  test("Arena section header Deck produces SECTION_HEADER token", () => {
    const tokens = lexDeckList("Deck");
    expect(tokens).toMatchObject([
      { type: "SECTION_HEADER", value: "Deck", start: 0, end: 4 },
    ]);
  });

  test("Arena section header case insensitive", () => {
    const tokens = lexDeckList("SIDEBOARD");
    expect(tokens).toMatchObject([
      { type: "SECTION_HEADER", value: "SIDEBOARD", start: 0, end: 9 },
    ]);
  });

  test("Arena metadata Name produces METADATA token", () => {
    const tokens = lexDeckList("Name The Birds (are rebels)");
    expect(tokens).toMatchObject([
      { type: "METADATA", value: "Name The Birds (are rebels)", start: 0, end: 27 },
    ]);
  });

  test("1 About produces card tokens not section header", () => {
    const tokens = lexDeckList("1 About");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "About", start: 2, end: 7 },
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

  test("card line with Archidekt collection marker produces COLLECTION_STATUS_TEXT and COLLECTION_STATUS_COLOR", () => {
    const tokens = lexDeckList("1 Arcane Signet (ecc) 55 [Ramp] ^Have,#37d67a^");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Arcane Signet", start: 2, end: 15 },
      { type: "SET_CODE", value: "ecc", start: 17, end: 20 },
      { type: "COLLECTOR_NUMBER", value: "55", start: 22, end: 24 },
      { type: "CATEGORY", value: "Ramp", start: 25, end: 31 },
      { type: "COLLECTION_STATUS_TEXT", value: "Have", start: 33, end: 37 },
      { type: "COLLECTION_STATUS_COLOR", value: "#37d67a", start: 38, end: 45 },
    ]);
  });

  test("card line with collection marker status text containing space", () => {
    const tokens = lexDeckList("1 Deadly Rollick (cmm) 147 ^Don't Have,#f47373^");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Deadly Rollick", start: 2, end: 16 },
      { type: "SET_CODE", value: "cmm", start: 18, end: 21 },
      { type: "COLLECTOR_NUMBER", value: "147", start: 23, end: 26 },
      { type: "COLLECTION_STATUS_TEXT", value: "Don't Have", start: 28, end: 38 },
      { type: "COLLECTION_STATUS_COLOR", value: "#f47373", start: 39, end: 46 },
    ]);
  });

  test("card line without collection marker still parses", () => {
    const tokens = lexDeckList("1 Lightning Bolt");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1", start: 0, end: 1 },
      { type: "CARD_NAME", value: "Lightning Bolt", start: 2, end: 16 },
    ]);
    expect(tokens.some((t) => t.type === "COLLECTION_STATUS_TEXT")).toBe(false);
    expect(tokens.some((t) => t.type === "COLLECTION_STATUS_COLOR")).toBe(false);
  });

  test("MTGGoldfish: Island with collector number in angle brackets", () => {
    const tokens = lexDeckList("6 Island <251> [THB]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "6" },
      { type: "CARD_NAME", value: "Island" },
      { type: "VARIANT", value: "251" },
      { type: "SET_CODE_BRACKET", value: "THB" },
    ]);
  });

  test("MTGGoldfish: extended art variant", () => {
    const tokens = lexDeckList("4 Monument to Endurance <extended> [DFT]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "4" },
      { type: "CARD_NAME", value: "Monument to Endurance" },
      { type: "VARIANT", value: "extended" },
      { type: "SET_CODE_BRACKET", value: "DFT" },
    ]);
  });

  test("MTGGoldfish: prerelease with foil marker (F)", () => {
    const tokens = lexDeckList("4 Spirebluff Canal <prerelease> [OTJ] (F)");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "4" },
      { type: "CARD_NAME", value: "Spirebluff Canal" },
      { type: "VARIANT", value: "prerelease" },
      { type: "SET_CODE_BRACKET", value: "OTJ" },
      { type: "FOIL_PAREN", value: "(F)" },
    ]);
  });

  test("MTGGoldfish: set name - variant format", () => {
    const tokens = lexDeckList("4 Steam Vents <Shadowmoor - borderless> [ECL]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "4" },
      { type: "CARD_NAME", value: "Steam Vents" },
      { type: "VARIANT", value: "Shadowmoor - borderless" },
      { type: "SET_CODE_BRACKET", value: "ECL" },
    ]);
  });

  test("MTGGoldfish MTGO: quantity name [SET] (F) - no variant", () => {
    const tokens = lexDeckList("2 Disdainful Stroke [KTK] (F)");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "2" },
      { type: "CARD_NAME", value: "Disdainful Stroke" },
      { type: "SET_CODE_BRACKET", value: "KTK" },
      { type: "FOIL_PAREN", value: "(F)" },
    ]);
  });

  test("MTGGoldfish MTGO: quantity name [SET] - no modifier", () => {
    const tokens = lexDeckList("1 Flashfreeze [M10]");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1" },
      { type: "CARD_NAME", value: "Flashfreeze" },
      { type: "SET_CODE_BRACKET", value: "M10" },
    ]);
    expect(tokens.some((t) => t.type === "FOIL_PAREN")).toBe(false);
    expect(tokens.some((t) => t.type === "ETCHED_PAREN")).toBe(false);
  });

  test("MTGGoldfish MTGO: quantity name [SET] (E) - etched", () => {
    const tokens = lexDeckList("1 Sol Ring [CMM] (E)");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1" },
      { type: "CARD_NAME", value: "Sol Ring" },
      { type: "SET_CODE_BRACKET", value: "CMM" },
      { type: "ETCHED_PAREN", value: "(E)" },
    ]);
  });

  test("MTGGoldfish Tabletop: (E) etched modifier with variant", () => {
    const tokens = lexDeckList("1 Sol Ring <etched> [CMM] (E)");
    expect(tokens).toMatchObject([
      { type: "QUANTITY", value: "1" },
      { type: "CARD_NAME", value: "Sol Ring" },
      { type: "VARIANT", value: "etched" },
      { type: "SET_CODE_BRACKET", value: "CMM" },
      { type: "ETCHED_PAREN", value: "(E)" },
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

  test("card line with category produces category span", () => {
    const spans = buildListSpans("1x Access Tunnel (tdc) 337 [Land]");
    const categorySpan = spans.find((s) => s.text === "[Land]");
    expect(categorySpan).toBeDefined();
    expect(categorySpan?.role).toBe("category");
  });

  test("card line with etched marker produces etched-marker span", () => {
    const spans = buildListSpans("1 Brimaz (MOC) 135 *E*");
    const etchedSpan = spans.find((s) => s.text === "*E*");
    expect(etchedSpan).toBeDefined();
    expect(etchedSpan?.role).toBe("etched-marker");
  });

  test("card line with foil marker produces foil-marker span", () => {
    const spans = buildListSpans("1 Anim Pakal (LCI) 223 *F*");
    const foilSpan = spans.find((s) => s.text === "*F*");
    expect(foilSpan).toBeDefined();
    expect(foilSpan?.role).toBe("foil-marker");
  });

  test("Arena format paste produces section-header and metadata spans", () => {
    const text = "About\nName The Birds (are rebels)\n\nDeck\n1 Anim Pakal, Thousandth Moon";
    const spans = buildListSpans(text);
    const aboutSpan = spans.find((s) => s.text === "About");
    const nameSpan = spans.find((s) => s.text === "Name The Birds (are rebels)");
    const deckSpan = spans.find((s) => s.text === "Deck");
    expect(aboutSpan?.role).toBe("section-header");
    expect(nameSpan?.role).toBe("metadata");
    expect(deckSpan?.role).toBe("section-header");
  });

  test("card line with category tag produces category-tag span", () => {
    const spans = buildListSpans("1x Frodo (ltc) 2 [Commander{top}]");
    const tagSpan = spans.find((s) => s.text === "{top}");
    expect(tagSpan).toBeDefined();
    expect(tagSpan?.role).toBe("category-tag");
  });

  test("card line with collection marker produces collection-status-text and collection-status-color spans", () => {
    const spans = buildListSpans("1 Arcane Signet (ecc) 55 [Ramp] ^Have,#37d67a^");
    const statusTextSpan = spans.find((s) => s.text === "Have");
    const colorSpan = spans.find((s) => s.text === "#37d67a");
    expect(statusTextSpan?.role).toBe("collection-status-text");
    expect(colorSpan?.role).toBe("collection-status-color");
  });

  test("MTGGoldfish line produces variant and set-code spans", () => {
    const spans = buildListSpans("6 Island <251> [THB]");
    const variantSpan = spans.find((s) => s.text === "251");
    const setSpan = spans.find((s) => s.text === "THB");
    expect(variantSpan?.role).toBe("variant");
    expect(setSpan?.role).toBe("set-code");
  });

  test("MTGGoldfish MTGO no-variant produces set-code and foil-marker spans", () => {
    const spans = buildListSpans("2 Disdainful Stroke [KTK] (F)");
    const setSpan = spans.find((s) => s.text === "KTK");
    const foilSpan = spans.find((s) => s.text === "(F)");
    expect(setSpan?.role).toBe("set-code");
    expect(foilSpan?.role).toBe("foil-marker");
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
