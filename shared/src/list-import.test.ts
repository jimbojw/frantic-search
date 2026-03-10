// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { importDeckList } from "./list-import";
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

describe("importDeckList", () => {
  const display = makeDisplay();
  const printingDisplay = makePrintingDisplay();

  test("imports a simple card list with no zones", () => {
    const text = "1 Lightning Bolt\n2 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toEqual({
      oracle_id: "oid1",
      scryfall_id: null,
      finish: null,
      zone: null,
      tags: [],
      collection_status: null,
      variant: null,
    });
    expect(result.candidates[1]!.oracle_id).toBe("oid2");
    expect(result.candidates[2]!.oracle_id).toBe("oid2");
  });

  test("sets zone from Arena section headers", () => {
    const text = "Deck\n1 Lightning Bolt\nSideboard\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.zone).toBe("Deck");
    expect(result.candidates[1]!.zone).toBe("Sideboard");
  });

  test("normalizes MainDeck to Deck", () => {
    const text = "MainDeck\n1 Lightning Bolt";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Deck");
  });

  test("normalizes Main Deck to Deck", () => {
    const text = "Main Deck\n1 Lightning Bolt";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Deck");
  });

  test("sets zone from Commander section header", () => {
    const text = "Commander\n1 Sol Ring";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Commander");
  });

  test("unknown section resets zone to null", () => {
    const text = "Deck\n1 Lightning Bolt\nAbout\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Deck");
    expect(result.candidates[1]!.zone).toBe(null);
  });

  test("splits multiple tags from comma-separated bracket", () => {
    const text = "1 Lightning Bolt [Blight,Creature]";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.tags).toEqual(["Blight", "Creature"]);
  });

  test("infers zone from primary bracket category matching known zone", () => {
    const text = "1 Sol Ring [Commander{top}]";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Commander");
    expect(result.candidates[0]!.tags).toEqual(["Commander{top}"]);
  });

  test("infers Sideboard zone from bracket with collection status", () => {
    const text = "1 Counterspell [Sideboard] ^Have,#37d67a^";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
    expect(result.candidates[0]!.tags).toEqual(["Sideboard"]);
  });

  test("infers Maybeboard zone from bracket with modifiers", () => {
    const text = "1 Lightning Bolt [Maybeboard{noDeck}{noPrice},Proliferate]";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Maybeboard");
    expect(result.candidates[0]!.tags).toEqual([
      "Maybeboard{noDeck}{noPrice}",
      "Proliferate",
    ]);
  });

  test("bracket zone overrides section header zone", () => {
    const text = "Deck\n1 Counterspell [Sideboard] ^Getting,#2ccce4^";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });

  test("extracts collection status from Archidekt markers", () => {
    const text = "1 Lightning Bolt [Ramp] ^Have,#37d67a^";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.collection_status).toBe("Have,#37d67a");
  });

  test("extracts tags from TappedOut inline #Tag", () => {
    const text = "1x Lightning Bolt #Land #Removal";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.tags).toEqual(["Land", "Removal"]);
  });

  test("sets zone from TappedOut *CMDR* role marker", () => {
    const text = "1x Sol Ring *CMDR*";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Commander");
  });

  test("TappedOut tags with slash preserved as single tag", () => {
    const text = "1x Lightning Bolt #Ramp/Reduction";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.tags).toEqual(["Ramp/Reduction"]);
  });

  test("extracts tag_colors from collection status markers", () => {
    const text =
      "1 Lightning Bolt [Ramp] ^Have,#37d67a^\n1 Counterspell [Control] ^Don't Have,#f47373^";
    const result = importDeckList(text, display, null);
    expect(result.tagColors).toEqual({
      Have: "#37d67a",
      "Don't Have": "#f47373",
    });
  });

  test("extracts deck name from Arena metadata token", () => {
    const text = "Name Simic Rhythm\nDeck\n1 Lightning Bolt";
    const result = importDeckList(text, display, null);
    expect(result.deckName).toBe("Simic Rhythm");
  });

  test("skips error lines and does not produce candidates", () => {
    const text = "1 Lightning Bolt\n1 Unknown Card\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.oracle_id).toBe("oid1");
    expect(result.candidates[1]!.oracle_id).toBe("oid2");
  });

  test("skips comment lines", () => {
    const text = "// this is a comment\n1 Lightning Bolt";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(1);
  });

  test("skips empty lines", () => {
    const text = "1 Lightning Bolt\n\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(2);
  });

  test("quantity expansion produces separate candidates", () => {
    const text = "4 Lightning Bolt";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(4);
    for (const c of result.candidates) {
      expect(c.oracle_id).toBe("oid1");
    }
  });

  test("quantity with trailing x is parsed", () => {
    const text = "3x Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates).toHaveLength(3);
  });

  test("resolves printing when set and collector number present", () => {
    const text = "1 Shock (M21) 159";
    const result = importDeckList(text, display, printingDisplay);
    expect(result.candidates[0]!.scryfall_id).toBe("p1");
  });

  test("preserves finish from Moxfield foil marker", () => {
    const text = "1 Shock (M21) 159 *F*";
    const result = importDeckList(text, display, printingDisplay);
    expect(result.candidates[0]!.finish).toBe("foil");
  });

  test("preserves finish from Moxfield etched marker", () => {
    const text = "1 Shock (M21) 159 *E*";
    const result = importDeckList(text, display, printingDisplay);
    expect(result.candidates[0]!.finish).toBe("etched");
  });

  test("returns null display produces empty candidates", () => {
    const result = importDeckList("1 Lightning Bolt", null, null);
    expect(result.candidates).toHaveLength(0);
  });

  test("empty text produces empty result", () => {
    const result = importDeckList("", display, null);
    expect(result.candidates).toHaveLength(0);
    expect(result.deckName).toBeNull();
    expect(result.tagColors).toEqual({});
  });

  test("section header with colon is handled", () => {
    const text = "Sideboard:\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });

  test("case-insensitive section header matching", () => {
    const text = "SIDEBOARD\n1 Counterspell";
    const result = importDeckList(text, display, null);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });
});
