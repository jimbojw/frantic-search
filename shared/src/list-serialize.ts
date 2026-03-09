// SPDX-License-Identifier: Apache-2.0
import type { InstanceState } from "./card-list";
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
}

type GroupKey = string;

function groupKey(
  oracleId: string,
  scryfallId: string | null,
  finish: string | null
): GroupKey {
  return `${oracleId}\0${scryfallId ?? ""}\0${finish ?? ""}`;
}

function aggregateInstances(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): AggregatedEntry[] {
  const groups = new Map<
    GroupKey,
    { oracleId: string; scryfallId: string | null; finish: string | null; count: number }
  >();
  const order: GroupKey[] = [];

  for (const inst of instances) {
    const key = groupKey(inst.oracle_id, inst.scryfall_id, inst.finish);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        oracleId: inst.oracle_id,
        scryfallId: inst.scryfall_id,
        finish: inst.finish,
        count: 1,
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
        setCode = printingDisplay.set_codes[row]!.toUpperCase();
        collectorNumber = printingDisplay.collector_numbers[row]!;
      }
    }

    entries.push({
      name,
      quantity: g.count,
      setCode,
      collectorNumber,
      finish: g.finish,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return entries;
}

/**
 * Serialize instances in Arena format: `quantity cardname`
 */
export function serializeArena(
  instances: InstanceState[],
  display: DisplayColumns
): string {
  if (instances.length === 0) return "";

  const entries = aggregateInstances(instances, display, null);
  return entries.map((e) => `${e.quantity} ${e.name}`).join("\n");
}

/**
 * Serialize instances in Moxfield format: `quantity cardname (SET) collector [*F*|*E*]`
 * Falls back to name-only when printing data is unavailable.
 */
export function serializeMoxfield(
  instances: InstanceState[],
  display: DisplayColumns,
  printingDisplay: PrintingDisplayColumns | null
): string {
  if (instances.length === 0) return "";

  const entries = aggregateInstances(instances, display, printingDisplay);
  return entries
    .map((e) => {
      let line = `${e.quantity} ${e.name}`;
      if (e.setCode && e.collectorNumber) {
        line += ` (${e.setCode}) ${e.collectorNumber}`;
      }
      if (e.finish === "foil") line += " *F*";
      else if (e.finish === "etched") line += " *E*";
      return line;
    })
    .join("\n");
}
