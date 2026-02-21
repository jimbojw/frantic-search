// SPDX-License-Identifier: Apache-2.0
import { TokenType, type Token, type ASTNode } from "./ast";
import { lex } from "./lexer";

const OPERATORS = new Set<string>([
  TokenType.COLON,
  TokenType.EQ,
  TokenType.NEQ,
  TokenType.LT,
  TokenType.GT,
  TokenType.LTE,
  TokenType.GTE,
]);

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
    return { type: "OR", children };
  }

  private parseAndGroup(): ASTNode {
    const children: ASTNode[] = [];
    while (this.isTermStart()) {
      children.push(this.parseTerm());
    }
    if (children.length === 0) return { type: "AND", children: [] };
    if (children.length === 1) return children[0];
    return { type: "AND", children };
  }

  private isTermStart(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.WORD ||
      t === TokenType.QUOTED ||
      t === TokenType.DASH ||
      t === TokenType.BANG ||
      t === TokenType.LPAREN
    );
  }

  private parseTerm(): ASTNode {
    if (this.at(TokenType.DASH)) {
      this.advance();
      if (!this.isAtomStart()) return { type: "NOT", child: { type: "AND", children: [] } };
      return { type: "NOT", child: this.parseAtom() };
    }
    if (this.at(TokenType.BANG)) {
      this.advance();
      const value = this.at(TokenType.QUOTED) || this.at(TokenType.WORD)
        ? this.advance().value
        : "";
      return { type: "EXACT", value };
    }
    return this.parseAtom();
  }

  private isAtomStart(): boolean {
    const t = this.peek().type;
    return t === TokenType.LPAREN || t === TokenType.WORD || t === TokenType.QUOTED;
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
          const value = this.advance();
          return { type: "FIELD", field: word.value, operator: op.value, value: value.value };
        }
        if (this.at(TokenType.REGEX)) {
          const regex = this.advance();
          return { type: "REGEX_FIELD", field: word.value, operator: op.value, pattern: regex.value };
        }
        return { type: "FIELD", field: word.value, operator: op.value, value: "" };
      }
      return { type: "BARE", value: word.value };
    }

    if (this.at(TokenType.QUOTED)) {
      return { type: "BARE", value: this.advance().value };
    }

    this.advance();
    return { type: "AND", children: [] };
  }
}

export function parse(input: string): ASTNode {
  const tokens = lex(input);
  return new Parser(tokens).parse();
}
