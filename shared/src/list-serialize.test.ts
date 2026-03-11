// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { serializeArena, serializeMoxfield, serializeArchidekt, serializeMtggoldfish, serializeMelee, serializeTappedOut, serializeTcgplayer } from "./list-serialize";
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

function inst(
  oracleId: string,
  listId = "default",
  scryfallId: string | null = null,
  finish: string | null = null,
  zone: string | null = null,
  opts?: { tags?: string[]; collection_status?: string | null }
): InstanceState {
  return {
    uuid: crypto.randomUUID(),
    oracle_id: oracleId,
    scryfall_id: scryfallId,
    finish,
    list_id: listId,
    zone,
    tags: opts?.tags ?? [],
    collection_status: opts?.collection_status ?? null,
    variant: null,
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

describe("serializeArchidekt", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeArchidekt([], display, null)).toBe("");
  });

  it("uses x suffix on quantity for generic instances", () => {
    const result = serializeArchidekt([inst("bolt-oracle")], display, null);
    expect(result).toBe("1x Lightning Bolt");
  });

  it("uses lowercase set code and collector number", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "nonfoil");
    const result = serializeArchidekt([i], display, printingDisplay);
    expect(result).toBe("1x Lightning Bolt (m21) 141");
  });

  it("omits finish markers for foil", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-b", "foil");
    const result = serializeArchidekt([i], display, printingDisplay);
    expect(result).toBe("1x Lightning Bolt (2xm) 141");
  });

  it("omits finish markers for etched", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "etched");
    const result = serializeArchidekt([i], display, printingDisplay);
    expect(result).toBe("1x Lightning Bolt (m21) 141");
  });

  it("aggregates same-printing instances with x suffix", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeArchidekt(instances, display, printingDisplay);
    expect(result).toBe("3x Lightning Bolt (m21) 141");
  });

  it("handles double-faced cards with printing info", () => {
    const i = inst("delver-oracle", "default", "delver-print-a", "nonfoil");
    const result = serializeArchidekt([i], display, printingDisplay);
    expect(result).toBe("1x Delver of Secrets // Insectile Aberration (isd) 51");
  });

  it("separates lines for different printings of the same card", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-b", "foil"),
    ];
    const result = serializeArchidekt(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1x Lightning Bolt (m21) 141");
    expect(lines).toContainEqual("1x Lightning Bolt (2xm) 141");
  });

  it("includes category bracket and collection status when present", () => {
    const i = inst("bolt-oracle", "default", null, null, null, {
      tags: ["Ramp"],
      collection_status: "Have,#37d67a",
    });
    const result = serializeArchidekt([i], display, null);
    expect(result).toBe("1x Lightning Bolt [Ramp] ^Have,#37d67a^");
  });

  it("includes multiple categories in bracket", () => {
    const i = inst("bolt-oracle", "default", null, null, null, {
      tags: ["Control", "Removal"],
      collection_status: "Don't Have,#f47373",
    });
    const result = serializeArchidekt([i], display, null);
    expect(result).toBe("1x Lightning Bolt [Control, Removal] ^Don't Have,#f47373^");
  });

  it("includes category tag with modifier", () => {
    const i = inst("bolt-oracle", "default", null, null, null, {
      tags: ["Commander{top}"],
    });
    const result = serializeArchidekt([i], display, null);
    expect(result).toBe("1x Lightning Bolt [Commander{top}]");
  });

  it("separates lines for same card with different tags", () => {
    const instances = [
      inst("bolt-oracle", "default", null, null, null, { tags: ["Ramp"] }),
      inst("bolt-oracle", "default", null, null, null, { tags: ["Removal"] }),
    ];
    const result = serializeArchidekt(instances, display, null);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1x Lightning Bolt [Ramp]");
    expect(lines).toContainEqual("1x Lightning Bolt [Removal]");
  });

  it("omits tags and collection_status when absent (backward compatible)", () => {
    const result = serializeArchidekt([inst("bolt-oracle")], display, null);
    expect(result).toBe("1x Lightning Bolt");
  });
});

describe("serializeMtggoldfish", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeMtggoldfish([], display, null)).toBe("");
  });

  it("falls back to name-only for generic instances", () => {
    const result = serializeMtggoldfish([inst("bolt-oracle")], display, null);
    expect(result).toBe("1 Lightning Bolt");
  });

  it("uses angle brackets and square brackets for printing info", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "nonfoil");
    const result = serializeMtggoldfish([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt <141> [M21]");
  });

  it("appends (F) for foil finish", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-b", "foil");
    const result = serializeMtggoldfish([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt <141> [2XM] (F)");
  });

  it("appends (E) for etched finish", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "etched");
    const result = serializeMtggoldfish([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt <141> [M21] (E)");
  });

  it("no marker for nonfoil finish", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "nonfoil");
    const result = serializeMtggoldfish([i], display, printingDisplay);
    expect(result).not.toContain("(F)");
    expect(result).not.toContain("(E)");
  });

  it("aggregates same-printing instances", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeMtggoldfish(instances, display, printingDisplay);
    expect(result).toBe("3 Lightning Bolt <141> [M21]");
  });

  it("handles double-faced cards with printing info", () => {
    const i = inst("delver-oracle", "default", "delver-print-a", "nonfoil");
    const result = serializeMtggoldfish([i], display, printingDisplay);
    expect(result).toBe("1 Delver of Secrets // Insectile Aberration <51> [ISD]");
  });

  it("handles mix of generic and printing-level instances", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeMtggoldfish(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1 Lightning Bolt");
    expect(lines).toContainEqual("1 Lightning Bolt <141> [M21]");
  });
});

describe("serializeTcgplayer", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeTcgplayer([], display, null)).toBe("");
  });

  it("falls back to name-only for generic instances", () => {
    const result = serializeTcgplayer([inst("bolt-oracle")], display, null);
    expect(result).toBe("1 Lightning Bolt");
  });

  it("includes set code and collector number for printing-level instances", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", "nonfoil");
    const result = serializeTcgplayer([i], display, printingDisplay);
    expect(result).toBe("1 Lightning Bolt [M21] 141");
  });

  it("aggregates same-printing instances", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeTcgplayer(instances, display, printingDisplay);
    expect(result).toBe("3 Lightning Bolt [M21] 141");
  });

  it("separates lines for different printings of the same card", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
      inst("bolt-oracle", "default", "bolt-print-b", "foil"),
    ];
    const result = serializeTcgplayer(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1 Lightning Bolt [M21] 141");
    expect(lines).toContainEqual("1 Lightning Bolt [2XM] 141");
  });

  it("handles mix of generic and printing-level instances", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("bolt-oracle", "default", "bolt-print-a", "nonfoil"),
    ];
    const result = serializeTcgplayer(instances, display, printingDisplay);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual("1 Lightning Bolt");
    expect(lines).toContainEqual("1 Lightning Bolt [M21] 141");
  });

  it("outputs only front face for double-faced cards (TCGPlayer compatibility)", () => {
    const i = inst("delver-oracle", "default", "delver-print-a", "nonfoil");
    const result = serializeTcgplayer([i], display, printingDisplay);
    expect(result).toBe("1 Delver of Secrets [ISD] 51");
  });

  it("orders Commander first, then deck, then two newlines, then Sideboard", () => {
    const instances = [
      inst("delver-oracle", "default", null, null, "Sideboard"),
      inst("bolt-oracle", "default", null, null, "Commander"),
      inst("bolt-oracle", "default", null, null, "Deck"),
    ];
    const result = serializeTcgplayer(instances, display, null);
    const sections = result.split("\n\n");
    expect(sections[0]).toContain("Lightning Bolt");
    expect(sections[0]).not.toContain("Delver");
    expect(sections[1]).toContain("Delver of Secrets");
  });

  it("maps Scryfall set codes to TCGPlayer set codes for known promo/list sets", () => {
    const printingWithPlst: PrintingDisplayColumns = {
      ...printingDisplay,
      scryfall_ids: ["bolt-list"],
      collector_numbers: ["C18-138"],
      set_codes: ["plst"],
    };
    const i = inst("bolt-oracle", "default", "bolt-list", "nonfoil");
    const result = serializeTcgplayer([i], display, printingWithPlst);
    expect(result).toBe("1 Lightning Bolt [LIST] C18-138");
  });

  it("outputs collector numbers verbatim without stripping suffixes", () => {
    const printingWithSuffix: PrintingDisplayColumns = {
      ...printingDisplay,
      scryfall_ids: ["bolt-promo"],
      collector_numbers: ["141p"],
      set_codes: ["pm21"],
    };
    const i = inst("bolt-oracle", "default", "bolt-promo", "nonfoil");
    const result = serializeTcgplayer([i], display, printingWithSuffix);
    expect(result).toBe("1 Lightning Bolt [PM21] 141p");
  });
});

describe("zone grouping", () => {
  it("serializeArena emits no headers; main block then two newlines then sideboard block", () => {
    const instances = [
      inst("bolt-oracle", "default", null, null, "Deck"),
      inst("delver-oracle", "default", null, null, "Sideboard"),
    ];
    const result = serializeArena(instances, display);
    expect(result).toBe(
      "1 Lightning Bolt\n\n1 Delver of Secrets // Insectile Aberration"
    );
  });

  it("serializeArena omits headers when all instances are zone-less", () => {
    const instances = [inst("bolt-oracle"), inst("delver-oracle")];
    const result = serializeArena(instances, display);
    expect(result).not.toContain("Deck\n");
    expect(result).toContain("1 Lightning Bolt");
  });

  it("serializeArena emits no headers; null zone in main block", () => {
    const instances = [
      inst("bolt-oracle"),
      inst("delver-oracle", "default", null, null, "Sideboard"),
    ];
    const result = serializeArena(instances, display);
    expect(result).toContain("1 Lightning Bolt");
    expect(result).toContain("1 Delver of Secrets // Insectile Aberration");
    expect(result).toBe("1 Lightning Bolt\n\n1 Delver of Secrets // Insectile Aberration");
  });

  it("serializeMoxfield emits SIDEBOARD: for post-main zones", () => {
    const instances = [
      inst("bolt-oracle", "default", null, null, "Deck"),
      inst("delver-oracle", "default", null, null, "Sideboard"),
    ];
    const result = serializeMoxfield(instances, display, null);
    expect(result).toBe(
      "1 Lightning Bolt\n\nSIDEBOARD:\n1 Delver of Secrets // Insectile Aberration"
    );
  });

  it("serializeMtggoldfish emits no headers; same structure as Arena", () => {
    const instances = [
      inst("bolt-oracle", "default", "bolt-print-a", null, "Deck"),
      inst("delver-oracle", "default", "delver-print-a", null, "Sideboard"),
    ];
    const result = serializeMtggoldfish(instances, display, printingDisplay);
    expect(result).toContain("1 Lightning Bolt");
    expect(result).toContain("1 Delver of Secrets // Insectile Aberration");
    expect(result).not.toContain("Deck\n");
    expect(result).not.toContain("Sideboard\n");
  });

  it("serializeArena orders Commander first, then deck, then two newlines, then Sideboard", () => {
    const instances = [
      inst("delver-oracle", "default", null, null, "Sideboard"),
      inst("bolt-oracle", "default", null, null, "Commander"),
      inst("bolt-oracle", "default", null, null, "Deck"),
    ];
    const result = serializeArena(instances, display);
    const sections = result.split("\n\n");
    expect(sections[0]).toContain("Lightning Bolt");
    expect(sections[0]).not.toContain("Delver");
    expect(sections[1]).toContain("Delver of Secrets");
  });

  it("serializeArchidekt outputs flat alphabetical list with no section headers", () => {
    const instances = [
      inst("delver-oracle", "default", null, null, "Sideboard"),
      inst("bolt-oracle", "default", null, null, "Deck"),
    ];
    const result = serializeArchidekt(instances, display, null);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Delver of Secrets");
    expect(lines[1]).toContain("Lightning Bolt");
    expect(result).not.toContain("Deck\n");
    expect(result).not.toContain("Sideboard\n");
  });

  it("serializeArchidekt emits zone as tag when tags empty", () => {
    const instances = [
      inst("bolt-oracle", "default", null, null, "Commander"),
    ];
    const result = serializeArchidekt(instances, display, null);
    expect(result).toContain("[Commander]");
  });
});

describe("serializeMelee", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeMelee([], display)).toBe("");
  });

  it("emits MainDeck header then main deck cards", () => {
    const instances = [inst("bolt-oracle"), inst("delver-oracle")];
    const result = serializeMelee(instances, display);
    expect(result).toMatch(/^MainDeck\n/);
    expect(result).toContain("1 Lightning Bolt");
    expect(result).toContain("1 Delver of Secrets // Insectile Aberration");
  });

  it("emits two newlines then Sideboard header and sideboard cards", () => {
    const instances = [
      inst("bolt-oracle", "default", null, null, "Deck"),
      inst("delver-oracle", "default", null, null, "Sideboard"),
    ];
    const result = serializeMelee(instances, display);
    expect(result).toContain("MainDeck\n1 Lightning Bolt\n\nSideboard\n1 Delver of Secrets // Insectile Aberration");
  });
});

describe("serializeTappedOut", () => {
  it("returns empty string for empty instances", () => {
    expect(serializeTappedOut([], display, null)).toBe("");
  });

  it("emits 1x name format with tags", () => {
    const i = inst("bolt-oracle", "default", null, null, null, { tags: ["Land", "Removal"] });
    const result = serializeTappedOut([i], display, null);
    expect(result).toMatch(/^1x Lightning Bolt #Land #Removal$/);
  });

  it("emits *CMDR* for Commander zone", () => {
    const i = inst("bolt-oracle", "default", null, null, "Commander");
    const result = serializeTappedOut([i], display, null);
    expect(result).toContain("*CMDR*");
  });

  it("emits (SET:num) when printing available", () => {
    const i = inst("bolt-oracle", "default", "bolt-print-a", null);
    const result = serializeTappedOut([i], display, printingDisplay);
    expect(result).toMatch(/\(m21:141\)/i);
  });

  it("emits *f* for foil finish", () => {
    const i = inst("bolt-oracle", "default", null, "foil");
    const result = serializeTappedOut([i], display, null);
    expect(result).toContain("*f*");
  });
});
