// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache, nodeKey } from "./evaluator";
import { parse } from "./parser";
import { index, matchCount } from "./evaluator.test-fixtures";

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

  test("exact name with !", () => {
    expect(matchCount('!"Lightning Bolt"')).toBe(1);
    expect(matchCount("!bolt")).toBe(0);
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
  // Combined name search (Spec 018)
  // -------------------------------------------------------------------------

  test("unquoted bare word matches normalized combined name across face boundary", () => {
    expect(matchCount("realmayara")).toBe(1);
  });

  test("unquoted bare word still matches single-face cards via normalized name", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("lightningbolt")).toBe(1);
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
