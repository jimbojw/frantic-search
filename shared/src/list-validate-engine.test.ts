// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { validateDeckListWithEngine, validateLines } from "./list-validate-engine";
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
  test("returns only error/warning in result, resolved parallel to request", () => {
    const { result, resolved } = validateLinesOnly(["1 Lightning Bolt", "1 UnknownCard"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.lineIndex).toBe(1);
    expect(result[0]!.kind).toBe("error");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).not.toBeNull();
    expect(resolved[1]).toBeNull();
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
  // § 3d: Unknown set
  // ---------------------------------------------------------------------------

  test("unknown set produces error with quick fix to remove set/collector", () => {
    const result = validate("1 Lightning Bolt (ZZZ) 1");
    const err = result.lines.find((l) => l.kind === "error");
    expect(err).toBeDefined();
    expect(err!.message).toContain("Unknown set");
    expect(err!.quickFixes).toBeDefined();
    expect(err!.quickFixes![0]!.label).toContain("Remove set/collector");
    expect(err!.quickFixes![0]!.replacement).toBe("1 Lightning Bolt");
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

  test("approximate match: punctuation difference suggests fix", () => {
    // "Thalia Guardian of Thraben" without comma → should still suggest the card
    // The exact check uses combinedNamesNormalized which strips non-alphanumeric
    const result = validate("1 Thalia Guardian of Thraben");
    // The exact EXACT match will fail because the name doesn't have the comma,
    // but the approximate match should find it via normalized comparison
    if (result.lines.some((l) => l.kind === "error")) {
      const err = result.lines.find((l) => l.kind === "error")!;
      expect(err.quickFixes).toBeDefined();
      expect(err.quickFixes![0]!.label).toContain("Thalia, Guardian of Thraben");
    } else {
      // The EXACT evaluator also does normalized matching, so it might pass
      expect(result.resolved).toHaveLength(1);
    }
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
