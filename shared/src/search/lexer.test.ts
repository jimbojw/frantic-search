// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { lex } from "./lexer";

describe("lex", () => {
  test("empty string produces only EOF", () => {
    expect(lex("")).toEqual([{ type: "EOF", value: "" }]);
  });

  test("whitespace-only produces only EOF", () => {
    expect(lex("   ")).toEqual([{ type: "EOF", value: "" }]);
  });

  test("single bare word", () => {
    expect(lex("lightning")).toEqual([
      { type: "WORD", value: "lightning" },
      { type: "EOF", value: "" },
    ]);
  });

  test("two bare words separated by whitespace", () => {
    expect(lex("lightning bolt")).toEqual([
      { type: "WORD", value: "lightning" },
      { type: "WORD", value: "bolt" },
      { type: "EOF", value: "" },
    ]);
  });

  test("field colon value", () => {
    expect(lex("c:wu")).toEqual([
      { type: "WORD", value: "c" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "wu" },
      { type: "EOF", value: "" },
    ]);
  });

  test("OR keyword", () => {
    expect(lex("a OR b")).toEqual([
      { type: "WORD", value: "a" },
      { type: "OR", value: "OR" },
      { type: "WORD", value: "b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("OR within a word is not special", () => {
    expect(lex("oracle")).toEqual([
      { type: "WORD", value: "oracle" },
      { type: "EOF", value: "" },
    ]);
  });

  test("parentheses", () => {
    expect(lex("(a b)")).toEqual([
      { type: "LPAREN", value: "(" },
      { type: "WORD", value: "a" },
      { type: "WORD", value: "b" },
      { type: "RPAREN", value: ")" },
      { type: "EOF", value: "" },
    ]);
  });

  test("dash as negation", () => {
    expect(lex("-c:r")).toEqual([
      { type: "DASH", value: "-" },
      { type: "WORD", value: "c" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "r" },
      { type: "EOF", value: "" },
    ]);
  });

  test("equals operator", () => {
    expect(lex("c=wu")).toEqual([
      { type: "WORD", value: "c" },
      { type: "EQ", value: "=" },
      { type: "WORD", value: "wu" },
      { type: "EOF", value: "" },
    ]);
  });

  test("not-equals operator", () => {
    expect(lex("c!=r")).toEqual([
      { type: "WORD", value: "c" },
      { type: "NEQ", value: "!=" },
      { type: "WORD", value: "r" },
      { type: "EOF", value: "" },
    ]);
  });

  test("less-than and greater-than operators", () => {
    expect(lex("pow<3")).toEqual([
      { type: "WORD", value: "pow" },
      { type: "LT", value: "<" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
    expect(lex("pow>3")).toEqual([
      { type: "WORD", value: "pow" },
      { type: "GT", value: ">" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
  });

  test("less-than-or-equal and greater-than-or-equal (greedy match)", () => {
    expect(lex("pow<=3")).toEqual([
      { type: "WORD", value: "pow" },
      { type: "LTE", value: "<=" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
    expect(lex("pow>=3")).toEqual([
      { type: "WORD", value: "pow" },
      { type: "GTE", value: ">=" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
  });

  test("quoted string", () => {
    expect(lex('o:"enters the"')).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "enters the" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed quote consumes to end of input", () => {
    expect(lex('"hello')).toEqual([
      { type: "QUOTED", value: "hello" },
      { type: "EOF", value: "" },
    ]);
  });

  test("complex query", () => {
    expect(lex('c:wu (t:creature OR t:planeswalker) -o:"enters the"')).toEqual([
      { type: "WORD", value: "c" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "wu" },
      { type: "LPAREN", value: "(" },
      { type: "WORD", value: "t" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "creature" },
      { type: "OR", value: "OR" },
      { type: "WORD", value: "t" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "planeswalker" },
      { type: "RPAREN", value: ")" },
      { type: "DASH", value: "-" },
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "enters the" },
      { type: "EOF", value: "" },
    ]);
  });
});
