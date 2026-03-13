// SPDX-License-Identifier: Apache-2.0
import type { ImportCandidate } from "./list-import";
import type { InstanceState } from "./card-list";
import type { DiffResult } from "./list-diff";

export interface PreserveOptions {
  preserveTags?: boolean;
  preserveCollectionStatus?: boolean;
  preserveVariants?: boolean;
}

/**
 * Card identity key for pairing: oracle_id, scryfall_id, finish.
 * Zone is excluded so cross-zone moves (Deck ↔ Sideboard) can pair.
 */
function cardIdentityKey(
  oracle_id: string,
  scryfall_id: string | null,
  finish: string | null
): string {
  return `${oracle_id}\0${scryfall_id ?? ""}\0${finish ?? ""}`;
}

function coalesce(value: string | null): string | null {
  if (value === null || value === "") return null;
  return value;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Enrich a diff by pairing removals with additions by card identity,
 * merging metadata per preserve options, and filtering no-op pairs.
 */
export function enrichDiffForPreserve(
  diff: DiffResult,
  options: PreserveOptions
): { removals: InstanceState[]; additions: ImportCandidate[] } {
  const { preserveTags = false, preserveCollectionStatus = false, preserveVariants = false } = options;

  if (!preserveTags && !preserveCollectionStatus && !preserveVariants) {
    return { removals: [...diff.removals], additions: [...diff.additions] };
  }

  const removalPool = new Map<string, InstanceState[]>();
  for (const r of diff.removals) {
    const key = cardIdentityKey(r.oracle_id, r.scryfall_id, r.finish);
    let arr = removalPool.get(key);
    if (!arr) {
      arr = [];
      removalPool.set(key, arr);
    }
    arr.push(r);
  }

  const finalRemovals: InstanceState[] = [];
  const finalAdditions: ImportCandidate[] = [];

  for (const add of diff.additions) {
    const key = cardIdentityKey(add.oracle_id, add.scryfall_id, add.finish);
    const pool = removalPool.get(key);
    const removal = pool?.shift();
    if (pool?.length === 0) removalPool.delete(key);

    if (!removal) {
      finalAdditions.push({ ...add });
      continue;
    }

    const merged: ImportCandidate = {
      oracle_id: add.oracle_id,
      scryfall_id: add.scryfall_id,
      finish: add.finish,
      zone: add.zone,
      tags: preserveTags
        ? [...new Set([...removal.tags, ...add.tags])]
        : add.tags,
      collection_status: preserveCollectionStatus
        ? coalesce(add.collection_status) ?? coalesce(removal.collection_status) ?? null
        : add.collection_status,
      variant: preserveVariants
        ? coalesce(add.variant) ?? coalesce(removal.variant) ?? null
        : add.variant,
    };

    const isNoOp =
      arraysEqual(merged.tags, removal.tags) &&
      coalesce(merged.collection_status) === coalesce(removal.collection_status) &&
      coalesce(merged.variant) === coalesce(removal.variant);

    if (!isNoOp) {
      finalRemovals.push(removal);
      finalAdditions.push(merged);
    }
  }

  for (const pool of removalPool.values()) {
    for (const r of pool) {
      finalRemovals.push(r);
    }
  }

  return { removals: finalRemovals, additions: finalAdditions };
}
