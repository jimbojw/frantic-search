// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { validateDeckList } from "./list-validate";
import { buildListSpans } from "./list-lexer";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

function makeDisplay(
  overrides?: Partial<DisplayColumns>
): DisplayColumns {
  return {
    names: [
      "Birds of Paradise",
      "Lightning Bolt",
      "Counterspell",
      "Sol Ring",
      "Shock",
      "Forest",
    ],
    mana_costs: ["{G}", "{R}", "{U}{U}", "{1}", "{R}", "{G}"],
    type_lines: ["Creature", "Instant", "Instant", "Artifact", "Instant", "Land"],
    oracle_texts: ["", "", "", "", "", ""],
    powers: [0, 0, 0, 0, 0, 0],
    toughnesses: [0, 0, 0, 0, 0, 0],
    loyalties: [0, 0, 0, 0, 0, 0],
    defenses: [0, 0, 0, 0, 0, 0],
    color_identity: [0, 0, 0, 0, 0, 0],
    scryfall_ids: ["", "", "", "", "", ""],
    art_crop_thumb_hashes: ["", "", "", "", "", ""],
    card_thumb_hashes: ["", "", "", "", "", ""],
    layouts: ["normal", "normal", "normal", "normal", "normal", "normal"],
    legalities_legal: [0, 0, 0, 0, 0, 0],
    legalities_banned: [0, 0, 0, 0, 0, 0],
    legalities_restricted: [0, 0, 0, 0, 0, 0],
    power_lookup: [],
    toughness_lookup: [],
    loyalty_lookup: [],
    defense_lookup: [],
    canonical_face: [0, 1, 2, 3, 4, 5],
    oracle_ids: ["oid0", "oid1", "oid2", "oid3", "oid4", "oid5"],
    edhrec_rank: [null, null, null, null, null, null],
    edhrec_salt: [null, null, null, null, null, null],
    ...overrides,
  };
}

function makePrintingDisplay(
  overrides?: Partial<PrintingDisplayColumns>
): PrintingDisplayColumns {
  return {
    scryfall_ids: ["p1", "p2", "p3"],
    collector_numbers: ["159", "273", "1"],
    set_codes: ["M21", "DMU", "MH2"],
    set_names: ["Core Set 2021", "Dominaria United", "Modern Horizons 2"],
    rarity: [0, 0, 0],
    finish: [0, 0, 0],
    price_usd: [0, 0, 0],
    canonical_face_ref: [4, 5, 1],
    ...overrides,
  };
}

describe("validateDeckList", () => {
  test("returns empty when display is null", () => {
    const result = validateDeckList("1 Lightning Bolt", null, null);
    expect(result.lines).toEqual([]);
  });

  test("returns empty when printingDisplay is null but display exists - no validation of set/collector", () => {
    const display = makeDisplay();
    const result = validateDeckList("1 Shock (M21) 159", display, null);
    expect(result.lines.length).toBeGreaterThan(0);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeUndefined();
  });

  test("valid card name passes", () => {
    const display = makeDisplay();
    const result = validateDeckList("1 Lightning Bolt", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeUndefined();
  });

  test("invalid card name produces error", () => {
    const display = makeDisplay();
    const result = validateDeckList("1 UnknownCard", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Unknown card");
    expect(errorLine?.span).toBeDefined();
  });

  test("malformed line - quantity only produces error", () => {
    const display = makeDisplay();
    const result = validateDeckList("4x", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Missing card name");
  });

  test("unknown set produces error when printing data available", () => {
    const display = makeDisplay();
    const printing = makePrintingDisplay();
    const result = validateDeckList("1 Shock (XXX) 1", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Unknown set");
  });

  test("valid set and collector number passes", () => {
    const display = makeDisplay();
    const printing = makePrintingDisplay();
    const result = validateDeckList("1 Shock (M21) 159", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeUndefined();
  });

  test("mismatched collector number produces error", () => {
    const display = makeDisplay();
    const printing = makePrintingDisplay();
    const result = validateDeckList("1 Shock (M21) 999", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Collector number");
  });

  test("comment lines are ok", () => {
    const display = makeDisplay();
    const result = validateDeckList("// Sideboard\n1 Lightning Bolt", display, null);
    const errorLines = result.lines.filter((l) => l.kind === "error");
    expect(errorLines.length).toBe(0);
  });

  test("error spans use document-global offsets so About/Name are not highlighted as error", () => {
    const text = "About\nName Simic Rhythm\n\nDeck\n1 UnknownCard";
    const display = makeDisplay();
    const result = validateDeckList(text, display, null);
    const spans = buildListSpans(text, result);
    const aboutSpan = spans.find((s) => s.text === "About");
    const nameSpan = spans.find((s) => s.text === "Name Simic Rhythm");
    expect(aboutSpan?.role).toBe("section-header");
    expect(nameSpan?.role).toBe("metadata");
  });

  test("MTGGoldfish: numeric variant as collector number resolves", () => {
    const display = makeDisplay({ names: ["Island", "Forest", "Mountain", "Shock", "Lightning Bolt", "Sol Ring"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["island-thb-251", "forest-dmu-273", "bolt-mh2"],
      collector_numbers: ["251", "273", "1"],
      set_codes: ["THB", "DMU", "MH2"],
      canonical_face_ref: [0, 0, 1],
    });
    const result = validateDeckList("6 Island <251> [THB]", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toMatchObject([{ oracle_id: "oid0", scryfall_id: "island-thb-251", quantity: 6, variant: "251" }]);
  });

  test("MTGGoldfish: extended variant resolves when printing has ExtendedArt flag", () => {
    const display = makeDisplay({ names: ["Monument", "Shock", "Lightning Bolt", "Sol Ring", "Forest", "Island"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["monument-ext", "monument-reg"],
      collector_numbers: ["1", "2"],
      set_codes: ["DFT", "DFT"],
      canonical_face_ref: [0, 0],
      printing_flags: [128, 0],
    });
    const result = validateDeckList("4 Monument <extended> [DFT]", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toMatchObject([{ scryfall_id: "monument-ext", variant: "extended" }]);
  });
});
