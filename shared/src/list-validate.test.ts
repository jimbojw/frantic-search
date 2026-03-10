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

  test("double-faced card matches by combined name", () => {
    const display = makeDisplay({
      names: ["Invasion of Ikoria", "Zilortha, Apex of Ikoria"],
      canonical_face: [0, 0],
      oracle_ids: ["dfc-oracle", "dfc-oracle"],
      mana_costs: ["{2}{G}", ""],
      type_lines: ["Battle", "Creature"],
      oracle_texts: ["", ""],
      powers: [0, 0],
      toughnesses: [0, 0],
      loyalties: [0, 0],
      defenses: [0, 0],
      color_identity: [0, 0],
      scryfall_ids: ["", ""],
      art_crop_thumb_hashes: ["", ""],
      card_thumb_hashes: ["", ""],
      layouts: ["battle", "battle"],
      legalities_legal: [0, 0],
      legalities_banned: [0, 0],
      legalities_restricted: [0, 0],
      power_lookup: [],
      toughness_lookup: [],
      loyalty_lookup: [],
      defense_lookup: [],
      edhrec_rank: [null, null],
      edhrec_salt: [null, null],
    });
    const result = validateDeckList("1 Invasion of Ikoria // Zilortha, Apex of Ikoria", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved?.[0]?.oracle_id).toBe("dfc-oracle");
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

  test("MTGGoldfish: known variant (prerelease) with no exact match falls back to foil in set, warning not error", () => {
    const display = makeDisplay({ names: ["Spirebluff Canal", "Shock", "Lightning Bolt", "Sol Ring", "Forest", "Island"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["canal-otj-nf", "canal-otj-foil"],
      collector_numbers: ["270", "270"],
      set_codes: ["OTJ", "OTJ"],
      canonical_face_ref: [0, 0],
      finish: [0, 1],
    });
    const result = validateDeckList("4 Spirebluff Canal <prerelease> [OTJ] (F)", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    const warning = result.lines.find((l) => l.kind === "warning");
    expect(warning).toBeDefined();
    expect(warning?.span).toBeDefined();
    expect(warning?.message).toContain("approximate");
    expect(result.resolved).toMatchObject([{
      oracle_id: "oid0",
      scryfall_id: "canal-otj-foil",
      quantity: 4,
      variant: "prerelease",
      finish: "foil",
    }]);
  });

  test("MTGGoldfish: known variant (prerelease) without (F) falls back to any printing in set", () => {
    const display = makeDisplay({ names: ["Spirebluff Canal", "Shock", "Lightning Bolt", "Sol Ring", "Forest", "Island"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["canal-otj-nf", "canal-otj-foil"],
      collector_numbers: ["270", "270"],
      set_codes: ["OTJ", "OTJ"],
      canonical_face_ref: [0, 0],
      finish: [0, 1],
    });
    const result = validateDeckList("4 Spirebluff Canal <prerelease> [OTJ]", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.lines.find((l) => l.kind === "warning")).toBeDefined();
    expect(result.resolved).toMatchObject([{
      oracle_id: "oid0",
      scryfall_id: "canal-otj-nf",
      quantity: 4,
      variant: "prerelease",
    }]);
  });

  test("MTGGoldfish: unknown variant still produces error", () => {
    const display = makeDisplay({ names: ["Spirebluff Canal", "Shock", "Lightning Bolt", "Sol Ring", "Forest", "Island"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["canal-otj"],
      collector_numbers: ["270"],
      set_codes: ["OTJ"],
      canonical_face_ref: [0],
    });
    const result = validateDeckList("4 Spirebluff Canal <gobbledygook> [OTJ]", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("No matching printing");
  });

  test("MTGGoldfish: known variant with SetName dash prefix falls back gracefully", () => {
    const display = makeDisplay({ names: ["Steam Vents", "Shock", "Lightning Bolt", "Sol Ring", "Forest", "Island"] });
    const printing = makePrintingDisplay({
      scryfall_ids: ["vents-ecl"],
      collector_numbers: ["1"],
      set_codes: ["ECL"],
      canonical_face_ref: [0],
      finish: [0],
    });
    const result = validateDeckList("4 Steam Vents <Shadowmoor - borderless> [ECL]", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Spec 111: Alternate names
  // -------------------------------------------------------------------------

  test("alternate name resolves to canonical card", () => {
    const display = makeDisplay({
      alternate_name_to_canonical_face: { leylineweaver: 1 },
    });
    const result = validateDeckList("4 Leyline Weaver", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved?.[0]?.oracle_id).toBe("oid1");
  });

  test("alternate name with preferred printing sets scryfall_id", () => {
    const display = makeDisplay({
      alternate_name_to_canonical_face: { leylineweaver: 1 },
    });
    const printing = makePrintingDisplay({
      scryfall_ids: ["p-om1-nf", "p-om1-foil", "p-mh2"],
      collector_numbers: ["100", "100", "261"],
      set_codes: ["OM1", "OM1", "MH2"],
      canonical_face_ref: [1, 1, 1],
      alternate_name_to_printing_indices: { leylineweaver: [0, 1] },
    });
    const result = validateDeckList("4 Leyline Weaver", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved?.[0]?.scryfall_id).toBe("p-om1-nf");
  });

  test("unknown card still errors even with empty alternate_names_index", () => {
    const display = makeDisplay({
      alternate_name_to_canonical_face: {},
    });
    const result = validateDeckList("1 TotallyFakeCard", display, null);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Unknown card");
  });

  // -------------------------------------------------------------------------
  // Printing-first resolution (tokens, duplicate names)
  // -------------------------------------------------------------------------

  test("token with set+collector resolves via printing-first when multiple cards share name", () => {
    const display = makeDisplay({
      names: ["Beast", "Lightning Bolt", "Counterspell", "Sol Ring", "Shock", "Forest", "Beast"],
      canonical_face: [0, 1, 2, 3, 4, 5, 6],
      oracle_ids: ["oid-beast-1", "oid1", "oid2", "oid3", "oid4", "oid5", "oid-beast-tc16"],
    });
    const printing = makePrintingDisplay({
      scryfall_ids: ["p1", "p2", "p3", "beast-tc16-14"],
      collector_numbers: ["159", "273", "1", "14"],
      set_codes: ["M21", "DMU", "MH2", "tc16"],
      set_names: ["Core Set 2021", "Dominaria United", "Modern Horizons 2", "Tokens Commander 2016"],
      canonical_face_ref: [4, 5, 1, 6],
    });
    const result = validateDeckList("1x Beast (tc16) 14 [Tokens & Extras{noDeck}]", display, printing);
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toMatchObject([
      { oracle_id: "oid-beast-tc16", scryfall_id: "beast-tc16-14", quantity: 1 },
    ]);
  });

  test("name mismatch when set+collector points to different card errors on name", () => {
    const display = makeDisplay({
      names: ["Beast", "Lightning Bolt", "Counterspell", "Sol Ring", "Shock", "Forest", "Goblin"],
      canonical_face: [0, 1, 2, 3, 4, 5, 6],
      oracle_ids: ["oid-beast", "oid1", "oid2", "oid3", "oid4", "oid5", "oid-goblin"],
    });
    const printing = makePrintingDisplay({
      scryfall_ids: ["p1", "p2", "p3", "goblin-tc16-14"],
      collector_numbers: ["159", "273", "1", "14"],
      set_codes: ["M21", "DMU", "MH2", "tc16"],
      canonical_face_ref: [4, 5, 1, 6],
    });
    const result = validateDeckList("1x Beast (tc16) 14", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Card name doesn't match printing");
    expect(errorLine?.span).toBeDefined();
  });

  test("unknown collector number when set+collector present errors on collector", () => {
    const display = makeDisplay({
      names: ["Beast", "Lightning Bolt", "Counterspell", "Sol Ring", "Shock", "Forest"],
      canonical_face: [0, 1, 2, 3, 4, 5],
      oracle_ids: ["oid-beast", "oid1", "oid2", "oid3", "oid4", "oid5"],
    });
    const printing = makePrintingDisplay({
      scryfall_ids: ["p1", "p2", "p3", "beast-tc16-14"],
      collector_numbers: ["159", "273", "1", "14"],
      set_codes: ["M21", "DMU", "MH2", "tc16"],
      set_names: ["Core Set 2021", "Dominaria United", "Modern Horizons 2", "Tokens Commander 2016"],
      canonical_face_ref: [4, 5, 1, 0],
    });
    const result = validateDeckList("1x Beast (tc16) 999", display, printing);
    const errorLine = result.lines.find((l) => l.kind === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine?.message).toContain("Collector number");
  });
});
