// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { Color, Format } from "./bits";
import type { ColumnarData } from "./data";
import { validateDeckListWithEngine, validateLines } from "./list-validate-engine";
import { CardIndex } from "./search/card-index";
import { NodeCache } from "./search/evaluator";
import { index, printingIndex, TEST_DATA, TEST_PRINTING_DATA } from "./search/evaluator.test-fixtures";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

// ---------------------------------------------------------------------------
// Build DisplayColumns / PrintingDisplayColumns from test fixtures
// (mirrors extractDisplayColumns / extractPrintingDisplayColumns in worker.ts)
// ---------------------------------------------------------------------------

function buildDisplay(): DisplayColumns {
  const len = TEST_DATA.names.length;
  return {
    names: TEST_DATA.names,
    mana_costs: TEST_DATA.mana_costs,
    type_lines: TEST_DATA.type_lines,
    oracle_texts: TEST_DATA.oracle_texts,
    powers: TEST_DATA.powers,
    toughnesses: TEST_DATA.toughnesses,
    loyalties: TEST_DATA.loyalties,
    defenses: TEST_DATA.defenses,
    color_identity: TEST_DATA.color_identity,
    scryfall_ids: TEST_DATA.scryfall_ids,
    art_crop_thumb_hashes: TEST_DATA.art_crop_thumb_hashes ?? new Array<string>(len).fill(""),
    card_thumb_hashes: TEST_DATA.card_thumb_hashes ?? new Array<string>(len).fill(""),
    layouts: TEST_DATA.layouts,
    legalities_legal: TEST_DATA.legalities_legal,
    legalities_banned: TEST_DATA.legalities_banned,
    legalities_restricted: TEST_DATA.legalities_restricted,
    power_lookup: TEST_DATA.power_lookup,
    toughness_lookup: TEST_DATA.toughness_lookup,
    loyalty_lookup: TEST_DATA.loyalty_lookup,
    defense_lookup: TEST_DATA.defense_lookup,
    canonical_face: TEST_DATA.canonical_face,
    oracle_ids: TEST_DATA.oracle_ids ?? new Array<string>(len).fill(""),
    edhrec_rank: TEST_DATA.edhrec_ranks,
    edhrec_salt: TEST_DATA.edhrec_salts,
  };
}

function buildPrintingDisplay(): PrintingDisplayColumns {
  return {
    scryfall_ids: TEST_PRINTING_DATA.scryfall_ids,
    collector_numbers: TEST_PRINTING_DATA.collector_numbers,
    set_codes: TEST_PRINTING_DATA.set_indices.map(
      (idx) => TEST_PRINTING_DATA.set_lookup[idx]?.code ?? "",
    ),
    set_names: TEST_PRINTING_DATA.set_indices.map(
      (idx) => TEST_PRINTING_DATA.set_lookup[idx]?.name ?? "",
    ),
    rarity: TEST_PRINTING_DATA.rarity,
    finish: TEST_PRINTING_DATA.finish,
    price_usd: TEST_PRINTING_DATA.price_usd,
    canonical_face_ref: TEST_PRINTING_DATA.canonical_face_ref,
    illustration_id_index: TEST_PRINTING_DATA.illustration_id_index,
    printing_flags: TEST_PRINTING_DATA.printing_flags,
    promo_types_flags_0: TEST_PRINTING_DATA.promo_types_flags_0,
    promo_types_flags_1: TEST_PRINTING_DATA.promo_types_flags_1,
  };
}

const display = buildDisplay();
const pd = buildPrintingDisplay();

function validate(text: string, d = display, p: PrintingDisplayColumns | null = pd) {
  const cache = new NodeCache(index, printingIndex);
  return validateDeckListWithEngine(text, index, printingIndex, d, p, cache);
}

function validateLinesOnly(lines: string[], d = display, p: PrintingDisplayColumns | null = pd) {
  const cache = new NodeCache(index, printingIndex);
  return validateLines(lines, index, printingIndex, d, p, cache);
}

// ---------------------------------------------------------------------------
// § 3e: Name-only lines
// ---------------------------------------------------------------------------

describe("validateLines", () => {
  test("returns only error/warning in result, indices strided per line", () => {
    const { result, indices } = validateLinesOnly(["1 Lightning Bolt", "1 UnknownCard"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.lineIndex).toBe(1);
    expect(result[0]!.kind).toBe("error");
    expect(indices).toHaveLength(4); // 2 lines * stride 2
    expect(indices[0]).toBeGreaterThanOrEqual(0); // line 0: valid oracleIndex
    expect(indices[2]).toBe(-1); // line 1: invalid
    expect(indices[3]).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// § Spec 116: Index alignment
// ---------------------------------------------------------------------------
//
// oracleIndex = face index into display.oracle_ids (face-level; each row is a card face).
// scryfallIndex = printing row into printingDisplay.scryfall_ids (printing-row level).
// For card-level resolution (no specific printing), scryfallIndex = -1.
// The worker uses the same index space as the main thread's DisplayColumns /
// PrintingDisplayColumns. Main-thread conversion:
//   display.oracle_ids[oracleIndex]        → oracle_id string
//   printingDisplay.scryfall_ids[scryfallIndex] → scryfall_id string (when ≥ 0)
// ---------------------------------------------------------------------------

describe("Spec 116 — index alignment", () => {
  test("name-only: oracleIndex matches face row, scryfallIndex is -1", () => {
    const result = validate("1 Lightning Bolt");
    const { indices } = result;
    expect(indices).toHaveLength(2);
    // Lightning Bolt = face row 1
    expect(indices[0]).toBe(1);
    expect(display.oracle_ids[indices[0]!]).toBe("oid1");
    // No specific printing → -1
    expect(indices[1]).toBe(-1);
  });

  test("printing-level: oracleIndex is canonicalFace, scryfallIndex is printing row", () => {
    const result = validate("1 Lightning Bolt (MH2) 261");
    const { indices } = result;
    expect(indices).toHaveLength(2);
    // canonical_face_ref[0] = 1 (printing row 0 is Bolt MH2 261)
    expect(indices[0]).toBe(1);
    expect(display.oracle_ids[indices[0]!]).toBe("oid1");
    // Printing row 0 → scryfall_id "p-a"
    expect(indices[1]).toBe(0);
    expect(pd.scryfall_ids[indices[1]!]).toBe("p-a");
  });

  test("Sol Ring printing-level indices align with display columns", () => {
    const result = validate("1 Sol Ring (C21) 280");
    const { indices } = result;
    expect(indices[0]).toBe(3); // face row 3
    expect(display.oracle_ids[indices[0]!]).toBe("oid3");
    expect(indices[1]).toBe(3); // printing row 3 → "p-d"
    expect(pd.scryfall_ids[indices[1]!]).toBe("p-d");
  });

  test("error line yields -1, -1", () => {
    const result = validate("1 UnknownCard");
    const { indices } = result;
    expect(indices[0]).toBe(-1);
    expect(indices[1]).toBe(-1);
  });

  test("comment and empty lines yield -1, -1", () => {
    const result = validate("// comment\n\n1 Lightning Bolt");
    const { indices } = result;
    expect(indices).toHaveLength(6); // 3 lines * stride 2
    // comment
    expect(indices[0]).toBe(-1);
    expect(indices[1]).toBe(-1);
    // empty
    expect(indices[2]).toBe(-1);
    expect(indices[3]).toBe(-1);
    // Lightning Bolt
    expect(indices[4]).toBe(1);
    expect(indices[5]).toBe(-1);
  });

  test("DFC resolves to canonical face (front face index)", () => {
    const result = validate("1 Ayara, Widow of the Realm // Ayara, Furnace Queen");
    const { indices } = result;
    // Ayara: face rows 7 (front) and 8 (back), canonical_face = 7 for both
    // resolveNameOnly uses faceIdx from evaluator — should be 7 (front) or canonical face
    expect(indices[0]).toBe(7);
    expect(display.oracle_ids[indices[0]!]).toBe("oid7");
  });

  test("multiple lines produce correctly strided indices", () => {
    const result = validate("2 Lightning Bolt\n3 Sol Ring");
    const { indices } = result;
    expect(indices).toHaveLength(4); // 2 lines * stride 2
    expect(indices[0]).toBe(1);
    expect(indices[1]).toBe(-1); // name-only
    expect(indices[2]).toBe(3);
    expect(indices[3]).toBe(-1); // name-only
  });

  test("indices from validateLines match validateDeckListWithEngine", () => {
    const lines = ["1 Lightning Bolt (MH2) 261", "1 Sol Ring"];
    const { indices: lineIndices } = validateLinesOnly(lines);
    const { indices: fullIndices } = validate(lines.join("\n"));
    expect(lineIndices).toHaveLength(fullIndices.length);
    for (let i = 0; i < lineIndices.length; i++) {
      expect(lineIndices[i]).toBe(fullIndices[i]);
    }
  });

  test("main-thread conversion: indices → oracle_id / scryfall_id", () => {
    const result = validate("1 Lightning Bolt (MH2) 261\n1 Sol Ring");
    const { indices } = result;
    const oracleIdx0 = indices[0]!;
    const scryfallIdx0 = indices[1]!;
    const oracleIdx1 = indices[2]!;
    const scryfallIdx1 = indices[3]!;

    // Line 0: printing-level
    expect(display.oracle_ids[oracleIdx0]).toBe("oid1");
    expect(pd.scryfall_ids[scryfallIdx0]).toBe("p-a");

    // Line 1: name-only (no printing)
    expect(display.oracle_ids[oracleIdx1]).toBe("oid3");
    expect(scryfallIdx1).toBe(-1);
  });
});

describe("validateDeckListWithEngine", () => {
  test("valid card name passes (name-only)", () => {
    const result = validate("1 Lightning Bolt");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.oracle_id).toBe("oid1");
    expect(result.resolved![0]!.quantity).toBe(1);
  });

  test("unknown card name produces error", () => {
    const result = validate("1 UnknownCard");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown card");
  });

  test("comment lines are ok", () => {
    const result = validate("// Sideboard\n1 Lightning Bolt");
    expect(result.lines.filter((l) => l.kind === "error")).toHaveLength(0);
    expect(result.resolved).toHaveLength(1);
  });

  test("quantity-only line produces error", () => {
    const result = validate("4x");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Missing card name");
  });

  test("DFC matches by combined name", () => {
    const result = validate("1 Ayara, Widow of the Realm // Ayara, Furnace Queen");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.oracle_id).toBe("oid7");
  });

  test("DFC matches by single-slash (Moxfield format)", () => {
    const result = validate("1 Ayara, Widow of the Realm / Ayara, Furnace Queen");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.oracle_id).toBe("oid7");
  });

  test("multiple lines resolve independently", () => {
    const result = validate("2 Lightning Bolt\n3 Sol Ring");
    expect(result.lines.filter((l) => l.kind === "error")).toHaveLength(0);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved![0]!.oracle_id).toBe("oid1");
    expect(result.resolved![0]!.quantity).toBe(2);
    expect(result.resolved![1]!.oracle_id).toBe("oid3");
    expect(result.resolved![1]!.quantity).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // § 3a: Full match (name + set + collector)
  // ---------------------------------------------------------------------------

  test("full match: name + set + collector resolves to specific printing", () => {
    const result = validate("1 Lightning Bolt (MH2) 261");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBe("p-a");
  });

  test("full match: Sol Ring in C21", () => {
    const result = validate("1 Sol Ring (C21) 280");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved![0]!.scryfall_id).toBe("p-d");
  });

  // ---------------------------------------------------------------------------
  // § 3b: Wrong collector number
  // ---------------------------------------------------------------------------

  test("wrong collector number produces error with quick fixes", () => {
    const result = validate("1 Lightning Bolt (MH2) 999");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Collector number");
    expect(err!.quickFixes).toBeDefined();
    expect(err!.quickFixes!.length).toBeGreaterThan(0);
  });

  test("collector number off by 1 (e.g. 261e) auto-resolves with warning", () => {
    // MH2 Bolt has 261, 262; "261e" has Levenshtein distance 1 to "261"
    const result = validate("1 Lightning Bolt (MH2) 261e");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toBe("Collector number resolved to 261");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBeDefined();
  });

  test("collector number off by 1 with foil marker prefers foil printing", () => {
    // MH2 Bolt: row 0 = 261 nonfoil, row 1 = 261 foil
    const result = validate("1 Lightning Bolt (MH2) 261e *F*");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBe("p-b"); // foil
  });

  test("quick fixes for wrong collector number sorted by Levenshtein distance", () => {
    // MH2 Bolt has 261, 262; "26" has dist 2 to both (no single dist-1 → no auto-resolve)
    const result = validate("1 Lightning Bolt (MH2) 26");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.quickFixes).toBeDefined();
    const labels = err!.quickFixes!.map((f) => f.label);
    // 261 and 262 both dist 2 from "26"; 261 < 262 lexicographically, so 261 first
    expect(labels[0]).toMatch(/Use 261/);
  });

  // ---------------------------------------------------------------------------
  // § 3c: Name mismatch (set+collector points to different card)
  // ---------------------------------------------------------------------------

  test("name mismatch: set+collector points to different card", () => {
    // C21 280 is Sol Ring (face 3), but we're saying the name is Lightning Bolt
    const result = validate("1 Lightning Bolt (C21) 280");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("doesn't match");
    expect(err!.quickFixes).toBeDefined();
    expect(err!.quickFixes!.some((f) => f.label.includes("Sol Ring"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // § 3d / § 3d.0: Unknown set
  // ---------------------------------------------------------------------------

  test("unknown set with no name+collector match produces error with Remove set/collector only", () => {
    // cn 999 does not exist for Lightning Bolt; ZZZ matches no known set at distance 1
    const result = validate("1 Lightning Bolt (ZZZ) 999");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    expect(err!.quickFixes).toBeDefined();
    expect(err!.quickFixes!.length).toBe(1);
    expect(err!.quickFixes![0]!.label).toContain("Remove set/collector");
    expect(err!.quickFixes![0]!.replacement).toBe("1 Lightning Bolt");
  });

  test("Levenshtein-on-set: 1 set + 1 collector at distance 1 auto-resolves with warning", () => {
    // MH1 is 1 from MH2; 261e is 1 from 261. Lightning Bolt in MH2 has cn 261
    const result = validate("1 Lightning Bolt (MH1) 261e");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("Set and collector number resolved to MH2 261");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBe("p-a");
  });

  test("Levenshtein-on-set: 1 set at distance 1, wrong collector offers set+collector quick fixes", () => {
    // MH1 -> MH2; 37e doesn't match 261,262,1. Quick fixes replace both set and collector
    const result = validate("1 Lightning Bolt (MH1) 37e");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    expect(err!.quickFixes).toBeDefined();
    const use261 = err!.quickFixes!.find((f) => f.label.startsWith("Use MH2 261"));
    expect(use261).toBeDefined();
    expect(use261!.replacement).toContain("(MH2)");
    expect(use261!.replacement).toContain("261");
  });

  test("Levenshtein-on-set: 2+ sets at distance 1 offers Use [set] for first two only", () => {
    // C2R is 1 from C21 and CMR. Sol Ring cn 999 doesn't exist
    const result = validate("1 Sol Ring (C2R) 999");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    expect(err!.quickFixes).toBeDefined();
    const useC21 = err!.quickFixes!.find((f) => f.label === "Use C21");
    const useCMR = err!.quickFixes!.find((f) => f.label === "Use CMR");
    expect(useC21).toBeDefined();
    expect(useCMR).toBeDefined();
    // Set replacement only — collector 999 stays; re-validation will produce collector error
    expect(useC21!.replacement).toBe("1 Sol Ring (C21) 999");
  });

  test("unknown set with unique name+collector resolves to that printing with warning", () => {
    // Lightning Bolt cn 113 is only in A25 (row 2, p-c)
    const result = validate("1 Lightning Bolt (ZZZ) 113");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toBe("Set resolved to A25");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBe("p-c");
  });

  test("unknown set with multiple name+collector matches offers Use quick fixes + Remove", () => {
    // Sol Ring cn 280 is in C21 (rows 3,4) and OC21 (row 7) — 2 unique sets
    const result = validate("1 Sol Ring (ZZZ) 280");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    expect(err!.quickFixes).toBeDefined();
    const useC21 = err!.quickFixes!.find((f) => f.label === "Use C21");
    expect(useC21).toBeDefined();
    expect(useC21!.replacement).toBe("1 Sol Ring (C21) 280");
    const removeFix = err!.quickFixes!.find((f) => f.label.includes("Remove set/collector"));
    expect(removeFix).toBeDefined();
    expect(removeFix!.replacement).toBe("1 Sol Ring");
  });

  test("unknown set with foil+non-foil same set resolves with warning", () => {
    // Lightning Bolt cn 261 is in MH2 only (rows 0,1,9 — foil and non-foil)
    const result = validate("1 Lightning Bolt (ZZZ) 261");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toBe("Set resolved to MH2");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBeDefined();
  });

  test("(000) with multiple unique sets resolves by name only", () => {
    // Sol Ring cn 280 is in C21 and OC21 — 000 means no set, resolve by name
    const result = validate("1 Sol Ring (000) 280");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBeNull();
  });

  test("(000) with no collector resolves by name only", () => {
    // TappedOut format: (000) without :num, #Tag forces TappedOut parsing
    const result = validate("1 Lightning Bolt (000) #Test");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved![0]!.scryfall_id).toBeNull();
  });

  test("(000) with unique name+collector resolves to that printing with warning", () => {
    // Lightning Bolt cn 113 is only in A25
    const result = validate("1 Lightning Bolt (000) 113");
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toBe("Set resolved to A25");
    expect(result.resolved![0]!.scryfall_id).toBe("p-c");
  });

  test("TCGPlayer set code PPTHB maps to pthb for known-set check (no pthb in fixtures, so unknown set)", () => {
    // Engine fixtures lack pthb; PPTHB maps to pthb and pthb is unknown → error
    const result = validate("1 Lightning Bolt [PPTHB] 13p");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    // Error message shows user's input (PPTHB), not internal Scryfall code
    expect(err!.message).toContain("PPTHB");
  });

  // ---------------------------------------------------------------------------
  // § 3e with printing data: set present but no collector
  // ---------------------------------------------------------------------------

  test("card with known set but no collector resolves to printing in set", () => {
    // Lightning Bolt has printings in MH2
    const result = validate("1 Lightning Bolt (MH2) 261");
    expect(result.lines.find((l) => l.kind === "error")).toBeUndefined();
    expect(result.resolved![0]!.scryfall_id).toBe("p-a");
  });

  // ---------------------------------------------------------------------------
  // Finish markers
  // ---------------------------------------------------------------------------

  test("foil marker sets finish on resolved entry", () => {
    const result = validate("1 Lightning Bolt *F*");
    expect(result.resolved![0]!.finish).toBe("foil");
  });

  test("etched marker sets finish on resolved entry", () => {
    const result = validate("1 Lightning Bolt *E*");
    expect(result.resolved![0]!.finish).toBe("etched");
  });

  // ---------------------------------------------------------------------------
  // § 3g: Approximate name match
  // ---------------------------------------------------------------------------

  test("approximate match: punctuation difference auto-resolves with warning", () => {
    // "Thalia Guardian of Thraben" without comma → auto-resolve with warning (Spec 114 § 3g)
    const result = validate("1 Thalia Guardian of Thraben");
    expect(result.resolved).toHaveLength(1);
    const warn = result.lines.find((l) => l.kind === "warning");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("Thalia, Guardian of Thraben");
  });

  test("approximate match: Gloin (plain o) and Glόin (Greek omicron) auto-resolve to Glóin with warning", () => {
    // Minimal fixture with Glóin for lookalike tests (Spec 114 § 3g)
    const gloinData: ColumnarData = {
      names: ["Glóin, Dwarf Emissary"],
      mana_costs: ["{1}{R}"],
      oracle_texts: [""],
      colors: [Color.Red],
      color_identity: [Color.Red],
      type_lines: ["Legendary Creature — Dwarf Noble"],
      powers: [2],
      toughnesses: [3],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [Format.Commander],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
      scryfall_ids: [""],
      oracle_ids: ["oid-gloin"],
      art_crop_thumb_hashes: [""],
      card_thumb_hashes: [""],
      layouts: ["normal"],
      flags: [0],
      edhrec_ranks: [null],
      edhrec_salts: [null],
      power_lookup: ["", "0", "*", "2", "3"],
      toughness_lookup: ["", "1", "3", "4"],
      loyalty_lookup: [""],
      defense_lookup: [""],
      keywords_index: {},
    };
    const gloinIndex = new CardIndex(gloinData);
    const gloinDisplay: DisplayColumns = {
      names: gloinData.names,
      mana_costs: gloinData.mana_costs,
      type_lines: gloinData.type_lines,
      oracle_texts: gloinData.oracle_texts,
      powers: gloinData.powers,
      toughnesses: gloinData.toughnesses,
      loyalties: gloinData.loyalties,
      defenses: gloinData.defenses,
      color_identity: gloinData.color_identity,
      scryfall_ids: gloinData.scryfall_ids,
      art_crop_thumb_hashes: gloinData.art_crop_thumb_hashes ?? [""],
      card_thumb_hashes: gloinData.card_thumb_hashes ?? [""],
      layouts: gloinData.layouts,
      legalities_legal: gloinData.legalities_legal,
      legalities_banned: gloinData.legalities_banned,
      legalities_restricted: gloinData.legalities_restricted,
      power_lookup: gloinData.power_lookup,
      toughness_lookup: gloinData.toughness_lookup,
      loyalty_lookup: gloinData.loyalty_lookup,
      defense_lookup: gloinData.defense_lookup,
      canonical_face: gloinData.canonical_face,
      oracle_ids: gloinData.oracle_ids ?? [""],
      edhrec_rank: gloinData.edhrec_ranks,
      edhrec_salt: gloinData.edhrec_salts,
    };
    const cache = new NodeCache(gloinIndex, null);

    const resultGloin = validateDeckListWithEngine(
      "1 Gloin, Dwarf Emissary",
      gloinIndex,
      null,
      gloinDisplay,
      null,
      cache,
    );
    expect(resultGloin.resolved).toHaveLength(1);
    expect(resultGloin.resolved![0]!.oracle_id).toBe("oid-gloin");
    const warnGloin = resultGloin.lines.find((l) => l.kind === "warning");
    expect(warnGloin).toBeDefined();
    expect(warnGloin!.message).toBe('Name resolved to "Glóin, Dwarf Emissary"');

    const resultGreek = validateDeckListWithEngine(
      "1 Glόin, Dwarf Emissary", // U+03CC Greek omicron with tonos
      gloinIndex,
      null,
      gloinDisplay,
      null,
      cache,
    );
    expect(resultGreek.resolved).toHaveLength(1);
    expect(resultGreek.resolved![0]!.oracle_id).toBe("oid-gloin");
    const warnGreek = resultGreek.lines.find((l) => l.kind === "warning");
    expect(warnGreek).toBeDefined();
    expect(warnGreek!.message).toBe('Name resolved to "Glóin, Dwarf Emissary"');
  });

  // ---------------------------------------------------------------------------
  // Case 3: Unknown name with valid set+collector
  // ---------------------------------------------------------------------------

  test("unknown card name with valid set+collector suggests correct card", () => {
    // MH2 261 = Lightning Bolt, but we use a fake name
    const result = validate("1 TypoCard (MH2) 261");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("not recognized");
    expect(err!.quickFixes).toBeDefined();
    expect(err!.quickFixes![0]!.label).toContain("Lightning Bolt");
  });

  // ---------------------------------------------------------------------------
  // Section headers and empty lines
  // ---------------------------------------------------------------------------

  test("section headers and empty lines are handled gracefully", () => {
    const result = validate("Deck\n1 Lightning Bolt\n\nSideboard\n1 Sol Ring");
    expect(result.lines.filter((l) => l.kind === "error")).toHaveLength(0);
    expect(result.resolved).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // NodeCache internment: repeated names hit cache
  // ---------------------------------------------------------------------------

  test("repeated card name lines produce consistent results", () => {
    const result = validate("4 Lightning Bolt\n4 Lightning Bolt");
    expect(result.lines.filter((l) => l.kind === "error")).toHaveLength(0);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved![0]!.oracle_id).toBe(result.resolved![1]!.oracle_id);
    expect(result.resolved![0]!.quantity).toBe(4);
    expect(result.resolved![1]!.quantity).toBe(4);
  });
});
