// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { parse } from "./parser";
import type { ASTNode } from "./ast";

function field(f: string, op: string, v: string): ASTNode {
  return { type: "FIELD", field: f, operator: op, value: v };
}

function bare(v: string, quoted = false): ASTNode {
  return { type: "BARE", value: v, quoted };
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

function nop(): ASTNode {
  return { type: "NOP" };
}

function exact(v: string): ASTNode {
  return { type: "EXACT", value: v };
}

function regexField(f: string, op: string, pattern: string): ASTNode {
  return { type: "REGEX_FIELD", field: f, operator: op, pattern };
}

function bareRegex(pattern: string): ASTNode {
  return or(
    regexField("name", ":", pattern),
    regexField("oracle", ":", pattern),
    regexField("type", ":", pattern),
  );
}

describe("parse", () => {
  test("empty input returns NOP node", () => {
    expect(parse("")).toMatchObject(nop());
  });

  test("single bare word", () => {
    expect(parse("lightning")).toMatchObject(bare("lightning"));
  });

  test("quoted bare word has quoted: true", () => {
    expect(parse('"lightning bolt"')).toMatchObject(bare("lightning bolt", true));
  });

  test("single field:value", () => {
    expect(parse("c:wu")).toMatchObject(field("c", ":", "wu"));
  });

  test("field with quoted value", () => {
    expect(parse('o:"enters the"')).toMatchObject(field("o", ":", "enters the"));
  });

  test("implicit AND with two terms", () => {
    expect(parse("c:wu t:creature")).toMatchObject(
      and(field("c", ":", "wu"), field("t", ":", "creature")),
    );
  });

  test("implicit AND with bare words", () => {
    expect(parse("lightning bolt")).toMatchObject(
      and(bare("lightning"), bare("bolt")),
    );
  });

  test("explicit OR", () => {
    expect(parse("c:wu OR c:bg")).toMatchObject(
      or(field("c", ":", "wu"), field("c", ":", "bg")),
    );
  });

  test("OR is case-insensitive", () => {
    expect(parse("c:wu or c:bg")).toMatchObject(
      or(field("c", ":", "wu"), field("c", ":", "bg")),
    );
  });

  test("AND binds tighter than OR", () => {
    expect(parse("a b OR c")).toMatchObject(
      or(and(bare("a"), bare("b")), bare("c")),
    );
  });

  test("negation with -", () => {
    expect(parse("-c:r")).toMatchObject(not(field("c", ":", "r")));
  });

  test("negation of bare word", () => {
    expect(parse("-fire")).toMatchObject(not(bare("fire")));
  });

  test("parenthesized group", () => {
    expect(parse("(c:wu OR c:bg) t:creature")).toMatchObject(
      and(
        or(field("c", ":", "wu"), field("c", ":", "bg")),
        field("t", ":", "creature"),
      ),
    );
  });

  test("nested parentheses", () => {
    expect(parse("((a))")).toMatchObject(bare("a"));
  });

  test("exact name with !", () => {
    expect(parse("!fire")).toMatchObject(exact("fire"));
  });

  test("bare word with mid !", () => {
    expect(parse("a!b")).toMatchObject(bare("a!b"));
  });

  test("field value with mid !", () => {
    expect(parse("name:a!b")).toMatchObject(field("name", ":", "a!b"));
  });

  test("exact name with ! and quoted string", () => {
    expect(parse('!"Lightning Bolt"')).toMatchObject(exact("Lightning Bolt"));
  });

  test("exact name with ! and single-quoted string", () => {
    expect(parse("!'Lightning Bolt'")).toMatchObject(exact("Lightning Bolt"));
  });

  test("empty exact-name variants parse as EXACT(value='') (Issue #53)", () => {
    for (const input of ["!", "!'", '!"', "!''", '!""']) {
      expect(parse(input)).toMatchObject({ type: "EXACT", value: "" });
    }
  });

  test("regex field value", () => {
    expect(parse("o:/^{T}:/")).toMatchObject(
      regexField("o", ":", "^{T}:"),
    );
  });

  test("comparison operators", () => {
    expect(parse("pow>=3")).toMatchObject(field("pow", ">=", "3"));
    expect(parse("pow<=3")).toMatchObject(field("pow", "<=", "3"));
    expect(parse("pow>3")).toMatchObject(field("pow", ">", "3"));
    expect(parse("pow<3")).toMatchObject(field("pow", "<", "3"));
    expect(parse("pow=3")).toMatchObject(field("pow", "=", "3"));
    expect(parse("pow!=3")).toMatchObject(field("pow", "!=", "3"));
  });

  test("trailing operator: c: with no value", () => {
    expect(parse("c:")).toMatchObject(field("c", ":", ""));
  });

  test("unclosed parenthesis", () => {
    expect(parse("(c:wu")).toMatchObject(field("c", ":", "wu"));
  });

  test("parser never throws on any input", () => {
    const inputs = ["", "(", ")", "OR", "-", "!", "c:", "((",  "-))", "a OR", "OR b"];
    for (const input of inputs) {
      expect(() => parse(input), `parse("${input}") should not throw`).not.toThrow();
    }
  });

  test("complex query", () => {
    expect(parse('c:wu (t:creature OR t:planeswalker) -o:"enters the"')).toMatchObject(
      and(
        field("c", ":", "wu"),
        or(field("t", ":", "creature"), field("t", ":", "planeswalker")),
        not(field("o", ":", "enters the")),
      ),
    );
  });

  describe("bare regex desugaring", () => {
    test("simple bare regex desugars to OR over string fields", () => {
      expect(parse("/bolt/")).toMatchObject(bareRegex("bolt"));
    });

    test("unclosed bare regex desugars the same way", () => {
      expect(parse("/bolt")).toMatchObject(bareRegex("bolt"));
    });

    test("negated bare regex", () => {
      expect(parse("-/bolt/")).toMatchObject(not(bareRegex("bolt")));
    });

    test("bare regex in implicit AND", () => {
      expect(parse("c:r /bolt/")).toMatchObject(
        and(field("c", ":", "r"), bareRegex("bolt")),
      );
    });

    test("bare regex in explicit OR", () => {
      expect(parse("c:r OR /bolt/")).toMatchObject(
        or(field("c", ":", "r"), bareRegex("bolt")),
      );
    });

    test("empty bare regex (just a slash)", () => {
      expect(parse("/")).toMatchObject(bareRegex(""));
    });

    test("bare regex does not break never-throws guarantee", () => {
      const inputs = ["/", "/bolt", "/bolt/", "-/x/", "(/x/) c:r"];
      for (const input of inputs) {
        expect(() => parse(input), `parse("${input}") should not throw`).not.toThrow();
      }
    });
  });

  describe("unique display aliases (Spec 048)", () => {
    test("++ desugars to unique:prints with sourceText", () => {
      const ast = parse("++") as import("./ast").FieldNode;
      expect(ast).toMatchObject(field("unique", ":", "prints"));
      expect(ast.sourceText).toBe("++");
    });

    test("@@ desugars to unique:art with sourceText", () => {
      const ast = parse("@@") as import("./ast").FieldNode;
      expect(ast).toMatchObject(field("unique", ":", "art"));
      expect(ast.sourceText).toBe("@@");
    });

    test("++ in combined query", () => {
      expect(parse("t:creature ++")).toMatchObject(
        and(field("t", ":", "creature"), field("unique", ":", "prints")),
      );
    });

    test("@@ in combined query", () => {
      expect(parse("lightning @@")).toMatchObject(
        and(bare("lightning"), field("unique", ":", "art")),
      );
    });

    test("negated ++ produces NOT over unique:prints", () => {
      expect(parse("-++")).toMatchObject(not(field("unique", ":", "prints")));
    });

    test("negated @@ produces NOT over unique:art", () => {
      expect(parse("-@@")).toMatchObject(not(field("unique", ":", "art")));
    });
  });

  describe("include:extras alias (Spec 057)", () => {
    test("** desugars to include:extras with sourceText", () => {
      const ast = parse("**") as import("./ast").FieldNode;
      expect(ast).toMatchObject(field("include", ":", "extras"));
      expect(ast.sourceText).toBe("**");
    });

    test("** in combined query", () => {
      expect(parse("t:creature **")).toMatchObject(
        and(field("t", ":", "creature"), field("include", ":", "extras")),
      );
    });

    test("negated ** produces NOT over include:extras", () => {
      expect(parse("-**")).toMatchObject(not(field("include", ":", "extras")));
    });
  });

  describe("NOP nodes", () => {
    test("trailing OR produces NOP right operand", () => {
      const ast = parse("a OR");
      expect(ast).toMatchObject(or(bare("a"), nop()));
    });

    test("leading OR produces NOP left operand", () => {
      const ast = parse("OR a");
      expect(ast).toMatchObject(or(nop(), bare("a")));
    });

    test("double OR produces NOP between operands", () => {
      const ast = parse("a OR OR b");
      expect(ast).toMatchObject(or(bare("a"), nop(), bare("b")));
    });

    test("empty parentheses produce NOP", () => {
      const ast = parse("()");
      expect(ast).toMatchObject(nop());
    });

    test("dangling dash produces NOP", () => {
      const ast = parse("-");
      expect(ast).toMatchObject(nop());
    });

    test("dangling dash after term produces term (NOP skipped from AND)", () => {
      const ast = parse("a -");
      // parseAndGroup produces [bare("a"), nop()]
      // but with children.length === 2, it returns AND([bare("a"), nop()])
      expect(ast).toMatchObject(and(bare("a"), nop()));
    });
  });

  describe("whitespace-aware field clauses (Spec 002 / GitHub #240)", () => {
    test("kw:f is a single FIELD", () => {
      expect(parse("kw:f")).toMatchObject(field("kw", ":", "f"));
    });

    test("kw: trailing is FIELD with empty value", () => {
      expect(parse("kw:")).toMatchObject(field("kw", ":", ""));
    });

    test("space after colon does not bind value to field", () => {
      expect(parse("kw: otag")).toMatchObject(and(field("kw", ":", ""), bare("otag")));
    });

    test("spaced first clause preserves following field clause", () => {
      expect(parse("kw: otag:ramp")).toMatchObject(
        and(field("kw", ":", ""), field("otag", ":", "ramp")),
      );
    });

    test("space before colon splits into bare kw, bare colon, bare flying", () => {
      expect(parse("kw : flying")).toMatchObject(
        and(bare("kw"), bare(":"), bare("flying")),
      );
    });

    test("space before colon only: colon merges with adjacent word", () => {
      expect(parse("kw :flying")).toMatchObject(and(bare("kw"), bare(":flying")));
    });

    test("space after comparison operator yields empty field value", () => {
      expect(parse("ci> r")).toMatchObject(and(field("ci", ">", ""), bare("r")));
    });

    test("space between field name and operator", () => {
      expect(parse("name :foo")).toMatchObject(and(bare("name"), bare(":foo")));
    });

    test("space before quoted value is not part of field", () => {
      expect(parse('o: "enters"')).toMatchObject(
        and(field("o", ":", ""), bare("enters", true)),
      );
    });

    test("field regex value requires adjacency", () => {
      expect(parse("c: /bolt/")).toMatchObject(
        and(field("c", ":", ""), bareRegex("bolt")),
      );
    });

    test("negation applies to first atom only; spaced clause completes as AND", () => {
      expect(parse("-kw: otag")).toMatchObject(and(not(field("kw", ":", "")), bare("otag")));
    });

    test("OR with spaced field clause", () => {
      expect(parse("a OR kw: otag")).toMatchObject(
        or(bare("a"), and(field("kw", ":", ""), bare("otag"))),
      );
    });

    test("leading colon merges with word (bare :word)", () => {
      expect(parse(":flying")).toMatchObject(bare(":flying"));
    });

    test("standalone operator at term start is BARE", () => {
      expect(parse("=")).toMatchObject(bare("="));
      expect(parse(">=")).toMatchObject(bare(">="));
    });
  });

  describe("operator aliases and invalid colon composites (Spec 002 / GitHub #255)", () => {
    test("=> and =< merge to >= and <=", () => {
      expect(parse("date=>2005")).toMatchObject(field("date", ">=", "2005"));
      expect(parse("date=<2005")).toMatchObject(field("date", "<=", "2005"));
    });

    test("== merges to = with operatorSynonym", () => {
      const ast = parse("set==fin") as import("./ast").FieldNode;
      expect(ast).toMatchObject({
        type: "FIELD",
        field: "set",
        operator: "=",
        value: "fin",
        operatorSynonym: "==",
      });
    });

    test("colon-comparison typos merge to two-character operators", () => {
      expect(parse("date:>2022")).toMatchObject(field("date", ":>", "2022"));
      expect(parse("date:<2018")).toMatchObject(field("date", ":<", "2018"));
      expect(parse("set:=mh2")).toMatchObject(field("set", ":=", "mh2"));
    });

    test("date:>2022 is a single FIELD, not AND of three terms", () => {
      const ast = parse("date:>2022");
      expect(ast.type).toBe("FIELD");
      if (ast.type === "FIELD") {
        expect(ast.field).toBe("date");
        expect(ast.operator).toBe(":>");
        expect(ast.value).toBe("2022");
      }
    });

    test("spaced := does not merge", () => {
      expect(parse("set: =mh2")).toMatchObject(and(field("set", ":", ""), bare("="), bare("mh2")));
    });
  });

  describe("source spans", () => {
    test("FIELD node span covers field through value", () => {
      const ast = parse("ci:wub");
      expect(ast.span).toEqual({ start: 0, end: 6 });
    });

    test("merged => operator span covers both punctuators and value", () => {
      const ast = parse("date=>2005") as import("./ast").FieldNode;
      expect(ast.span).toEqual({ start: 0, end: 10 });
      expect(ast.operator).toBe(">=");
    });

    test("FIELD node valueSpan covers just the value", () => {
      const ast = parse("ci:wub") as import("./ast").FieldNode;
      expect(ast.valueSpan).toEqual({ start: 3, end: 6 });
    });

    test("FIELD with quoted value", () => {
      const ast = parse('o:"enters the"') as import("./ast").FieldNode;
      expect(ast.span).toEqual({ start: 0, end: 14 });
      expect(ast.valueSpan).toEqual({ start: 2, end: 14 });
    });

    test("NOT node span covers dash through child", () => {
      const ast = parse("-ci:r");
      expect(ast.span).toEqual({ start: 0, end: 5 });
    });

    test("AND node span covers first through last child", () => {
      const ast = parse("a b c");
      expect(ast.span).toEqual({ start: 0, end: 5 });
    });

    test("OR node span covers first through last child", () => {
      const ast = parse("a OR b");
      expect(ast.span).toEqual({ start: 0, end: 6 });
    });

    test("BARE unquoted span", () => {
      const ast = parse("goblin");
      expect(ast.span).toEqual({ start: 0, end: 6 });
    });

    test("BARE quoted span includes delimiters", () => {
      const ast = parse('"goblin"');
      expect(ast.span).toEqual({ start: 0, end: 8 });
    });

    test("EXACT span covers bang through value", () => {
      const ast = parse('!"Lightning Bolt"');
      expect(ast.span).toEqual({ start: 0, end: 17 });
    });

    test("parenthesized expression: parens excluded from spans", () => {
      const ast = parse("(a OR b) c");
      expect(ast.type).toBe("AND");
      expect(ast.span).toEqual({ start: 1, end: 10 });
      if (ast.type === "AND") {
        expect(ast.children[0].span).toEqual({ start: 1, end: 7 });
        expect(ast.children[1].span).toEqual({ start: 9, end: 10 });
      }
    });

    test("dangling operator produces zero-width valueSpan", () => {
      const ast = parse("ci:") as import("./ast").FieldNode;
      expect(ast.span).toEqual({ start: 0, end: 3 });
      expect(ast.valueSpan).toEqual({ start: 3, end: 3 });
    });

    test("REGEX_FIELD node span covers field through closing slash", () => {
      const ast = parse("name:/giant/") as import("./ast").RegexFieldNode;
      expect(ast.span).toEqual({ start: 0, end: 12 });
    });

    test("synthetic bare regex nodes have no span", () => {
      const ast = parse("/giant/");
      expect(ast.type).toBe("OR");
      expect(ast.span).toBeUndefined();
      if (ast.type === "OR") {
        for (const child of ast.children) {
          expect(child.span).toBeUndefined();
        }
      }
    });

    test("negated bare word span", () => {
      const ast = parse("-fire");
      expect(ast.span).toEqual({ start: 0, end: 5 });
    });

    test("comparison operator field span", () => {
      const ast = parse("pow>=3") as import("./ast").FieldNode;
      expect(ast.span).toEqual({ start: 0, end: 6 });
      expect(ast.valueSpan).toEqual({ start: 5, end: 6 });
    });

    test("nested AND inside OR preserves correct spans", () => {
      const ast = parse("a b OR c");
      expect(ast.type).toBe("OR");
      if (ast.type === "OR") {
        expect(ast.children[0].span).toEqual({ start: 0, end: 3 });
        expect(ast.children[1].span).toEqual({ start: 7, end: 8 });
      }
      expect(ast.span).toEqual({ start: 0, end: 8 });
    });

    test("FIELD with quoted value has valueSpan including quotes", () => {
      const ast = parse('t:"legendary creature"') as import("./ast").FieldNode;
      expect(ast.span).toEqual({ start: 0, end: 22 });
      expect(ast.valueSpan).toEqual({ start: 2, end: 22 });
    });

    test("FIELD with double-quoted value has sourceText including quotes (issue 133)", () => {
      const ast = parse('o:"destroy all creatures"') as import("./ast").FieldNode;
      expect(ast.sourceText).toBe('"destroy all creatures"');
      expect(ast.value).toBe("destroy all creatures");
    });

    test("FIELD with single-quoted value has sourceText including quotes (issue 133)", () => {
      const ast = parse("o:'destroy all creatures'") as import("./ast").FieldNode;
      expect(ast.sourceText).toBe("'destroy all creatures'");
      expect(ast.value).toBe("destroy all creatures");
    });

    test("FIELD with unquoted value has no sourceText", () => {
      const ast = parse("o:destroy") as import("./ast").FieldNode;
      expect(ast.sourceText).toBeUndefined();
      expect(ast.value).toBe("destroy");
    });
  });
});
