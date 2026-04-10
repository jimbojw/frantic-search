// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  normalizeAlphanumeric,
  normalizeForLookalikes,
  normalizeForTagResolution,
  matchesBoundaryAlignedPrefix,
  forEachBoundaryAlignedRemainder,
} from "./normalize";

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

describe("normalizeForTagResolution (Spec 174)", () => {
  it("lowercases and folds accents like alphanumeric path", () => {
    expect(normalizeForTagResolution("Glóin")).toBe("gloin");
  });

  it("preserves ASCII hyphens", () => {
    expect(normalizeForTagResolution("Mana-Rock")).toBe("mana-rock");
    expect(normalizeForTagResolution("one-off")).toBe("one-off");
  });

  it("strips spaces and punctuation except hyphen", () => {
    expect(normalizeForTagResolution("9 ed")).toBe("9ed");
  });
});

describe("matchesBoundaryAlignedPrefix (Spec 174)", () => {
  it("matches prefix at slug start", () => {
    expect(matchesBoundaryAlignedPrefix("mana-ramp", "mana-r")).toBe(true);
    expect(matchesBoundaryAlignedPrefix("mana-ramp", "mana")).toBe(true);
  });

  it("does not match sole mana key for mana-r prefix", () => {
    expect(matchesBoundaryAlignedPrefix("mana", "mana-r")).toBe(false);
  });

  it("matches segment after hyphen (death-trigger / trigger)", () => {
    expect(matchesBoundaryAlignedPrefix("death-trigger", "trigger")).toBe(true);
  });

  it("does not match in-word substring (ana vs mana)", () => {
    expect(matchesBoundaryAlignedPrefix("mana", "ana")).toBe(false);
  });

  it("does not match amp in mana-ramp", () => {
    expect(matchesBoundaryAlignedPrefix("mana-ramp", "amp")).toBe(false);
  });

  it("#253: on- does not match one-off / one-sided-fight via stripped on", () => {
    expect(matchesBoundaryAlignedPrefix("one-off", "on-")).toBe(false);
    expect(matchesBoundaryAlignedPrefix("one-sided-fight", "on-")).toBe(false);
  });

  it("empty u matches any non-empty key", () => {
    expect(matchesBoundaryAlignedPrefix("x", "")).toBe(true);
  });
});

describe("forEachBoundaryAlignedRemainder (Spec 174 / Spec 181)", () => {
  it("yields remainder after u at each boundary match", () => {
    const out: string[] = [];
    forEachBoundaryAlignedRemainder("cast-on-resolution", "on-", (_i, r) => {
      out.push(r);
    });
    expect(out).toEqual(["resolution"]);
  });

  it("invokes once per alignment for mana-r on mana-ramp", () => {
    const out: string[] = [];
    forEachBoundaryAlignedRemainder("mana-ramp", "mana-r", (_i, r) => {
      out.push(r);
    });
    expect(out).toEqual(["amp"]);
  });
});

describe("contrast with normalizeAlphanumeric", () => {
  it("hyphens stripped by alphanumeric but kept for tags", () => {
    expect(normalizeAlphanumeric("mana-rock")).toBe("manarock");
    expect(normalizeForTagResolution("mana-rock")).toBe("mana-rock");
  });
});
