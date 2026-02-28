// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { fnv1a, seededRank, collectBareWords, seededSort, seededSortPrintings } from "./ordering";
import type { ASTNode } from "./ast";

// --- Helpers ---

function bare(value: string, quoted = false): ASTNode {
  return { type: "BARE", value, quoted };
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

  test("different session salts produce different orderings for same seed", () => {
    const indices = Array.from({ length: 20 }, (_, i) => i);
    const longNames = indices.map(i => `card ${i}`);

    const a = [...indices];
    const b = [...indices];
    seededSort(a, "same-seed", longNames, [], 0xDEADBEEF);
    seededSort(b, "same-seed", longNames, [], 0xCAFEBABE);
    expect(a).not.toEqual(b);
  });

  test("same session salt preserves within-session stability", () => {
    const salt = 0x12345678;
    const a = [0, 1, 2, 3];
    const b = [0, 1, 2, 3];
    seededSort(a, "query", namesLower, ["light"], salt);
    seededSort(b, "query", namesLower, ["light"], salt);
    expect(a).toEqual(b);
  });
});

// --- seededSortPrintings ---

describe("seededSortPrintings", () => {
  // Card names indexed by canonical face index.
  const names = [
    "lightning bolt",     // face 0
    "twilight shepherd",  // face 1
    "lightmine field",    // face 2
    "raging goblin",      // face 3
  ];

  // Printing rows: each maps to a canonical face via canonicalFaceRef.
  //   printing 0 → face 0 (lightning bolt)
  //   printing 1 → face 0 (lightning bolt, different finish)
  //   printing 2 → face 1 (twilight shepherd)
  //   printing 3 → face 2 (lightmine field)
  //   printing 4 → face 2 (lightmine field, different finish)
  //   printing 5 → face 3 (raging goblin)
  const canonicalFaceRef = [0, 0, 1, 2, 2, 3];

  test("same-card printings preserve relative order", () => {
    const pi = new Uint32Array([0, 1, 2, 3, 4, 5]);
    seededSortPrintings(pi, "test-seed", canonicalFaceRef, names, []);

    const arr = Array.from(pi);
    const idx0 = arr.indexOf(0);
    const idx1 = arr.indexOf(1);
    expect(idx0).toBeLessThan(idx1);

    const idx3 = arr.indexOf(3);
    const idx4 = arr.indexOf(4);
    expect(idx3).toBeLessThan(idx4);
  });

  test("different-card printings are shuffled across seeds", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pi = new Uint32Array([0, 1, 2, 3, 4, 5]);
      seededSortPrintings(pi, `seed-${i}`, canonicalFaceRef, names, []);
      results.add(Array.from(pi).join(","));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test("prefix boost: printings of prefix-matching cards come first", () => {
    const pi = new Uint32Array([0, 1, 2, 3, 4, 5]);
    seededSortPrintings(pi, "some-seed", canonicalFaceRef, names, ["light"]);

    // Faces 0 and 2 start with "light"; faces 1 and 3 do not.
    // Printings 0,1 (face 0) and 3,4 (face 2) should precede 2 (face 1) and 5 (face 3).
    const boosted = Array.from(pi.slice(0, 4)).sort();
    const rest = Array.from(pi.slice(4)).sort();
    expect(boosted).toEqual([0, 1, 3, 4]);
    expect(rest).toEqual([2, 5]);
  });

  test("same seed produces identical ordering", () => {
    const a = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const b = new Uint32Array([0, 1, 2, 3, 4, 5]);
    seededSortPrintings(a, "stable-seed", canonicalFaceRef, names, ["light"]);
    seededSortPrintings(b, "stable-seed", canonicalFaceRef, names, ["light"]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test("different seeds produce different orderings", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pi = new Uint32Array([0, 1, 2, 3, 4, 5]);
      seededSortPrintings(pi, `vary-${i}`, canonicalFaceRef, names, ["light"]);
      results.add(Array.from(pi).join(","));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test("different session salts produce different orderings", () => {
    const a = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const b = new Uint32Array([0, 1, 2, 3, 4, 5]);
    seededSortPrintings(a, "same-seed", canonicalFaceRef, names, [], 0xDEADBEEF);
    seededSortPrintings(b, "same-seed", canonicalFaceRef, names, [], 0xCAFEBABE);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  test("empty array returns unchanged", () => {
    const pi = new Uint32Array([]);
    seededSortPrintings(pi, "seed", canonicalFaceRef, names, []);
    expect(Array.from(pi)).toEqual([]);
  });

  test("single element returns unchanged", () => {
    const pi = new Uint32Array([3]);
    seededSortPrintings(pi, "seed", canonicalFaceRef, names, []);
    expect(Array.from(pi)).toEqual([3]);
  });

  test("output contains exactly the same elements as input", () => {
    const pi = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const original = Array.from(pi).sort();
    seededSortPrintings(pi, "any-seed", canonicalFaceRef, names, ["light"]);
    expect(Array.from(pi).sort()).toEqual(original);
  });
});
