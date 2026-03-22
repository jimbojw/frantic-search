// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { Color, Format } from "../bits";
import type { ColumnarData } from "../data";
import { NodeCache, nodeKey } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { index, matchCount, TEST_DATA, saltMatchCount } from "./evaluator.test-fixtures";

// ---------------------------------------------------------------------------
// Node key uniqueness
// ---------------------------------------------------------------------------

describe("nodeKey", () => {
  test("different node types produce different keys", () => {
    const bare = parse("bolt");      // BARE
    const field = parse("c:wu");     // FIELD
    expect(nodeKey(bare)).not.toBe(nodeKey(field));
  });

  test("same structure produces identical keys", () => {
    expect(nodeKey(parse("c:wu"))).toBe(nodeKey(parse("c:wu")));
    expect(nodeKey(parse("c:wu t:creature"))).toBe(nodeKey(parse("c:wu t:creature")));
  });

  test("different field values produce different keys", () => {
    expect(nodeKey(parse("c:wu"))).not.toBe(nodeKey(parse("c:bg")));
  });

  test("different operators produce different keys", () => {
    expect(nodeKey(parse("c:wu"))).not.toBe(nodeKey(parse("c=wu")));
  });

  test("separator prevents ambiguous concatenation", () => {
    const ast1 = { type: "FIELD" as const, field: "ab", operator: ":", value: "cd" };
    const ast2 = { type: "FIELD" as const, field: "a", operator: ":", value: "bcd" };
    expect(nodeKey(ast1)).not.toBe(nodeKey(ast2));
  });

  test("empty value produces unique key", () => {
    expect(nodeKey(parse("c:"))).not.toBe(nodeKey(parse("c:wu")));
  });

  test("NOT key includes child key", () => {
    const key = nodeKey(parse("-c:wu"));
    expect(key).toContain("NOT");
    expect(key).toContain("FIELD");
  });

  test("AND vs OR produce different keys for same children", () => {
    const andKey = nodeKey(parse("c:wu t:creature"));    // implicit AND
    const orKey = nodeKey(parse("c:wu OR t:creature"));
    expect(andKey).not.toBe(orKey);
  });

  test("child order matters for AND keys", () => {
    const ast1 = parse("c:wu t:creature");
    const ast2 = parse("t:creature c:wu");
    expect(nodeKey(ast1)).not.toBe(nodeKey(ast2));
  });

  test("regex field key includes pattern", () => {
    const key = nodeKey(parse("o:/damage/"));
    expect(key).toContain("REGEX_FIELD");
    expect(key).toContain("damage");
  });

  test("exact name key", () => {
    const key = nodeKey(parse('!"Lightning Bolt"'));
    expect(key).toContain("EXACT");
    expect(key).toContain("Lightning Bolt");
  });

  test("quoted and unquoted bare words produce different keys", () => {
    const unquoted = { type: "BARE" as const, value: "x", quoted: false };
    const quoted = { type: "BARE" as const, value: "x", quoted: true };
    expect(nodeKey(unquoted)).not.toBe(nodeKey(quoted));
  });

  test("NOP node has a stable key", () => {
    const key = nodeKey({ type: "NOP" });
    expect(key).toBe("NOP");
  });

  test("alias and canonical form produce different keys (breakdown label fix)", () => {
    // ** vs include:extras, ++ vs unique:prints, @@ vs unique:art — each pair
    // must have distinct keys so the breakdown shows the original term.
    expect(nodeKey(parse("**"))).not.toBe(nodeKey(parse("include:extras")));
    expect(nodeKey(parse("++"))).not.toBe(nodeKey(parse("unique:prints")));
    expect(nodeKey(parse("@@"))).not.toBe(nodeKey(parse("unique:art")));
  });
});

// ---------------------------------------------------------------------------
// Interning identity
// ---------------------------------------------------------------------------

describe("NodeCache.intern", () => {
  test("same AST structure returns same InternedNode", () => {
    const cache = new NodeCache(index);
    const ast1 = parse("c:wu");
    const ast2 = parse("c:wu");
    const interned1 = cache.intern(ast1);
    const interned2 = cache.intern(ast2);
    expect(interned1).toBe(interned2);
  });

  test("different ASTs return different InternedNodes", () => {
    const cache = new NodeCache(index);
    const interned1 = cache.intern(parse("c:wu"));
    const interned2 = cache.intern(parse("c:bg"));
    expect(interned1).not.toBe(interned2);
  });

  test("deeply nested identical structures resolve to same node", () => {
    const cache = new NodeCache(index);
    const ast1 = parse("(c:wu OR c:bg) t:creature");
    const ast2 = parse("(c:wu OR c:bg) t:creature");
    expect(cache.intern(ast1)).toBe(cache.intern(ast2));
  });

  test("** and include:extras get distinct nodes when shared cache (breakdown label)", () => {
    const cache = new NodeCache(index);
    cache.evaluate(parse("**")); // populate cache with ** AST
    const { result } = cache.evaluate(parse("include:extras"));
    const node = result.node;
    expect(node.type).toBe("FIELD");
    expect((node as { sourceText?: string }).sourceText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Match count equivalence (same results as the old evaluate function)
// ---------------------------------------------------------------------------

describe("evaluate", () => {
  test("bare word matches name substring", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("birds")).toBe(1);
    expect(matchCount("nonexistent")).toBe(0);
  });

  test("bare word is case-insensitive", () => {
    expect(matchCount("BOLT")).toBe(1);
    expect(matchCount("Birds")).toBe(1);
  });

  test("name field substring", () => {
    expect(matchCount("name:bolt")).toBe(1);
    expect(matchCount("n:thalia")).toBe(1);
  });

  test("oracle text field substring", () => {
    expect(matchCount("o:flying")).toBe(1);
    expect(matchCount("o:damage")).toBe(2);
    expect(matchCount("o:target")).toBe(4);
  });

  test("color field with : (superset)", () => {
    expect(matchCount("c:g")).toBe(2);
    expect(matchCount("c:r")).toBe(2);
    expect(matchCount("c:wu")).toBe(1);
    expect(matchCount("c:w")).toBe(2);
  });

  test("color field with = (exact)", () => {
    expect(matchCount("c=wu")).toBe(1);
    expect(matchCount("c=w")).toBe(1);
    expect(matchCount("c=g")).toBe(2);
  });

  test("full color names work as values", () => {
    expect(matchCount("c:green")).toBe(2);
    expect(matchCount("c:red")).toBe(2);
    expect(matchCount("c:blue")).toBe(2);
    expect(matchCount("c:white")).toBe(2);
    expect(matchCount("c:black")).toBe(2);
  });

  test("guild names work as color values", () => {
    expect(matchCount("c:azorius")).toBe(1);   // WU → only Azorius Charm
    expect(matchCount("c:rakdos")).toBe(1);    // BR → only Ayara back
  });

  test("shard and wedge names work as color values", () => {
    expect(matchCount("c:esper")).toBe(0);     // WUB → no card has all three
    expect(matchCount("c:jeskai")).toBe(0);    // URW → no card has all three
  });

  test("college names are aliases for guilds", () => {
    expect(matchCount("c:prismari")).toBe(matchCount("c:izzet"));   // UR
    expect(matchCount("c:silverquill")).toBe(matchCount("c:orzhov")); // WB
  });

  test("colorless matches cards with zero color bits", () => {
    expect(matchCount("c:colorless")).toBe(1);  // Sol Ring only
    expect(matchCount("c:c")).toBe(1);
  });

  test("multicolor matches cards with 2+ color bits", () => {
    expect(matchCount("c:multicolor")).toBe(2); // Azorius Charm (WU), Ayara back (BR)
    expect(matchCount("c:m")).toBe(2);
  });

  test("color names work with identity field", () => {
    expect(matchCount("id<=esper")).toBe(5);  // identity ⊆ WUB: Counterspell(U), Sol Ring(∅), Azorius(WU), Thalia(W), Dismember(B)
    expect(matchCount("id:green")).toBe(matchCount("id:g"));
  });

  test("color names are case-insensitive", () => {
    expect(matchCount("c:Green")).toBe(2);
    expect(matchCount("c:AZORIUS")).toBe(1);
    expect(matchCount("c:Colorless")).toBe(1);
    expect(matchCount("c:Multicolor")).toBe(2);
  });

  test("type field matches card types", () => {
    expect(matchCount("t:creature")).toBe(4);
    expect(matchCount("t:instant")).toBe(4);
    expect(matchCount("t:artifact")).toBe(1);
  });

  test("type field matches supertypes", () => {
    expect(matchCount("t:legendary")).toBe(2);
  });

  test("type field matches subtypes", () => {
    expect(matchCount("t:elf")).toBe(2);
    expect(matchCount("t:human")).toBe(1);
  });

  test("type field matches partial words", () => {
    expect(matchCount("t:legend")).toBe(2);
  });

  test("type field with quoted multi-word matches type_line substring", () => {
    expect(matchCount('t:"legendary creature"')).toBe(2);
  });

  test("power field numeric comparison", () => {
    expect(matchCount("pow=0")).toBe(2);   // Birds (0) + Tarmogoyf (* → 0)
    expect(matchCount("pow=2")).toBe(1);
    expect(matchCount("pow>=2")).toBe(2);
    expect(matchCount("pow<2")).toBe(2);   // Birds (0) + Tarmogoyf (* → 0)
  });

  test("* power treated as 0 for comparisons (Spec 034)", () => {
    expect(matchCount("pow=0")).toBe(2);   // Birds (0) + Tarmogoyf (* → 0)
    expect(matchCount("pow<=0")).toBe(2);
    expect(matchCount("pow>0")).toBe(2);   // Thalia (2) + Ayara (3/4)
    expect(matchCount("pow!=0")).toBe(2);
  });

  test("1+* toughness treated as 1 for comparisons (Spec 034)", () => {
    expect(matchCount("tou=1")).toBe(2);
  });

  test("query value x/y treated as 0 (Spec 034)", () => {
    expect(matchCount("pow=x")).toBe(2);   // same as pow=0
    expect(matchCount("pow=y")).toBe(2);
    expect(matchCount("pow=X")).toBe(2);
  });

  test("mana symbol contains (braced)", () => {
    expect(matchCount("m:{G}")).toBe(2);
    expect(matchCount("m:{R}")).toBe(1);
    expect(matchCount("m:{u}{u}")).toBe(1);
    expect(matchCount("m:{b/p}{b/p}")).toBe(1);
  });

  test("mana symbol contains is case-insensitive", () => {
    expect(matchCount("m:{g}")).toBe(2);
    expect(matchCount("m:{r}")).toBe(1);
  });

  test("bare mana shorthand matches same as braced", () => {
    expect(matchCount("m:g")).toBe(2);
    expect(matchCount("m:r")).toBe(1);
    expect(matchCount("m:uu")).toBe(1);
    expect(matchCount("m:rr")).toBe(0);
  });

  test("mixed bare/braced mana shorthand", () => {
    expect(matchCount("m:r{r}")).toBe(0);
    expect(matchCount("m:{r}r")).toBe(0);
    expect(matchCount("m:u{u}")).toBe(1);
    expect(matchCount("m:{u}u")).toBe(1);
  });

  test("generic mana in query", () => {
    expect(matchCount("m:1")).toBe(5);
    expect(matchCount("m:1g")).toBe(1);
    expect(matchCount("m:{1}{g}")).toBe(1);
  });

  test("phyrexian symbol in query matches only itself", () => {
    expect(matchCount("m:{b/p}")).toBe(1);
  });

  test("mana= exact match vs mana: superset", () => {
    expect(matchCount("mana=1")).toBe(1);   // only Sol Ring {1}
    expect(matchCount("mana:1")).toBe(5);    // any with generic>=1
    expect(matchCount("mana=uu")).toBe(1);   // only Counterspell {U}{U}
    expect(matchCount("mana:uu")).toBe(1);   // same in this pool
  });

  test("mana> strict superset excludes exact", () => {
    expect(matchCount("mana>=uu")).toBe(1);  // Counterspell
    expect(matchCount("mana>uu")).toBe(0);   // no card has more than 2U
  });

  test("mana<= subset: card has at most query symbols", () => {
    expect(matchCount("mana<=uu")).toBe(2);  // Sol Ring {}, Counterspell {U}{U}
  });

  test("produces (Spec 147)", () => {
    expect(matchCount("produces:c")).toBe(1);       // Sol Ring
    expect(matchCount("produces:g")).toBe(1);      // Birds
    expect(matchCount("produces:wu")).toBe(1);      // Birds
    expect(matchCount("produces:wug")).toBe(1);    // Birds
    expect(matchCount("produces=wubrg")).toBe(1);  // Birds (exactly all five)
    expect(matchCount("produces=wu")).toBe(0);     // no card produces exactly WU
    expect(matchCount("produces<g")).toBe(7);      // cards producing nothing (subset of {G})
    expect(matchCount("produces:azorius")).toBe(1);  // Birds produces at least WU
    expect(matchCount("produces=azorius")).toBe(0);  // no card produces exactly WU
    expect(matchCount("produces:")).toBe(2);      // empty = produces any (Birds, Sol Ring)
    expect(matchCount("produces=0")).toBe(7);     // cards producing no mana
    expect(matchCount("produces>0")).toBe(2);     // Birds, Sol Ring
    expect(matchCount("-produces=0")).toBe(2);     // NOT produces nothing
    expect(matchCount("produces:multicolor")).toBe(1);  // Birds (5 types)
    expect(matchCount("produces=2")).toBe(0);     // minimal fixture: Birds=5, Sol Ring=1
    expect(matchCount("produces>2")).toBe(1);     // Birds
    expect(matchCount("produces<2")).toBe(8);      // 7 non-producers + Sol Ring
  });

  test("exact name with !", () => {
    expect(matchCount('!"Lightning Bolt"')).toBe(1);
    expect(matchCount("!bolt")).toBe(0);
  });

  test("empty exact-name produces error (Issue #53)", () => {
    const cache = new NodeCache(index);
    for (const query of ["!", "!'", '!"', "!''", '!""']) {
      const { result } = cache.evaluate(parse(query));
      expect(result.error).toBe("exact name requires a non-empty value");
      expect(result.matchCount).toBe(-1);
    }
  });

  test("implicit AND", () => {
    expect(matchCount("c:g t:creature")).toBe(2);
    expect(matchCount("c:w t:creature")).toBe(1);
  });

  test("explicit OR", () => {
    expect(matchCount("c:r OR c:u")).toBe(4);
  });

  test("negation with -", () => {
    expect(matchCount("-t:creature")).toBe(5);
    expect(matchCount("t:creature -c:w")).toBe(3);
  });

  test("parenthesized group", () => {
    expect(matchCount("(c:r OR c:u) t:instant")).toBe(3);
  });

  test("unknown field produces error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("xyzzy:common"));
    expect(result.error).toBe('unknown field "xyzzy"');
    expect(result.matchCount).toBe(-1);
  });

  test("printing field without printing index produces error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("rarity:common"));
    expect(result.error).toBe("printing data not loaded");
    expect(result.matchCount).toBe(-1);
  });

  test("empty value matches all cards", () => {
    expect(matchCount("c:")).toBe(9);
  });

  test("empty input (root NOP) produces zero indices and matchCount -1", () => {
    const cache = new NodeCache(index);
    const { result, indices } = cache.evaluate(parse(""));
    expect(indices.length).toBe(0);
    expect(result.matchCount).toBe(-1);
  });

  test("trailing OR: a OR evaluates to just a", () => {
    expect(matchCount("bolt OR")).toBe(matchCount("bolt"));
  });

  test("leading OR: OR a evaluates to just a", () => {
    expect(matchCount("OR bolt")).toBe(matchCount("bolt"));
  });

  test("double OR: a OR OR b skips middle NOP", () => {
    expect(matchCount("c:r OR OR c:u")).toBe(matchCount("c:r OR c:u"));
  });

  test("empty parens produce NOP, skipped in AND", () => {
    expect(matchCount("() c:r")).toBe(matchCount("c:r"));
  });

  test("NOP in OR with all NOP children matches nothing", () => {
    expect(matchCount("OR")).toBe(0);
  });

  test("result tree has children with matchCounts", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("c:g t:creature"));
    expect(result.matchCount).toBe(2);
    expect(result.children).toHaveLength(2);
    expect(result.children![0].matchCount).toBe(2);
    expect(result.children![1].matchCount).toBe(4);
  });

  test("indices contains canonical face indices of matching cards", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("c:g t:creature"));
    expect(Array.from(indices)).toEqual([0, 4]);
  });

  test("indices for single match", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse('!"Lightning Bolt"'));
    expect(Array.from(indices)).toEqual([1]);
  });

  test("indices empty when no matches", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("rarity:common"));
    expect(Array.from(indices)).toEqual([]);
  });

  test("legal:commander matches all cards legal in commander", () => {
    expect(matchCount("legal:commander")).toBe(9);
  });

  test("legal:legacy matches cards legal in legacy", () => {
    expect(matchCount("legal:legacy")).toBe(7);
  });

  test("f: alias works for legal:", () => {
    expect(matchCount("f:modern")).toBe(5);
  });

  test("edh is an alias for commander", () => {
    expect(matchCount("legal:edh")).toBe(matchCount("legal:commander"));
    expect(matchCount("f:edh")).toBe(matchCount("f:commander"));
  });

  test("f:c and f:e resolve to commander (Spec 103)", () => {
    expect(matchCount("f:c")).toBe(matchCount("f:commander"));
    expect(matchCount("f:e")).toBe(matchCount("f:edh"));
  });

  test("banned:legacy matches cards banned in legacy", () => {
    expect(matchCount("banned:legacy")).toBe(1);
  });

  test("restricted:vintage matches cards restricted in vintage", () => {
    expect(matchCount("restricted:vintage")).toBe(1);
  });

  test("legal + type combo", () => {
    expect(matchCount("legal:legacy t:creature")).toBe(4);
  });

  test("unknown format produces error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("legal:fakefmt"));
    expect(result.error).toBe('unknown format "fakefmt"');
    expect(result.matchCount).toBe(-1);
  });

  test("regex on oracle text", () => {
    expect(matchCount("o:/damage/")).toBe(2);
    expect(matchCount("o:/target/")).toBe(4);
  });

  test("regex on type line", () => {
    expect(matchCount("t:/legendary.*elf/")).toBe(1);
    expect(matchCount("t:/legendary.*human/")).toBe(1);
    expect(matchCount("t:/creature/")).toBe(4);
  });

  test("regex on name", () => {
    expect(matchCount("name:/^birds/")).toBe(1);
    expect(matchCount("name:/bolt$/")).toBe(1);
  });

  test("regex with invalid pattern produces error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("o:/[invalid/"));
    expect(result.error).toBe("invalid regex");
    expect(result.matchCount).toBe(-1);
  });

  test("regex on non-string field produces error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("pow:/3/"));
    expect(result.error).toBe('unknown field "pow"');
    expect(result.matchCount).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // Multi-face card (DFC) tests
  // -------------------------------------------------------------------------

  test("query matching only back face returns canonical face index", () => {
    expect(matchCount("t:phyrexian")).toBe(1);
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("t:phyrexian"));
    expect(Array.from(indices)).toEqual([7]);
  });

  test("query matching both faces produces one result at canonical face", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("t:elf t:legendary"));
    expect(Array.from(indices)).toEqual([7]);
  });

  test("cross-face conditions match when different faces satisfy different terms", () => {
    expect(matchCount("pow>=4 tou<=2")).toBe(0);
  });

  test("DFC card-level color match", () => {
    expect(matchCount("c:r t:elf")).toBe(1);
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("c:r t:elf"));
    expect(Array.from(indices)).toEqual([7]);
  });

  test("identity: colon uses subset semantics (fits in a commander deck)", () => {
    expect(matchCount("id:wu")).toBe(4);
    expect(matchCount("id:w")).toBe(2);
    expect(matchCount("id:br")).toBe(4);
  });

  test("identity: explicit >= still uses superset semantics", () => {
    expect(matchCount("id>=wu")).toBe(1);
    expect(matchCount("id>=w")).toBe(2);
  });

  test("identity: subset combined with type narrows correctly", () => {
    expect(matchCount("id:br t:elf")).toBe(1);
  });

  test("commander:, cmd:, and ci: are aliases with same subset colon semantics", () => {
    expect(matchCount("commander:wu")).toBe(4);
    expect(matchCount("commander:br")).toBe(4);
    expect(matchCount("commander:w")).toBe(2);
    expect(matchCount("cmd:w")).toBe(2);
    expect(matchCount("cmd:br")).toBe(4);
    expect(matchCount("ci:wu")).toBe(4);
    expect(matchCount("ci:w")).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Color/identity number queries (Spec 055)
  // -------------------------------------------------------------------------

  describe("color/identity number queries (Spec 055)", () => {
    test("ci:2 matches exactly 2-color identity", () => {
      expect(matchCount("ci:2")).toBe(2); // Azorius Charm, Ayara
    });
    test("ci:0 matches colorless", () => { expect(matchCount("ci:0")).toBe(1); });
    test("ci:1 matches monocolor", () => { expect(matchCount("ci:1")).toBe(6); });
    test("ci:3 matches nothing in pool", () => { expect(matchCount("ci:3")).toBe(0); });
    test("ci:5 matches nothing in pool", () => { expect(matchCount("ci:5")).toBe(0); });
    test("ci>=2 matches 2+ colors", () => { expect(matchCount("ci>=2")).toBe(2); });
    test("ci>=1 matches non-colorless", () => { expect(matchCount("ci>=1")).toBe(8); });
    test("ci<=1 matches colorless + monocolor", () => { expect(matchCount("ci<=1")).toBe(7); });
    test("ci>0 matches non-colorless", () => { expect(matchCount("ci>0")).toBe(8); });
    test("ci<2 matches colorless + monocolor", () => { expect(matchCount("ci<2")).toBe(7); });
    test("ci!=1 matches 0 and 2-color", () => { expect(matchCount("ci!=1")).toBe(3); });
    test("ci=2 same as ci:2", () => { expect(matchCount("ci=2")).toBe(2); });
    test("c:0 matches colorless face", () => { expect(matchCount("c:0")).toBe(1); });
    test("c:1 matches monocolor faces", () => { expect(matchCount("c:1")).toBe(7); }); // 6 single-face + Ayara front
    test("c:2 matches 2-color faces", () => { expect(matchCount("c:2")).toBe(2); });
    test("-ci:2 matches non-2-color", () => { expect(matchCount("-ci:2")).toBe(7); });
    test("-ci:0 matches non-colorless", () => { expect(matchCount("-ci:0")).toBe(8); });
    test("ci:1 t:creature matches monocolor creatures", () => { expect(matchCount("ci:1 t:creature")).toBe(3); });
    test("ci>=1 t:instant matches non-colorless instants", () => { expect(matchCount("ci>=1 t:instant")).toBe(4); });
    test("id:2 alias works", () => { expect(matchCount("id:2")).toBe(2); });
    test("commander:1 alias works", () => { expect(matchCount("commander:1")).toBe(6); });
    test("cmd:0 alias works", () => { expect(matchCount("cmd:0")).toBe(1); });
    test("ci:wub still matches letter-sequence (not numeric)", () => {
      expect(matchCount("ci:wub")).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Combined name search (Spec 018)
  // -------------------------------------------------------------------------

  test("unquoted bare word matches normalized combined name across face boundary", () => {
    expect(matchCount("realmayara")).toBe(1);
  });

  test("unquoted bare word still matches single-face cards via normalized name", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("lightningbolt")).toBe(1);
  });

  test("unquoted bare word gloin matches card Glóin via accent folding (NFD normalization)", () => {
    const minimal: ColumnarData = {
      names: ["Glóin, Dwarf Emissary"],
      mana_costs: ["{1}{R}"],
      oracle_texts: [""],
      colors: [Color.Red],
      color_identity: [Color.Red],
      type_lines: ["Legendary Creature — Dwarf Noble"],
      powers: [2],
      toughnesses: [3],
      loyalties: [0],
      defenses: [0],
      legalities_legal: [Format.Commander],
      legalities_banned: [0],
      legalities_restricted: [0],
      card_index: [0],
      canonical_face: [0],
      scryfall_ids: [""],
      layouts: ["normal"],
      flags: [0],
      edhrec_ranks: [null],
      edhrec_salts: [null],
      power_lookup: ["", "0", "*", "2", "3", "4"],
      toughness_lookup: ["", "1", "1+*", "3", "4"],
      loyalty_lookup: [""],
      defense_lookup: [""],
      keywords_index: {},
      produces: {},
    };
    const idx = new CardIndex(minimal);
    const cache = new NodeCache(idx);
    const result = cache.evaluate(parse("gloin"));
    expect(result.result.matchCount).toBe(1);
  });

  test("quoted bare word matches literal combined name", () => {
    expect(matchCount('" // "')).toBe(1);
  });

  test("quoted bare word does not match normalized form", () => {
    expect(matchCount('"realmayara"')).toBe(0);
  });

  test("name: field searches combined name", () => {
    expect(matchCount('name:" // "')).toBe(1);
  });

  test("exact name matches combined name", () => {
    expect(matchCount('!"Ayara, Widow of the Realm // Ayara, Furnace Queen"')).toBe(1);
  });

  test("exact name matches individual face name for DFC", () => {
    expect(matchCount('!"Ayara, Furnace Queen"')).toBe(1);
  });

  test("exact name still matches single-face cards", () => {
    expect(matchCount('!"Lightning Bolt"')).toBe(1);
  });

  test("regex on name searches combined name", () => {
    expect(matchCount("name:/realm.*furnace/")).toBe(1);
  });

  test("combined name: cross-field AND with face-specific field", () => {
    expect(matchCount("name:widow pow>=4")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Spec 096: Name comparison operators
// ---------------------------------------------------------------------------

describe("name comparison operators (Spec 096)", () => {
  test("name>M returns cards whose normalized name is after m", () => {
    // Sol Ring, Tarmogoyf, Thalia (s,t,t > m)
    expect(matchCount("name>M")).toBe(3);
  });

  test("name>=M includes cards at or after m", () => {
    expect(matchCount("name>=M")).toBe(3);
  });

  test("name<M returns cards before m", () => {
    // Azorius, Ayara, Birds, Counterspell, Dismember, Lightning Bolt
    expect(matchCount("name<M")).toBe(6);
  });

  test("name<=M includes cards at or before m", () => {
    expect(matchCount("name<=M")).toBe(6);
  });

  test("name:bolt and name=bolt unchanged (substring match)", () => {
    expect(matchCount("name:bolt")).toBe(1);
    expect(matchCount("name=bolt")).toBe(1);
  });

  test("-name>M equals name<=M (operator inversion)", () => {
    expect(matchCount("-name>M")).toBe(matchCount("name<=M"));
    expect(matchCount("-name>M")).toBe(6);
  });

  test("name>Lightning returns Lightning Bolt and names after (full string comparison)", () => {
    // lightningbolt > lightning; Sol Ring, Tarmogoyf, Thalia
    expect(matchCount("name>Lightning")).toBe(4);
  });

  test("name>=Lightning includes Lightning Bolt (equal) and names after", () => {
    expect(matchCount("name>=Lightning")).toBe(4);
  });

  test("name>/foo/ returns error (regex does not support comparison operators)", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("name>/foo/"));
    expect(result.error).toContain("name field does not support comparison operators with regex");
    expect(result.matchCount).toBe(-1);
  });

  test("name>50% returns latter half alphabetically (Spec 095)", () => {
    // 10 faces; latter 50% = 5 faces
    const count = matchCount("name>50%");
    expect(count).toBe(5);
  });

  test("name>=Thalia finds Thalia (quoted value normalized)", () => {
    expect(matchCount('name>="Thalia, Guardian"')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Salt (Spec 101) — uses SALT_TEST_DATA with salts [10,50,30,20,40,60,70,80,80,90]
// ---------------------------------------------------------------------------

describe("salt (Spec 101)", () => {
  test("salt>50 matches faces with salt greater than 50", () => {
    // Salts [10,50,30,20,40,60,70,80,80,90]; >50: 60,70,80,80,90 = 5 face rows, 4 canonical faces (Ayara 7+8 share)
    expect(saltMatchCount("salt>50")).toBe(4);
  });

  test("salt<=100 matches all faces with salt", () => {
    // 10 face rows, 9 canonical faces (Ayara 7+8 share)
    expect(saltMatchCount("salt<=100")).toBe(9);
  });

  test("salt>90% returns top 10% saltiest (1 face)", () => {
    expect(saltMatchCount("salt>90%")).toBe(1);
  });

  test("salt<10% returns bottom 10% least salty (1 face)", () => {
    expect(saltMatchCount("salt<10%")).toBe(1);
  });

  test("-salt>90% becomes salt<=90% (negation path)", () => {
    // salt<=90% includes all 10 face rows in bottom-90% slice
    expect(saltMatchCount("-salt>90%")).toBe(10);
  });

  test("salt with all-null data matches nothing", () => {
    expect(matchCount("salt>50")).toBe(0);
  });

  test("saltiness and edhrecsalt aliases work", () => {
    expect(saltMatchCount("saltiness>50")).toBe(saltMatchCount("salt>50"));
    expect(saltMatchCount("edhrecsalt>50")).toBe(saltMatchCount("salt>50"));
  });
});

// ---------------------------------------------------------------------------
// Spec 136: Nullable face fields

// ---------------------------------------------------------------------------

describe("Spec 136: nullable face fields", () => {
  test("pow=null matches faces without power (e.g. Lightning Bolt)", () => {
    // Non-creatures: Bolt, Counterspell, Sol Ring, Azorius Charm, Dismember = 5 cards
    expect(matchCount("pow=null")).toBe(5);
  });

  test("pow!=null matches faces with power", () => {
    expect(matchCount("pow!=null")).toBe(4);
  });

  test("tou=null matches faces without toughness", () => {
    expect(matchCount("tou=null")).toBe(5);
  });

  test("tou!=null matches faces with toughness", () => {
    expect(matchCount("tou!=null")).toBe(4);
  });

  test("loy=null matches faces without loyalty (all planeswalkers have loyalty; TEST_DATA has all null)", () => {
    expect(matchCount("loy=null")).toBe(9);
  });

  test("def=null matches faces without defense (all in TEST_DATA)", () => {
    expect(matchCount("def=null")).toBe(9);
  });

  test("m=null matches faces with no mana cost (Ayara back face)", () => {
    expect(matchCount("m=null")).toBe(1);
  });

  test("m!=null matches faces with mana cost", () => {
    // All 9 cards have at least one face with mana cost (Ayara front has mana)
    expect(matchCount("m!=null")).toBe(9);
  });

  test("edhrec=null matches faces without EDHREC rank (all in TEST_DATA)", () => {
    expect(matchCount("edhrec=null")).toBe(9);
  });

  test("salt=null matches faces without salt score (all in TEST_DATA)", () => {
    expect(matchCount("salt=null")).toBe(9);
  });

  test("pow>null returns error", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("pow>null"));
    expect(result.error).toBe("null cannot be used with comparison operators");
    expect(result.matchCount).toBe(-1);
  });

  test("pow=null OR tou=null matches non-creatures", () => {
    expect(matchCount("pow=null OR tou=null")).toBe(5);
  });

  test("-pow>3 excludes faces without power (operator inversion)", () => {
    expect(matchCount("-pow>3")).toBe(matchCount("pow<=3"));
  });

  test("-pow=null matches faces with power (buffer inversion)", () => {
    expect(matchCount("-pow=null")).toBe(4);
  });

  test("-m:{R} uses buffer inversion (nulls included)", () => {
    // Cards without mana cost (Ayara back) should be in -m:{R} result
    expect(matchCount("-m:{R}")).toBeGreaterThan(0);
  });

  test("-m=null matches faces with mana cost (buffer inversion)", () => {
    expect(matchCount("-m=null")).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// CMC / mana value
// ---------------------------------------------------------------------------
// Row CMC: #0=1, #1=1, #2=2, #3=1, #4=2, #5=2, #6=2, #7=3, #8=0, #9=3

describe("cmc / mana value", () => {
  test("cmc:2 matches rows with mana value exactly 2", () => {
    expect(matchCount("cmc:2")).toBe(4);
  });

  test("cmc>2 matches mana value > 2", () => {
    expect(matchCount("cmc>2")).toBe(2);
  });

  test("cmc>=2 matches mana value >= 2", () => {
    expect(matchCount("cmc>=2")).toBe(6);
  });

  test("cmc<2 matches mana value < 2", () => {
    expect(matchCount("cmc<2")).toBe(4);
  });

  test("cmc<=1 matches mana value <= 1", () => {
    expect(matchCount("cmc<=1")).toBe(4);
  });

  test("cmc!=2 matches all cards except mana value 2", () => {
    expect(matchCount("cmc!=2")).toBe(5);
  });

  test("mv: and manavalue: are aliases for cmc:", () => {
    expect(matchCount("mv:2")).toBe(4);
    expect(matchCount("manavalue:2")).toBe(4);
    expect(matchCount("mv>2")).toBe(2);
  });

  test("non-numeric value matches nothing", () => {
    expect(matchCount("cmc:abc")).toBe(0);
  });

  test("cmc:0 matches only the back face with empty mana cost", () => {
    expect(matchCount("cmc:0")).toBe(1);
  });

  test("Dismember {1}{B/P}{B/P} has cmc 3", () => {
    expect(matchCount("cmc:3")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cache hit/miss behavior
// ---------------------------------------------------------------------------

describe("cache hit/miss", () => {
  test("first evaluation returns cached: false on all nodes", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("c:wu"));
    expect(result.cached).toBe(false);
  });

  test("shared subtree is cached on second evaluation", () => {
    const cache = new NodeCache(index);
    cache.evaluate(parse("c:wu t:creature"));
    const { result } = cache.evaluate(parse("c:wu t:elf"));
    const cwu = result.children!.find(
      c => c.node.type === "FIELD" && c.node.field === "c"
    );
    expect(cwu).toBeDefined();
    expect(cwu!.cached).toBe(true);
    const tElf = result.children!.find(
      c => c.node.type === "FIELD" && c.node.field === "t"
    );
    expect(tElf).toBeDefined();
    expect(tElf!.cached).toBe(false);
  });

  test("integration: overlapping queries c:r t:creature then c:r t:elf", () => {
    const cache = new NodeCache(index);
    const first = cache.evaluate(parse("c:r t:creature"));
    expect(first.result.cached).toBe(false);
    for (const child of first.result.children!) {
      expect(child.cached).toBe(false);
    }

    const second = cache.evaluate(parse("c:r t:elf"));
    const cr = second.result.children!.find(
      c => c.node.type === "FIELD" && c.node.field === "c"
    );
    expect(cr!.cached).toBe(true);
    expect(cr!.matchCount).toBe(2);

    const tElf = second.result.children!.find(
      c => c.node.type === "FIELD" && c.node.field === "t"
    );
    expect(tElf!.cached).toBe(false);
  });

  test("exact same query on second call returns cached on all nodes", () => {
    const cache = new NodeCache(index);
    cache.evaluate(parse("c:g t:creature"));
    const { result } = cache.evaluate(parse("c:g t:creature"));
    expect(result.cached).toBe(true);
    for (const child of result.children!) {
      expect(child.cached).toBe(true);
    }
  });

  test("separate NodeCache instances share no state", () => {
    const cache1 = new NodeCache(index);
    cache1.evaluate(parse("c:wu"));
    const cache2 = new NodeCache(index);
    const { result } = cache2.evaluate(parse("c:wu"));
    expect(result.cached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

describe("timing", () => {
  test("productionMs and evalMs are non-negative", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("c:wu t:creature"));
    expect(result.productionMs).toBeGreaterThanOrEqual(0);
    expect(result.evalMs).toBeGreaterThanOrEqual(0);
    for (const child of result.children!) {
      expect(child.productionMs).toBeGreaterThanOrEqual(0);
      expect(child.evalMs).toBeGreaterThanOrEqual(0);
    }
  });

  test("cached node has evalMs of zero", () => {
    const cache = new NodeCache(index);
    cache.evaluate(parse("c:wu"));
    const { result } = cache.evaluate(parse("c:wu t:creature"));
    const cwu = result.children!.find(
      c => c.node.type === "FIELD" && c.node.field === "c"
    );
    expect(cwu!.cached).toBe(true);
    expect(cwu!.evalMs).toBe(0);
    expect(cwu!.productionMs).toBeGreaterThanOrEqual(0);
  });

  test("freshly computed node has evalMs approximately equal to productionMs", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("c:wu"));
    expect(result.evalMs).toBe(result.productionMs);
  });
});

// ---------------------------------------------------------------------------
// Tilde self-reference (Spec 020)
// ---------------------------------------------------------------------------

describe("tilde self-reference", () => {
  test("o:~ matches cards with any self-reference", () => {
    expect(matchCount("o:~")).toBe(3); // Bolt, Tarmogoyf, Ayara front
  });

  test('o:"~ deals" matches cards with that tilde pattern', () => {
    expect(matchCount('o:"~ deals"')).toBe(2); // Bolt, Ayara front
  });

  test("o:~ does NOT match cards without self-reference", () => {
    const cache = new NodeCache(index);
    const indices = Array.from(cache.evaluate(parse("o:~")).indices);
    expect(indices).not.toContain(0); // Birds
    expect(indices).not.toContain(2); // Counterspell
    expect(indices).not.toContain(3); // Sol Ring
    expect(indices).not.toContain(5); // Azorius Charm
    expect(indices).not.toContain(6); // Thalia
    expect(indices).not.toContain(9); // Dismember
  });

  test("o:flying (no tilde) uses original column, unchanged", () => {
    expect(matchCount("o:flying")).toBe(1);
  });

  test("o:damage (no tilde) is unchanged", () => {
    expect(matchCount("o:damage")).toBe(2);
  });

  test("o:/~ deals \\d+/ regex matches against tilde column", () => {
    expect(matchCount("o:/~ deals \\d+/")).toBe(1);
  });

  test("o:/damage/ regex without tilde uses original column", () => {
    expect(matchCount("o:/damage/")).toBe(2);
  });

  test("indices for o:~ contains expected cards", () => {
    const cache = new NodeCache(index);
    const indices = Array.from(cache.evaluate(parse("o:~")).indices);
    expect(indices).toEqual([1, 4, 7]);
  });

  test("o:~ does NOT match when tilde is only inside reminder text", () => {
    const cache = new NodeCache(index);
    const indices = Array.from(cache.evaluate(parse("o:~")).indices);
    expect(indices).not.toContain(0); // Birds: ~ only in "(~ can't be blocked…)"
  });
});

// ---------------------------------------------------------------------------
// Reminder text stripping
// ---------------------------------------------------------------------------

describe("reminder text stripping", () => {
  test("o:flying still matches (keyword is outside reminder text)", () => {
    expect(matchCount("o:flying")).toBe(1);
  });

  test("o:reach does NOT match (only in reminder text)", () => {
    expect(matchCount("o:reach")).toBe(0);
  });

  test("o:blocked does NOT match (only in reminder text)", () => {
    expect(matchCount("o:blocked")).toBe(0);
  });

  test("o:damage is unchanged (no reminder text involved)", () => {
    expect(matchCount("o:damage")).toBe(2);
  });

  test("o:target is unchanged (all occurrences outside reminder text)", () => {
    expect(matchCount("o:target")).toBe(4);
  });

  test("o:/reach/ regex does NOT match reminder text", () => {
    expect(matchCount("o:/reach/")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Spec 111: Alternate names (printed_name, flavor_name)
// ---------------------------------------------------------------------------

describe("alternate names (Spec 111)", () => {
  // Bolt (face 1) has alternate name "chain lightning variant"
  // Sol Ring (face 3) has alternate name "sol ring godzilla"
  const altData = {
    ...TEST_DATA,
    alternate_names_index: {
      chainlightningvariant: 1,  // maps to Lightning Bolt's canonical face
      solringgodzilla: 3,        // maps to Sol Ring's canonical face
    },
  };
  const altIndex = new CardIndex(altData);
  function altMatchCount(query: string): number {
    const cache = new NodeCache(altIndex);
    return cache.evaluate(parse(query)).result.matchCount;
  }

  test("bare word matches alternate name", () => {
    expect(altMatchCount("chainlightningvariant")).toBe(1);
  });

  test("bare word substring matches alternate name", () => {
    expect(altMatchCount("chainlightning")).toBe(1);
  });

  test("exact name matches alternate name", () => {
    expect(altMatchCount('!"Chain Lightning Variant"')).toBe(1);
  });

  test("exact name is case-insensitive for alternate names", () => {
    expect(altMatchCount('!"chain lightning variant"')).toBe(1);
  });

  test("bare word matches godzilla-style alternate name", () => {
    expect(altMatchCount("solringgodzilla")).toBe(1);
  });

  test("alternate name does not match when query is unrelated", () => {
    expect(altMatchCount("nonexistentcard")).toBe(0);
  });

  test("primary name still works alongside alternate names", () => {
    expect(altMatchCount("Lightning Bolt")).toBe(1);
    expect(altMatchCount('!"Lightning Bolt"')).toBe(1);
  });
});
