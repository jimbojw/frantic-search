// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from "vitest";
import { CardFlag, PrintingFlag } from "../bits";
import {
  printingPassesDefaultInclusionFilter,
  type DefaultInclusionPrintingRow,
} from "./default-inclusion-filter";

function baseRow(over: Partial<DefaultInclusionPrintingRow> = {}): DefaultInclusionPrintingRow {
  return {
    wide: false,
    widenExtrasLayout: false,
    widenContentWarning: false,
    widenPlaytest: false,
    widenOversized: false,
    layout: "normal",
    faceFlags: 0,
    printingFlags: 0,
    promoTypesFlags1: 0,
    setCode: "lea",
    setType: "expansion",
    ...over,
  };
}

describe("printingPassesDefaultInclusionFilter (Spec 178)", () => {
  test("normal expansion printing passes", () => {
    expect(printingPassesDefaultInclusionFilter(baseRow())).toBe(true);
  });

  test("extras layout omitted when no widening", () => {
    expect(printingPassesDefaultInclusionFilter(baseRow({ layout: "token" }))).toBe(false);
    expect(printingPassesDefaultInclusionFilter(baseRow({ layout: "art_series" }))).toBe(false);
  });

  test("printing-wide skips all passes for memorabilia / omit codes / playtest / CW / oversized", () => {
    expect(
      printingPassesDefaultInclusionFilter(
        baseRow({
          wide: true,
          layout: "normal",
          setType: "memorabilia",
          setCode: "hho",
          promoTypesFlags1: 1,
          faceFlags: CardFlag.ContentWarning,
          printingFlags: PrintingFlag.Oversized,
        }),
      ),
    ).toBe(true);
  });

  test("widenExtrasLayout + extras layout skips all passes (full re-inclusion)", () => {
    const heavy = baseRow({
      widenExtrasLayout: true,
      layout: "art_series",
      setType: "memorabilia",
      setCode: "hho",
      promoTypesFlags1: 1,
      faceFlags: CardFlag.ContentWarning,
      printingFlags: PrintingFlag.Oversized,
    });
    expect(printingPassesDefaultInclusionFilter(heavy)).toBe(true);

    expect(
      printingPassesDefaultInclusionFilter({
        ...heavy,
        layout: "token",
      }),
    ).toBe(true);

    expect(
      printingPassesDefaultInclusionFilter({
        ...heavy,
        layout: "double_faced_token",
      }),
    ).toBe(true);

    expect(
      printingPassesDefaultInclusionFilter({
        ...heavy,
        layout: "vanguard",
      }),
    ).toBe(true);
  });

  test("widenExtrasLayout does not widen normal-layout printings", () => {
    expect(
      printingPassesDefaultInclusionFilter(
        baseRow({
          widenExtrasLayout: true,
          layout: "normal",
          setType: "memorabilia",
        }),
      ),
    ).toBe(false);
  });

  test("query-level widenPlaytest when gate closed", () => {
    expect(
      printingPassesDefaultInclusionFilter(
        baseRow({
          promoTypesFlags1: 1,
          widenPlaytest: true,
        }),
      ),
    ).toBe(true);
  });
});
