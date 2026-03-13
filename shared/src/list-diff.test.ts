// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { diffDeckList } from "./list-diff";
import type { ImportCandidate } from "./list-import";
import type { InstanceState } from "./card-list";

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

describe("diffDeckList", () => {
  test("empty candidates against empty list produces no changes", () => {
    const result = diffDeckList([], []);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(0);
  });

  test("all candidates are additions when list is empty", () => {
    const candidates = [candidate("oid1"), candidate("oid2")];
    const result = diffDeckList(candidates, []);
    expect(result.additions).toHaveLength(2);
    expect(result.removals).toHaveLength(0);
  });

  test("all instances are removals when candidates are empty", () => {
    const instances = [instance("u1", "oid1"), instance("u2", "oid2")];
    const result = diffDeckList([], instances);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(2);
    expect(result.removals.map((r) => r.uuid)).toEqual(["u1", "u2"]);
  });

  test("identical candidate and instance cancel out", () => {
    const candidates = [candidate("oid1")];
    const instances = [instance("u1", "oid1")];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(0);
  });

  test("4x current minus 3x candidate = 1 removal", () => {
    const candidates = [candidate("oid1"), candidate("oid1"), candidate("oid1")];
    const instances = [
      instance("u1", "oid1"),
      instance("u2", "oid1"),
      instance("u3", "oid1"),
      instance("u4", "oid1"),
    ];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(1);
  });

  test("3x current plus 1x candidate = 1 addition", () => {
    const candidates = [
      candidate("oid1"),
      candidate("oid1"),
      candidate("oid1"),
      candidate("oid1"),
    ];
    const instances = [
      instance("u1", "oid1"),
      instance("u2", "oid1"),
      instance("u3", "oid1"),
    ];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(0);
  });

  test("generic does not match printing-level instance", () => {
    const candidates = [candidate("oid1")];
    const instances = [
      instance("u1", "oid1", { scryfall_id: "sf1", finish: "foil" }),
    ];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("different zones do not match", () => {
    const candidates = [candidate("oid1", { zone: "Sideboard" })];
    const instances = [instance("u1", "oid1", { zone: "Deck" })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("same zone matches", () => {
    const candidates = [candidate("oid1", { zone: "Sideboard" })];
    const instances = [instance("u1", "oid1", { zone: "Sideboard" })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(0);
  });

  test("different tags do not match", () => {
    const candidates = [candidate("oid1", { tags: ["Ramp"] })];
    const instances = [instance("u1", "oid1", { tags: ["Control"] })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("same tags in same order match", () => {
    const candidates = [candidate("oid1", { tags: ["Ramp", "Land"] })];
    const instances = [instance("u1", "oid1", { tags: ["Ramp", "Land"] })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(0);
  });

  test("tags in different order do not match", () => {
    const candidates = [candidate("oid1", { tags: ["Land", "Ramp"] })];
    const instances = [instance("u1", "oid1", { tags: ["Ramp", "Land"] })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("different collection_status does not match", () => {
    const candidates = [
      candidate("oid1", { collection_status: "Have,#37d67a" }),
    ];
    const instances = [
      instance("u1", "oid1", { collection_status: "Don't Have,#f47373" }),
    ];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("different variant does not match", () => {
    const candidates = [candidate("oid1", { variant: "extended" })];
    const instances = [instance("u1", "oid1", { variant: "showcase" })];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(1);
  });

  test("mixed additions and removals", () => {
    const candidates = [candidate("oid1"), candidate("oid3")];
    const instances = [instance("u1", "oid1"), instance("u2", "oid2")];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]!.oracle_id).toBe("oid3");
    expect(result.removals).toHaveLength(1);
    expect(result.removals[0]!.uuid).toBe("u2");
  });

  test("greedy matching: each current instance matches at most one candidate", () => {
    const candidates = [candidate("oid1"), candidate("oid1")];
    const instances = [instance("u1", "oid1")];
    const result = diffDeckList(candidates, instances);
    expect(result.additions).toHaveLength(1);
    expect(result.removals).toHaveLength(0);
  });

  test("full match all fields", () => {
    const c = candidate("oid1", {
      scryfall_id: "sf1",
      finish: "foil",
      zone: "Sideboard",
      tags: ["Ramp"],
      collection_status: "Have,#37d67a",
      variant: "extended",
    });
    const i = instance("u1", "oid1", {
      scryfall_id: "sf1",
      finish: "foil",
      zone: "Sideboard",
      tags: ["Ramp"],
      collection_status: "Have,#37d67a",
      variant: "extended",
    });
    const result = diffDeckList([c], [i]);
    expect(result.additions).toHaveLength(0);
    expect(result.removals).toHaveLength(0);
  });
});
