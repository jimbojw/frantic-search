// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { parse } from "./parser";
import { astUsesFranticExtensionSyntax } from "./query-extension-syntax";

function ext(q: string): boolean {
  return astUsesFranticExtensionSyntax(parse(q));
}

describe("astUsesFranticExtensionSyntax", () => {
  it("is false for plain Scryfall-like queries", () => {
    expect(ext("t:creature")).toBe(false);
    expect(ext("c:r o:draw")).toBe(false);
  });

  it("is true for is!= / not!= (Frantic-only, Spec 032 / ADR-022 / Spec 085)", () => {
    expect(ext("is!=bear")).toBe(true);
    expect(ext("not!=token")).toBe(true);
    expect(ext("is:bear")).toBe(false);
    expect(ext("is=bear")).toBe(false);
  });

  it("is false for unique:prints, unique:art, ++, @@ (Scryfall-supported)", () => {
    expect(ext("t:instant unique:prints")).toBe(false);
    expect(ext("t:creature unique:art")).toBe(false);
    expect(ext("t:creature ++")).toBe(false);
    expect(ext("t:creature @@")).toBe(false);
  });

  it("is false for include:extras but true for ** (Spec 057 / 085)", () => {
    expect(ext("t:creature include:extras")).toBe(false);
    expect(ext("t:creature **")).toBe(true);
  });

  it("is true for salt field", () => {
    expect(ext("salt>0.5")).toBe(true);
    expect(ext("saltiness<1")).toBe(true);
  });

  it("is true for percentile on supported fields", () => {
    expect(ext("edhrec>99%")).toBe(true);
    expect(ext("usd<50%")).toBe(true);
    expect(ext("date>90%")).toBe(true);
    expect(ext("name>10%")).toBe(true);
  });

  it("is true for partial date/year literals (Spec 061 expansion)", () => {
    expect(ext("date=202")).toBe(true);
    expect(ext("year>=202")).toBe(true);
    expect(ext("date>=2021-0")).toBe(true);
  });

  it("is false for complete date/year literals", () => {
    expect(ext("date=2021")).toBe(false);
    expect(ext("date>=2021-06-15")).toBe(false);
    expect(ext("year>=2024")).toBe(false);
  });

  it("is false for date now/today and set-code style values", () => {
    expect(ext("date>=today")).toBe(false);
    expect(ext("date>=now")).toBe(false);
    expect(ext("date>=neo")).toBe(false);
  });

  it("OR / AND composes", () => {
    expect(ext("t:creature OR salt>1")).toBe(true);
    expect(ext("(t:creature OR c:g) unique:prints")).toBe(false);
  });

  it("is true for null comparisons Scryfall does not support (Spec 080 / 136)", () => {
    expect(ext("usd=null")).toBe(true);
    expect(ext("usd!=null")).toBe(true);
    expect(ext("$=null")).toBe(true);
    expect(ext("pow=null")).toBe(true);
    expect(ext("tou!=null")).toBe(true);
    expect(ext("loy:null")).toBe(true);
    expect(ext("def=null")).toBe(true);
    expect(ext("m=null")).toBe(true);
  });

  it("is true for equatable-null on usd and edhrec (Spec 172 / 085)", () => {
    expect(ext("usd=n")).toBe(true);
    expect(ext("edhrec=n")).toBe(true);
    expect(ext("edhrec=null")).toBe(true);
  });

  it("is true for Spec 173 stat extensions (quoted, non-plain, equatable-null)", () => {
    expect(ext("pow=n")).toBe(true);
    expect(ext('tou:"1"')).toBe(true);
    expect(ext("tou:1+*")).toBe(true);
    expect(ext("tou=+*")).toBe(true);
  });

  it("is false for plain-numeric stat equality and numeric ranges (Spec 173)", () => {
    expect(ext("pow=2")).toBe(false);
    expect(ext("tou:1")).toBe(false);
    expect(ext("pow>3")).toBe(false);
    expect(ext("tou!=0")).toBe(false);
  });
});
