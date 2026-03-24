// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildStrayCommaCleanedQuery, buildStrayCommaCleanup } from "./stray-comma-cleanup";

describe("buildStrayCommaCleanup (Spec 157)", () => {
  it("removes terminal commas from multiple unquoted field values (CSV-style)", () => {
    const q = "ci=u, o=surveil, t=pl";
    const out = buildStrayCommaCleanup(q);
    expect(out?.cleanedQuery).toBe("ci=u o=surveil t=pl");
    expect(out?.label).toBe("ci=u o=surveil");
  });

  it("does not remove commas inside quoted oracle values", () => {
    const q = 'o:"draw two, discard one" t:creature';
    expect(buildStrayCommaCleanup(q)).toBeNull();
  });

  it("does not remove commas from regex field patterns", () => {
    const q = "name:/giant,/";
    expect(buildStrayCommaCleanup(q)).toBeNull();
  });

  it("returns null when no field value ends with a comma", () => {
    expect(buildStrayCommaCleanup("ci=u t:creature")).toBeNull();
  });

  it("returns null for empty or whitespace-only query", () => {
    expect(buildStrayCommaCleanup("")).toBeNull();
    expect(buildStrayCommaCleanup("   ")).toBeNull();
  });

  it("ignores bare comma operand (out of scope)", () => {
    const q = "c=u , o:surveil";
    expect(buildStrayCommaCleanup(q)).toBeNull();
  });

  it("handles single field clause with trailing comma on value", () => {
    const out = buildStrayCommaCleanup("o=surveil,");
    expect(out?.cleanedQuery).toBe("o=surveil");
    expect(out?.label).toBe("o=surveil");
  });

  it("normalizes whitespace after removals", () => {
    const q = "ci=u,  o=surveil,";
    const out = buildStrayCommaCleanup(q);
    expect(out?.cleanedQuery).toBe("ci=u o=surveil");
    expect(out?.label).toBe("ci=u o=surveil");
  });

  it("strips trailing comma on negated field value", () => {
    const out = buildStrayCommaCleanup("-o=nope,");
    expect(out?.cleanedQuery).toBe("-o=nope");
    expect(out?.label).toBe("-o=nope");
  });

  it("only strips unquoted value commas when quoted clause also contains commas", () => {
    const out = buildStrayCommaCleanup('t=creature, o:"a,b"');
    expect(out?.cleanedQuery).toBe('t=creature o:"a,b"');
    expect(out?.label).toBe("t=creature");
  });

  it("buildStrayCommaCleanedQuery returns only the query string", () => {
    expect(buildStrayCommaCleanedQuery("o=x,")).toBe("o=x");
  });

  it("label is only operands that had a trailing comma (c:u o=surveil, t=pl)", () => {
    const out = buildStrayCommaCleanup("c:u o=surveil, t=pl");
    expect(out?.cleanedQuery).toBe("c:u o=surveil t=pl");
    expect(out?.label).toBe("o=surveil");
  });
});
