// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "vitest";
import { parse } from "./parser";
import { singleExactNameFromAst } from "./exact-name-from-ast";

describe("singleExactNameFromAst", () => {
  test("returns null when no EXACT", () => {
    expect(singleExactNameFromAst(parse("t:creature"))).toBeNull();
  });

  test("returns name for single quoted exact", () => {
    expect(singleExactNameFromAst(parse('!"Lightning Bolt"'))).toBe("Lightning Bolt");
  });

  test("returns null for two exact names", () => {
    expect(singleExactNameFromAst(parse('!"A" !"B"'))).toBeNull();
  });

  test("returns name when one EXACT appears with other terms", () => {
    expect(singleExactNameFromAst(parse('!"Bolt" t:instant'))).toBe("Bolt");
  });

  test("ignores empty EXACT nodes for count", () => {
    expect(singleExactNameFromAst(parse("!"))).toBeNull();
  });

  test("OR of two exact is two nodes", () => {
    expect(singleExactNameFromAst(parse('!"A" or !"B"'))).toBeNull();
  });

  test("single exact under NOT still counts as one EXACT leaf", () => {
    expect(singleExactNameFromAst(parse('-!"X"'))).toBe("X");
  });
});
