// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { serializeArena, serializeMoxfield } from "./list-serialize";
import type { InstanceState } from "./card-list";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

// Minimal display columns for testing — two cards, one double-faced
const display: DisplayColumns = {
  names: ["Lightning Bolt", "Delver of Secrets", "Insectile Aberration"],
  oracle_ids: ["bolt-oracle", "delver-oracle", "delver-oracle"],
  canonical_face: [0, 1, 1],
  mana_costs: ["", "", ""],
  type_lines: ["", "", ""],
  oracle_texts: ["", "", ""],
  powers: [0, 0, 0],
  toughnesses: [0, 0, 0],
  loyalties: [0, 0, 0],
  defenses: [0, 0, 0],
  color_identity: [0, 0, 0],
  scryfall_ids: ["bolt-sf", "delver-sf", "delver-sf"],
  art_crop_thumb_hashes: ["", "", ""],
  card_thumb_hashes: ["", "", ""],
  layouts: ["normal", "transform", "transform"],
  legalities_legal: [0, 0, 0],
  legalities_banned: [0, 0, 0],
  legalities_restricted: [0, 0, 0],
  power_lookup: [],
  toughness_lookup: [],
  loyalty_lookup: [],
  defense_lookup: [],
  edhrec_rank: [null, null, null],
  edhrec_salt: [null, null, null],
};

const printingDisplay: PrintingDisplayColumns = {
  scryfall_ids: ["bolt-print-a", "bolt-print-b", "delver-print-a"],
  collector_numbers: ["141", "141", "51"],
  set_codes: ["M21", "2XM", "ISD"],
  set_names: ["Core Set 2021", "Double Masters", "Innistrad"],
  rarity: [0, 0, 0],
  finish: [0, 1, 0], // bolt-print-b is foil
  price_usd: [0, 0, 0],
  canonical_face_ref: [0, 0, 1],
};

// Mapping from scryfall printing IDs to oracle IDs (via canonical_face_ref → display.oracle_ids)
const oracleToCanonicalFace = new Map([
  ["bolt-oracle", 0],
  ["delver-oracle", 1],
]);

function inst(
  oracleId: string,
  listId = "default",
  scryfallId: string | null = null,
  finish: string | null = null
): InstanceState {
  return {
    uuid: crypto.randomUUID(),
    oracle_id: oracleId,
    scryfall_id: scryfallId,
    finish,
    list_id: listId,
  };
}

describe("serializeArena", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeArena([], display)).toBe("");
  });

  it("serializes a single generic instance", () => {
    const result = serializeArena([inst("bolt-oracle")], display);
    expect(result).toBe("1 Lightning Bolt");
  });

  it("aggregates multiple instances of the same card", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("bolt-oracle"),
      inst("bolt-oracle"),
      inst("bolt-oracle"),
    ];
    expect(serializeArena(instances, display)).toBe("4 Lightning Bolt");
  });

  it("serializes a double-faced card with full name", () => {
    const result = serializeArena([inst("delver-oracle")], display);
    expect(result).toBe("1 Delver of Secrets // Insectile Aberration");
  });

  it("lists multiple different cards on separate lines", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("delver-oracle"),
    ];
    const result = serializeArena(instances, display);
    expect(result).toContain("1 Lightning Bolt");
    expect(result).toContain("1 Delver of Secrets // Insectile Aberration");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("sorts entries alphabetically by card name", () => {
    const instances = [
      inst("delver-oracle"),
      inst("bolt-oracle"),
    ];
    const lines = serializeArena(instances, display).split("\n");
    expect(lines[0]).toContain("Delver of Secrets");
    expect(lines[1]).toContain("Lightning Bolt");
  });

  it("skips instances with unresolvable oracle_id", () => {
    const instances = [inst("nonexistent-oracle"), inst("bolt-oracle")];
    expect(serializeArena(instances, display)).toBe("1 Lightning Bolt");
  });
});

describe("serializeMoxfield", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeMoxfield([], display, null)).toBe("");
  });

  it("falls back to name-only for generic instances", () => {
    const result = serializeMoxfield([inst("bolt-oracle")], display, null);
    expect(result).toBe("1 Lightning Bolt");
  });

  it("includes set code and collector number for printing-level instances", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "nonfoil");
    const result = serializeMoxfield([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt (M21) 141");
  });

  it("appends *F* for foil finish", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-b", "foil");
    const result = serializeMoxfield([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt (2XM) 141 *F*");
  });

  it("appends *E* for etched finish", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "etched");
    const result = serializeMoxfield([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt (M21) 141 *E*");
  });

  it("aggregates same-printing instances", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeMoxfield(instances, display, printingDisplay);
    expect(result).toBe("3 Lightning Bolt (M21) 141");
  });

  it("separates lines for different printings of the same card", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-b", "foil"),
    ];
    const result = serializeMoxfield(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1 Lightning Bolt (M21) 141");
    expect(lines).toContainEqual("1 Lightning Bolt (2XM) 141 *F*");
  });

  it("handles mix of generic and printing-level instances", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeMoxfield(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1 Lightning Bolt");
    expect(lines).toContainEqual("1 Lightning Bolt (M21) 141");
  });

  it("handles double-faced cards with printing info", () => {
    const i = inst("delver-oracle", "default", "delver-print-a", "nonfoil");
    const result = serializeMoxfield([i], display, printingDisplay);
    expect(result).toBe("1 Delver of Secrets // Insectile Aberration (ISD) 51");
  });
});
