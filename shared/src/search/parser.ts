// SPDX-License-Identifier: Apache-2.0
import { TokenType, type Token, type ASTNode, type Span } from "./ast";
import { lex } from "./lexer";

const BARE_REGEX_FIELDS = ["name", "oracle", "type"];

const OPERATORS = new Set<string>([
  TokenType.COLON,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.GT,
  TokenType.LTE,
  TokenType.GTE,
]);

function compoundSpan(children: ASTNode[]): Span | undefined {
  const first = children[0]?.span;
  const last = children[children.length - 1]?.span;
  if (first && last) return { start: first.start, end: last.end };
  return undefined;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    const node = this.parseExpr();
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private at(type: string): boolean {
    return this.peek().type === type;
  }

  private parseExpr(): ASTNode {
    return this.parseOrGroup();
  }

  private parseOrGroup(): ASTNode {
    const left = this.parseAndGroup();
    if (!this.at(TokenType.OR)) return left;

    const children: ASTNode[] = [left];
    while (this.at(TokenType.OR)) {
      this.advance();
      children.push(this.parseAndGroup());
    }
    return { type: "OR", children, span: compoundSpan(children) };
  }

  private parseAndGroup(): ASTNode {
    const children: ASTNode[] = [];
    while (this.isTermStart()) {
      children.push(this.parseTerm());
    }
    if (children.length === 0) return { type: "NOP" };
    if (children.length === 1) return children[0];
    return { type: "AND", children, span: compoundSpan(children) };
  }

  private isTermStart(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.WORD ||
      t === TokenType.QUOTED ||
      t === TokenType.REGEX ||
      t === TokenType.DASH ||
      t === TokenType.BANG ||
      t === TokenType.LPAREN
    );
  }

  private parseTerm(): ASTNode {
    if (this.at(TokenType.DASH)) {
      const dash = this.advance();
      if (!this.isAtomStart()) return { type: "NOP" };
      const child = this.parseAtom();
      const span = child.span ? { start: dash.start, end: child.span.end } : undefined;
      return { type: "NOT", child, span };
    }
    if (this.at(TokenType.BANG)) {
      const bang = this.advance();
      if (this.at(TokenType.QUOTED) || this.at(TokenType.WORD)) {
        const valueTok = this.advance();
        return { type: "EXACT", value: valueTok.value, span: { start: bang.start, end: valueTok.end } };
      }
      return { type: "EXACT", value: "", span: { start: bang.start, end: bang.end } };
    }
    return this.parseAtom();
  }

  private isAtomStart(): boolean {
    const t = this.peek().type;
    return t === TokenType.LPAREN || t === TokenType.WORD || t === TokenType.QUOTED || t === TokenType.REGEX;
  }

  private parseAtom(): ASTNode {
    if (this.at(TokenType.LPAREN)) {
      this.advance();
      const inner = this.parseExpr();
      if (this.at(TokenType.RPAREN)) this.advance();
      return inner;
    }

    if (this.at(TokenType.WORD)) {
      const word = this.advance();
      if (OPERATORS.has(this.peek().type)) {
        const op = this.advance();
        if (this.at(TokenType.WORD) || this.at(TokenType.QUOTED)) {
          const valueTok = this.advance();
          return {
            type: "FIELD", field: word.value, operator: op.value, value: valueTok.value,
            span: { start: word.start, end: valueTok.end },
            valueSpan: { start: valueTok.start, end: valueTok.end },
          };
        }
        if (this.at(TokenType.REGEX)) {
          const regex = this.advance();
          return {
            type: "REGEX_FIELD", field: word.value, operator: op.value, pattern: regex.value,
            span: { start: word.start, end: regex.end },
          };
        }
        return {
          type: "FIELD", field: word.value, operator: op.value, value: "",
          span: { start: word.start, end: op.end },
          valueSpan: { start: op.end, end: op.end },
        };
      }
      return { type: "BARE", value: word.value, quoted: false, span: { start: word.start, end: word.end } };
    }

    if (this.at(TokenType.QUOTED)) {
      const tok = this.advance();
      return { type: "BARE", value: tok.value, quoted: true, span: { start: tok.start, end: tok.end } };
    }

    if (this.at(TokenType.REGEX)) {
      const pattern = this.advance().value;
      return {
        type: "OR",
        children: BARE_REGEX_FIELDS.map((field) => ({
          type: "REGEX_FIELD" as const,
          field,
          operator: ":",
          pattern,
        })),
      };
    }

    this.advance();
    return { type: "NOP" };
  }
}

export function parse(input: string): ASTNode {
  const tokens = lex(input);
  return new Parser(tokens).parse();
}
