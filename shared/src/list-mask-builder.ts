// SPDX-License-Identifier: Apache-2.0
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";
import type { ResolvedInstance } from "./deck-scoring/types";
import type { MaterializedView, InstanceState } from "./card-list";
import type { ParsedEntry } from "./list-lexer";
import { FINISH_FROM_STRING } from "./bits";
import { PrintingFlag } from "./bits";
import { TRASH_LIST_ID } from "./card-list";
import { normalizeAlphanumeric } from "./normalize";

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
 * For each canonical face, prefers tournament-legal nonfoil, then tournament-legal any,
 * then nonfoil, then first in group (Spec 121).
 */
export function buildCanonicalPrintingPerFace(
  pd: PrintingDisplayColumns,
): Map<number, number> {
  const map = new Map<number, number>();
  const cfRef = pd.canonical_face_ref;
  const finish = pd.finish;
  const flags = pd.printing_flags;
  const n = cfRef.length;

  const ATYPICAL_MASK = PrintingFlag.GoldBorder | PrintingFlag.Oversized;
  const isStandardPrinting = (i: number) =>
    !flags || !(flags[i] & ATYPICAL_MASK);

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

  // For each cf, pick canonical printing (standard nonfoil > standard any > nonfoil > first)
  for (const [cf, indices] of byCf) {
    const stdNonfoil = indices.find((i) => isStandardPrinting(i) && finish[i] === 0);
    const stdAny = indices.find((i) => isStandardPrinting(i));
    const nonfoil = indices.find((i) => finish[i] === 0);
    map.set(cf, stdNonfoil ?? stdAny ?? nonfoil ?? indices[0]);
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

/** Spec 185: maps for resolving instances to canonical face + optional printing row. */
export interface ResolveInstancesForScoringOptions {
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
}

/**
 * Spec 185: resolve one list line for deck scoring. Oracle-only lines use
 * `printingRowIndex: -1` (worker picks cheapest valid USD). Omits unknown oracle
 * or failed printing lookup (same as unresolved validation).
 */
export function resolveInstanceForScoring(
  instance: InstanceState,
  options: ResolveInstancesForScoringOptions,
): ResolvedInstance | null {
  const { oracleToCanonicalFace, printingLookup } = options;
  const cf = oracleToCanonicalFace.get(instance.oracle_id);
  if (cf === undefined) return null;

  if (instance.scryfall_id) {
    if (!printingLookup) return null;
    const enc = encodeFinish(instance.finish ?? "nonfoil");
    if (enc === undefined) return null;
    const key = `${instance.scryfall_id}:${enc}`;
    const pi = printingLookup.get(key);
    if (pi === undefined) return null;
    return { canonicalFaceIndex: cf, printingRowIndex: pi };
  }

  return { canonicalFaceIndex: cf, printingRowIndex: -1 };
}

/**
 * Same as {@link resolveInstanceForScoring} for each instance in order; drops
 * unresolved entries so `length` is deck size D for scoring.
 */
export function resolveInstancesForScoring(
  instances: InstanceState[],
  options: ResolveInstancesForScoringOptions,
): ResolvedInstance[] {
  const out: ResolvedInstance[] = [];
  for (let i = 0; i < instances.length; i++) {
    const r = resolveInstanceForScoring(instances[i], options);
    if (r !== null) out.push(r);
  }
  return out;
}

export interface BuildMasksOptions {
  view: MaterializedView;
  listId: string;
  printingCount?: number;
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
  /** Spec 121: when present, generic entries resolve to canonical printing. */
  canonicalPrintingPerFace?: Map<number, number>;
}

export interface BuildMasksFromParsedEntriesOptions {
  printingCount?: number;
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
  /** Spec 121: when present, generic entries resolve to canonical printing. */
  canonicalPrintingPerFace?: Map<number, number>;
}

export interface BuildMasksResult {
  printingIndices?: Uint32Array;
}

export interface BuildMetadataIndexOptions {
  printingCount?: number;
  oracleToCanonicalFace: Map<string, number>;
  printingLookup?: Map<string, number>;
  canonicalPrintingPerFace?: Map<number, number>;
}

export interface MetadataIndexResult {
  keys: string[];
  indexArrays: Uint32Array[];
}

/** Normalize metadata string for index: accent folding, lowercase, alphanumeric only. Spec 123. */
function normalizeMetadata(s: string): string {
  return normalizeAlphanumeric(s);
}

/**
 * Returns sorted unique tags from all non-trash Instances in the view.
 * Spec 125: used for MY LIST section tag chips in MenuDrawer.
 */
export function getUniqueTagsFromView(view: MaterializedView): string[] {
  const seen = new Set<string>();
  for (const [listId, uuids] of view.instancesByList) {
    if (listId === TRASH_LIST_ID) continue;
    if (!uuids) continue;
    for (const uuid of uuids) {
      const instance = view.instances.get(uuid);
      if (!instance) continue;
      for (const tag of instance.tags) {
        if (tag) seen.add(tag);
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Resolve instance to printing index(es). Returns empty array when unresolved. */
function resolveInstanceToPrintingIndices(
  instance: InstanceState,
  options: BuildMetadataIndexOptions,
): number[] {
  const { oracleToCanonicalFace, printingLookup, canonicalPrintingPerFace } =
    options;
  const indices: number[] = [];
  const { oracle_id, scryfall_id, finish } = instance;

  if (scryfall_id && printingLookup) {
    const enc = encodeFinish(finish ?? "nonfoil");
    if (enc !== undefined) {
      const key = `${scryfall_id}:${enc}`;
      const pi = printingLookup.get(key);
      if (pi !== undefined) indices.push(pi);
    }
  }

  const cf = oracleToCanonicalFace.get(oracle_id);
  if (cf !== undefined && !scryfall_id && canonicalPrintingPerFace) {
    const pi = canonicalPrintingPerFace.get(cf);
    if (pi !== undefined) indices.push(pi);
  }

  return indices;
}

/** Add metadata strings from instance to index map. */
function addInstanceMetadataToMap(
  instance: InstanceState,
  printingIndices: number[],
  map: Map<string, Set<number>>,
): void {
  const sources: string[] = [];
  const zone = instance.zone ?? "Deck";
  sources.push(zone);
  for (const t of instance.tags) sources.push(t);
  if (instance.collection_status) sources.push(instance.collection_status);
  if (instance.variant) sources.push(instance.variant);

  for (const s of sources) {
    const norm = normalizeMetadata(s);
    if (norm === "") continue;
    let set = map.get(norm);
    if (!set) {
      set = new Set();
      map.set(norm, set);
    }
    for (const pi of printingIndices) set.add(pi);
  }
}

/**
 * Builds printingIndices for a list from the materialized view.
 * Spec 121: My List is printing-domain only. Printing-level entries add indices;
 * generic entries resolve to canonical printing when canonicalPrintingPerFace is present.
 */
export function buildMasksForList(options: BuildMasksOptions): BuildMasksResult {
  const {
    view,
    listId,
    printingCount = 0,
    oracleToCanonicalFace,
    printingLookup,
    canonicalPrintingPerFace,
  } = options;

  if (printingCount === 0) {
    return {};
  }

  const indices = new Set<number>();
  const uuids = view.instancesByList.get(listId);
  if (!uuids || uuids.size === 0) {
    return { printingIndices: new Uint32Array(0) };
  }

  for (const uuid of uuids) {
    const instance = view.instances.get(uuid);
    if (!instance) continue;

    const { oracle_id, scryfall_id, finish } = instance;

    // Printing-level: scryfall_id identifies a specific printing.
    if (scryfall_id && printingLookup) {
      const enc = encodeFinish(finish ?? "nonfoil");
      if (enc !== undefined) {
        const key = `${scryfall_id}:${enc}`;
        const pi = printingLookup.get(key);
        if (pi !== undefined) indices.add(pi);
      }
    }

    // Generic: resolve to canonical printing when map available (Spec 121).
    const cf = oracleToCanonicalFace.get(oracle_id);
    if (cf !== undefined && !scryfall_id && canonicalPrintingPerFace) {
      const pi = canonicalPrintingPerFace.get(cf);
      if (pi !== undefined) indices.add(pi);
    }
  }

  return { printingIndices: new Uint32Array(indices) };
}

/**
 * Builds printingIndices from ParsedEntry[] (e.g. from deck list validation).
 * Used by CLI for search --list and list-diff when no MaterializedView is available.
 * Spec 121: printing-domain only; generic entries resolve to canonical printing when map present.
 */
export function buildMasksFromParsedEntries(
  entries: ParsedEntry[],
  options: BuildMasksFromParsedEntriesOptions,
): BuildMasksResult {
  const {
    printingCount = 0,
    oracleToCanonicalFace,
    printingLookup,
    canonicalPrintingPerFace,
  } = options;

  if (printingCount === 0) {
    return {};
  }

  const indices = new Set<number>();
  for (const entry of entries) {
    const { oracle_id, scryfall_id, finish } = entry;

    if (scryfall_id && printingLookup) {
      const enc = encodeFinish(finish ?? "nonfoil");
      if (enc !== undefined) {
        const key = `${scryfall_id}:${enc}`;
        const pi = printingLookup.get(key);
        if (pi !== undefined) indices.add(pi);
      }
    }

    const cf = oracleToCanonicalFace.get(oracle_id);
    if (cf !== undefined && !scryfall_id && canonicalPrintingPerFace) {
      const pi = canonicalPrintingPerFace.get(cf);
      if (pi !== undefined) indices.add(pi);
    }
  }

  return { printingIndices: new Uint32Array(indices) };
}

/**
 * Builds pan-list metadata index for # queries. Spec 123.
 * Iterates all non-trash lists; zone, tags, collection_status, variant contribute.
 * zone: null → "Deck". Returns omit when empty.
 */
export function buildMetadataIndex(
  view: MaterializedView,
  options: BuildMetadataIndexOptions,
): MetadataIndexResult | undefined {
  const { printingCount = 0 } = options;
  if (printingCount === 0) return undefined;

  const map = new Map<string, Set<number>>();

  for (const [listId, uuids] of view.instancesByList) {
    if (listId === TRASH_LIST_ID) continue;
    if (!uuids || uuids.size === 0) continue;

    for (const uuid of uuids) {
      const instance = view.instances.get(uuid);
      if (!instance) continue;

      const printingIndices = resolveInstanceToPrintingIndices(instance, options);
      if (printingIndices.length === 0) continue;

      addInstanceMetadataToMap(instance, printingIndices, map);
    }
  }

  if (map.size === 0) return undefined;

  const keys: string[] = [];
  const indexArrays: Uint32Array[] = [];
  for (const [key, set] of map) {
    keys.push(key);
    indexArrays.push(new Uint32Array(set));
  }
  return { keys, indexArrays };
}

/**
 * Builds metadata index from a flat list of instances (e.g. CLI from importDeckList).
 * Spec 123. Same semantics as buildMetadataIndex but for instances not in a view.
 */
export function buildMetadataIndexFromInstances(
  instances: InstanceState[],
  options: BuildMetadataIndexOptions,
): MetadataIndexResult | undefined {
  const { printingCount = 0 } = options;
  if (printingCount === 0) return undefined;

  const map = new Map<string, Set<number>>();

  for (const instance of instances) {
    const printingIndices = resolveInstanceToPrintingIndices(instance, options);
    if (printingIndices.length === 0) continue;

    addInstanceMetadataToMap(instance, printingIndices, map);
  }

  if (map.size === 0) return undefined;

  const keys: string[] = [];
  const indexArrays: Uint32Array[] = [];
  for (const [key, set] of map) {
    keys.push(key);
    indexArrays.push(new Uint32Array(set));
  }
  return { keys, indexArrays };
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
