// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { NodeCache, nodeKey } from "./evaluator";
import { parse } from "./parser";
import { CardIndex } from "./card-index";
import { Color, Format } from "../bits";
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
    "Flying\n{T}: Add one mana of any color.",
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
    "",
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
  scryfall_ids:   ["", "", "", "", "", "", "", "", "", ""],
  thumb_hashes:   ["", "", "", "", "", "", "", "", "", ""],
  layouts:        ["normal", "normal", "normal", "normal", "normal", "normal", "normal", "transform", "transform", "normal"],
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
    expect(matchCount("o:target")).toBe(5);
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
    expect(matchCount("c:black")).toBe(3);
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
    expect(matchCount("t:creature")).toBe(5);
    expect(matchCount("t:instant")).toBe(4);
    expect(matchCount("t:artifact")).toBe(1);
  });

  test("type field matches supertypes", () => {
    expect(matchCount("t:legendary")).toBe(3);
  });

  test("type field matches subtypes", () => {
    expect(matchCount("t:elf")).toBe(3);
    expect(matchCount("t:human")).toBe(1);
  });

  test("type field matches partial words", () => {
    expect(matchCount("t:legend")).toBe(3);
  });

  test("type field with quoted multi-word matches type_line substring", () => {
    expect(matchCount('t:"legendary creature"')).toBe(3);
  });

  test("power field numeric comparison", () => {
    expect(matchCount("pow=0")).toBe(1);
    expect(matchCount("pow=2")).toBe(1);
    expect(matchCount("pow>=2")).toBe(3);
    expect(matchCount("pow<2")).toBe(1);
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
    expect(matchCount("t:creature -c:w")).toBe(4);
  });

  test("parenthesized group", () => {
    expect(matchCount("(c:r OR c:u) t:instant")).toBe(3);
  });

  test("unknown field matches zero cards", () => {
    expect(matchCount("rarity:common")).toBe(0);
  });

  test("empty value matches all face rows", () => {
    expect(matchCount("c:")).toBe(10);
  });

  test("empty input matches all face rows", () => {
    expect(matchCount("")).toBe(10);
  });

  test("result tree has children with matchCounts", () => {
    const cache = new NodeCache(index);
    const { result } = cache.evaluate(parse("c:g t:creature"));
    expect(result.matchCount).toBe(2);
    expect(result.children).toHaveLength(2);
    expect(result.children![0].matchCount).toBe(2);
    expect(result.children![1].matchCount).toBe(5);
  });

  test("matchingIndices contains indices of matching cards", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("c:g t:creature"));
    expect(matchingIndices).toEqual([0, 4]);
  });

  test("matchingIndices for single match", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse('!"Lightning Bolt"'));
    expect(matchingIndices).toEqual([1]);
  });

  test("matchingIndices empty when no matches", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("rarity:common"));
    expect(matchingIndices).toEqual([]);
  });

  test("legal:commander matches all face rows legal in commander", () => {
    expect(matchCount("legal:commander")).toBe(10);
  });

  test("legal:legacy matches face rows legal in legacy", () => {
    expect(matchCount("legal:legacy")).toBe(8);
  });

  test("f: alias works for legal:", () => {
    expect(matchCount("f:modern")).toBe(6);
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
    expect(matchCount("legal:legacy t:creature")).toBe(5);
  });

  test("unknown format matches zero", () => {
    expect(matchCount("legal:fakefmt")).toBe(0);
  });

  test("regex on oracle text", () => {
    expect(matchCount("o:/damage/")).toBe(2);
    expect(matchCount("o:/target/")).toBe(5);
  });

  test("regex on type line", () => {
    expect(matchCount("t:/legendary.*elf/")).toBe(2);
    expect(matchCount("t:/legendary.*human/")).toBe(1);
    expect(matchCount("t:/creature/")).toBe(5);
  });

  test("regex on name", () => {
    expect(matchCount("name:/^birds/")).toBe(1);
    expect(matchCount("name:/bolt$/")).toBe(1);
  });

  test("regex with invalid pattern matches zero", () => {
    expect(matchCount("o:/[invalid/")).toBe(0);
  });

  test("regex on unsupported field matches zero", () => {
    expect(matchCount("pow:/3/")).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Multi-face card (DFC) tests
  // -------------------------------------------------------------------------

  test("query matching only back face returns a face-level match", () => {
    expect(matchCount("t:phyrexian")).toBe(1);
  });

  test("back face match appears in matchingIndices", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("t:phyrexian"));
    expect(matchingIndices).toEqual([8]);
  });

  test("deduplicateMatches collapses back face to canonical (front) face", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("t:phyrexian"));
    const deduped = index.deduplicateMatches(matchingIndices);
    expect(deduped).toEqual([7]);
  });

  test("query matching both faces deduplicates to one result", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("t:elf t:legendary"));
    expect(matchingIndices).toEqual([7, 8]);
    const deduped = index.deduplicateMatches(matchingIndices);
    expect(deduped).toEqual([7]);
  });

  test("cross-face condition produces no match (per-face semantics)", () => {
    expect(matchCount("pow>=4 tou<=2")).toBe(0);
  });

  test("DFC face-specific color match", () => {
    expect(matchCount("c:r t:elf")).toBe(1);
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("c:r t:elf"));
    expect(matchingIndices).toEqual([8]);
  });

  test("identity: colon uses subset semantics (fits in a commander deck)", () => {
    // identity:wu → cards whose identity ⊆ {W,U}: Counterspell(U), Sol Ring(∅), Azorius(WU), Thalia(W)
    expect(matchCount("id:wu")).toBe(4);
    // identity:w → Thalia(W), Sol Ring(∅)
    expect(matchCount("id:w")).toBe(2);
    // identity:br → Bolt(R), Sol Ring(∅), Ayara front(BR), Ayara back(BR), Dismember(B)
    expect(matchCount("id:br")).toBe(5);
  });

  test("identity: explicit >= still uses superset semantics", () => {
    // identity>=wu → cards whose identity ⊇ {W,U}: only Azorius Charm (WU)
    expect(matchCount("id>=wu")).toBe(1);
    // identity>=w → Azorius(WU) + Thalia(W)
    expect(matchCount("id>=w")).toBe(2);
  });

  test("identity: subset combined with type narrows correctly", () => {
    // id:br t:elf → Ayara front(BR, Elf) + Ayara back(BR, Elf) — both ⊆ {B,R}
    expect(matchCount("id:br t:elf")).toBe(2);
  });

  test("commander:, cmd:, and ci: are aliases with same subset colon semantics", () => {
    expect(matchCount("commander:wu")).toBe(4);
    expect(matchCount("commander:br")).toBe(5);
    expect(matchCount("commander:w")).toBe(2);
    expect(matchCount("cmd:w")).toBe(2);
    expect(matchCount("cmd:br")).toBe(5);
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
    expect(matchCount("realmayara")).toBe(2); // both faces of the DFC
  });

  test("unquoted bare word still matches single-face cards via normalized name", () => {
    expect(matchCount("bolt")).toBe(1);
    expect(matchCount("lightningbolt")).toBe(1);
  });

  test("quoted bare word matches literal combined name", () => {
    // Quoted " // " matches the literal combined name "Ayara, Widow of the Realm // Ayara, Furnace Queen"
    expect(matchCount('" // "')).toBe(2); // both faces of Ayara DFC
  });

  test("quoted bare word does not match normalized form", () => {
    // "realmayara" does not appear literally in "Ayara, Widow of the Realm // Ayara, Furnace Queen"
    expect(matchCount('"realmayara"')).toBe(0);
  });

  test("name: field searches combined name", () => {
    expect(matchCount('name:" // "')).toBe(2);
  });

  test("exact name matches combined name", () => {
    expect(matchCount('!"Ayara, Widow of the Realm // Ayara, Furnace Queen"')).toBe(2);
  });

  test("exact name matches individual face name for DFC", () => {
    expect(matchCount('!"Ayara, Furnace Queen"')).toBe(1);
  });

  test("exact name still matches single-face cards", () => {
    expect(matchCount('!"Lightning Bolt"')).toBe(1);
  });

  test("regex on name searches combined name", () => {
    expect(matchCount("name:/realm.*furnace/")).toBe(2);
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

  test("cmc!=2 matches all rows except mana value 2", () => {
    expect(matchCount("cmc!=2")).toBe(6);
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
//   #0 Birds:     ""  (no self-ref)
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
    const { matchingIndices } = cache.evaluate(parse("o:~"));
    expect(matchingIndices).not.toContain(0); // Birds
    expect(matchingIndices).not.toContain(2); // Counterspell
    expect(matchingIndices).not.toContain(3); // Sol Ring
    expect(matchingIndices).not.toContain(5); // Azorius Charm
    expect(matchingIndices).not.toContain(6); // Thalia
    expect(matchingIndices).not.toContain(8); // Ayara back
    expect(matchingIndices).not.toContain(9); // Dismember
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

  test("matchingIndices for o:~ contains expected rows", () => {
    const cache = new NodeCache(index);
    const { matchingIndices } = cache.evaluate(parse("o:~"));
    expect(matchingIndices).toEqual([1, 4, 7]);
  });
});
