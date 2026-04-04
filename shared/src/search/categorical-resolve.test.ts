// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import {
  normalizeForResolution,
  resolveCategoricalValue,
  resolveForField,
  expandIsKeywordsFromPrefix,
  expandIsKeywordsExact,
  collectIsNotPrefixHintNormalizedCandidates,
  type ResolutionContext,
} from "./categorical-resolve";

describe("normalizeForResolution", () => {
  it("lowercases input", () => {
    expect(normalizeForResolution("COMMANDER")).toBe("commander");
  });

  it("strips punctuation and whitespace", () => {
    expect(normalizeForResolution("9ED")).toBe("9ed");
    expect(normalizeForResolution("9 ed")).toBe("9ed");
  });

  it("preserves alphanumeric", () => {
    expect(normalizeForResolution("a1b2c3")).toBe("a1b2c3");
  });
});

describe("expandIsKeywordsFromPrefix (Spec 032)", () => {
  it("returns null when trimmed empty", () => {
    expect(expandIsKeywordsFromPrefix("")).toBe(null);
    expect(expandIsKeywordsFromPrefix("  \t ")).toBe(null);
  });

  it("returns empty array when no keyword matches", () => {
    expect(expandIsKeywordsFromPrefix("zzznotakeyword")).toEqual([]);
  });

  it("returns sorted list of all prefix matches", () => {
    const u = expandIsKeywordsFromPrefix("art");
    expect(u).toContain("art_series");
    expect(u!.length).toBeGreaterThanOrEqual(1);
    const sorted = [...u!].sort();
    expect(u).toEqual(sorted);
  });

  it("resolves unique single match as one element", () => {
    expect(expandIsKeywordsFromPrefix("commander")).toEqual(["commander"]);
  });

  it("uses exact normalized match so meld does not absorb meldpart", () => {
    expect(expandIsKeywordsFromPrefix("meld")).toEqual(["meld"]);
  });

  it("prefix discovery drops unsupported stubs (me/mel → meld only, not meldpart)", () => {
    expect(expandIsKeywordsFromPrefix("me")).toEqual(["meld"]);
    expect(expandIsKeywordsFromPrefix("mel")).toEqual(["meld"]);
  });

  it("does not map type-line false positives to longer is tokens (creature vs creatureland)", () => {
    expect(expandIsKeywordsFromPrefix("creature")).toEqual([]);
  });
});

describe("collectIsNotPrefixHintNormalizedCandidates (Spec 181)", () => {
  it("omits unsupported is stubs from hint vocabulary", () => {
    const c = collectIsNotPrefixHintNormalizedCandidates();
    expect(c.includes(normalizeForResolution("spotlight"))).toBe(false);
  });
});

describe("expandIsKeywordsExact (Spec 032 / ADR-022)", () => {
  it("returns null when trimmed empty", () => {
    expect(expandIsKeywordsExact("")).toBe(null);
    expect(expandIsKeywordsExact("  \t ")).toBe(null);
  });

  it("returns empty when no exact keyword matches", () => {
    expect(expandIsKeywordsExact("zzznotakeyword")).toEqual([]);
    expect(expandIsKeywordsExact("mel")).toEqual([]);
  });

  it("returns singleton for exact keyword (no prefix widen)", () => {
    expect(expandIsKeywordsExact("meld")).toEqual(["meld"]);
    expect(expandIsKeywordsExact("commander")).toEqual(["commander"]);
  });

  it("returns empty for type-line false positive without exact is keyword", () => {
    expect(expandIsKeywordsExact("creature")).toEqual([]);
  });

  it("returns sorted deterministic list", () => {
    const u = expandIsKeywordsExact("spell");
    expect(u).toEqual(["spell"]);
  });
});

describe("resolveCategoricalValue", () => {
  const candidates = ["commander", "pioneer", "pauper", "penny", "predh"];

  it("returns single match when exactly one candidate matches prefix", () => {
    expect(resolveCategoricalValue("c", candidates)).toBe("commander");
    expect(resolveCategoricalValue("com", candidates)).toBe("commander");
    expect(resolveCategoricalValue("commander", candidates)).toBe("commander");
  });

  it("returns null when zero candidates match", () => {
    expect(resolveCategoricalValue("x", candidates)).toBeNull();
    expect(resolveCategoricalValue("z", candidates)).toBeNull();
  });

  it("returns null when multiple candidates match", () => {
    expect(resolveCategoricalValue("p", candidates)).toBeNull();
  });

  it("is case-insensitive via normalization", () => {
    expect(resolveCategoricalValue("C", candidates)).toBe("commander");
  });

  it("handles normalized typed value", () => {
    expect(resolveCategoricalValue("9 ed", ["9ed"])).toBe("9ed");
  });
});

describe("resolveForField", () => {
  describe("build-time fields", () => {
    it("resolves view/v to VIEW_MODES", () => {
      expect(resolveForField("view", "i")).toBe("images");
      expect(resolveForField("view", "s")).toBe("slim");
      expect(resolveForField("v", "i")).toBe("images");
    });

    it("resolves unique", () => {
      expect(resolveForField("unique", "a")).toBe("art");
      expect(resolveForField("unique", "c")).toBe("cards");
      expect(resolveForField("unique", "p")).toBe("prints");
    });

    it("resolves sort", () => {
      expect(resolveForField("sort", "na")).toBe("name");
      expect(resolveForField("sort", "mv")).toBe("mv");
    });

    it("resolves include", () => {
      expect(resolveForField("include", "e")).toBe("extras");
    });

    it("resolves legal/f/format/banned/restricted", () => {
      expect(resolveForField("legal", "c")).toBe("commander");
      expect(resolveForField("f", "c")).toBe("commander");
      expect(resolveForField("f", "e")).toBe("edh");
      expect(resolveForField("legal", "com")).toBe("commander");
    });

    it("passes through typed value when multiple format matches", () => {
      expect(resolveForField("legal", "p")).toBe("p");
    });

    it("resolves rarity", () => {
      expect(resolveForField("rarity", "r")).toBe("rare");
      expect(resolveForField("r", "r")).toBe("rare");
    });

    it("resolves game", () => {
      expect(resolveForField("game", "ar")).toBe("arena");
    });

    it("resolves frame", () => {
      expect(resolveForField("frame", "f")).toBe("future");
    });

    it("resolves is keywords", () => {
      expect(resolveForField("is", "per")).toBe("permanent");
      expect(resolveForField("is", "commander")).toBe("commander");
      expect(resolveForField("is", "alchem")).toBe("alchemy");
      expect(resolveForField("is", "unse")).toBe("unset");
    });

    it("resolves not keywords (same set as is)", () => {
      expect(resolveForField("not", "per")).toBe("permanent");
      expect(resolveForField("not", "commander")).toBe("commander");
    });
  });

  describe("runtime fields", () => {
    it("resolves set when context has knownSetCodes", () => {
      const ctx: ResolutionContext = {
        knownSetCodes: new Set(["9ed", "a25", "lea"]),
      };
      expect(resolveForField("set", "9", ctx)).toBe("9ed");
      expect(resolveForField("set", "9ed", ctx)).toBe("9ed");
      expect(resolveForField("set", "lea", ctx)).toBe("lea");
    });

    it("passes through typed value for set when multiple matches", () => {
      const ctx: ResolutionContext = {
        knownSetCodes: new Set(["9ed", "9e"]),
      };
      expect(resolveForField("set", "9", ctx)).toBe("9");
    });

    it("skips set resolution when context absent", () => {
      expect(resolveForField("set", "9ed")).toBe("9ed");
    });

    it("resolves set_type when context has knownSetTypes (Spec 179)", () => {
      const ctx: ResolutionContext = {
        knownSetTypes: new Set(["expansion", "masters", "memorabilia"]),
      };
      expect(resolveForField("set_type", "mas", ctx)).toBe("masters");
      expect(resolveForField("st", "mem", ctx)).toBe("memorabilia");
    });

    it("passes through set_type when multiple prefix matches", () => {
      const ctx: ResolutionContext = {
        knownSetTypes: new Set(["masters", "memorabilia"]),
      };
      expect(resolveForField("set_type", "m", ctx)).toBe("m");
    });

    it("resolves in: when exactly one match across game+set+rarity union", () => {
      const ctx: ResolutionContext = {
        knownSetCodes: new Set(["lea", "m15"]),
      };
      expect(resolveForField("in", "ar", ctx)).toBe("arena");
    });

    it("passes through typed value for in: when arena and a25 both match", () => {
      const ctx: ResolutionContext = {
        knownSetCodes: new Set(["a25"]),
      };
      expect(resolveForField("in", "a", ctx)).toBe("a");
    });

    it("resolves in:9ed when only set matches", () => {
      const ctx: ResolutionContext = {
        knownSetCodes: new Set(["9ed", "lea"]),
      };
      expect(resolveForField("in", "9", ctx)).toBe("9ed");
    });

    it("resolves otag when context has oracleTagLabels", () => {
      const ctx: ResolutionContext = {
        oracleTagLabels: ["tribal", "removal", "ramp"],
      };
      expect(resolveForField("otag", "t", ctx)).toBe("tribal");
      expect(resolveForField("otag", "rem", ctx)).toBe("removal");
    });

    it("resolves atag when context has illustrationTagLabels", () => {
      const ctx: ResolutionContext = {
        illustrationTagLabels: ["fantasy", "scifi"],
      };
      expect(resolveForField("atag", "f", ctx)).toBe("fantasy");
    });

    it("resolves kw when context has keywordLabels and exactly one match", () => {
      const ctx: ResolutionContext = {
        keywordLabels: ["flying", "deathtouch", "haste"],
      };
      expect(resolveForField("kw", "f", ctx)).toBe("flying");
      expect(resolveForField("kw", "de", ctx)).toBe("deathtouch");
      expect(resolveForField("keyword", "haste", ctx)).toBe("haste");
    });

    it("passes through typed value for kw when multiple matches", () => {
      const ctx: ResolutionContext = {
        keywordLabels: ["prowess", "protection", "plainswalk"],
      };
      expect(resolveForField("kw", "p", ctx)).toBe("p");
    });

    it("skips kw resolution when context absent", () => {
      expect(resolveForField("kw", "flying")).toBe("flying");
    });
  });

  describe("non-categorical fields", () => {
    it("returns value as-is for open-ended fields", () => {
      expect(resolveForField("name", "bolt")).toBe("bolt");
      expect(resolveForField("oracle", "draw")).toBe("draw");
    });
  });
});
