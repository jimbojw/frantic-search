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
}

type GroupKey = string;

function groupKey(
  oracleId: string,
  scryfallId: string | null,
  finish: string | null,
  tags?: string[],
  collectionStatus?: string | null
): GroupKey {
  const base = `${oracleId}\0${scryfallId ?? ""}\0${finish ?? ""}`;
  if (tags !== undefined && collectionStatus !== undefined) {
    return `${base}\0${tags.join("\x01")}\0${collectionStatus ?? ""}`;
  }
  return base;
}

interface AggregateOptions {
  preserveTagsAndStatus?: boolean;
}

function aggregateInstances(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null,
  options?: AggregateOptions
): AggregatedEntry[] {
  const preserve = options?.preserveTagsAndStatus ?? false;
  const groups = new Map<
    GroupKey,
    {
      oracleId: string;
      scryfallId: string | null;
      finish: string | null;
      count: number;
      tags?: string[];
      collection_status?: string | null;
    }
  >();
  const order: GroupKey[] = [];

  for (const inst of instances) {
    const key = preserve
      ? groupKey(inst.oracle_id, inst.scryfall_id, inst.finish, inst.tags, inst.collection_status)
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
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return entries;
}

interface ZoneGroup {
  zone: string | null;
  entries: AggregatedEntry[];
}

const ZONE_ORDER: readonly string[] = KNOWN_ZONES;

function zoneSort(a: string | null, b: string | null): number {
  const ai = a ? ZONE_ORDER.indexOf(a) : -1;
  const bi = b ? ZONE_ORDER.indexOf(b) : -1;
  const aOrder = ai >= 0 ? ai : (a === null ? -1 : ZONE_ORDER.length);
  const bOrder = bi >= 0 ? bi : (b === null ? -1 : ZONE_ORDER.length);
  return aOrder - bOrder;
}

interface GroupByZoneOptions {
  preserveTagsAndStatus?: boolean;
}

/**
 * Group instances by zone, then aggregate each zone group.
 * Returns zone groups in KNOWN_ZONES order, with null (implicit main) first.
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

  const zones = [...byZone.keys()].sort(zoneSort);
  return zones.map((zone) => ({
    zone,
    entries: aggregateInstances(byZone.get(zone)!, display, printingDisplay, options),
  }));
}

/**
 * Whether zone headers should be emitted.
 * Skip headers when all instances are in a single zone group of null (no zone metadata).
 */
function needsZoneHeaders(groups: ZoneGroup[]): boolean {
  if (groups.length === 0) return false;
  if (groups.length === 1 && groups[0]!.zone === null) return false;
  return true;
}

/**
 * Serialize instances in Arena format: `quantity cardname`
 * Groups by zone with section headers (Deck, Sideboard, Commander, etc.)
 */
export function serializeArena(
  instances: InstanceState[],
  display: DisplayColumns
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, null);
  const showHeaders = needsZoneHeaders(groups);
  const sections: string[] = [];

  for (const { zone, entries } of groups) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(zone ?? "Deck");
    }
    for (const e of entries) {
      lines.push(`${e.quantity} ${e.name}`);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Serialize instances in Moxfield format: `quantity cardname (SET) collector [*F*|*E*]`
 * Falls back to name-only when printing data is unavailable.
 * Uses section headers for zones (Sideboard becomes "SIDEBOARD:" per Moxfield convention).
 */
export function serializeMoxfield(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay);
  const showHeaders = needsZoneHeaders(groups);
  const sections: string[] = [];

  for (const { zone, entries } of groups) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(zone ?? "Deck");
    }
    for (const e of entries) {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode.toUpperCase()}) ${e.collectorNumber}`;
      }
      if (e.finish === "foil") line += " *F*";
      else if (e.finish === "etched") line += " *E*";
      lines.push(line);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Serialize instances in Archidekt format: `quantityx cardname (set) collector [tags] ^status^`
 * Lowercase set codes, x suffix on quantity, no finish markers.
 * Includes bracket categories and collection status when present for round-trip fidelity.
 * Groups by zone with section headers.
 */
export function serializeArchidekt(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay, {
    preserveTagsAndStatus: true,
  });
  const showHeaders = needsZoneHeaders(groups);
  const sections: string[] = [];

  for (const { zone, entries } of groups) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(zone ?? "Deck");
    }
    for (const e of entries) {
      let line = `${e.quantity}x ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode.toLowerCase()}) ${e.collectorNumber}`;
      }
      if (e.tags && e.tags.length > 0) {
        line += ` [${e.tags.join(", ")}]`;
      }
      if (e.collection_status) {
        line += ` ^${e.collection_status}^`;
      }
      lines.push(line);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Serialize instances in MTGGoldfish format: `quantity cardname <collector> [SET] (F|E)?`
 * Uses collector number as variant. Uppercase set codes in square brackets.
 * Groups by zone with section headers.
 */
export function serializeMtggoldfish(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const groups = groupByZone(instances, display, printingDisplay);
  const showHeaders = needsZoneHeaders(groups);
  const sections: string[] = [];

  for (const { zone, entries } of groups) {
    const lines: string[] = [];
    if (showHeaders) {
      lines.push(zone ?? "Deck");
    }
    for (const e of entries) {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` <${e.collectorNumber}> [${e.setCode.toUpperCase()}]`;
      }
      if (e.finish === "foil") line += " (F)";
      else if (e.finish === "etched") line += " (E)";
      lines.push(line);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
