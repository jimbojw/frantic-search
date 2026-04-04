// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  buildPrefixBranchHint,
  collapseBranchTokens,
  sortBranchTokens,
} from "./prefix-branch-hint";

describe("sortBranchTokens (Spec 181)", () => {
  it("orders equals before letters before digits", () => {
    expect(sortBranchTokens(["0", "a", "="])).toEqual(["=", "a", "0"]);
  });
});

describe("collapseBranchTokens (Spec 181)", () => {
  it("collapses 3+ contiguous letters", () => {
    expect(
      collapseBranchTokens(["a", "b", "c", "d", "e", "f", "h", "j", "0", "1", "2", "3", "4", "5"]),
    ).toEqual(["a-f", "h", "j", "0-5"]);
  });

  it("isolates gap then collapses following run (a|c-f)", () => {
    expect(collapseBranchTokens(["a", "c", "d", "e", "f"])).toEqual(["a", "c-f"]);
  });

  it("collapses full letter and digit ranges", () => {
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const digits = "0123456789".split("");
    expect(collapseBranchTokens([...letters, ...digits])).toEqual(["a-z", "0-9"]);
  });

  it("does not collapse runs of length 2", () => {
    expect(collapseBranchTokens(["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps equals as its own token", () => {
    expect(collapseBranchTokens(sortBranchTokens(["=", "o"]))).toEqual(["=", "o"]);
  });
});

describe("buildPrefixBranchHint (Spec 181)", () => {
  it("empty prefix: first chars with collapse", () => {
    const cands = ["a", "b", "c", "d", "e", "f", "h", "j", "0", "1", "2", "3", "4", "5"];
    expect(buildPrefixBranchHint("", cands)).toBe("(a-f|h|j|0-5)");
  });

  it("single completion: suffix after prefix", () => {
    expect(buildPrefixBranchHint("p", ["paper"])).toBe("(aper)");
  });

  it("single match when candidate equals prefix: no hint (nothing to complete)", () => {
    expect(buildPrefixBranchHint("paper", ["paper"])).toBe(null);
  });

  it("multi-branch with exact key and extensions: (=|o)", () => {
    expect(buildPrefixBranchHint("c", ["c", "common"])).toBe("(=|o)");
  });

  it("multi-branch dedupes same next char", () => {
    expect(buildPrefixBranchHint("pre", ["prefix", "prelude"])).toBe("(f|l)");
  });

  it("returns null when no candidates", () => {
    expect(buildPrefixBranchHint("x", [])).toBe(null);
  });

  it("returns null when no matches for non-empty prefix", () => {
    expect(buildPrefixBranchHint("zzz", ["apple", "banana"])).toBe(null);
  });

  it("trims whitespace on value", () => {
    expect(buildPrefixBranchHint("  p  ", ["paper"])).toBe("(aper)");
  });
});
