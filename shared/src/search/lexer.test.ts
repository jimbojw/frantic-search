// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { lex } from "./lexer";

describe("lex", () => {
  test("empty string produces only EOF", () => {
    expect(lex("")).toMatchObject([{ type: "EOF", value: "" }]);
  });

  test("whitespace-only produces only EOF", () => {
    expect(lex("   ")).toMatchObject([{ type: "EOF", value: "" }]);
  });

  test("single bare word", () => {
    expect(lex("lightning")).toMatchObject([
      { type: "WORD", value: "lightning" },
      { type: "EOF", value: "" },
    ]);
  });

  test("two bare words separated by whitespace", () => {
    expect(lex("lightning bolt")).toMatchObject([
      { type: "WORD", value: "lightning" },
      { type: "WORD", value: "bolt" },
      { type: "EOF", value: "" },
    ]);
  });

  test("field colon value", () => {
    expect(lex("c:wu")).toMatchObject([
      { type: "WORD", value: "c" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "wu" },
      { type: "EOF", value: "" },
    ]);
  });

  test("OR keyword", () => {
    expect(lex("a OR b")).toMatchObject([
      { type: "WORD", value: "a" },
      { type: "OR", value: "OR" },
      { type: "WORD", value: "b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("lowercase or is recognized as OR", () => {
    expect(lex("a or b")).toMatchObject([
      { type: "WORD", value: "a" },
      { type: "OR", value: "or" },
      { type: "WORD", value: "b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("mixed-case Or is recognized as OR", () => {
    expect(lex("a Or b")).toMatchObject([
      { type: "WORD", value: "a" },
      { type: "OR", value: "Or" },
      { type: "WORD", value: "b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("OR within a word is not special", () => {
    expect(lex("oracle")).toMatchObject([
      { type: "WORD", value: "oracle" },
      { type: "EOF", value: "" },
    ]);
  });

  test("parentheses", () => {
    expect(lex("(a b)")).toMatchObject([
      { type: "LPAREN", value: "(" },
      { type: "WORD", value: "a" },
      { type: "WORD", value: "b" },
      { type: "RPAREN", value: ")" },
      { type: "EOF", value: "" },
    ]);
  });

  test("dash as negation", () => {
    expect(lex("-c:r")).toMatchObject([
      { type: "DASH", value: "-" },
      { type: "WORD", value: "c" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "r" },
      { type: "EOF", value: "" },
    ]);
  });

  test("equals operator", () => {
    expect(lex("c=wu")).toMatchObject([
      { type: "WORD", value: "c" },
      { type: "EQ", value: "=" },
      { type: "WORD", value: "wu" },
      { type: "EOF", value: "" },
    ]);
  });

  test("not-equals operator", () => {
    expect(lex("c!=r")).toMatchObject([
      { type: "WORD", value: "c" },
      { type: "NEQ", value: "!=" },
      { type: "WORD", value: "r" },
      { type: "EOF", value: "" },
    ]);
  });

  test("less-than and greater-than operators", () => {
    expect(lex("pow<3")).toMatchObject([
      { type: "WORD", value: "pow" },
      { type: "LT", value: "<" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
    expect(lex("pow>3")).toMatchObject([
      { type: "WORD", value: "pow" },
      { type: "GT", value: ">" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
  });

  test("less-than-or-equal and greater-than-or-equal (greedy match)", () => {
    expect(lex("pow<=3")).toMatchObject([
      { type: "WORD", value: "pow" },
      { type: "LTE", value: "<=" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
    expect(lex("pow>=3")).toMatchObject([
      { type: "WORD", value: "pow" },
      { type: "GTE", value: ">=" },
      { type: "WORD", value: "3" },
      { type: "EOF", value: "" },
    ]);
  });

  test("quoted string", () => {
    expect(lex('o:"enters the"')).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "enters the" },
      { type: "EOF", value: "" },
    ]);
  });

  test("single-quoted string", () => {
    expect(lex("o:'enters the'")).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "enters the" },
      { type: "EOF", value: "" },
    ]);
  });

  test("single quotes can embed double quotes", () => {
    expect(lex(`o:'gains "'`)).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: 'gains "' },
      { type: "EOF", value: "" },
    ]);
  });

  test("double quotes can embed single quotes", () => {
    expect(lex(`o:"gains '"`)).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "QUOTED", value: "gains '" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed double quote consumes to end of input", () => {
    expect(lex('"hello')).toMatchObject([
      { type: "QUOTED", value: "hello" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed single quote consumes to end of input", () => {
    expect(lex("'hello")).toMatchObject([
      { type: "QUOTED", value: "hello" },
      { type: "EOF", value: "" },
    ]);
  });

  test("apostrophe within a word is not a quote delimiter", () => {
    expect(lex("can't")).toMatchObject([
      { type: "WORD", value: "can't" },
      { type: "EOF", value: "" },
    ]);
  });

  test("apostrophe in a field value", () => {
    expect(lex("o:can't")).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "WORD", value: "can't" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! as exact-name prefix", () => {
    expect(lex("!fire")).toMatchObject([
      { type: "BANG", value: "!" },
      { type: "WORD", value: "fire" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! before quoted string", () => {
    expect(lex('!"Sift Through Sands"')).toMatchObject([
      { type: "BANG", value: "!" },
      { type: "QUOTED", value: "Sift Through Sands" },
      { type: "EOF", value: "" },
    ]);
  });

  test("regex delimited by forward slashes", () => {
    expect(lex("o:/^{T}:/")).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "^{T}:" },
      { type: "EOF", value: "" },
    ]);
  });

  test("regex with escaped forward slash", () => {
    expect(lex("name:/a\\/b/")).toMatchObject([
      { type: "WORD", value: "name" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "a\\/b" },
      { type: "EOF", value: "" },
    ]);
  });

  test("unclosed regex consumes to end of input", () => {
    expect(lex("o:/partial")).toMatchObject([
      { type: "WORD", value: "o" },
      { type: "COLON", value: ":" },
      { type: "REGEX", value: "partial" },
      { type: "EOF", value: "" },
    ]);
  });

  test("! before single-quoted string", () => {
    expect(lex("!'Lightning Bolt'")).toMatchObject([
      { type: "BANG", value: "!" },
      { type: "QUOTED", value: "Lightning Bolt" },
      { type: "EOF", value: "" },
    ]);
  });

  test("!= is still NEQ, not BANG + EQ", () => {
    expect(lex("c!=r")).toMatchObject([
      { type: "WORD", value: "c" },
      { type: "NEQ", value: "!=" },
      { type: "WORD", value: "r" },
      { type: "EOF", value: "" },
    ]);
  });

  test("complex query", () => {
    expect(lex('c:wu (t:creature OR t:planeswalker) -o:"enters the"')).toMatchObject([
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

  describe("token spans", () => {
    test("field:value tokens have correct spans", () => {
      const tokens = lex("ci:wub");
      expect(tokens[0]).toEqual({ type: "WORD", value: "ci", start: 0, end: 2 });
      expect(tokens[1]).toEqual({ type: "COLON", value: ":", start: 2, end: 3 });
      expect(tokens[2]).toEqual({ type: "WORD", value: "wub", start: 3, end: 6 });
      expect(tokens[3]).toEqual({ type: "EOF", value: "", start: 6, end: 6 });
    });

    test("quoted token span includes delimiters", () => {
      const tokens = lex('"hello world"');
      expect(tokens[0]).toEqual({ type: "QUOTED", value: "hello world", start: 0, end: 13 });
    });

    test("whitespace is skipped, offsets still correct", () => {
      const tokens = lex("a  b");
      expect(tokens[0]).toEqual({ type: "WORD", value: "a", start: 0, end: 1 });
      expect(tokens[1]).toEqual({ type: "WORD", value: "b", start: 3, end: 4 });
    });

    test("regex token span includes slashes", () => {
      const tokens = lex("/giant/");
      expect(tokens[0]).toEqual({ type: "REGEX", value: "giant", start: 0, end: 7 });
    });

    test("comparison operator spans", () => {
      const tokens = lex("pow>=3");
      expect(tokens[0]).toEqual({ type: "WORD", value: "pow", start: 0, end: 3 });
      expect(tokens[1]).toEqual({ type: "GTE", value: ">=", start: 3, end: 5 });
      expect(tokens[2]).toEqual({ type: "WORD", value: "3", start: 5, end: 6 });
    });

    test("EOF span for empty input", () => {
      const tokens = lex("");
      expect(tokens[0]).toEqual({ type: "EOF", value: "", start: 0, end: 0 });
    });

    test("dash and bang spans", () => {
      const tokens = lex("-!");
      expect(tokens[0]).toEqual({ type: "DASH", value: "-", start: 0, end: 1 });
      expect(tokens[1]).toEqual({ type: "BANG", value: "!", start: 1, end: 2 });
    });

    test("paren spans", () => {
      const tokens = lex("(a)");
      expect(tokens[0]).toEqual({ type: "LPAREN", value: "(", start: 0, end: 1 });
      expect(tokens[1]).toEqual({ type: "WORD", value: "a", start: 1, end: 2 });
      expect(tokens[2]).toEqual({ type: "RPAREN", value: ")", start: 2, end: 3 });
    });

    test("NEQ operator span", () => {
      const tokens = lex("c!=r");
      expect(tokens[1]).toEqual({ type: "NEQ", value: "!=", start: 1, end: 3 });
    });

    test("LT and LTE spans", () => {
      expect(lex("x<3")[1]).toEqual({ type: "LT", value: "<", start: 1, end: 2 });
      expect(lex("x<=3")[1]).toEqual({ type: "LTE", value: "<=", start: 1, end: 3 });
    });

    test("GT span", () => {
      expect(lex("x>3")[1]).toEqual({ type: "GT", value: ">", start: 1, end: 2 });
    });

    test("EQ span", () => {
      expect(lex("x=3")[1]).toEqual({ type: "EQ", value: "=", start: 1, end: 2 });
    });

    test("OR keyword span", () => {
      const tokens = lex("a OR b");
      expect(tokens[1]).toEqual({ type: "OR", value: "OR", start: 2, end: 4 });
    });

    test("single-quoted token span includes delimiters", () => {
      const tokens = lex("'hello'");
      expect(tokens[0]).toEqual({ type: "QUOTED", value: "hello", start: 0, end: 7 });
    });

    test("unclosed quote span extends to end of input", () => {
      const tokens = lex('"hello');
      expect(tokens[0]).toEqual({ type: "QUOTED", value: "hello", start: 0, end: 6 });
    });

    test("unclosed regex span extends to end of input", () => {
      const tokens = lex("/partial");
      expect(tokens[0]).toEqual({ type: "REGEX", value: "partial", start: 0, end: 8 });
    });

    test("invariant: input.slice(start, end) reproduces source text", () => {
      const input = 'c:wu (t:creature OR t:planeswalker) -o:"enters the"';
      const tokens = lex(input);
      for (const token of tokens) {
        const slice = input.slice(token.start, token.end);
        if (token.type === "EOF") {
          expect(slice).toBe("");
        } else if (token.type === "QUOTED") {
          expect(slice).toBe(`"${token.value}"`);
        } else {
          expect(slice).toBe(token.value);
        }
      }
    });
  });
});
