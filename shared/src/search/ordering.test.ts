// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { fnv1a, seededRank, collectBareWords, seededSort } from "./ordering";
import type { ASTNode } from "./ast";

// --- Helpers ---

function bare(value: string): ASTNode {
  return { type: "BARE", value };
}

function field(f: string, op: string, v: string): ASTNode {
  return { type: "FIELD", field: f, operator: op, value: v };
}

function and(...children: ASTNode[]): ASTNode {
  return { type: "AND", children };
}

function or(...children: ASTNode[]): ASTNode {
  return { type: "OR", children };
}

function not(child: ASTNode): ASTNode {
  return { type: "NOT", child };
}

// --- seededRank ---

describe("seededRank", () => {
  test("same inputs produce identical output", () => {
    const seed = fnv1a("t:creature");
    expect(seededRank(seed, 42)).toBe(seededRank(seed, 42));
  });

  test("different seeds produce different values for same index", () => {
    const a = seededRank(fnv1a("t:creature"), 42);
    const b = seededRank(fnv1a("t:instant"), 42);
    expect(a).not.toBe(b);
  });

  test("same seed produces different values for different indices", () => {
    const seed = fnv1a("t:creature");
    const a = seededRank(seed, 0);
    const b = seededRank(seed, 1);
    expect(a).not.toBe(b);
  });

  test("values span a wide range across 1000 indices", () => {
    const seed = fnv1a("some-query");
    const values = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      values.add(seededRank(seed, i));
    }
    expect(values.size).toBeGreaterThan(950);
  });

  test("returns unsigned 32-bit integers", () => {
    const seed = fnv1a("test");
    for (let i = 0; i < 100; i++) {
      const v = seededRank(seed, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

// --- collectBareWords ---

describe("collectBareWords", () => {
  test("single bare word", () => {
    expect(collectBareWords(bare("bolt"))).toEqual(["bolt"]);
  });

  test("bare word + field in AND", () => {
    expect(collectBareWords(and(bare("bolt"), field("t", ":", "creature")))).toEqual(["bolt"]);
  });

  test("two bare words in AND", () => {
    expect(collectBareWords(and(bare("light"), bare("bolt")))).toEqual(["light", "bolt"]);
  });

  test("negated bare word yields nothing", () => {
    expect(collectBareWords(not(bare("bolt")))).toEqual([]);
  });

  test("mixed negated and non-negated", () => {
    expect(collectBareWords(and(not(bare("fire")), bare("bolt")))).toEqual(["bolt"]);
  });

  test("no bare words (all fields)", () => {
    expect(collectBareWords(and(field("t", ":", "creature"), field("c", ":", "red")))).toEqual([]);
  });

  test("OR of bare words", () => {
    expect(collectBareWords(or(bare("light"), bare("bolt")))).toEqual(["light", "bolt"]);
  });

  test("deeply nested bare word", () => {
    const ast = and(or(bare("deep")), field("t", ":", "instant"));
    expect(collectBareWords(ast)).toEqual(["deep"]);
  });

  test("EXACT and REGEX_FIELD nodes are ignored", () => {
    const ast = and(
      { type: "EXACT", value: "Lightning Bolt" },
      { type: "REGEX_FIELD", field: "name", operator: ":", pattern: "bolt" },
    );
    expect(collectBareWords(ast)).toEqual([]);
  });
});

// --- seededSort ---

describe("seededSort", () => {
  const names = [
    "Lightning Bolt",     // 0 - starts with "light"
    "Twilight Shepherd",  // 1 - contains "light" but doesn't start with it
    "Lightmine Field",    // 2 - starts with "light"
    "Raging Goblin",      // 3 - doesn't contain "light"
  ];
  const namesLower = names.map(n => n.toLowerCase());

  test("prefix matches sort before non-prefix matches", () => {
    const indices = [0, 1, 2];
    seededSort(indices, "some-seed", namesLower, ["light"]);

    const prefixGroup = indices.slice(0, 2);
    const containsGroup = indices.slice(2);
    expect(prefixGroup.sort()).toEqual([0, 2]);
    expect(containsGroup).toEqual([1]);
  });

  test("same seed produces identical ordering", () => {
    const a = [0, 1, 2, 3];
    const b = [0, 1, 2, 3];
    seededSort(a, "test-seed", namesLower, ["light"]);
    seededSort(b, "test-seed", namesLower, ["light"]);
    expect(a).toEqual(b);
  });

  test("different seeds produce different within-tier orderings", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const indices = [0, 1, 2, 3];
      seededSort(indices, `seed-${i}`, namesLower, []);
      results.add(indices.join(","));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test("no bare words behaves as pure seeded random", () => {
    const a = [0, 1, 2, 3];
    const b = [0, 1, 2, 3];
    seededSort(a, "seed-x", namesLower, []);
    seededSort(b, "seed-x", namesLower, []);
    expect(a).toEqual(b);
    // Should not be in original order (with overwhelming probability for 4 items)
    const allSame = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const indices = [0, 1, 2, 3];
      seededSort(indices, `rng-${i}`, namesLower, []);
      allSame.add(indices.join(","));
    }
    expect(allSame.size).toBeGreaterThan(1);
  });

  test("all prefix matches gives pure seeded random ordering", () => {
    // All names start with "light" → all in tier 0 → ordered by hash
    const shortNames = ["lightning bolt", "lightmine field", "light of day"];
    const indices = [0, 1, 2];
    seededSort(indices, "seed", shortNames, ["light"]);
    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  test("empty array returns empty", () => {
    const indices: number[] = [];
    seededSort(indices, "seed", namesLower, ["light"]);
    expect(indices).toEqual([]);
  });

  test("single element returns unchanged", () => {
    const indices = [2];
    seededSort(indices, "seed", namesLower, ["light"]);
    expect(indices).toEqual([2]);
  });

  test("output contains exactly the same elements as input", () => {
    const indices = [0, 1, 2, 3];
    const original = [...indices];
    seededSort(indices, "any-seed", namesLower, ["light"]);
    expect(indices.sort()).toEqual(original.sort());
  });

  test("multiple bare words: boost if name starts with any", () => {
    const multiNames = [
      "lightning bolt",  // 0 - starts with "light"
      "bolt bend",       // 1 - starts with "bolt"
      "firebolt",        // 2 - starts with neither
    ];
    const indices = [0, 1, 2];
    seededSort(indices, "seed", multiNames, ["light", "bolt"]);

    const boosted = indices.slice(0, 2);
    const rest = indices.slice(2);
    expect(boosted.sort()).toEqual([0, 1]);
    expect(rest).toEqual([2]);
  });
});
