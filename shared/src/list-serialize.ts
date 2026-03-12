// SPDX-License-Identifier: Apache-2.0
import type { InstanceState } from "./card-list";
import { KNOWN_ZONES } from "./card-list";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";
import type { ParsedEntry } from "./list-lexer";
import type { DeckFormat } from "./list-format";

/**
 * Resolve an oracle_id to the card name.
 * @param frontFaceOnly - When true, DFCs return only the front face (TCGPlayer compatibility).
 */
function resolveCardName(
  oracleId: string,
  display: DisplayColumns,
  frontFaceOnly?: boolean
): string | null {
  let canonicalFace = -1;
  for (let i = 0; i < display.oracle_ids.length; i++) {
    if (display.oracle_ids[i] === oracleId) {
      canonicalFace = display.canonical_face[i]!;
      break;
    }
  }
  if (canonicalFace < 0) return null;

  const faces: number[] = [];
  for (let i = 0; i < display.canonical_face.length; i++) {
    if (display.canonical_face[i] === canonicalFace) faces.push(i);
  }
  if (frontFaceOnly && faces.length > 0) {
    return display.names[faces[0]!]!;
  }
  return faces.map((i) => display.names[i]).join(" // ");
}

/**
 * Find a printing row by scryfall_id in PrintingDisplayColumns.
 */
function findPrintingRow(
  scryfallId: string,
  printing: PrintingDisplayColumns
): number {
  for (let i = 0; i < printing.scryfall_ids.length; i++) {
    if (printing.scryfall_ids[i] === scryfallId) return i;
  }
  return -1;
}

interface AggregatedEntry {
  name: string;
  quantity: number;
  setCode: string | null;
  collectorNumber: string | null;
  finish: string | null;
  /** Archidekt: bracket categories e.g. [Ramp], [Control, Removal] */
  tags?: string[];
  /** Archidekt: collection status e.g. ^Have,#37d67a^ */
  collection_status?: string | null;
  /** Archidekt: zone for deriving tags when tags empty */
  zone?: string | null;
  /** oracle_id for ParsedEntry derivation (internal) */
  _oracleId?: string;
  /** scryfall_id for ParsedEntry derivation (internal) */
  _scryfallId?: string | null;
}

type GroupKey = string;

function groupKey(
  oracleId: string,
  scryfallId: string | null,
  finish: string | null,
  tags?: string[],
  collectionStatus?: string | null,
  zone?: string | null
): GroupKey {
  const base = `${oracleId}\0${scryfallId ?? ""}\0${finish ?? ""}`;
  const parts: string[] = [];
  if (tags !== undefined && collectionStatus !== undefined) {
    parts.push(tags.join("\x01"), collectionStatus ?? "");
  }
  if (zone !== undefined) {
    parts.push(zone ?? "");
  }
  return parts.length > 0 ? base + "\0" + parts.join("\0") : base;
}

interface AggregateOptions {
  preserveTagsAndStatus?: boolean;
  preserveZone?: boolean;
  /** When true, DFCs use only the front face name (e.g. TCGPlayer Mass Entry). */
  frontFaceOnly?: boolean;
}

function aggregateInstances(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  options?: AggregateOptions
): AggregatedEntry[] {
  const preserve = options?.preserveTagsAndStatus ?? false;
  const preserveZone = options?.preserveZone ?? false;
  const groups = new Map<
    GroupKey,
    {
      oracleId: string;
      scryfallId: string | null;
      finish: string | null;
      count: number;
      tags?: string[];
      collection_status?: string | null;
      zone?: string | null;
    }
  >();
  const order: GroupKey[] = [];

  for (const inst of instances) {
    const key =
      preserve || preserveZone
        ? groupKey(
            inst.oracle_id,
            inst.scryfall_id,
            inst.finish,
            preserve ? inst.tags : undefined,
            preserve ? inst.collection_status : undefined,
            preserveZone ? inst.zone ?? null : undefined
          )
        : groupKey(inst.oracle_id, inst.scryfall_id, inst.finish);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        oracleId: inst.oracle_id,
        scryfallId: inst.scryfall_id,
        finish: inst.finish,
        count: 1,
        ...(preserve && {
          tags: inst.tags,
          collection_status: inst.collection_status,
        }),
        ...(preserveZone && { zone: inst.zone ?? null }),
      });
      order.push(key);
    }
  }

  const entries: AggregatedEntry[] = [];
  const frontFaceOnly = options?.frontFaceOnly ?? false;
  for (const key of order) {
    const g = groups.get(key)!;
    const name = resolveCardName(g.oracleId, display, frontFaceOnly);
    if (!name) continue;

    let setCode: string | null = null;
    let collectorNumber: string | null = null;
    if (g.scryfallId && printingDisplay) {
      const row = findPrintingRow(g.scryfallId, printingDisplay);
      if (row >= 0) {
        setCode = printingDisplay.set_codes[row]!;
        collectorNumber = printingDisplay.collector_numbers[row]!;
      }
    }

    entries.push({
      name,
      quantity: g.count,
      setCode,
      collectorNumber,
      finish: g.finish,
      _oracleId: g.oracleId,
      _scryfallId: g.scryfallId,
      ...(preserve && g.tags !== undefined && { tags: g.tags }),
      ...(preserve && "collection_status" in g && { collection_status: g.collection_status }),
      ...(preserveZone && "zone" in g && { zone: g.zone }),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return entries;
}

function zoneOrderForFormat(format: DeckFormat): readonly (string | null)[] {
  if (format === "melee") return MELEE_ORDER;
  return COMMANDER_FIRST_ORDER;
}

/**
 * Return ParsedEntry[] from instances in the same order as serialized lines.
 * Used for baseline resolved cache seeding (Spec 115).
 */
export function parsedEntriesFromInstances(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  format: DeckFormat
): ParsedEntry[] {
  if (format === "archidekt" || format === "tappedout") {
    const entries = aggregateInstances(instances, display, printingDisplay, {
      preserveTagsAndStatus: true,
      preserveZone: true,
    });
    return entries.map((e) => ({
      oracle_id: (e as AggregatedEntry & { _oracleId?: string })._oracleId ?? "",
      scryfall_id: (e as AggregatedEntry & { _scryfallId?: string | null })._scryfallId ?? null,
      quantity: e.quantity,
      finish: e.finish === "foil" ? "foil" : e.finish === "etched" ? "etched" : undefined,
    }));
  }
  const groups = groupByZone(instances, display, printingDisplay, {
    zoneOrder: zoneOrderForFormat(format),
  });
  const result: ParsedEntry[] = [];
  for (const { entries } of groups) {
    for (const e of entries) {
      result.push({
        oracle_id: (e as AggregatedEntry & { _oracleId?: string })._oracleId ?? "",
        scryfall_id: (e as AggregatedEntry & { _scryfallId?: string | null })._scryfallId ?? null,
        quantity: e.quantity,
        finish: e.finish === "foil" ? "foil" : e.finish === "etched" ? "etched" : undefined,
      });
    }
  }
  return result;
}

interface ZoneGroup {
  zone: string | null;
  entries: AggregatedEntry[];
}

interface GroupByZoneOptions {
  preserveTagsAndStatus?: boolean;
  preserveZone?: boolean;
  zoneOrder?: readonly (string | null)[];
  frontFaceOnly?: boolean;
}

/** Zone order for Arena/MTGGoldfish/Moxfield: Commander first, then main deck, then sideboard block. */
const COMMANDER_FIRST_ORDER: readonly (string | null)[] = [
  "Commander",
  "Deck",
  null,
  "Sideboard",
  "Companion",
  "Maybeboard",
];

/** Zone order for Melee: main deck first, then sideboard block. */
const MELEE_ORDER: readonly (string | null)[] = [
  "Deck",
  null,
  "Sideboard",
  "Companion",
  "Maybeboard",
];

function zoneOrderIndex(zone: string | null, order: readonly (string | null)[]): number {
  const idx = order.indexOf(zone);
  return idx >= 0 ? idx : order.length;
}

/**
 * Group instances by zone, then aggregate each zone group.
 * Returns zone groups in the given order (or KNOWN_ZONES with null first if no order).
 */
function groupByZone(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  options?: GroupByZoneOptions
): ZoneGroup[] {
  const byZone = new Map<string | null, InstanceState[]>();
  for (const inst of instances) {
    const zone = inst.zone ?? null;
    let arr = byZone.get(zone);
    if (!arr) {
      arr = [];
      byZone.set(zone, arr);
    }
    arr.push(inst);
  }

  const order = options?.zoneOrder ?? [null, ...KNOWN_ZONES];
  const zones = [...byZone.keys()].sort(
    (a, b) => zoneOrderIndex(a, order) - zoneOrderIndex(b, order)
  );
  return zones.map((zone) => ({
    zone,
    entries: aggregateInstances(byZone.get(zone)!, display, printingDisplay, options),
  }));
}

/**
 * Serialize instances in Arena format: `quantity cardname`
 * Commander first, then deck, then two newlines, then Sideboard and other zones. No headings.
 */
export function serializeArena(
  instances: InstanceState[],
  display: DisplayColumns
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, null, {
    zoneOrder: COMMANDER_FIRST_ORDER,
  });
  const mainZones = ["Commander", "Deck", null];
  const mainLines: string[] = [];
  const postLines: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => `${e.quantity} ${e.name}`);
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else {
      postLines.push(...cardLines);
    }
  }

  const main = mainLines.join("\n");
  const post = postLines.join("\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/**
 * Serialize instances in Moxfield format: `quantity cardname (SET) collector [*F*|*E*] [#Tag...]`
 * Falls back to name-only when printing data is unavailable.
 * Commander first, then deck, then two newlines, then SIDEBOARD: on own line, etc.
 * Custom tags (per moxfield.com/help/managing-custom-tags) emitted as #Tag when present.
 */
export function serializeMoxfield(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay, {
    zoneOrder: COMMANDER_FIRST_ORDER,
    preserveTagsAndStatus: true,
  });
  const mainZones = ["Commander", "Deck", null];
  const mainLines: string[] = [];
  const postSections: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode.toUpperCase()}) ${e.collectorNumber}`;
      }
      if (e.finish === "foil") line += " *F*";
      else if (e.finish === "etched") line += " *E*";
      if (e.tags && e.tags.length > 0) {
        line += e.tags.map((t) => ` #${t}`).join("");
      }
      return line;
    });
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else if (zone && cardLines.length > 0) {
      postSections.push(zone.toUpperCase() + ":\n" + cardLines.join("\n"));
    }
  }

  const main = mainLines.join("\n");
  const post = postSections.join("\n\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/**
 * Serialize instances in Archidekt format: `quantityx cardname (set) collector [tags] ^status^`
 * Lowercase set codes, x suffix on quantity, no finish markers.
 * All cards in alphabetical order by name. No section headers. Categories (tags) indicate zone/role.
 */
export function serializeArchidekt(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const entries = aggregateInstances(instances, display, printingDisplay, {
    preserveTagsAndStatus: true,
    preserveZone: true,
  });

  return entries
    .map((e) => {
      let line = `${e.quantity}x ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode.toLowerCase()}) ${e.collectorNumber}`;
      }
      const tags = e.tags && e.tags.length > 0 ? e.tags : (e.zone ? [e.zone] : undefined);
      if (tags) {
        line += ` [${tags.join(", ")}]`;
      }
      if (e.collection_status) {
        line += ` ^${e.collection_status}^`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Serialize instances in MTGGoldfish format: `quantity cardname <collector> [SET] (F|E)?`
 * Uses collector number as variant. Uppercase set codes in square brackets.
 * Commander first, then deck, then two newlines, then Sideboard and other zones. No headings.
 */
export function serializeMtggoldfish(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay, {
    zoneOrder: COMMANDER_FIRST_ORDER,
  });
  const mainZones = ["Commander", "Deck", null];
  const mainLines: string[] = [];
  const postLines: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` <${e.collectorNumber}> [${e.setCode.toUpperCase()}]`;
      }
      if (e.finish === "foil") line += " (F)";
      else if (e.finish === "etched") line += " (E)";
      return line;
    });
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else {
      postLines.push(...cardLines);
    }
  }

  const main = mainLines.join("\n");
  const post = postLines.join("\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/** Scryfall set codes that differ from TCGPlayer Mass Entry set codes. */
const SCRYFALL_TO_TCGPLAYER_SET: Record<string, string> = {
  pmei: "UMP",   // Unique and Miscellaneous Promos
  plst: "LIST",  // The List Reprints
  psnc: "PPSNC", // Promo Pack: Streets of New Capenna
  pmkm: "PPMKM", // Promo Pack: Murders at Karlov Manor
  pthb: "PPTHB", // Promo Pack: Theros Beyond Death
  pdsk: "PPDSK", // Promo Pack: Duskmourn: House of Horror
  pone: "PPONE", // Promo Pack: Phyrexia: All Will Be One
  pkhm: "PPKHM", // Promo Pack: Kaldheim
  pblb: "PPBLB", // Promo Pack: Bloomburrow
  pstx: "PPSTX", // Promo Pack: Strixhaven
};

/** Reverse map for validation: TCGPlayer set code → Scryfall set code. */
const TCGPLAYER_TO_SCRYFALL_SET: Record<string, string> = Object.fromEntries(
  Object.entries(SCRYFALL_TO_TCGPLAYER_SET).map(([k, v]) => [v, k])
);

function tcgplayerSetCode(scryfallCode: string): string {
  const mapped = SCRYFALL_TO_TCGPLAYER_SET[scryfallCode.toLowerCase()];
  return mapped ?? scryfallCode.toUpperCase();
}

/** Normalize TCGPlayer set code to Scryfall code for printing lookup. Used by validation. */
export function tcgplayerToScryfallSetCode(setCode: string): string {
  const mapped = TCGPLAYER_TO_SCRYFALL_SET[setCode.toUpperCase()];
  return mapped ?? setCode.toLowerCase();
}

/**
 * Serialize instances in TCGPlayer Mass Entry format: `quantity cardname [SET] collector`
 * Per TCGPlayer docs: Quantity → Card Name → Set Code → Card Number Within Set.
 * Falls back to name-only when printing data is unavailable. No foil/etched markers.
 * Commander first, then deck, then two newlines, then Sideboard and other zones. No headings.
 */
export function serializeTcgplayer(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay, {
    zoneOrder: COMMANDER_FIRST_ORDER,
    frontFaceOnly: true,
  });
  const mainZones = ["Commander", "Deck", null];
  const mainLines: string[] = [];
  const postLines: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` [${tcgplayerSetCode(e.setCode)}] ${e.collectorNumber}`;
      }
      return line;
    });
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else {
      postLines.push(...cardLines);
    }
  }

  const main = mainLines.join("\n");
  const post = postLines.join("\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/**
 * Serialize instances in Mana Pool bulk entry format: `quantity cardname [SET] collector`
 * Same structure as TCGPlayer Mass Entry but uses Scryfall set codes (uppercase) directly —
 * no TCGPlayer-specific mappings (UMP, LIST, PPTHB, etc.).
 * Falls back to name-only when printing data is unavailable. No foil/etched markers.
 * Commander first, then deck, then two newlines, then Sideboard and other zones. No headings.
 */
export function serializeManapool(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay, {
    zoneOrder: COMMANDER_FIRST_ORDER,
    frontFaceOnly: true,
  });
  const mainZones = ["Commander", "Deck", null];
  const mainLines: string[] = [];
  const postLines: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` [${e.setCode.toUpperCase()}] ${e.collectorNumber}`;
      }
      return line;
    });
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else {
      postLines.push(...cardLines);
    }
  }

  const main = mainLines.join("\n");
  const post = postLines.join("\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/**
 * Serialize instances in Melee.gg format: `quantity name`
 * Header MainDeck (no colon), two newlines, then Sideboard (if any) and other zones.
 */
export function serializeMelee(
  instances: InstanceState[],
  display: DisplayColumns
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, null, {
    zoneOrder: MELEE_ORDER,
  });
  const mainZones = ["Deck", null];
  const mainLines: string[] = [];
  const postSections: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => `${e.quantity} ${e.name}`);
    if (mainZones.includes(zone)) {
      mainLines.push(...cardLines);
    } else if (zone && cardLines.length > 0) {
      postSections.push(zone + "\n" + cardLines.join("\n"));
    }
  }

  const main = "MainDeck\n" + mainLines.join("\n");
  const post = postSections.join("\n\n");
  if (post.length === 0) return main;
  return main + "\n\n" + post;
}

/**
 * Serialize instances in TappedOut inline format: 1x name (SET:num) with finish and tags.
 * Uses (SET:num) for set+collector, foil/etched markers, CMDR/CMPN for zone.
 * Flat alphabetical list by name.
 */
export function serializeTappedOut(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const entries = aggregateInstances(instances, display, printingDisplay, {
    preserveTagsAndStatus: true,
    preserveZone: true,
  });

  return entries
    .map((e) => {
      let line = `${e.quantity}x ${e.name}`;
      if (e.setCode) {
        line += e.collectorNumber
          ? ` (${e.setCode}:${e.collectorNumber})`
          : ` (${e.setCode})`;
      }
      if (e.finish === "foil") line += " *f*";
      else if (e.finish === "etched") line += " *f-etch*";
      if (e.zone === "Commander") line += " *CMDR*";
      else if (e.zone === "Companion") line += " *CMPN*";
      const tags = e.tags && e.tags.length > 0 ? e.tags : undefined;
      if (tags) {
        line += tags.map((t) => ` #${t}`).join("");
      }
      return line;
    })
    .join("\n");
}
