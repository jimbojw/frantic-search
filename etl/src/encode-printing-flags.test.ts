// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import { PrintingFlag } from "@frantic-search/shared";
import { encodePrintingFlags } from "./encode-printing-flags";

const unsetMask = PrintingFlag.Unset;

describe("encodePrintingFlags", () => {
  test("set_type funny sets Unset bit (Spec 171)", () => {
    expect(encodePrintingFlags({ set_type: "funny" }) & unsetMask).toBe(unsetMask);
  });

  test("set_type Funny is case-insensitive", () => {
    expect(encodePrintingFlags({ set_type: "Funny" }) & unsetMask).toBe(unsetMask);
  });

  test("non-funny set_type leaves Unset clear", () => {
    expect(encodePrintingFlags({ set_type: "expansion" }) & unsetMask).toBe(0);
    expect(encodePrintingFlags({ set_type: "alchemy" }) & unsetMask).toBe(0);
  });

  test("missing set_type leaves Unset clear", () => {
    expect(encodePrintingFlags({}) & unsetMask).toBe(0);
  });

  test("funny plus other flags ORs together", () => {
    const flags = encodePrintingFlags({ set_type: "funny", promo: true, digital: true });
    expect(flags & unsetMask).toBe(unsetMask);
    expect(flags & PrintingFlag.Promo).toBe(PrintingFlag.Promo);
    expect(flags & PrintingFlag.Digital).toBe(PrintingFlag.Digital);
  });
});
