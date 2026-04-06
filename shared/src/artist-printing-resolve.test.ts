// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { resolveArtistForPrintingRow } from "./artist-printing-resolve";

describe("resolveArtistForPrintingRow", () => {
  it("returns first raw artist name matching strided pair", () => {
    const raw = {
      "Carl Critchlow": [0, 12, 1, 12],
      "Other Artist": [0, 99],
    };
    expect(resolveArtistForPrintingRow(raw, 12, 0)).toBe("Carl Critchlow");
    expect(resolveArtistForPrintingRow(raw, 12, 1)).toBe("Carl Critchlow");
    expect(resolveArtistForPrintingRow(raw, 99, 0)).toBe("Other Artist");
  });

  it("returns null when no match or null index", () => {
    expect(resolveArtistForPrintingRow({ A: [0, 1] }, 2, 0)).toBeNull();
    expect(resolveArtistForPrintingRow(null, 0, 0)).toBeNull();
  });
});
