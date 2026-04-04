// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import {
  isMemorabiliaDefaultOmit,
  isSetCodeWidenedByQuery,
  isSetTypeWidenedByQuery,
  isSetTypeWidenedByPrefixes,
} from "./default-filter";

describe("default-filter helpers (Spec 178)", () => {
  test("isMemorabiliaDefaultOmit true for memorabilia", () => {
    expect(isMemorabiliaDefaultOmit("memorabilia")).toBe(true);
  });

  test("isMemorabiliaDefaultOmit false for empty or other types", () => {
    expect(isMemorabiliaDefaultOmit("")).toBe(false);
    expect(isMemorabiliaDefaultOmit("masters")).toBe(false);
    expect(isMemorabiliaDefaultOmit("expansion")).toBe(false);
  });

  test("isSetTypeWidenedByPrefixes matches eval-printing prefix semantics", () => {
    expect(isSetTypeWidenedByPrefixes("memorabilia", ["m"])).toBe(true);
    expect(isSetTypeWidenedByPrefixes("memorabilia", ["mem"])).toBe(true);
    expect(isSetTypeWidenedByPrefixes("masters", ["m"])).toBe(true);
    expect(isSetTypeWidenedByPrefixes("memorabilia", ["me"])).toBe(true);
    expect(isSetTypeWidenedByPrefixes("memorabilia", ["exp"])).toBe(false);
    expect(isSetTypeWidenedByPrefixes("", ["m"])).toBe(false);
    expect(isSetTypeWidenedByPrefixes("memorabilia", [])).toBe(false);
  });

  test("isSetCodeWidenedByQuery prefix and exact", () => {
    expect(isSetCodeWidenedByQuery("mh2", ["m"], [])).toBe(true);
    expect(isSetCodeWidenedByQuery("mh2", [], ["mh2"])).toBe(true);
    expect(isSetCodeWidenedByQuery("mh2", [], ["m"])).toBe(false);
    expect(isSetCodeWidenedByQuery("", ["m"], [])).toBe(false);
  });

  test("isSetTypeWidenedByQuery prefix and exact", () => {
    expect(isSetTypeWidenedByQuery("memorabilia", ["mem"], [])).toBe(true);
    expect(isSetTypeWidenedByQuery("masters", [], ["masters"])).toBe(true);
    expect(isSetTypeWidenedByQuery("masters", [], ["m"])).toBe(false);
  });
});
