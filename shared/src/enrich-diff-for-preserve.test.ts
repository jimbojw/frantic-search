// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { enrichDiffForPreserve } from "./enrich-diff-for-preserve";
import { diffDeckList } from "./list-diff";
import type { ImportCandidate } from "./list-import";
import type { InstanceState } from "./card-list";
import type { DiffResult } from "./list-diff";

function candidate(
  oracle_id: string,
  overrides?: Partial<ImportCandidate>
): ImportCandidate {
  return {
    oracle_id,
    scryfall_id: null,
    finish: null,
    zone: null,
    tags: [],
    collection_status: null,
    variant: null,
    ...overrides,
  };
}

function instance(
  uuid: string,
  oracle_id: string,
  overrides?: Partial<InstanceState>
): InstanceState {
  return {
    uuid,
    oracle_id,
    scryfall_id: null,
    finish: null,
    list_id: "default",
    zone: null,
    tags: [],
    collection_status: null,
    variant: null,
    ...overrides,
  };
}

describe("enrichDiffForPreserve", () => {
  test("all options OFF: pass-through, no merge", () => {
    const removals = [instance("u1", "oid1", { tags: ["Combo"] })];
    const additions = [candidate("oid1", { tags: ["Dude"] })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(1);
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]!.tags).toEqual(["Dude"]);
  });

  test("preserve tags ON: merge removal #Combo + addition #Dude", () => {
    const removals = [instance("u1", "oid1", { tags: ["Combo"] })];
    const additions = [candidate("oid1", { tags: ["Dude"] })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(1);
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]!.tags).toEqual(["Combo", "Dude"]);
  });

  test("preserve tags ON: removal #Combo + addition no tag = no-op pair filtered out", () => {
    const removals = [instance("u1", "oid1", { tags: ["Combo"] })];
    const additions = [candidate("oid1", { tags: [] })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  test("preserve collection_status: incoming ?? existing; null incoming uses existing", () => {
    const removals = [instance("u1", "oid1", { collection_status: "Have,#37d67a" })];
    const additions = [candidate("oid1", { collection_status: null })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: true,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  test("preserve collection_status: existing used when incoming null, pair not no-op due to tag change", () => {
    const removals = [instance("u1", "oid1", { tags: ["Combo"], collection_status: "Have,#37d67a" })];
    const additions = [candidate("oid1", { tags: ["Dude"], collection_status: null })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: true,
      preserveVariants: false,
    });
    expect(result.additions[0]!.collection_status).toBe("Have,#37d67a");
    expect(result.additions[0]!.tags).toEqual(["Combo", "Dude"]);
  });

  test("preserve collection_status: incoming wins when present", () => {
    const removals = [instance("u1", "oid1", { collection_status: "Don't Have,#f47373" })];
    const additions = [candidate("oid1", { collection_status: "Have,#37d67a" })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: true,
      preserveVariants: false,
    });
    expect(result.additions[0]!.collection_status).toBe("Have,#37d67a");
  });

  test("preserve collection_status: empty string treated as null, no-op when merged equals removal", () => {
    const removals = [instance("u1", "oid1", { collection_status: "Have,#37d67a" })];
    const additions = [candidate("oid1", { collection_status: "" })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: true,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  test("preserve variant: incoming ?? existing; null incoming uses existing, no-op when merged equals removal", () => {
    const removals = [instance("u1", "oid1", { variant: "showcase" })];
    const additions = [candidate("oid1", { variant: null })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: false,
      preserveVariants: true,
    });
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  test("preserve variant: incoming wins when present", () => {
    const removals = [instance("u1", "oid1", { variant: "showcase" })];
    const additions = [candidate("oid1", { variant: "extended" })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: false,
      preserveCollectionStatus: false,
      preserveVariants: true,
    });
    expect(result.additions[0]!.variant).toBe("extended");
  });

  test("zone move: removal Deck + addition Sideboard pair; zone from addition", () => {
    const removals = [instance("u1", "oid1", { zone: "Deck", tags: ["Combo"] })];
    const additions = [candidate("oid1", { zone: "Sideboard", tags: ["Dude"] })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(1);
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]!.zone).toBe("Sideboard");
    expect(result.additions[0]!.tags).toEqual(["Combo", "Dude"]);
  });

  test("multiple copies: greedy pairing first removal with first addition", () => {
    const removals = [
      instance("u1", "oid1", { tags: ["A"] }),
      instance("u2", "oid1", { tags: ["B"] }),
    ];
    const additions = [
      candidate("oid1", { tags: ["X"] }),
      candidate("oid1", { tags: ["Y"] }),
    ];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(2);
    expect(result.additions).toHaveLength(2);
    expect(result.additions[0]!.tags).toEqual(["A", "X"]);
    expect(result.additions[1]!.tags).toEqual(["B", "Y"]);
  });

  test("no-op: merged equals removal, exclude both", () => {
    const removals = [instance("u1", "oid1", { tags: ["Combo"], variant: "foil" })];
    const additions = [candidate("oid1", { tags: ["Combo"], variant: "foil" })];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: true,
    });
    expect(result.removals).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  test("unpaired removals and additions pass through", () => {
    const removals = [
      instance("u1", "oid1", { tags: ["Combo"] }),
      instance("u2", "oid2"),
    ];
    const additions = [
      candidate("oid1", { tags: ["Dude"] }),
      candidate("oid3"),
    ];
    const diff: DiffResult = { removals, additions };
    const result = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(result.removals).toHaveLength(2);
    expect(result.additions).toHaveLength(2);
    expect(result.additions[0]!.tags).toEqual(["Combo", "Dude"]);
    expect(result.additions[1]!.oracle_id).toBe("oid3");
  });

  test("integration with diffDeckList: tags change produces pair, merge works", () => {
    const instances = [instance("u1", "oid1", { tags: ["Combo"] })];
    const candidates = [candidate("oid1", { tags: ["Dude"] })];
    const diff = diffDeckList(candidates, instances);
    expect(diff.additions).toHaveLength(1);
    expect(diff.removals).toHaveLength(1);

    const enriched = enrichDiffForPreserve(diff, {
      preserveTags: true,
      preserveCollectionStatus: false,
      preserveVariants: false,
    });
    expect(enriched.additions[0]!.tags).toEqual(["Combo", "Dude"]);
  });
});
