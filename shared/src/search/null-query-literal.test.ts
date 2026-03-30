// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { isEquatableNullLiteral } from "./null-query-literal";

describe("isEquatableNullLiteral (Spec 172)", () => {
  it("matches null and proper prefixes", () => {
    expect(isEquatableNullLiteral("null")).toBe(true);
    expect(isEquatableNullLiteral("NULL")).toBe(true);
    expect(isEquatableNullLiteral("n")).toBe(true);
    expect(isEquatableNullLiteral("N")).toBe(true);
    expect(isEquatableNullLiteral("nu")).toBe(true);
    expect(isEquatableNullLiteral("nul")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isEquatableNullLiteral("  nu  ")).toBe(true);
    expect(isEquatableNullLiteral("\tnul\n")).toBe(true);
  });

  it("rejects empty, non-prefixes, and extensions", () => {
    expect(isEquatableNullLiteral("")).toBe(false);
    expect(isEquatableNullLiteral("no")).toBe(false);
    expect(isEquatableNullLiteral("nil")).toBe(false);
    expect(isEquatableNullLiteral("nulll")).toBe(false);
    expect(isEquatableNullLiteral("abc")).toBe(false);
  });
});
