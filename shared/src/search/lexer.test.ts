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

  test("lowercase or is recognized as OR", () => {
    expect(lex("a or b")).toEqual([
      { type: "WORD", value: "a" },
      { type: "OR", value: "or" },
      { type: "WORD", value: "b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("mixed-case Or is recognized as OR", () => {
    expect(lex("a Or b")).toEqual([
      { type: "WORD", value: "a" },
      { type: "OR", value: "Or" },
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

  test("single-quoted string", () => {
    expect(lex("o:'enters the'")).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "enters the" },
      { type: "EOF", value: "" },
    ]);
  });

  test("single quotes can embed double quotes", () => {
    expect(lex(`o:'gains "'`)).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: 'gains "' },
      { type: "EOF", value: "" },
    ]);
  });

  test("double quotes can embed single quotes", () => {
    expect(lex(`o:"gains '"`)).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "gains '" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed double quote consumes to end of input", () => {
    expect(lex('"hello')).toEqual([
      { type: "QUOTED", value: "hello" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed single quote consumes to end of input", () => {
    expect(lex("'hello")).toEqual([
      { type: "QUOTED", value: "hello" },
      { type: "EOF", value: "" },
    ]);
  });

  test("apostrophe within a word is not a quote delimiter", () => {
    expect(lex("can't")).toEqual([
      { type: "WORD", value: "can't" },
      { type: "EOF", value: "" },
    ]);
  });

  test("apostrophe in a field value", () => {
    expect(lex("o:can't")).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "can't" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! as exact-name prefix", () => {
    expect(lex("!fire")).toEqual([
      { type: "BANG", value: "!" },
      { type: "WORD", value: "fire" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! before quoted string", () => {
    expect(lex('!"Sift Through Sands"')).toEqual([
      { type: "BANG", value: "!" },
      { type: "QUOTED", value: "Sift Through Sands" },
      { type: "EOF", value: "" },
    ]);
  });

  test("regex delimited by forward slashes", () => {
    expect(lex("o:/^{T}:/")).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "^{T}:" },
      { type: "EOF", value: "" },
    ]);
  });

  test("regex with escaped forward slash", () => {
    expect(lex("name:/a\\/b/")).toEqual([
      { type: "WORD", value: "name" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "a\\/b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed regex consumes to end of input", () => {
    expect(lex("o:/partial")).toEqual([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "partial" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! before single-quoted string", () => {
    expect(lex("!'Lightning Bolt'")).toEqual([
      { type: "BANG", value: "!" },
      { type: "QUOTED", value: "Lightning Bolt" },
      { type: "EOF", value: "" },
    ]);
  });

  test("!= is still NEQ, not BANG + EQ", () => {
    expect(lex("c!=r")).toEqual([
      { type: "WORD", value: "c" },
      { type: "NEQ", value: "!=" },
      { type: "WORD", value: "r" },
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
