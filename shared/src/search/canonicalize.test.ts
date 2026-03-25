// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { toScryfallQuery } from "./canonicalize";
import { parse } from "./parser";

function canon(input: string): string {
  return toScryfallQuery(parse(input));
}

describe("toScryfallQuery", () => {
  // --- Bare words ---

  it("passes through an unquoted bare word", () => {
    expect(canon("lightning")).toBe("lightning");
  });

  it("wraps a quoted bare word in double quotes", () => {
    expect(canon('"lightning bolt"')).toBe('"lightning bolt"');
  });

  it("converts single-quoted bare word to double quotes", () => {
    expect(canon("'lightning bolt'")).toBe('"lightning bolt"');
  });

  // --- Field nodes ---

  it("serializes a simple field query", () => {
    expect(canon("c:r")).toBe("c:r");
  });

  it("serializes field with comparison operator", () => {
    expect(canon("power>=3")).toBe("power>=3");
  });

  it("serializes field with != operator", () => {
    expect(canon("c!=r")).toBe("c!=r");
  });

  it("quotes field value containing whitespace", () => {
    expect(canon('t:"legendary creature"')).toBe('t:"legendary creature"');
  });

  it("drops field node with empty value", () => {
    expect(canon("c:")).toBe("");
  });

  it("drops empty field value within a compound query", () => {
    // "c:" at the end is the only way to get a truly empty field value in
    // a compound query — "c: t:creature" parses as c:t (value consumed).
    expect(canon("t:creature c:")).toBe("t:creature");
  });

  it("strips view: terms for Scryfall (Spec 058)", () => {
    expect(canon("lightning view:images")).toBe("lightning");
    expect(canon("view:slim t:creature")).toBe("t:creature");
    expect(canon("view:detail")).toBe("");
    expect(canon("c:r view:full t:instant")).toBe("c:r t:instant");
  });

  it("strips v: alias for Scryfall (Spec 083)", () => {
    expect(canon("lightning v:images")).toBe("lightning");
    expect(canon("v:slim t:creature")).toBe("t:creature");
    expect(canon("c:r v:full t:instant")).toBe("c:r t:instant");
  });

  it("strips sort: terms for Scryfall (Spec 059)", () => {
    expect(canon("lightning sort:name")).toBe("lightning");
    expect(canon("sort:mv t:creature")).toBe("t:creature");
    expect(canon("sort:usd")).toBe("");
    expect(canon("c:r sort:date t:instant")).toBe("c:r t:instant");
  });

  it("strips -sort: terms for Scryfall (Spec 059)", () => {
    expect(canon("-sort:name t:creature")).toBe("t:creature");
    expect(canon("-sort:usd")).toBe("");
  });

  it("strips display: and order: for Scryfall (Spec 107)", () => {
    expect(canon("lightning display:full")).toBe("lightning");
    expect(canon("display:grid t:creature")).toBe("t:creature");
    expect(canon("t:creature order:name")).toBe("t:creature");
    expect(canon("order:cmc c:r")).toBe("c:r");
  });

  it("strips usd=null and usd!=null for Scryfall (Spec 080)", () => {
    expect(canon("usd=null")).toBe("");
    expect(canon("usd!=null")).toBe("");
    expect(canon("t:creature usd=null")).toBe("t:creature");
    expect(canon("usd!=null lightning")).toBe("lightning");
  });

  it("strips pow/tou/loy/def/m=null and !=null for Scryfall (Spec 136)", () => {
    expect(canon("pow=null")).toBe("");
    expect(canon("pow!=null")).toBe("");
    expect(canon("tou=null")).toBe("");
    expect(canon("m=null")).toBe("");
    expect(canon("m!=null")).toBe("");
    expect(canon("loy=null")).toBe("");
    expect(canon("def=null")).toBe("");
    expect(canon("t:creature pow=null")).toBe("t:creature");
    expect(canon("pow!=null lightning")).toBe("lightning");
  });

  it("strips name comparison operators for Scryfall (Spec 096)", () => {
    expect(canon("name>M")).toBe("");
    expect(canon("name<M")).toBe("");
    expect(canon("name>=Lightning")).toBe("");
    expect(canon("name<=Lightning")).toBe("");
    expect(canon("t:creature name>M")).toBe("t:creature");
    expect(canon("name>M lightning")).toBe("lightning");
  });

  it("strips percentile queries for Scryfall (Spec 095)", () => {
    expect(canon("usd>90%")).toBe("");
    expect(canon("date<10%")).toBe("");
    expect(canon("name>50%")).toBe("");
    expect(canon("edhrec>90%")).toBe("");
    expect(canon("t:creature usd>90%")).toBe("t:creature");
    expect(canon("usd>90% lightning")).toBe("lightning");
  });

  it("strips edhrec filter for Scryfall (Spec 099)", () => {
    expect(canon("edhrec<100")).toBe("");
    expect(canon("edhrec>=500")).toBe("");
    expect(canon("t:creature edhrec<100")).toBe("t:creature");
    expect(canon("edhrec<100 lightning")).toBe("lightning");
  });

  it("strips salt filter for Scryfall (Spec 101)", () => {
    expect(canon("salt>50")).toBe("");
    expect(canon("salt<=100")).toBe("");
    expect(canon("salt>90%")).toBe("");
    expect(canon("t:creature salt>50")).toBe("t:creature");
    expect(canon("salt>50 lightning")).toBe("lightning");
  });

  it("resolves categorical field values for Scryfall outlinks (Spec 103)", () => {
    expect(canon("f:c")).toBe("f:commander");
    expect(canon("f:commander")).toBe("f:commander");
    expect(canon("legal:e")).toBe("legal:edh");
  });

  // --- Regex field nodes ---

  it("serializes a regex field query", () => {
    expect(canon("name:/bolt/")).toBe("name:/bolt/");
  });

  // --- Exact name nodes ---

  it("serializes an exact name query", () => {
    expect(canon("!fire")).toBe('!"fire"');
  });

  it("serializes a quoted exact name query", () => {
    expect(canon('!"lightning bolt"')).toBe('!"lightning bolt"');
  });

  // --- NOT nodes ---

  it("serializes a simple negation", () => {
    expect(canon("-t:creature")).toBe("-t:creature");
  });

  // --- AND nodes ---

  it("serializes implicit AND as space-separated terms", () => {
    expect(canon("c:r t:creature")).toBe("c:r t:creature");
  });

  // --- OR nodes ---

  it("serializes OR groups", () => {
    expect(canon("t:creature OR t:instant")).toBe(
      "(t:creature OR t:instant)",
    );
  });

  it("serializes nested OR inside AND with parentheses", () => {
    expect(canon("c:r (t:creature OR t:instant)")).toBe(
      "c:r (t:creature OR t:instant)",
    );
  });

  // --- NOP handling ---

  it("returns empty string for empty input", () => {
    expect(canon("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(canon("   ")).toBe("");
  });

  // --- Unclosed delimiters ---

  it("closes an unclosed double quote", () => {
    expect(canon('"oracle')).toBe('"oracle"');
  });

  it("closes an unclosed single quote and converts to double", () => {
    expect(canon("'oracle")).toBe('"oracle"');
  });

  // --- Bare regex (parser expands to OR of three REGEX_FIELD nodes) ---

  it("expands bare regex to OR of field regexes", () => {
    expect(canon("/giant/")).toBe(
      "(name:/giant/ OR oracle:/giant/ OR type:/giant/)",
    );
  });

  // --- Unclosed regex (bare, becomes OR expansion) ---

  it("closes an unclosed bare regex and expands", () => {
    expect(canon("/oracle")).toBe(
      "(name:/oracle/ OR oracle:/oracle/ OR type:/oracle/)",
    );
  });

  // --- Invalid regex ---

  it("passes through invalid regex with closed delimiters", () => {
    expect(canon("name:/[/")).toBe("name:/[/");
  });

  // --- Partial date padding ---

  it("pads a partial year to YYYY-MM-DD", () => {
    expect(canon("date>=202")).toBe("date>=2020-01-01");
  });

  it("complete year date=2025 stays as-is (Spec 061)", () => {
    expect(canon("date=2025")).toBe("date=2025");
  });

  it("complete year-month date=2025-02 stays as-is (Spec 061)", () => {
    expect(canon("date=2025-02")).toBe("date=2025-02");
  });

  it("partial date=202 expands to range (Spec 061)", () => {
    expect(canon("date=202")).toBe("date>=2020-01-01 date<2030-01-01");
  });

  it("partial date>202 expands to date>=2021-01-01 (floor semantics)", () => {
    expect(canon("date>202")).toBe("date>=2021-01-01");
  });

  it("partial date<=202 expands to date<2021-01-01 (floor semantics)", () => {
    expect(canon("date<=202")).toBe("date<2021-01-01");
  });

  it("pads a year-only date to YYYY-MM-DD for >= operator", () => {
    expect(canon("date>=2021")).toBe("date>=2021-01-01");
  });

  it("pads a year-month date to YYYY-MM-DD for >= operator", () => {
    expect(canon("date>=2021-06")).toBe("date>=2021-06-01");
  });

  it("leaves a full date unchanged", () => {
    expect(canon("date>=2021-06-15")).toBe("date>=2021-06-15");
  });

  it("leaves special date value 'today' unchanged", () => {
    expect(canon("date>=today")).toBe("date>=today");
  });

  it("leaves special date value 'now' unchanged", () => {
    expect(canon("date>=now")).toBe("date>=now");
  });

  it("pads date with alias field name", () => {
    expect(canon("date>=202")).toBe("date>=2020-01-01");
  });

  it("pads a partial month digit", () => {
    expect(canon("date>=2021-0")).toBe("date>=2021-01-01");
  });

  it("leaves non-numeric date values unchanged (set codes)", () => {
    expect(canon("date>=neo")).toBe("date>=neo");
  });

  // --- Year field: complete YYYY keeps year literal (GitHub #193, Spec 061) ---

  it("year>=YYYY stays YYYY (not padded to YYYY-MM-DD)", () => {
    expect(canon("year>=2024")).toBe("year>=2024");
  });

  it("year>YYYY keeps operator and YYYY", () => {
    expect(canon("year>2023")).toBe("year>2023");
  });

  it("year<YYYY keeps operator and YYYY", () => {
    expect(canon("year<2026")).toBe("year<2026");
  });

  it("year<=YYYY keeps operator and YYYY", () => {
    expect(canon("year<=2024")).toBe("year<=2024");
  });

  it("partial year on year field still expands to YYYY-MM-DD", () => {
    expect(canon("year>=202")).toBe("year>=2020-01-01");
  });

  // --- Compound / complex queries ---

  it("handles a complex query with mixed terms", () => {
    expect(canon("c:r t:creature power>=3")).toBe(
      "c:r t:creature power>=3",
    );
  });

  it("handles NOT of a parenthesized group", () => {
    expect(canon("-(t:creature OR t:instant)")).toBe(
      "-(t:creature OR t:instant)",
    );
  });

  it("preserves field aliases (does not canonicalize field names)", () => {
    expect(canon("pow>=3")).toBe("pow>=3");
  });

  it("canonicalizes $ and usd to usd for Scryfall (Spec 074, issue #90)", () => {
    expect(canon("$<1")).toBe("usd<1");
    expect(canon("$>=5 t:creature")).toBe("usd>=5 t:creature");
    expect(canon("usd<5")).toBe("usd<5");
  });
});
