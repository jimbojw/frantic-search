// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parse } from "./parser";
import type { ASTNode } from "./ast";

function field(f: string, op: string, v: string): ASTNode {
  return { type: "FIELD", field: f, operator: op, value: v };
}

function bare(v: string): ASTNode {
  return { type: "BARE", value: v };
}

function and(...children: ASTNode[]): ASTNode {
  return { type: "AND", children };
}

function or(...children: ASTNode[]): ASTNode {
  return { type: "OR", children };
}

function not(child: ASTNode): ASTNode {
  return { type: "NOT", child };
}

function exact(v: string): ASTNode {
  return { type: "EXACT", value: v };
}

function regexField(f: string, op: string, pattern: string): ASTNode {
  return { type: "REGEX_FIELD", field: f, operator: op, pattern };
}

describe("parse", () => {
  test("empty input returns empty AND node", () => {
    expect(parse("")).toEqual(and());
  });

  test("single bare word", () => {
    expect(parse("lightning")).toEqual(bare("lightning"));
  });

  test("quoted bare word", () => {
    expect(parse('"lightning bolt"')).toEqual(bare("lightning bolt"));
  });

  test("single field:value", () => {
    expect(parse("c:wu")).toEqual(field("c", ":", "wu"));
  });

  test("field with quoted value", () => {
    expect(parse('o:"enters the"')).toEqual(field("o", ":", "enters the"));
  });

  test("implicit AND with two terms", () => {
    expect(parse("c:wu t:creature")).toEqual(
      and(field("c", ":", "wu"), field("t", ":", "creature")),
    );
  });

  test("implicit AND with bare words", () => {
    expect(parse("lightning bolt")).toEqual(
      and(bare("lightning"), bare("bolt")),
    );
  });

  test("explicit OR", () => {
    expect(parse("c:wu OR c:bg")).toEqual(
      or(field("c", ":", "wu"), field("c", ":", "bg")),
    );
  });

  test("OR is case-insensitive", () => {
    expect(parse("c:wu or c:bg")).toEqual(
      or(field("c", ":", "wu"), field("c", ":", "bg")),
    );
  });

  test("AND binds tighter than OR", () => {
    expect(parse("a b OR c")).toEqual(
      or(and(bare("a"), bare("b")), bare("c")),
    );
  });

  test("negation with -", () => {
    expect(parse("-c:r")).toEqual(not(field("c", ":", "r")));
  });

  test("negation of bare word", () => {
    expect(parse("-fire")).toEqual(not(bare("fire")));
  });

  test("parenthesized group", () => {
    expect(parse("(c:wu OR c:bg) t:creature")).toEqual(
      and(
        or(field("c", ":", "wu"), field("c", ":", "bg")),
        field("t", ":", "creature"),
      ),
    );
  });

  test("nested parentheses", () => {
    expect(parse("((a))")).toEqual(bare("a"));
  });

  test("exact name with !", () => {
    expect(parse("!fire")).toEqual(exact("fire"));
  });

  test("exact name with ! and quoted string", () => {
    expect(parse('!"Lightning Bolt"')).toEqual(exact("Lightning Bolt"));
  });

  test("exact name with ! and single-quoted string", () => {
    expect(parse("!'Lightning Bolt'")).toEqual(exact("Lightning Bolt"));
  });

  test("regex field value", () => {
    expect(parse("o:/^{T}:/")).toEqual(
      regexField("o", ":", "^{T}:"),
    );
  });

  test("comparison operators", () => {
    expect(parse("pow>=3")).toEqual(field("pow", ">=", "3"));
    expect(parse("pow<=3")).toEqual(field("pow", "<=", "3"));
    expect(parse("pow>3")).toEqual(field("pow", ">", "3"));
    expect(parse("pow<3")).toEqual(field("pow", "<", "3"));
    expect(parse("pow=3")).toEqual(field("pow", "=", "3"));
    expect(parse("pow!=3")).toEqual(field("pow", "!=", "3"));
  });

  test("trailing operator: c: with no value", () => {
    expect(parse("c:")).toEqual(field("c", ":", ""));
  });

  test("unclosed parenthesis", () => {
    expect(parse("(c:wu")).toEqual(field("c", ":", "wu"));
  });

  test("parser never throws on any input", () => {
    const inputs = ["", "(", ")", "OR", "-", "!", "c:", "((",  "-))", "a OR", "OR b"];
    for (const input of inputs) {
      expect(() => parse(input), `parse("${input}") should not throw`).not.toThrow();
    }
  });

  test("complex query", () => {
    expect(parse('c:wu (t:creature OR t:planeswalker) -o:"enters the"')).toEqual(
      and(
        field("c", ":", "wu"),
        or(field("t", ":", "creature"), field("t", ":", "planeswalker")),
        not(field("o", ":", "enters the")),
      ),
    );
  });
});
