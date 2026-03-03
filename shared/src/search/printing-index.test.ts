// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { PrintingIndex } from "./printing-index";
import type { PrintingColumnarData } from "../data";
import { Rarity, Finish, Frame, Game } from "../bits";

// Minimal printing data: face 1 has 3 printings (p-a, p-b, p-c) at indices 0, 1, 2
const CANONICAL_ORDER_DATA: PrintingColumnarData = {
  canonical_face_ref: [1, 1, 1],
  scryfall_ids: ["p-a", "p-b", "p-c"],
  collector_numbers: ["1", "2", "3"],
  set_indices: [0, 0, 0],
  rarity: [Rarity.Rare, Rarity.Rare, Rarity.Rare],
  printing_flags: [0, 0, 0],
  finish: [Finish.Nonfoil, Finish.Nonfoil, Finish.Nonfoil],
  frame: [Frame.Y2015, Frame.Y2015, Frame.Y2015],
  price_usd: [100, 200, 300],
  released_at: [20200101, 20210101, 20220101],
  games: [Game.Paper, Game.Paper, Game.Paper],
  set_lookup: [{ code: "XXX", name: "Test Set", released_at: 20200101 }],
};

describe("PrintingIndex", () => {
  test("without canonicalScryfallIds preserves original iteration order", () => {
    const idx = new PrintingIndex(CANONICAL_ORDER_DATA);
    const printings = idx.printingsOf(1);
    expect(printings).toEqual([0, 1, 2]);
  });

  test("with canonicalScryfallIds puts canonical printing first (Issue #74)", () => {
    const canonicalIds: string[] = [];
    canonicalIds[1] = "p-b";
    const idx = new PrintingIndex(CANONICAL_ORDER_DATA, canonicalIds);
    const printings = idx.printingsOf(1);
    expect(printings[0]).toBe(1);
    expect(idx.scryfallIds[printings[0]]).toBe("p-b");
    expect(printings).toHaveLength(3);
  });

  test("with canonicalScryfallIds when canonical is already first does not reorder", () => {
    const canonicalIds: string[] = [];
    canonicalIds[1] = "p-a";
    const idx = new PrintingIndex(CANONICAL_ORDER_DATA, canonicalIds);
    const printings = idx.printingsOf(1);
    expect(printings).toEqual([0, 1, 2]);
  });

  test("with canonicalScryfallIds when no printing matches preserves order", () => {
    const canonicalIds: string[] = [];
    canonicalIds[1] = "nonexistent";
    const idx = new PrintingIndex(CANONICAL_ORDER_DATA, canonicalIds);
    const printings = idx.printingsOf(1);
    expect(printings).toEqual([0, 1, 2]);
  });
});
