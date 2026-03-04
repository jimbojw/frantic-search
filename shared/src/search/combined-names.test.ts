// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { computeCombinedNames } from "./combined-names";

describe("computeCombinedNames", () => {
  it("returns single name for single-face cards", () => {
    const names = ["Lightning Bolt", "Counterspell"];
    const canonicalFace = [0, 1];
    expect(computeCombinedNames(names, canonicalFace)).toEqual([
      "Lightning Bolt",
      "Counterspell",
    ]);
  });

  it("joins face names with // for multi-face cards", () => {
    const names = ["Beck", "Call"];
    const canonicalFace = [0, 0];
    expect(computeCombinedNames(names, canonicalFace)).toEqual([
      "Beck // Call",
      "Beck // Call",
    ]);
  });

  it("handles mixed single and multi-face cards", () => {
    const names = ["Beck", "Call", "Lightning Bolt"];
    const canonicalFace = [0, 0, 2];
    expect(computeCombinedNames(names, canonicalFace)).toEqual([
      "Beck // Call",
      "Beck // Call",
      "Lightning Bolt",
    ]);
  });
});
