// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import { PROMO_TYPE_FLAGS } from "@frantic-search/shared";
import { encodePromoTypesFlags } from "./encode-promo-types-flags";

const alchemyMask = 1 << PROMO_TYPE_FLAGS.alchemy.bit;

describe("encodePromoTypesFlags", () => {
  test("promo_types alchemy sets alchemy bit", () => {
    const { flags0, flags1 } = encodePromoTypesFlags({ promo_types: ["alchemy"] });
    expect(flags0 & alchemyMask).toBe(alchemyMask);
    expect(flags1).toBe(0);
  });

  test("set_type alchemy without promo_types sets alchemy bit (issue #191)", () => {
    const { flags0, flags1 } = encodePromoTypesFlags({ set_type: "alchemy" });
    expect(flags0 & alchemyMask).toBe(alchemyMask);
    expect(flags1).toBe(0);
  });

  test("set_type Alchemy is case-insensitive", () => {
    const { flags0 } = encodePromoTypesFlags({ set_type: "Alchemy" });
    expect(flags0 & alchemyMask).toBe(alchemyMask);
  });

  test("set_type alchemy plus promo_types alchemy still single OR", () => {
    const { flags0, flags1 } = encodePromoTypesFlags({
      set_type: "alchemy",
      promo_types: ["alchemy"],
    });
    expect(flags0 & alchemyMask).toBe(alchemyMask);
    expect(flags1).toBe(0);
  });

  test("non-alchemy set_type and no alchemy promo leaves alchemy bit clear", () => {
    const { flags0, flags1 } = encodePromoTypesFlags({
      set_type: "expansion",
      promo_types: ["poster"],
    });
    expect(flags0 & alchemyMask).toBe(0);
    expect(flags1 & (1 << PROMO_TYPE_FLAGS.poster.bit)).toBeGreaterThan(0);
  });

  test("empty input yields zero flags", () => {
    expect(encodePromoTypesFlags({})).toEqual({ flags0: 0, flags1: 0 });
  });
});
