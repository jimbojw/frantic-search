// SPDX-License-Identifier: Apache-2.0
import type { ImportCandidate } from "./list-import";
import type { InstanceState } from "./card-list";

export interface DiffResult {
  additions: ImportCandidate[];
  removals: InstanceState[];
}

/**
 * Build a string key for identity matching. UUID and list_id are excluded.
 */
function identityKey(
  oracle_id: string,
  scryfall_id: string | null,
  finish: string | null,
  zone: string | null,
  tags: string[],
  collection_status: string | null,
  variant: string | null
): string {
  return `${oracle_id}\0${scryfall_id ?? ""}\0${finish ?? ""}\0${zone ?? ""}\0${tags.join("\x01")}\0${collection_status ?? ""}\0${variant ?? ""}`;
}

/**
 * Dumb diff: exact identity matching on all fields except uuid and list_id.
 * Greedy one-to-one match. Remaining candidates = additions, remaining instances = removals.
 */
export function diffDeckList(
  candidates: ImportCandidate[],
  currentInstances: InstanceState[]
): DiffResult {
  // Build a multimap of identity key → available instance indices
  const instancePool = new Map<string, number[]>();
  for (let i = 0; i < currentInstances.length; i++) {
    const inst = currentInstances[i]!;
    const key = identityKey(
      inst.oracle_id,
      inst.scryfall_id,
      inst.finish,
      inst.zone,
      inst.tags,
      inst.collection_status,
      inst.variant
    );
    let arr = instancePool.get(key);
    if (!arr) {
      arr = [];
      instancePool.set(key, arr);
    }
    arr.push(i);
  }

  const matched = new Set<number>();
  const additions: ImportCandidate[] = [];

  for (const cand of candidates) {
    const key = identityKey(
      cand.oracle_id,
      cand.scryfall_id,
      cand.finish,
      cand.zone,
      cand.tags,
      cand.collection_status,
      cand.variant
    );
    const pool = instancePool.get(key);
    if (pool && pool.length > 0) {
      const idx = pool.pop()!;
      matched.add(idx);
      if (pool.length === 0) instancePool.delete(key);
    } else {
      additions.push(cand);
    }
  }

  const removals: InstanceState[] = [];
  for (let i = 0; i < currentInstances.length; i++) {
    if (!matched.has(i)) {
      removals.push(currentInstances[i]!);
    }
  }

  return { additions, removals };
}
