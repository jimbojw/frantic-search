// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { normalizeAlphanumeric, normalizeForLookalikes } from "./normalize";

describe("normalizeForLookalikes", () => {
  it("maps Greek omicron to Latin o", () => {
    expect(normalizeForLookalikes("Glόin")).toBe("Gloin"); // U+03CC Greek omicron with tonos
    expect(normalizeForLookalikes("Glοin")).toBe("Gloin"); // U+03BF Greek omicron
  });

  it("leaves Latin characters unchanged", () => {
    expect(normalizeForLookalikes("Glóin")).toBe("Glóin");
    expect(normalizeForLookalikes("Gloin")).toBe("Gloin");
  });
});

describe("normalizeAlphanumeric", () => {
  it("lowercases and strips non-alphanumeric", () => {
    expect(normalizeAlphanumeric("COMMANDER")).toBe("commander");
    expect(normalizeAlphanumeric("9ED")).toBe("9ed");
    expect(normalizeAlphanumeric("9 ed")).toBe("9ed");
    expect(normalizeAlphanumeric("a1b2c3")).toBe("a1b2c3");
  });

  it("folds Latin accents to base characters", () => {
    expect(normalizeAlphanumeric("Glóin")).toBe("gloin");
    expect(normalizeAlphanumeric(" naïve")).toBe("naive");
    expect(normalizeAlphanumeric("Crème brûlée")).toBe("cremebrulee");
    expect(normalizeAlphanumeric("Niño")).toBe("nino");
    expect(normalizeAlphanumeric("Zürich")).toBe("zurich");
  });
});
