// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { importDeckList } from "./list-import";
import type { ParsedEntry, ValidationResult } from "./list-lexer";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

/** Build ValidationResult for importDeckList tests. errorLineIndices = line indices with kind: 'error'. */
function makeValidationResult(
  text: string,
  resolved: ParsedEntry[],
  errorLineIndices: number[] = [],
): ValidationResult {
  const lineStrings = text.split(/\r?\n/);
  const lines: ValidationResult["lines"] = [];
  let offset = 0;
  for (let i = 0; i < lineStrings.length; i++) {
    const line = lineStrings[i]!;
    const lineStart = offset;
    const lineEnd = offset + line.length;
    lines.push({
      lineIndex: i,
      lineStart,
      lineEnd,
      kind: errorLineIndices.includes(i) ? "error" : "ok",
    });
    offset = lineEnd + (i < lineStrings.length - 1 ? 1 : 0);
  }
  return { lines, resolved };
}

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
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 2 },
    ]);
    const result = importDeckList(text, display, null, vr);
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
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.zone).toBe("Deck");
    expect(result.candidates[1]!.zone).toBe("Sideboard");
  });

  test("normalizes MainDeck to Deck", () => {
    const text = "MainDeck\n1 Lightning Bolt";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Deck");
  });

  test("normalizes Main Deck to Deck", () => {
    const text = "Main Deck\n1 Lightning Bolt";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Deck");
  });

  test("sets zone from Commander section header", () => {
    const text = "Commander\n1 Sol Ring";
    const vr = makeValidationResult(text, [{ oracle_id: "oid3", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Commander");
  });

  test("unknown section resets zone to null", () => {
    const text = "Deck\n1 Lightning Bolt\nAbout\n1 Counterspell";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Deck");
    expect(result.candidates[1]!.zone).toBe(null);
  });

  test("splits multiple tags from comma-separated bracket", () => {
    const text = "1 Lightning Bolt [Blight,Creature]";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.tags).toEqual(["Blight", "Creature"]);
  });

  test("infers zone from primary bracket category matching known zone", () => {
    const text = "1 Sol Ring [Commander{top}]";
    const vr = makeValidationResult(text, [{ oracle_id: "oid3", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Commander");
    expect(result.candidates[0]!.tags).toEqual(["Commander{top}"]);
  });

  test("infers Sideboard zone from bracket with collection status", () => {
    const text = "1 Counterspell [Sideboard] ^Have,#37d67a^";
    const vr = makeValidationResult(text, [{ oracle_id: "oid2", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
    expect(result.candidates[0]!.tags).toEqual(["Sideboard"]);
  });

  test("infers Maybeboard zone from bracket with modifiers", () => {
    const text = "1 Lightning Bolt [Maybeboard{noDeck}{noPrice},Proliferate]";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Maybeboard");
    expect(result.candidates[0]!.tags).toEqual([
      "Maybeboard{noDeck}{noPrice}",
      "Proliferate",
    ]);
  });

  test("bracket zone overrides section header zone", () => {
    const text = "Deck\n1 Counterspell [Sideboard] ^Getting,#2ccce4^";
    const vr = makeValidationResult(text, [{ oracle_id: "oid2", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });

  test("extracts collection status from Archidekt markers", () => {
    const text = "1 Lightning Bolt [Ramp] ^Have,#37d67a^";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.collection_status).toBe("Have,#37d67a");
  });

  test("extracts tags from TappedOut inline #Tag", () => {
    const text = "1x Lightning Bolt #Land #Removal";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.tags).toEqual(["Land", "Removal"]);
  });

  test("sets zone from TappedOut *CMDR* role marker", () => {
    const text = "1x Sol Ring *CMDR*";
    const vr = makeValidationResult(text, [{ oracle_id: "oid3", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Commander");
  });

  test("TappedOut tags with slash preserved as single tag", () => {
    const text = "1x Lightning Bolt #Ramp/Reduction";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.tags).toEqual(["Ramp/Reduction"]);
  });

  test("extracts tags from Moxfield (SET) collector #Tag format", () => {
    const text = "1 Biomancer's Familiar (RNA) 158 #Reduction";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.tags).toEqual(["Reduction"]);
  });

  test("extracts tag_colors from collection status markers", () => {
    const text =
      "1 Lightning Bolt [Ramp] ^Have,#37d67a^\n1 Counterspell [Control] ^Don't Have,#f47373^";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, display, null, vr);
    expect(result.tagColors).toEqual({
      Have: "#37d67a",
      "Don't Have": "#f47373",
    });
  });

  test("extracts deck name from Arena metadata token", () => {
    const text = "Name Simic Rhythm\nDeck\n1 Lightning Bolt";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.deckName).toBe("Simic Rhythm");
  });

  test("skips error lines and does not produce candidates", () => {
    const text = "1 Lightning Bolt\n1 Unknown Card\n1 Counterspell";
    const vr = makeValidationResult(
      text,
      [
        { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
        { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
      ],
      [1],
    );
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.oracle_id).toBe("oid1");
    expect(result.candidates[1]!.oracle_id).toBe("oid2");
  });

  test("skips comment lines", () => {
    const text = "// this is a comment\n1 Lightning Bolt";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(1);
  });

  test("skips empty lines", () => {
    const text = "1 Lightning Bolt\n\n1 Counterspell";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(2);
  });

  test("quantity expansion produces separate candidates", () => {
    const text = "4 Lightning Bolt";
    const vr = makeValidationResult(text, [{ oracle_id: "oid1", scryfall_id: null, quantity: 4 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(4);
    for (const c of result.candidates) {
      expect(c.oracle_id).toBe("oid1");
    }
  });

  test("quantity with trailing x is parsed", () => {
    const text = "3x Counterspell";
    const vr = makeValidationResult(text, [{ oracle_id: "oid2", scryfall_id: null, quantity: 3 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates).toHaveLength(3);
  });

  test("resolves printing when set and collector number present", () => {
    const text = "1 Shock (M21) 159";
    const vr = makeValidationResult(text, [{ oracle_id: "oid4", scryfall_id: "p1", quantity: 1 }]);
    const result = importDeckList(text, display, printingDisplay, vr);
    expect(result.candidates[0]!.scryfall_id).toBe("p1");
  });

  test("sets finish to nonfoil when scryfall_id present but no foil/etched marker (Spec 075 invariant)", () => {
    const text = "1 Shock (M21) 159";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid4", scryfall_id: "p1", quantity: 1 },
    ]);
    const result = importDeckList(text, display, printingDisplay, vr);
    expect(result.candidates[0]!.scryfall_id).toBe("p1");
    expect(result.candidates[0]!.finish).toBe("nonfoil");
  });

  test("preserves finish from Moxfield foil marker", () => {
    const text = "1 Shock (M21) 159 *F*";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid4", scryfall_id: "p1", quantity: 1, finish: "foil" },
    ]);
    const result = importDeckList(text, display, printingDisplay, vr);
    expect(result.candidates[0]!.finish).toBe("foil");
  });

  test("preserves finish from Moxfield etched marker", () => {
    const text = "1 Shock (M21) 159 *E*";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid4", scryfall_id: "p1", quantity: 1, finish: "etched" },
    ]);
    const result = importDeckList(text, display, printingDisplay, vr);
    expect(result.candidates[0]!.finish).toBe("etched");
  });

  test("returns null display produces empty candidates", () => {
    const result = importDeckList("1 Lightning Bolt", null, null, { lines: [], resolved: [] });
    expect(result.candidates).toHaveLength(0);
  });

  test("empty text produces empty result", () => {
    const result = importDeckList("", display, null, { lines: [], resolved: [] });
    expect(result.candidates).toHaveLength(0);
    expect(result.deckName).toBeNull();
    expect(result.tagColors).toEqual({});
  });

  test("section header with colon is handled", () => {
    const text = "Sideboard:\n1 Counterspell";
    const vr = makeValidationResult(text, [{ oracle_id: "oid2", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });

  test("case-insensitive section header matching", () => {
    const text = "SIDEBOARD\n1 Counterspell";
    const vr = makeValidationResult(text, [{ oracle_id: "oid2", scryfall_id: null, quantity: 1 }]);
    const result = importDeckList(text, display, null, vr);
    expect(result.candidates[0]!.zone).toBe("Sideboard");
  });

  test("Moxfield: first line is commander when card matches is:commander", () => {
    const displayWithCommander = makeDisplay({
      names: ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Shock", "Forest", "Thalia, Guardian of Thraben"],
      type_lines: ["Creature", "Instant", "Instant", "Artifact", "Instant", "Land", "Legendary Creature — Human Soldier"],
      oracle_texts: ["", "", "", "", "", "", ""],
      oracle_ids: ["oid0", "oid1", "oid2", "oid3", "oid4", "oid5", "oid-cmdr"],
      mana_costs: ["{G}", "{R}", "{U}{U}", "{1}", "{R}", "{G}", "{1}{W}"],
      powers: [0, 0, 0, 0, 0, 0, 2],
      toughnesses: [0, 0, 0, 0, 0, 0, 2],
      loyalties: [0, 0, 0, 0, 0, 0, 0],
      defenses: [0, 0, 0, 0, 0, 0, 0],
      color_identity: [0, 0, 0, 0, 0, 0, 0],
      scryfall_ids: ["", "", "", "", "", "", ""],
      art_crop_thumb_hashes: ["", "", "", "", "", "", ""],
      card_thumb_hashes: ["", "", "", "", "", "", ""],
      layouts: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"],
      legalities_legal: [0, 0, 0, 0, 0, 0, 0],
      legalities_banned: [0, 0, 0, 0, 0, 0, 0],
      legalities_restricted: [0, 0, 0, 0, 0, 0, 0],
      canonical_face: [0, 1, 2, 3, 4, 5, 6],
      edhrec_rank: [null, null, null, null, null, null, null],
      edhrec_salt: [null, null, null, null, null, null, null],
    });
    const text = "1 Thalia, Guardian of Thraben (DMU) 30\n1 Lightning Bolt (M21) 159\n1 Counterspell";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid-cmdr", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, displayWithCommander, null, vr, "moxfield");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]!.zone).toBe("Commander");
    expect(result.candidates[1]!.zone).toBeNull();
    expect(result.candidates[2]!.zone).toBeNull();
  });

  test("Moxfield: first line is non-commander when card does not match is:commander", () => {
    const text = "1 Lightning Bolt (M21) 159\n1 Counterspell";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, display, null, vr, "moxfield");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.zone).toBeNull();
    expect(result.candidates[1]!.zone).toBeNull();
  });

  test("Moxfield or Arena plain-text: commander alone at end preceded by blank line", () => {
    const displayWithCommander = makeDisplay({
      names: ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Shock", "Forest", "Sliver Overlord"],
      type_lines: ["Creature", "Instant", "Instant", "Artifact", "Instant", "Land", "Legendary Creature — Sliver"],
      oracle_texts: ["", "", "", "", "", "", ""],
      oracle_ids: ["oid0", "oid1", "oid2", "oid3", "oid4", "oid5", "oid-sliver"],
      mana_costs: ["{G}", "{R}", "{U}{U}", "{1}", "{R}", "{G}", "{W}{U}{B}{R}{G}"],
      powers: [0, 0, 0, 0, 0, 0, 7],
      toughnesses: [0, 0, 0, 0, 0, 0, 7],
      loyalties: [0, 0, 0, 0, 0, 0, 0],
      defenses: [0, 0, 0, 0, 0, 0, 0],
      color_identity: [0, 0, 0, 0, 0, 0, 0],
      scryfall_ids: ["", "", "", "", "", "", ""],
      art_crop_thumb_hashes: ["", "", "", "", "", "", ""],
      card_thumb_hashes: ["", "", "", "", "", "", ""],
      layouts: ["normal", "normal", "normal", "normal", "normal", "normal", "normal"],
      legalities_legal: [0, 0, 0, 0, 0, 0, 0],
      legalities_banned: [0, 0, 0, 0, 0, 0, 0],
      legalities_restricted: [0, 0, 0, 0, 0, 0, 0],
      canonical_face: [0, 1, 2, 3, 4, 5, 6],
      edhrec_rank: [null, null, null, null, null, null, null],
      edhrec_salt: [null, null, null, null, null, null, null],
    });
    const text = "1 Lightning Bolt\n1 Counterspell\n\nSIDEBOARD:\n1 Shock\n\n1 Sliver Overlord";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid2", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid4", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid-sliver", scryfall_id: null, quantity: 1 },
    ]);
    const resultMoxfield = importDeckList(text, displayWithCommander, null, vr, "moxfield");
    expect(resultMoxfield.candidates).toHaveLength(4);
    expect(resultMoxfield.candidates[0]!.zone).toBeNull();
    expect(resultMoxfield.candidates[1]!.zone).toBeNull();
    expect(resultMoxfield.candidates[2]!.zone).toBe("Sideboard");
    expect(resultMoxfield.candidates[3]!.zone).toBe("Commander");

    // Plain text lacks Moxfield markers so is often detected as Arena
    const resultArena = importDeckList(text, displayWithCommander, null, vr, "arena");
    expect(resultArena.candidates[3]!.zone).toBe("Commander");
  });

  test("Moxfield: first card in SIDEBOARD: is Companion when card matches is:companion", () => {
    const displayWithCompanion = makeDisplay({
      names: ["Birds of Paradise", "Lightning Bolt", "Zirda, the Dawnwaker"],
      type_lines: ["Creature", "Instant", "Legendary Creature — Elemental"],
      oracle_texts: [
        "",
        "",
        "Companion — Each permanent card in your starting deck has mana value 2 or less.\nFirst strike, haste",
      ],
      oracle_ids: ["oid0", "oid1", "oid-zirda"],
      mana_costs: ["{G}", "{R}", "{1}{R}{W}"],
      powers: [0, 0, 2],
      toughnesses: [0, 0, 2],
      loyalties: [0, 0, 0],
      defenses: [0, 0, 0],
      color_identity: [0, 0, 0],
      scryfall_ids: ["", "", ""],
      art_crop_thumb_hashes: ["", "", ""],
      card_thumb_hashes: ["", "", ""],
      layouts: ["normal", "normal", "normal"],
      legalities_legal: [0, 0, 0],
      legalities_banned: [0, 0, 0],
      legalities_restricted: [0, 0, 0],
      canonical_face: [0, 1, 2],
      edhrec_rank: [null, null, null],
      edhrec_salt: [null, null, null],
    });
    const text = "1 Lightning Bolt (M21) 159\n1 Birds of Paradise\n\nSIDEBOARD:\n1 Zirda, the Dawnwaker (IKO) 233";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid0", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid-zirda", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, displayWithCompanion, null, vr, "moxfield");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]!.zone).toBeNull();
    expect(result.candidates[1]!.zone).toBeNull();
    expect(result.candidates[2]!.zone).toBe("Companion");
  });

  test("Moxfield: second card in SIDEBOARD: stays Sideboard when first is companion", () => {
    const displayWithCompanion = makeDisplay({
      names: ["Lightning Bolt", "Zirda, the Dawnwaker", "Shock"],
      type_lines: ["Instant", "Legendary Creature — Elemental", "Instant"],
      oracle_texts: [
        "",
        "Companion — Each permanent card in your starting deck has mana value 2 or less.\nFirst strike",
        "",
      ],
      oracle_ids: ["oid1", "oid-zirda", "oid4"],
      mana_costs: ["{R}", "{1}{R}{W}", "{R}"],
      powers: [0, 2, 0],
      toughnesses: [0, 2, 0],
      loyalties: [0, 0, 0],
      defenses: [0, 0, 0],
      color_identity: [0, 0, 0],
      scryfall_ids: ["", "", ""],
      art_crop_thumb_hashes: ["", "", ""],
      card_thumb_hashes: ["", "", ""],
      layouts: ["normal", "normal", "normal"],
      legalities_legal: [0, 0, 0],
      legalities_banned: [0, 0, 0],
      legalities_restricted: [0, 0, 0],
      canonical_face: [0, 1, 2],
      edhrec_rank: [null, null, null],
      edhrec_salt: [null, null, null],
    });
    const text = "1 Lightning Bolt\n\nSIDEBOARD:\n1 Zirda, the Dawnwaker (IKO) 233\n1 Shock";
    const vr = makeValidationResult(text, [
      { oracle_id: "oid1", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid-zirda", scryfall_id: null, quantity: 1 },
      { oracle_id: "oid4", scryfall_id: null, quantity: 1 },
    ]);
    const result = importDeckList(text, displayWithCompanion, null, vr, "moxfield");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[1]!.zone).toBe("Companion");
    expect(result.candidates[2]!.zone).toBe("Sideboard");
  });
});
