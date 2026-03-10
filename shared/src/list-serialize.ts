// SPDX-License-Identifier: Apache-2.0
import type { InstanceState } from "./card-list";
import { KNOWN_ZONES } from "./card-list";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

/**
 * Resolve an oracle_id to the full card name (including " // " for DFCs).
 */
function resolveCardName(
  oracleId: string,
  display: DisplayColumns
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
  for (const key of order) {
    const g = groups.get(key)!;
    const name = resolveCardName(g.oracleId, display);
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
      ...(preserve && g.tags !== undefined && { tags: g.tags }),
      ...(preserve && "collection_status" in g && { collection_status: g.collection_status }),
      ...(preserveZone && "zone" in g && { zone: g.zone }),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return entries;
}

interface ZoneGroup {
  zone: string | null;
  entries: AggregatedEntry[];
}

interface GroupByZoneOptions {
  preserveTagsAndStatus?: boolean;
  zoneOrder?: readonly (string | null)[];
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
 * Serialize instances in Moxfield format: `quantity cardname (SET) collector [*F*|*E*]`
 * Falls back to name-only when printing data is unavailable.
 * Commander first, then deck, then two newlines, then SIDEBOARD: on own line, etc.
 */
export function serializeMoxfield(
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
  const postSections: string[] = [];

  for (const { zone, entries } of groups) {
    const cardLines = entries.map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode.toUpperCase()}) ${e.collectorNumber}`;
      }
      if (e.finish === "foil") line += " *F*";
      else if (e.finish === "etched") line += " *E*";
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
