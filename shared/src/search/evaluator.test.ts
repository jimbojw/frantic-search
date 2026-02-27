// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache, nodeKey } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, Format, CardFlag } from "../bits";
import type { ColumnarData } from "../data";

// ---------------------------------------------------------------------------
// Synthetic card pool (9 cards = 10 face rows)
// ---------------------------------------------------------------------------
// Row #0  Birds of Paradise (front)  | G  | Creature — Elf               | pow=0
// Row #1  Lightning Bolt             | R  | Instant                      | -
// Row #2  Counterspell               | U  | Instant                      | -
// Row #3  Sol Ring                   | -  | Artifact                     | -
// Row #4  Tarmogoyf                  | G  | Creature — Lhurgoyf          | pow=*
// Row #5  Azorius Charm              | WU | Instant                      | -
// Row #6  Thalia, Guardian           | W  | Legendary Creature — Human   | pow=2
// Row #7  Ayara, Widow (front)       | B  | Legendary Creature — Elf Noble     | pow=3
// Row #8  Ayara, Furnace Queen (back)| BR | Legendary Creature — Phyrexian Elf | pow=4
// Row #9  Dismember                  | B  | Instant                      | -
//
// Ayara is a transform DFC: rows 7+8 share canonical_face=7.

const powerDict = ["", "0", "*", "2", "3", "4"];
const toughnessDict = ["", "1", "1+*", "3", "4"];

const TEST_DATA: ColumnarData = {
  names:          ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm", "Ayara, Furnace Queen", "Dismember"],
  combined_names: ["Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf", "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Dismember"],
  mana_costs:     ["{G}", "{R}", "{U}{U}", "{1}", "{1}{G}", "{W}{U}", "{1}{W}", "{1}{B}{B}", "", "{1}{B/P}{B/P}"],
  oracle_texts:   [
    "Flying (This creature can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "Lightning Bolt deals 3 damage to any target.",
    "Counter target spell.",
    "{T}: Add {C}{C}.",
    "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "Choose one —",
    "First strike\nNoncreature spells cost {1} more to cast.",
    "{T}, Sacrifice another creature or artifact: Ayara deals X damage to target opponent.",
    "At the beginning of combat on your turn, return up to one target artifact or creature card from your graveyard to the battlefield.",
    "Target creature gets -5/-5 until end of turn.",
  ],
  oracle_texts_tilde: [
    "Flying (~ can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "~ deals 3 damage to any target.",
    "",
    "",
    "~'s power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "",
    "",
    "{T}, Sacrifice another creature or artifact: ~ deals X damage to target opponent.",
    "",
    "",
  ],
  colors:         [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black, Color.Black | Color.Red, Color.Black],
  color_identity: [Color.Green, Color.Red, Color.Blue, 0, Color.Green, Color.White | Color.Blue, Color.White, Color.Black | Color.Red, Color.Black | Color.Red, Color.Black],
  type_lines:     [
    "Creature — Elf",
    "Instant",
    "Instant",
    "Artifact",
    "Creature — Lhurgoyf",
    "Instant",
    "Legendary Creature — Human Soldier",
    "Legendary Creature — Elf Noble",
    "Legendary Creature — Phyrexian Elf Noble",
    "Instant",
  ],
  powers:         [1, 0, 0, 0, 2, 0, 3, 4, 5, 0],   // indices into powerDict
  toughnesses:    [1, 0, 0, 0, 2, 0, 3, 3, 4, 0],   // indices into toughnessDict
  loyalties:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  defenses:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_legal: [
    Format.Commander | Format.Legacy,                   // #0 Birds
    Format.Commander | Format.Legacy | Format.Modern,   // #1 Bolt
    Format.Commander | Format.Legacy,                   // #2 Counterspell
    Format.Commander | Format.Vintage,                  // #3 Sol Ring
    Format.Commander | Format.Legacy | Format.Modern,   // #4 Tarmogoyf
    Format.Commander | Format.Pioneer,                  // #5 Azorius Charm
    Format.Commander | Format.Legacy | Format.Modern,   // #6 Thalia
    Format.Commander | Format.Legacy | Format.Modern,   // #7 Ayara front (card-level, duplicated)
    Format.Commander | Format.Legacy | Format.Modern,   // #8 Ayara back  (card-level, duplicated)
    Format.Commander | Format.Legacy | Format.Modern,   // #9 Dismember
  ],
  legalities_banned: [
    0, 0, 0,
    Format.Legacy,    // #3 Sol Ring
    0, 0, 0, 0, 0, 0,
  ],
  legalities_restricted: [
    0, 0, 0,
    Format.Vintage,   // #3 Sol Ring
    0, 0, 0, 0, 0, 0,
  ],
  card_index:     [0, 1, 2, 3, 4, 5, 6, 7, 7, 8],
  canonical_face: [0, 1, 2, 3, 4, 5, 6, 7, 7, 9],
  scryfall_ids:           ["", "", "", "", "", "", "", "", "", ""],
  art_crop_thumb_hashes:  ["", "", "", "", "", "", "", "", "", ""],
  card_thumb_hashes:      ["", "", "", "", "", "", "", "", "", ""],
  layouts:        ["normal", "normal", "normal", "normal", "normal", "normal", "normal", "transform", "transform", "normal"],
  flags:          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  power_lookup:    powerDict,
  toughness_lookup: toughnessDict,
  loyalty_lookup:  [""],
  defense_lookup:  [""],
};

const index = new CardIndex(TEST_DATA);

function matchCount(query: string): number {
  const cache = new NodeCache(index);
  return cache.evaluate(parse(query)).result.matchCount;
}

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
    // field "ab" + value "cd" vs field "a" + value "bcd"
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
    // toughnessDict = ["", "1", "1+*", "3", "4"]
    // Row 0 Birds: tou=1, Row 4 Tarmogoyf: tou=1+*→1, Row 6 Thalia: tou=3(!?)
    // Actually: Row 0 Birds tou idx 1 → "1", Row 4 Tarmogoyf tou idx 2 → "1+*" → 1
    // tou=1 matches Birds (1) + Tarmogoyf (1+* → 1)
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
    const { result } = cache.evaluate(parse("rarity:common"));
    expect(result.error).toBe('unknown field "rarity"');
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
    // Ayara front: pow=3, tou=3. Ayara back: pow=4, tou=4.
    // pow>=4 matches back face, but no face has tou<=2 → still 0
    expect(matchCount("pow>=4 tou<=2")).toBe(0);
  });

  test("DFC card-level color match", () => {
    // c:r matches Ayara back (BR) → canonical 7. t:elf matches Ayara front+back → canonical 7. AND → 7.
    expect(matchCount("c:r t:elf")).toBe(1);
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("c:r t:elf"));
    expect(Array.from(indices)).toEqual([7]);
  });

  test("identity: colon uses subset semantics (fits in a commander deck)", () => {
    // identity:wu → cards whose identity ⊆ {W,U}: Counterspell(U), Sol Ring(∅), Azorius(WU), Thalia(W)
    expect(matchCount("id:wu")).toBe(4);
    // identity:w → Thalia(W), Sol Ring(∅)
    expect(matchCount("id:w")).toBe(2);
    // identity:br → Bolt(R), Sol Ring(∅), Ayara(BR), Dismember(B)
    expect(matchCount("id:br")).toBe(4);
  });

  test("identity: explicit >= still uses superset semantics", () => {
    // identity>=wu → cards whose identity ⊇ {W,U}: only Azorius Charm (WU)
    expect(matchCount("id>=wu")).toBe(1);
    // identity>=w → Azorius(WU) + Thalia(W)
    expect(matchCount("id>=w")).toBe(2);
  });

  test("identity: subset combined with type narrows correctly", () => {
    // id:br t:elf → Ayara(BR, Elf) — ⊆ {B,R}
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
    // "realmayara" spans the boundary between "Realm" and "Ayara" in
    // "Ayara, Widow of the Realm // Ayara, Furnace Queen"
    // Normalized: "ayarawidowoftherealmayarafurnacequeen" contains "realmayara"
    expect(matchCount("realmayara")).toBe(1); // one card (DFC)
  });

  test("unquoted bare word still matches single-face cards via normalized name", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("lightningbolt")).toBe(1);
  });

  test("quoted bare word matches literal combined name", () => {
    // Quoted " // " matches the literal combined name "Ayara, Widow of the Realm // Ayara, Furnace Queen"
    expect(matchCount('" // "')).toBe(1); // one card (DFC)
  });

  test("quoted bare word does not match normalized form", () => {
    // "realmayara" does not appear literally in "Ayara, Widow of the Realm // Ayara, Furnace Queen"
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
    // name:widow matches both faces (combined name contains "widow")
    // pow>=4 matches only back face (pow=4)
    // Before 018: name:widow only matched face 7 (front), which has pow=3, so no match
    // After 018: name:widow matches face 8 too (combined name), which has pow=4 → match
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
// oracle_texts_tilde values for test data:
//   #0 Birds:     "Flying (~ can't be blocked …)\n{T}: Add one mana of any color."  (~ only in reminder text)
//   #1 Bolt:      "~ deals 3 damage to any target."
//   #2 Counter:   ""
//   #3 Sol Ring:  ""
//   #4 Tarmogoyf: "~'s power is equal to …"
//   #5 Azorius:   ""
//   #6 Thalia:    ""
//   #7 Ayara (F): "{T}, Sacrifice another creature or artifact: ~ deals X damage to target opponent."
//   #8 Ayara (B): ""
//   #9 Dismember: ""

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
    // Row 1: "~ deals 3 damage" → matches \d+
    // Row 7: "~ deals X damage" → X is not \d+
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
// Scryfall ignores reminder text (parenthesized text) when matching o: queries.
// Birds of Paradise now has:
//   "Flying (This creature can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color."
// After stripping: "Flying \n{T}: Add one mana of any color."

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
// is: operator (Spec 032)
// ---------------------------------------------------------------------------
// Extended pool adds cards to exercise is: keywords.
//
// Row #0  Birds of Paradise       | G  | Creature — Elf                          | pow=0  | normal
// Row #1  Lightning Bolt          | R  | Instant                                 | -      | normal
// Row #2  Counterspell            | U  | Instant                                 | -      | normal
// Row #3  Sol Ring                | -  | Artifact                                | -      | normal
// Row #4  Tarmogoyf               | G  | Creature — Lhurgoyf                     | pow=*  | normal
// Row #5  Azorius Charm           | WU | Instant                                 | -      | normal
// Row #6  Thalia, Guardian        | W  | Legendary Creature — Human Soldier      | pow=2  | normal
// Row #7  Ayara, Widow (front)    | B  | Legendary Creature — Elf Noble          | pow=3  | transform
// Row #8  Ayara, Furnace (back)   | BR | Legendary Creature — Phyrexian Elf Noble| pow=4  | transform
// Row #9  Dismember               | B  | Instant                                 | -      | normal
// --- new rows ---
// Row #10 Grizzly Bears           | G  | Creature — Bear                         | pow=2 tou=2 cmc=2 | normal
// Row #11 Runeclaw Bear           | G  | Creature — Bear                         | pow=2 tou=2 cmc=2 | normal  (vanilla)
// Row #12 Slippery Bogle          | GU | Creature — Beast                        | pow=1 tou=1 cmc=1 | normal  (french vanilla: hexproof)
// Row #13 Rograkh (front)         | R  | Legendary Creature — Kobold Warrior     | pow=0 tou=1 cmc=0 | normal  (partner)
// Row #14 Halana and Alena        | RG | Legendary Creature — Human Ranger       | pow=2 tou=3 cmc=4 | normal  (companion-like text: "can be your commander")
// Row #15 Lurrus (companion)      | WB | Legendary Creature — Cat Nightmare      | pow=3 tou=2 cmc=3 | normal  (companion)
// Row #16 Murderous Rider (front) | B  | Creature — Zombie Knight                | pow=2 tou=3 cmc=3 | adventure
// Row #17 Swift End (back)        | B  | Instant — Adventure                     | -      cmc=3      | adventure
// Row #18 Nicol Bolas (front)     | UBR| Legendary Planeswalker — Bolas          | -      cmc=4      | modal_dfc
// Row #19 Nicol Bolas (back)      | UBR| Legendary Creature — Elder Dragon       | -      cmc=7      | modal_dfc
// Row #20 Urza's Saga             | -  | Enchantment — Urza's Saga               | -      cmc=0      | saga
// Row #21 Delver of Secrets (f)   | U  | Creature — Human Wizard                 | pow=1 tou=1 cmc=1 | transform
// Row #22 Insectile Aberration (b)| U  | Creature — Human Insect                 | pow=3 tou=2 cmc=0 | transform
// Row #23 Gisela (meld front)     | W  | Legendary Creature — Angel Horror       | pow=4 tou=3 cmc=4 | meld
// Row #24 Stoneforge Mystic       | W  | Creature — Kor Artificer                | pow=1 tou=2 cmc=2 | normal  (french vanilla: NO — has non-keyword text)
// Row #25 Akroma, Angel of Wrath  | W  | Legendary Creature — Angel              | pow=6 tou=6 cmc=8 | normal  (french vanilla: flying, first strike, vigilance, trample, haste, protection from black and from red)
// Row #26 Incubation // Incongruity| GU | Sorcery // Instant                     | -      cmc=1      | split
// --- flags + land cycle rows ---
// Row #27 Underground Sea          | -  | Land — Island Swamp                     | -      cmc=0      | normal  flags=Reserved
// Row #28 Steamflogger Boss        | R  | Creature — Goblin Rigger                | pow=3 tou=3 cmc=4 | normal  flags=Funny
// Row #29 Gandalf the Grey         | -  | Legendary Creature — Avatar Wizard      | pow=3 tou=4 cmc=5 | normal  flags=UniversesBeyond
// Row #30 Steam Vents              | -  | Land — Island Mountain                  | -      cmc=0      | normal  (shockland)
// Row #31 Scalding Tarn            | -  | Land                                    | -      cmc=0      | normal  (fetchland)
// --- Spec 040: extended is: keywords ---
// Row #32 Temple of Triumph        | -  | Land                                    | -      cmc=0      | normal  (scryland)
// Row #33 Irrigated Farmland       | -  | Land — Plains Island                    | -      cmc=0      | normal  (bikeland)
// Row #34 Indatha Triome           | -  | Land — Plains Swamp Forest              | -      cmc=0      | normal  (triome)
// Row #35 Hybrid-Phyrexian Test    | GW | Creature — Elf                          | pow=2 tou=2 cmc=2 | normal  (mana: {1}{G/W/P})
// Row #36 Blinding Souleater       | -  | Artifact Creature — Cleric              | pow=1 tou=3 cmc=3 | normal  (oracle has {W/P} — Phyrexian in text only)
// Row #37 Oracle Hybrid Test       | -  | Creature — Elf                          | pow=1 tou=1 cmc=1 | normal  (oracle has {G/U} — hybrid in text only)

const isExtPowerDict = ["", "0", "*", "2", "3", "4", "1", "6"];
const isExtToughnessDict = ["", "1", "1+*", "3", "4", "2", "6"];

const IS_TEST_DATA: ColumnarData = {
  names: [
    "Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf",
    "Azorius Charm", "Thalia, Guardian of Thraben", "Ayara, Widow of the Realm", "Ayara, Furnace Queen", "Dismember",
    "Grizzly Bears", "Runeclaw Bear", "Slippery Bogle", "Rograkh, Son of Rohgahh",
    "Halana and Alena, Partners", "Lurrus of the Dream-Den",
    "Murderous Rider", "Swift End",
    "Nicol Bolas, Dragon-God", "Nicol Bolas, the Arisen",
    "Urza's Saga",
    "Delver of Secrets", "Insectile Aberration",
    "Gisela, the Broken Blade",
    "Stoneforge Mystic",
    "Akroma, Angel of Wrath",
    "Incubation // Incongruity",
    "Underground Sea", "Steamflogger Boss", "Gandalf the Grey",
    "Steam Vents", "Scalding Tarn",
    "Temple of Triumph", "Irrigated Farmland", "Indatha Triome", "Hybrid-Phyrexian Test",
    "Blinding Souleater", "Oracle Hybrid Test",
  ],
  combined_names: [
    "Birds of Paradise", "Lightning Bolt", "Counterspell", "Sol Ring", "Tarmogoyf",
    "Azorius Charm", "Thalia, Guardian of Thraben",
    "Ayara, Widow of the Realm // Ayara, Furnace Queen", "Ayara, Widow of the Realm // Ayara, Furnace Queen",
    "Dismember",
    "Grizzly Bears", "Runeclaw Bear", "Slippery Bogle", "Rograkh, Son of Rohgahh",
    "Halana and Alena, Partners", "Lurrus of the Dream-Den",
    "Murderous Rider // Swift End", "Murderous Rider // Swift End",
    "Nicol Bolas, Dragon-God // Nicol Bolas, the Arisen", "Nicol Bolas, Dragon-God // Nicol Bolas, the Arisen",
    "Urza's Saga",
    "Delver of Secrets // Insectile Aberration", "Delver of Secrets // Insectile Aberration",
    "Gisela, the Broken Blade",
    "Stoneforge Mystic",
    "Akroma, Angel of Wrath",
    "Incubation // Incongruity",
    "Underground Sea", "Steamflogger Boss", "Gandalf the Grey",
    "Steam Vents", "Scalding Tarn",
    "Temple of Triumph", "Irrigated Farmland", "Indatha Triome", "Hybrid-Phyrexian Test",
    "Blinding Souleater", "Oracle Hybrid Test",
  ],
  mana_costs: [
    "{G}", "{R}", "{U}{U}", "{1}", "{1}{G}",
    "{W}{U}", "{1}{W}", "{1}{B}{B}", "", "{1}{B/P}{B/P}",
    "{1}{G}", "{1}{G}", "{G}{U}", "{0}",
    "{2}{R}{G}", "{1}{W}{B}",
    "{1}{B}{B}", "{2}{B}",
    "{1}{U}{B}{R}", "{4}{U}{B}{R}",
    "",
    "{U}", "",
    "{2}{W}{W}",
    "{1}{W}",
    "{5}{W}{W}{W}",
    "{G/U}",
    "", "{2}{R}{R}", "{3}{U}{U}",
    "", "",
    "", "", "", "{1}{G/W/P}",
    "{3}", "{G}",
  ],
  oracle_texts: [
    "Flying (This creature can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "Lightning Bolt deals 3 damage to any target.",
    "Counter target spell.",
    "{T}: Add {C}{C}.",
    "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is that number plus 1.",
    "Choose one —",
    "First strike\nNoncreature spells cost {1} more to cast.",
    "{T}, Sacrifice another creature or artifact: Ayara deals X damage to target opponent.",
    "At the beginning of combat on your turn, return up to one target artifact or creature card from your graveyard to the battlefield.",
    "Target creature gets -5/-5 until end of turn.",
    "Grizzly Bears can't block alone.",
    "",
    "Hexproof (This creature can't be the target of spells or abilities your opponents control.)",
    "First strike, trample\nPartner",
    "Halana and Alena, Partners can be your commander.",
    "Companion — Each permanent card in your starting deck has mana value 2 or less.\nLifelink",
    "Lifelink",
    "Destroy target creature or planeswalker. You lose 2 life.",
    "+1: You draw a card. Target opponent discards a card.",
    "",
    "{T}: Add {C}.",
    "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
    "Flying",
    "Flying, first strike, lifelink",
    "When Stoneforge Mystic enters the battlefield, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{W}, {T}: You may put an Equipment card from your hand onto the battlefield.",
    "Flying, first strike, vigilance, trample, haste, protection from black and from red",
    "Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.",
    "{T}: Add {U} or {B}.",
    "Steamflogger Boss gets +1/+0 for each other Rigger you control.\nOther Rigger creatures you control have haste.\nIf a Rigger you control would assemble a Contraption, it assembles two Contraptions instead.",
    "Gandalf the Grey enters with three loyalty counters.",
    "As Steam Vents enters the battlefield, you may pay 2 life. If you don't, it enters the battlefield tapped.\n{T}: Add {U} or {R}.",
    "{T}, Pay 1 life, Sacrifice Scalding Tarn: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle.",
    "{T}: Add {R} or {W}.",
    "Cycling {2}\n{T}: Add {W} or {U}.",
    "Cycling {3}\n{T}: Add {W}, {B}, or {G}.",
    "",
    "{W/P}, {T}: Tap target creature.",
    "{G/U}: This creature gets +1/+1 until end of turn.",
  ],
  oracle_texts_tilde: [
    "Flying (~ can't be blocked except by creatures with flying or reach.)\n{T}: Add one mana of any color.",
    "~ deals 3 damage to any target.",
    "", "", "",
    "", "", "", "", "",
    "~ can't block alone.",
    "",
    "Hexproof (~ can't be the target of spells or abilities your opponents control.)",
    "",
    "~ can be your commander.",
    "",
    "", "", "", "", "",
    "", "",
    "",
    "",
    "",
    "",
    "", "", "",
    "", "",
    "{T}: Add {R} or {W}.",
    "Cycling {2}",
    "{T}: Add {W}, {B}, or {G}.",
    "",
    "", "",
  ],
  colors: [
    Color.Green, Color.Red, Color.Blue, 0, Color.Green,
    Color.White | Color.Blue, Color.White, Color.Black, Color.Black | Color.Red, Color.Black,
    Color.Green, Color.Green, Color.Green | Color.Blue, Color.Red,
    Color.Red | Color.Green, Color.White | Color.Black,
    Color.Black, Color.Black,
    Color.Blue | Color.Black | Color.Red, Color.Blue | Color.Black | Color.Red,
    0,
    Color.Blue, Color.Blue,
    Color.White,
    Color.White,
    Color.White,
    Color.Green | Color.Blue,
    0, Color.Red, 0,
    0, 0,
    0, 0, 0, Color.Green | Color.White,
    0, Color.Green,
  ],
  color_identity: [
    Color.Green, Color.Red, Color.Blue, 0, Color.Green,
    Color.White | Color.Blue, Color.White, Color.Black | Color.Red, Color.Black | Color.Red, Color.Black,
    Color.Green, Color.Green, Color.Green | Color.Blue, Color.Red,
    Color.Red | Color.Green, Color.White | Color.Black,
    Color.Black, Color.Black,
    Color.Blue | Color.Black | Color.Red, Color.Blue | Color.Black | Color.Red,
    0,
    Color.Blue, Color.Blue,
    Color.White,
    Color.White,
    Color.White,
    Color.Green | Color.Blue,
    0, Color.Red, 0,
    0, 0,
    0, 0, 0, Color.Green | Color.White,
    0, Color.Green,
  ],
  type_lines: [
    "Creature — Elf",
    "Instant",
    "Instant",
    "Artifact",
    "Creature — Lhurgoyf",
    "Instant",
    "Legendary Creature — Human Soldier",
    "Legendary Creature — Elf Noble",
    "Legendary Creature — Phyrexian Elf Noble",
    "Instant",
    "Creature — Bear",
    "Creature — Bear",
    "Creature — Beast",
    "Legendary Creature — Kobold Warrior",
    "Legendary Creature — Human Ranger",
    "Legendary Creature — Cat Nightmare",
    "Creature — Zombie Knight",
    "Instant — Adventure",
    "Legendary Planeswalker — Bolas",
    "Legendary Creature — Elder Dragon",
    "Enchantment — Urza's Saga",
    "Creature — Human Wizard",
    "Creature — Human Insect",
    "Legendary Creature — Angel Horror",
    "Creature — Kor Artificer",
    "Legendary Creature — Angel",
    "Sorcery",
    "Land — Island Swamp",
    "Creature — Goblin Rigger",
    "Legendary Creature — Avatar Wizard",
    "Land — Island Mountain",
    "Land",
    "Land",
    "Land — Plains Island",
    "Land — Plains Swamp Forest",
    "Creature — Elf",
    "Artifact Creature — Cleric",
    "Creature — Elf",
  ],
  //                              0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37
  powers:      /* dict idx */   [ 1, 0, 0, 0, 2, 0, 3, 4, 5, 0, 3, 3, 6, 1, 3, 4, 3, 0, 0, 0, 0, 6, 4, 5, 6, 7, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 6, 6],
  toughnesses: /* dict idx */   [ 1, 0, 0, 0, 2, 0, 1, 3, 4, 0, 5, 5, 1, 1, 3, 5, 3, 0, 0, 0, 0, 1, 5, 3, 5, 6, 0, 0, 3, 4, 0, 0, 0, 0, 0, 5, 3, 1],
  loyalties:                    [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  defenses:                     [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_legal:             [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_banned:            [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legalities_restricted:        [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  card_index:     [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  canonical_face: [0, 1, 2, 3, 4, 5, 6, 7, 7, 9, 10, 11, 12, 13, 14, 15, 16, 16, 18, 18, 20, 21, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
  scryfall_ids:          Array(38).fill(""),
  art_crop_thumb_hashes: Array(38).fill(""),
  card_thumb_hashes:     Array(38).fill(""),
  layouts: [
    "normal", "normal", "normal", "normal", "normal",
    "normal", "normal", "transform", "transform", "normal",
    "normal", "normal", "normal", "normal",
    "normal", "normal",
    "adventure", "adventure",
    "modal_dfc", "modal_dfc",
    "saga",
    "transform", "transform",
    "meld",
    "normal",
    "normal",
    "split",
    "normal", "normal", "normal",
    "normal", "normal",
    "normal", "normal", "normal", "normal",
    "normal", "normal",
  ],
  flags: [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0,
    0, 0,
    0, 0,
    0,
    0, 0,
    0,
    0,
    0,
    0,
    CardFlag.Reserved, CardFlag.Funny, CardFlag.UniversesBeyond,
    0, 0,
    0, 0, 0, 0,
    0, 0,
  ],
  power_lookup: isExtPowerDict,
  toughness_lookup: isExtToughnessDict,
  loyalty_lookup: [""],
  defense_lookup: [""],
};

const isIndex = new CardIndex(IS_TEST_DATA);

function isMatchCount(query: string): number {
  const cache = new NodeCache(isIndex);
  return cache.evaluate(parse(query)).result.matchCount;
}

function isMatchIndices(query: string): number[] {
  const cache = new NodeCache(isIndex);
  return Array.from(cache.evaluate(parse(query)).indices);
}

describe("is: operator", () => {
  // --- Type/supertype checks ---

  test("is:permanent matches creatures, artifacts, enchantments, planeswalkers, lands", () => {
    const indices = isMatchIndices("is:permanent");
    // Non-permanent single-face cards
    expect(indices).not.toContain(1);  // Lightning Bolt (Instant)
    expect(indices).not.toContain(2);  // Counterspell (Instant)
    expect(indices).not.toContain(5);  // Azorius Charm (Instant)
    expect(indices).not.toContain(9);  // Dismember (Instant)
    expect(indices).not.toContain(26); // Incubation (Sorcery)
    expect(indices).toContain(0);  // Birds (Creature)
    expect(indices).toContain(3);  // Sol Ring (Artifact)
    expect(indices).toContain(16); // Murderous Rider (Creature face of adventure card — card is permanent)
    expect(indices).toContain(18); // Nicol Bolas (Planeswalker)
    expect(indices).toContain(20); // Urza's Saga (Enchantment)
    expect(indices).toContain(27); // Underground Sea (Land)
    expect(indices).toContain(30); // Steam Vents (Land)
  });

  test("is:spell matches non-land cards", () => {
    // 34 total cards - 6 lands (#27, #30, #31, #32, #33, #34)
    expect(isMatchCount("is:spell")).toBe(28);
  });

  test("is:historic matches artifacts, legendaries, and sagas", () => {
    const indices = isMatchIndices("is:historic");
    expect(indices).toContain(3);  // Sol Ring (Artifact)
    expect(indices).toContain(6);  // Thalia (Legendary)
    expect(indices).toContain(7);  // Ayara (Legendary)
    expect(indices).toContain(18); // Nicol Bolas (Legendary)
    expect(indices).toContain(20); // Urza's Saga
    expect(indices).toContain(23); // Gisela (Legendary)
    expect(indices).toContain(25); // Akroma (Legendary)
    expect(indices).not.toContain(1);  // Lightning Bolt
    expect(indices).not.toContain(10); // Grizzly Bears
  });

  test("is:party matches cleric, rogue, warrior, wizard subtypes", () => {
    const indices = isMatchIndices("is:party");
    expect(indices).toContain(13); // Rograkh (Warrior)
    expect(indices).toContain(21); // Delver (Wizard)
    expect(indices).not.toContain(0);  // Birds (Elf)
    expect(indices).not.toContain(10); // Grizzly Bears (Bear)
  });

  test("is:outlaw matches assassin, mercenary, pirate, rogue, warlock subtypes", () => {
    // No outlaws in pool
    expect(isMatchCount("is:outlaw")).toBe(0);
  });

  // --- Layout checks ---

  test("is:transform matches transform layout", () => {
    const indices = isMatchIndices("is:transform");
    expect(indices).toContain(7);  // Ayara
    expect(indices).toContain(21); // Delver
    expect(indices).not.toContain(18); // Nicol Bolas (modal_dfc)
    expect(isMatchCount("is:transform")).toBe(2);
  });

  test("is:modal and is:mdfc match modal_dfc layout", () => {
    expect(isMatchCount("is:modal")).toBe(1);   // Nicol Bolas
    expect(isMatchCount("is:mdfc")).toBe(1);
    expect(isMatchIndices("is:modal")).toEqual(isMatchIndices("is:mdfc"));
  });

  test("is:dfc matches transform, modal_dfc, and meld", () => {
    const indices = isMatchIndices("is:dfc");
    expect(indices).toContain(7);  // Ayara (transform)
    expect(indices).toContain(21); // Delver (transform)
    expect(indices).toContain(18); // Nicol Bolas (modal_dfc)
    expect(indices).toContain(23); // Gisela (meld)
    expect(indices).not.toContain(16); // Murderous Rider (adventure)
    expect(indices).not.toContain(26); // Incubation (split)
  });

  test("is:meld matches meld layout", () => {
    const indices = isMatchIndices("is:meld");
    expect(indices).toEqual([23]); // Gisela
  });

  test("is:adventure matches adventure layout", () => {
    const indices = isMatchIndices("is:adventure");
    expect(indices).toContain(16); // Murderous Rider (canonical face)
    expect(isMatchCount("is:adventure")).toBe(1);
  });

  test("is:split matches split layout", () => {
    const indices = isMatchIndices("is:split");
    expect(indices).toEqual([26]); // Incubation // Incongruity
  });

  test("is:leveler matches leveler layout (none in pool)", () => {
    expect(isMatchCount("is:leveler")).toBe(0);
  });

  test("is:flip matches flip layout (none in pool)", () => {
    expect(isMatchCount("is:flip")).toBe(0);
  });

  // --- Oracle text checks ---

  test("is:vanilla matches cards with empty oracle text", () => {
    const indices = isMatchIndices("is:vanilla");
    // Row 11: Runeclaw Bear has empty oracle text
    // Row 19: Nicol Bolas back has empty oracle text → canonical 18
    expect(indices).toContain(11);
    expect(indices).toContain(18);
    expect(indices).not.toContain(10); // Grizzly Bears has non-empty text
  });

  test("is:commander matches legendary creatures and planeswalkers", () => {
    const indices = isMatchIndices("is:commander");
    expect(indices).toContain(6);  // Thalia (Legendary Creature)
    expect(indices).toContain(7);  // Ayara (Legendary Creature)
    expect(indices).toContain(13); // Rograkh (Legendary Creature)
    expect(indices).toContain(14); // Halana and Alena — has "can be your commander"
    expect(indices).toContain(15); // Lurrus (Legendary Creature)
    expect(indices).toContain(18); // Nicol Bolas (Legendary Planeswalker / Legendary Creature)
    expect(indices).toContain(23); // Gisela (Legendary Creature)
    expect(indices).toContain(25); // Akroma (Legendary Creature)
    expect(indices).not.toContain(0);  // Birds (non-legendary creature)
    expect(indices).not.toContain(3);  // Sol Ring (Artifact, not legendary creature)
  });

  test("is:brawler is an alias for is:commander", () => {
    expect(isMatchIndices("is:brawler")).toEqual(isMatchIndices("is:commander"));
  });

  test("is:companion matches cards with Companion keyword", () => {
    const indices = isMatchIndices("is:companion");
    expect(indices).toContain(15); // Lurrus
    expect(indices).not.toContain(6);  // Thalia
    expect(isMatchCount("is:companion")).toBe(1);
  });

  test("is:partner matches cards with Partner keyword", () => {
    const indices = isMatchIndices("is:partner");
    expect(indices).toContain(13); // Rograkh (has "Partner" as keyword line)
    expect(indices).not.toContain(14); // Halana — name contains "Partners" but no Partner keyword
    expect(isMatchCount("is:partner")).toBe(1);
  });

  // --- Stat checks ---

  test("is:bear matches 2/2 creatures with cmc 2", () => {
    const indices = isMatchIndices("is:bear");
    expect(indices).toContain(10); // Grizzly Bears: Creature, pow=2, tou=2, cmc=2
    expect(indices).toContain(11); // Runeclaw Bear: Creature, pow=2, tou=2, cmc=2
    expect(indices).toContain(35); // Hybrid-Phyrexian Test: Creature, pow=2, tou=2, cmc=2
    expect(indices).not.toContain(6);  // Thalia: pow=2, tou=1 (not 2/2)
    expect(indices).not.toContain(24); // Stoneforge: pow=1, tou=2 (not 2/2)
    expect(isMatchCount("is:bear")).toBe(3);
  });

  // --- French vanilla ---

  test("is:frenchvanilla matches creatures with only keyword abilities", () => {
    const indices = isMatchIndices("is:frenchvanilla");
    expect(indices).toContain(12); // Slippery Bogle: "Hexproof" (after reminder strip)
    expect(indices).toContain(16); // Murderous Rider: "Lifelink"
    expect(indices).toContain(21); // Delver (via Insectile Aberration back face: "Flying")
    expect(indices).toContain(23); // Gisela: "Flying, first strike, lifelink"
    expect(indices).toContain(25); // Akroma: "Flying, first strike, vigilance, trample, haste, protection from black and from red"
    expect(indices).not.toContain(11); // Runeclaw Bear: empty text (that's vanilla, not french vanilla)
    expect(indices).not.toContain(24); // Stoneforge: has non-keyword text
    expect(indices).not.toContain(6);  // Thalia: "First strike\nNoncreature spells cost {1} more to cast." — second line is not a keyword
  });

  test("is:frenchvanilla does not match non-creatures", () => {
    const indices = isMatchIndices("is:frenchvanilla");
    expect(indices).not.toContain(3);  // Sol Ring (Artifact)
    expect(indices).not.toContain(1);  // Lightning Bolt (Instant)
  });

  // --- Edge cases ---

  test("unknown is: value produces error", () => {
    const cache = new NodeCache(index);
    const nonsense = cache.evaluate(parse("is:nonsense")).result;
    expect(nonsense.error).toBe('unknown keyword "nonsense"');
    expect(nonsense.matchCount).toBe(-1);

    const cache2 = new NodeCache(index);
    const foil = cache2.evaluate(parse("is:foil")).result;
    expect(foil.error).toBe('unsupported keyword "foil"');
    expect(foil.matchCount).toBe(-1);
  });

  test("is: with comparison operators matches zero cards", () => {
    expect(isMatchCount("is>spell")).toBe(0);
    expect(isMatchCount("is<commander")).toBe(0);
    expect(isMatchCount("is>=vanilla")).toBe(0);
    expect(isMatchCount("is!=bear")).toBe(0);
  });

  test("is= works same as is:", () => {
    expect(isMatchCount("is=spell")).toBe(isMatchCount("is:spell"));
    expect(isMatchCount("is=commander")).toBe(isMatchCount("is:commander"));
  });

  test("negation -is:spell works", () => {
    // is:spell matches 28 (34 total cards - 6 lands), so -is:spell matches 6
    expect(isMatchCount("-is:spell")).toBe(6);
  });

  test("negation -is:permanent excludes permanents", () => {
    const indices = isMatchIndices("-is:permanent");
    expect(indices).toContain(1);  // Lightning Bolt
    expect(indices).toContain(2);  // Counterspell
    expect(indices).toContain(26); // Incubation (Sorcery)
    expect(indices).not.toContain(0);  // Birds (Creature)
    expect(indices).not.toContain(3);  // Sol Ring (Artifact)
  });

  test("is:commander combined with color filter", () => {
    // Legendary creatures/PWs that are white
    const indices = isMatchIndices("is:commander c:w");
    expect(indices).toContain(6);  // Thalia
    expect(indices).toContain(23); // Gisela
    expect(indices).toContain(25); // Akroma
    expect(indices).not.toContain(7); // Ayara (black, not white)
  });

  test("is:bear combined with color filter", () => {
    expect(isMatchCount("is:bear c:g")).toBe(3); // Grizzly Bears, Runeclaw Bear, Hybrid-Phyrexian Test
    expect(isMatchCount("is:bear c:r")).toBe(0);
  });

  test("is: is case-insensitive on the value", () => {
    expect(isMatchCount("is:Spell")).toBe(isMatchCount("is:spell"));
    expect(isMatchCount("is:COMMANDER")).toBe(isMatchCount("is:commander"));
    expect(isMatchCount("is:Transform")).toBe(isMatchCount("is:transform"));
  });

  test("layout keywords produce one result per DFC card", () => {
    const indices = isMatchIndices("is:transform");
    expect(indices).toContain(7);  // Ayara (canonical face)
    expect(indices).toContain(21); // Delver (canonical face)
    expect(indices).not.toContain(8);  // back face never in results
    expect(indices).not.toContain(22); // back face never in results
  });

  // --- Flag checks ---

  test("is:reserved matches cards with Reserved flag", () => {
    const indices = isMatchIndices("is:reserved");
    expect(indices).toEqual([27]); // Underground Sea
  });

  test("is:funny matches cards with Funny flag", () => {
    const indices = isMatchIndices("is:funny");
    expect(indices).toEqual([28]); // Steamflogger Boss
  });

  test("is:universesbeyond matches cards with UniversesBeyond flag", () => {
    const indices = isMatchIndices("is:universesbeyond");
    expect(indices).toEqual([29]); // Gandalf the Grey
  });

  test("-is:funny excludes funny cards", () => {
    const indices = isMatchIndices("-is:funny");
    expect(indices).not.toContain(28);
    expect(indices).toContain(0); // Birds
    expect(indices.length).toBe(33); // 34 total cards - 1 funny
  });

  // --- Land cycle checks ---

  test("is:shockland matches Steam Vents", () => {
    const indices = isMatchIndices("is:shockland");
    expect(indices).toEqual([30]); // Steam Vents
  });

  test("is:fetchland matches Scalding Tarn", () => {
    const indices = isMatchIndices("is:fetchland");
    expect(indices).toEqual([31]); // Scalding Tarn
  });

  test("is:dual matches Underground Sea", () => {
    const indices = isMatchIndices("is:dual");
    expect(indices).toEqual([27]); // Underground Sea
  });

  test("is:checkland matches nothing in pool (no checklands present)", () => {
    expect(isMatchCount("is:checkland")).toBe(0);
  });

  test("is:fastland matches nothing in pool", () => {
    expect(isMatchCount("is:fastland")).toBe(0);
  });

  test("is:painland matches nothing in pool", () => {
    expect(isMatchCount("is:painland")).toBe(0);
  });

  test("is:slowland matches nothing in pool", () => {
    expect(isMatchCount("is:slowland")).toBe(0);
  });

  test("is:bounceland matches nothing in pool", () => {
    expect(isMatchCount("is:bounceland")).toBe(0);
  });

  test("land cycle combined with is:reserved", () => {
    // Underground Sea is both a dual land and reserved
    expect(isMatchCount("is:dual is:reserved")).toBe(1);
  });

  // --- Extended land cycles (Spec 040) ---

  test("is:scryland matches Temple of Triumph", () => {
    expect(isMatchIndices("is:scryland")).toEqual([32]);
  });

  test("is:bikeland matches Irrigated Farmland", () => {
    expect(isMatchIndices("is:bikeland")).toEqual([33]);
  });

  test("is:cycleland is an alias for is:bikeland", () => {
    expect(isMatchIndices("is:cycleland")).toEqual(isMatchIndices("is:bikeland"));
  });

  test("is:bicycleland is an alias for is:bikeland", () => {
    expect(isMatchIndices("is:bicycleland")).toEqual(isMatchIndices("is:bikeland"));
  });

  test("is:triome matches Indatha Triome", () => {
    expect(isMatchIndices("is:triome")).toEqual([34]);
  });

  test("is:tricycleland is an alias for is:triome", () => {
    expect(isMatchIndices("is:tricycleland")).toEqual(isMatchIndices("is:triome"));
  });

  test("is:trikeland is an alias for is:triome", () => {
    expect(isMatchIndices("is:trikeland")).toEqual(isMatchIndices("is:triome"));
  });

  test("is:karoo is an alias for is:bounceland", () => {
    expect(isMatchCount("is:karoo")).toBe(isMatchCount("is:bounceland"));
  });

  // --- is:hybrid and is:phyrexian (Spec 040) ---

  test("is:hybrid checks mana cost only, not oracle text", () => {
    const indices = isMatchIndices("is:hybrid");
    expect(indices).toContain(26); // Incubation {G/U} in mana cost
    expect(indices).toContain(35); // Hybrid-Phyrexian Test {1}{G/W/P} in mana cost
    expect(indices).not.toContain(37); // Oracle Hybrid Test — {G/U} in oracle text only (not matched)
    expect(indices).not.toContain(9);  // Dismember {1}{B/P}{B/P} — Phyrexian only
    expect(indices).not.toContain(36); // Blinding Souleater — Phyrexian only in oracle
    expect(indices).not.toContain(1);  // Lightning Bolt {R} — no hybrid
  });

  test("is:phyrexian matches cards with Phyrexian mana in cost or oracle text", () => {
    const indices = isMatchIndices("is:phyrexian");
    expect(indices).toContain(9);  // Dismember {1}{B/P}{B/P} in mana cost
    expect(indices).toContain(35); // Hybrid-Phyrexian Test {1}{G/W/P} in mana cost
    expect(indices).toContain(36); // Blinding Souleater — {W/P} in oracle text only
    expect(indices).not.toContain(26); // Incubation {G/U} — hybrid only
    expect(indices).not.toContain(37); // Oracle Hybrid Test — hybrid only in oracle
    expect(indices).not.toContain(1);  // Lightning Bolt {R} — no Phyrexian
  });

  test("hybrid-phyrexian card matches both is:hybrid and is:phyrexian", () => {
    const hybridIndices = isMatchIndices("is:hybrid");
    const phyrexianIndices = isMatchIndices("is:phyrexian");
    expect(hybridIndices).toContain(35);
    expect(phyrexianIndices).toContain(35);
  });

  test("-is:hybrid excludes hybrid cards", () => {
    const indices = isMatchIndices("-is:hybrid");
    expect(indices).not.toContain(26);
    expect(indices).not.toContain(35);
    expect(indices).toContain(37); // Oracle-only hybrid is NOT excluded (not matched by is:hybrid)
    expect(indices).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// Colorless+color contradiction (Spec 039, GitHub issue #17)
// ---------------------------------------------------------------------------

describe("colorless+color contradiction", () => {
  function getResult(query: string) {
    const cache = new NodeCache(index);
    return cache.evaluate(parse(query)).result;
  }

  test("ci:cb produces error (colorless + blue)", () => {
    const result = getResult("ci:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("c:cb produces error (color field, same contradiction)", () => {
    const result = getResult("c:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:cw produces error", () => {
    const result = getResult("ci:cw");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:cwubrg produces error", () => {
    const result = getResult("ci:cwubrg");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("c:cr produces error", () => {
    const result = getResult("c:cr");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("ci:c (just colorless) is NOT an error", () => {
    const result = getResult("ci:c");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(1); // Sol Ring
  });

  test("ci:colorless is NOT an error", () => {
    const result = getResult("ci:colorless");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(1);
  });

  test("ci:wu (no colorless) is NOT an error", () => {
    const result = getResult("ci:wu");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  test("error node in AND is skipped — t:creature ci:cb matches same as t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    const withError = matchCount("t:creature ci:cb");
    expect(withError).toBe(creatureOnly);
  });

  test("error node child in AND carries error field", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("t:creature ci:cb"));
    const ciChild = result.children!.find(
      c => c.node.type === "FIELD" && (c.node as import("./ast").FieldNode).field === "ci"
    );
    expect(ciChild).toBeDefined();
    expect(ciChild!.error).toBe("a card cannot be both colored and colorless");
    expect(ciChild!.matchCount).toBe(-1);
  });

  test("error node in OR is skipped — t:creature OR ci:cb matches same as t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    const withError = matchCount("t:creature OR ci:cb");
    expect(withError).toBe(creatureOnly);
  });

  test("NOT of error propagates error — -ci:cb", () => {
    const result = getResult("-ci:cb");
    expect(result.error).toBe("a card cannot be both colored and colorless");
    expect(result.matchCount).toBe(-1);
  });

  test("error node produces zero indices", () => {
    const cache = new NodeCache(index);
    const { indices } = cache.evaluate(parse("ci:cb"));
    expect(indices.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Non-destructive error handling (Spec 039)
// ---------------------------------------------------------------------------

describe("non-destructive error handling", () => {
  function getResult(query: string) {
    const cache = new NodeCache(index);
    return cache.evaluate(parse(query));
  }

  // --- Error detection ---

  test("foo:bar produces unknown field error", () => {
    const { result } = getResult("foo:bar");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("foo: (unknown field, empty value) produces error", () => {
    const { result } = getResult("foo:");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("o:/[/ produces invalid regex error", () => {
    const { result } = getResult("o:/[/");
    expect(result.error).toBe("invalid regex");
    expect(result.matchCount).toBe(-1);
  });

  test("f:comma produces unknown format error", () => {
    const { result } = getResult("f:comma");
    expect(result.error).toBe('unknown format "comma"');
    expect(result.matchCount).toBe(-1);
  });

  test("is:xyz produces unknown keyword error", () => {
    const { result } = getResult("is:xyz");
    expect(result.error).toBe('unknown keyword "xyz"');
    expect(result.matchCount).toBe(-1);
  });

  test("is:foil produces unsupported keyword error", () => {
    const { result } = getResult("is:foil");
    expect(result.error).toBe('unsupported keyword "foil"');
    expect(result.matchCount).toBe(-1);
  });

  test("error nodes produce zero indices", () => {
    expect(getResult("foo:bar").indices.length).toBe(0);
    expect(getResult("o:/[/").indices.length).toBe(0);
    expect(getResult("f:comma").indices.length).toBe(0);
    expect(getResult("is:xyz").indices.length).toBe(0);
  });

  // --- Non-errors (should NOT produce errors) ---

  test("ci: (known field, empty value) is not an error", () => {
    const { result } = getResult("ci:");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(9);
  });

  test("t:xyz (open-ended field, zero results) is not an error", () => {
    const { result } = getResult("t:notavalidtype");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
  });

  test("f:commander (known format) is not an error", () => {
    const { result } = getResult("f:commander");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  test("is:permanent (supported keyword) is not an error", () => {
    const { result } = getResult("is:permanent");
    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
  });

  // --- AND with error children ---

  test("error child is skipped in AND — t:creature foo:bar", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature foo:bar")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — t:creature o:/[/", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature o:/[/")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — f:comma t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("f:comma t:creature")).toBe(creatureOnly);
  });

  test("error child is skipped in AND — is:xyz t:creature", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("is:xyz t:creature")).toBe(creatureOnly);
  });

  test("all-error AND is vacuous conjunction (all cards)", () => {
    expect(matchCount("foo:bar baz:qux")).toBe(9);
  });

  test("AND error child carries error field", () => {
    const { result } = getResult("t:creature foo:bar");
    const errorChild = result.children!.find(
      c => c.node.type === "FIELD" && (c.node as import("./ast").FieldNode).field === "foo"
    );
    expect(errorChild).toBeDefined();
    expect(errorChild!.error).toBe('unknown field "foo"');
    expect(errorChild!.matchCount).toBe(-1);
  });

  // --- OR with error children ---

  test("error child is skipped in OR — t:creature OR foo:bar", () => {
    const creatureOnly = matchCount("t:creature");
    expect(matchCount("t:creature OR foo:bar")).toBe(creatureOnly);
  });

  test("all-error OR is vacuous disjunction (empty set)", () => {
    expect(matchCount("foo:bar OR baz:qux")).toBe(0);
  });

  // --- NOT with error child ---

  test("-foo:bar propagates error", () => {
    const { result } = getResult("-foo:bar");
    expect(result.error).toBe('unknown field "foo"');
    expect(result.matchCount).toBe(-1);
  });

  test("-f:comma propagates error", () => {
    const { result } = getResult("-f:comma");
    expect(result.error).toBe('unknown format "comma"');
    expect(result.matchCount).toBe(-1);
  });
});
