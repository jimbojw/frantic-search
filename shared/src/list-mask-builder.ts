// SPDX-License-Identifier: Apache-2.0
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";
import type { MaterializedView } from "./card-list";
import type { ParsedEntry } from "./list-lexer";
import { FINISH_FROM_STRING } from "./bits";

/**
 * Builds oracle_id → canonical face index map from display columns.
 * For each face row i, oracle_ids[i] maps to canonical_face[i].
 */
export function buildOracleToCanonicalFaceMap(
  display: DisplayColumns,
): Map<string, number> {
  const map = new Map<string, number>();
  const oracleIds = display.oracle_ids;
  const canonicalFace = display.canonical_face;
  for (let i = 0; i < oracleIds.length; i++) {
    const oid = oracleIds[i];
    if (oid) map.set(oid, canonicalFace[i]);
  }
  return map;
}

/**
 * Builds canonical face index → canonical printing index map.
 * For each canonical face, picks first nonfoil printing (finish === 0), else first in group.
 * Matches promoteFaceToPrintingCanonicalNonfoil semantics (Spec 121).
 */
export function buildCanonicalPrintingPerFace(
  pd: PrintingDisplayColumns,
): Map<number, number> {
  const map = new Map<number, number>();
  const cfRef = pd.canonical_face_ref;
  const finish = pd.finish;
  const n = cfRef.length;

  // Group by cf: collect indices for each cf
  const byCf = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const cf = cfRef[i];
    let arr = byCf.get(cf);
    if (!arr) {
      arr = [];
      byCf.set(cf, arr);
    }
    arr.push(i);
  }

  // For each cf, pick first nonfoil or first in group
  for (const [cf, indices] of byCf) {
    const nonfoil = indices.find((i) => finish[i] === 0);
    map.set(cf, nonfoil ?? indices[0]);
  }
  return map;
}

/**
 * Builds (scryfall_id, finish) → printing row index lookup.
 * Key format: `${scryfall_id}:${finish}` where finish is 0|1|2 (nonfoil|foil|etched).
 */
export function buildPrintingLookup(
  pd: PrintingDisplayColumns,
): Map<string, number> {
  const map = new Map<string, number>();
  const scryfallIds = pd.scryfall_ids;
  const finish = pd.finish;
  for (let i = 0; i < scryfallIds.length; i++) {
    map.set(`${scryfallIds[i]}:${finish[i]}`, i);
  }
  return map;
}

/**
 * Encodes InstanceState.finish string to numeric finish (0=nonfoil, 1=foil, 2=etched).
 * Returns undefined if finish is null or invalid.
 */
function encodeFinish(finish: string | null): number | undefined {
  if (!finish) return undefined;
  const n = FINISH_FROM_STRING[finish.toLowerCase()];
  return n !== undefined ? n : undefined;
}

export interface BuildMasksOptions {
  view: MaterializedView;
  listId: string;
  faceCount: number;
  printingCount?: number;
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
  /** Spec 121: when present, generic entries resolve to canonical printing. */
  canonicalPrintingPerFace?: Map<number, number>;
}

export interface BuildMasksFromParsedEntriesOptions {
  faceCount: number;
  printingCount?: number;
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
  /** Spec 121: when present, generic entries resolve to canonical printing. */
  canonicalPrintingPerFace?: Map<number, number>;
}

export interface BuildMasksResult {
  faceMask: Uint8Array;
  printingMask?: Uint8Array;
}

/**
 * Builds faceMask (zeroed) and printingMask for a list from the materialized view.
 * Spec 121: My List is printing-domain only. Printing-level entries set printingMask bits;
 * generic entries resolve to canonical printing when canonicalPrintingPerFace is present.
 */
export function buildMasksForList(options: BuildMasksOptions): BuildMasksResult {
  const {
    view,
    listId,
    faceCount,
    printingCount = 0,
    oracleToCanonicalFace,
    printingLookup,
    canonicalPrintingPerFace,
  } = options;

  const faceMask = new Uint8Array(faceCount);
  let printingMask: Uint8Array | undefined;
  if (printingCount > 0) {
    printingMask = new Uint8Array(printingCount);
  }

  const uuids = view.instancesByList.get(listId);
  if (!uuids || uuids.size === 0) {
    return printingMask ? { faceMask, printingMask } : { faceMask };
  }

  for (const uuid of uuids) {
    const instance = view.instances.get(uuid);
    if (!instance) continue;

    const { oracle_id, scryfall_id, finish } = instance;

    // Printing-level: scryfall_id identifies a specific printing.
    if (scryfall_id && printingLookup && printingMask) {
      const enc = encodeFinish(finish ?? "nonfoil");
      if (enc !== undefined) {
        const key = `${scryfall_id}:${enc}`;
        const pi = printingLookup.get(key);
        if (pi !== undefined) printingMask[pi] = 1;
      }
    }

    // Generic: resolve to canonical printing when map available (Spec 121).
    const cf = oracleToCanonicalFace.get(oracle_id);
    if (cf !== undefined && !scryfall_id && canonicalPrintingPerFace && printingMask) {
      const pi = canonicalPrintingPerFace.get(cf);
      if (pi !== undefined) printingMask[pi] = 1;
    }
  }

  return printingMask ? { faceMask, printingMask } : { faceMask };
}

/**
 * Builds faceMask (zeroed) and printingMask from ParsedEntry[] (e.g. from deck list validation).
 * Used by CLI for search --list and list-diff when no MaterializedView is available.
 * Spec 121: printing-domain only; generic entries resolve to canonical printing when map present.
 */
export function buildMasksFromParsedEntries(
  entries: ParsedEntry[],
  options: BuildMasksFromParsedEntriesOptions,
): BuildMasksResult {
  const {
    faceCount,
    printingCount = 0,
    oracleToCanonicalFace,
    printingLookup,
    canonicalPrintingPerFace,
  } = options;

  const faceMask = new Uint8Array(faceCount);
  let printingMask: Uint8Array | undefined;
  if (printingCount > 0) {
    printingMask = new Uint8Array(printingCount);
  }

  for (const entry of entries) {
    const { oracle_id, scryfall_id, finish } = entry;

    if (scryfall_id && printingLookup && printingMask) {
      const enc = encodeFinish(finish ?? "nonfoil");
      if (enc !== undefined) {
        const key = `${scryfall_id}:${enc}`;
        const pi = printingLookup.get(key);
        if (pi !== undefined) printingMask[pi] = 1;
      }
    }

    const cf = oracleToCanonicalFace.get(oracle_id);
    if (cf !== undefined && !scryfall_id && canonicalPrintingPerFace && printingMask) {
      const pi = canonicalPrintingPerFace.get(cf);
      if (pi !== undefined) printingMask[pi] = 1;
    }
  }

  return printingMask ? { faceMask, printingMask } : { faceMask };
}

/**
 * Counts instances in the list matching the given criteria.
 * - Oracle-level: pass oracleId only (scryfallId and finish undefined/null); matches instances with scryfall_id and finish null.
 * - Printing-level: pass all three; matches instances with exact scryfall_id and finish. When finish is 'nonfoil',
 *   also matches instances with finish null (treated as nonfoil in buildMasksForList).
 */
export function getMatchingCount(
  view: MaterializedView,
  listId: string,
  oracleId: string,
  scryfallId?: string | null,
  finish?: string | null,
): number {
  const uuids = view.instancesByList.get(listId);
  if (!uuids) return 0;
  const isOracleLevel = scryfallId == null && finish == null;
  let count = 0;
  for (const uuid of uuids) {
    const instance = view.instances.get(uuid);
    if (!instance || instance.oracle_id !== oracleId) continue;
    if (isOracleLevel) {
      if (instance.scryfall_id == null && instance.finish == null) count++;
    } else {
      const finishMatch =
        instance.finish === finish ||
        (finish === "nonfoil" && instance.finish == null);
      if (instance.scryfall_id === scryfallId && finishMatch) count++;
    }
  }
  return count;
}

/**
 * Counts list entries per canonical face for aggregation display (Spec 087).
 * When my:list is in the query, aggregation counts should reflect how many list entries
 * match each card, not how many printings exist in the database.
 */
export function countListEntriesPerCard(
  view: MaterializedView,
  listId: string,
  oracleToCanonicalFace: Map<string, number>,
): Map<number, number> {
  const result = new Map<number, number>();
  const uuids = view.instancesByList.get(listId);
  if (!uuids) return result;
  for (const uuid of uuids) {
    const instance = view.instances.get(uuid);
    if (!instance) continue;
    const cf = oracleToCanonicalFace.get(instance.oracle_id);
    if (cf === undefined) continue;
    result.set(cf, (result.get(cf) ?? 0) + 1);
  }
  return result;
}

/**
 * Returns true if any instance in the list has printing-level data (scryfall_id set).
 * When scryfall_id is present, null finish is treated as nonfoil (see buildMasksForList).
 */
export function hasPrintingLevelEntries(
  view: MaterializedView,
  listId: string,
): boolean {
  const uuids = view.instancesByList.get(listId);
  if (!uuids) return false;
  for (const uuid of uuids) {
    const instance = view.instances.get(uuid);
    if (instance?.scryfall_id) return true;
  }
  return false;
}
