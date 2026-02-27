// SPDX-License-Identifier: Apache-2.0
import { TokenType, type Token } from "./ast";

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  ":": TokenType.COLON,
  "(": TokenType.LPAREN,
  ")": TokenType.RPAREN,
};

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isSpecial(ch: string): boolean {
  return (
    ch in SINGLE_CHAR_TOKENS ||
    ch === "=" ||
    ch === "!" ||
    ch === "<" ||
    ch === ">" ||
    ch === '"'
  );
}

export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos];

    if (isWhitespace(ch)) {
      pos++;
      continue;
    }

    if (ch in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch], value: ch, start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    if (ch === "-") {
      tokens.push({ type: TokenType.DASH, value: "-", start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const tokenStart = pos;
      pos++;
      while (pos < input.length && input[pos] !== ch) {
        pos++;
      }
      const value = input.slice(tokenStart + 1, pos);
      if (pos < input.length) pos++; // skip closing quote
      tokens.push({ type: TokenType.QUOTED, value, start: tokenStart, end: pos });
      continue;
    }

    if (ch === "/") {
      const tokenStart = pos;
      pos++;
      while (pos < input.length && !(input[pos] === "/" && input[pos - 1] !== "\\")) {
        pos++;
      }
      const value = input.slice(tokenStart + 1, pos);
      if (pos < input.length) pos++; // skip closing slash
      tokens.push({ type: TokenType.REGEX, value, start: tokenStart, end: pos });
      continue;
    }

    if (ch === "!") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.NEQ, value: "!=", start: pos, end: pos + 2 });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.BANG, value: "!", start: pos, end: pos + 1 });
        pos++;
      }
      continue;
    }

    if (ch === "<") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.LTE, value: "<=", start: pos, end: pos + 2 });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.LT, value: "<", start: pos, end: pos + 1 });
        pos++;
      }
      continue;
    }

    if (ch === ">") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.GTE, value: ">=", start: pos, end: pos + 2 });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.GT, value: ">", start: pos, end: pos + 1 });
        pos++;
      }
      continue;
    }

    if (ch === "=") {
      tokens.push({ type: TokenType.EQ, value: "=", start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    const start = pos;
    while (pos < input.length && !isWhitespace(input[pos]) && !isSpecial(input[pos])) {
      pos++;
    }
    if (pos > start) {
      const value = input.slice(start, pos);
      tokens.push({ type: value.toUpperCase() === "OR" ? TokenType.OR : TokenType.WORD, value, start, end: pos });
    }
  }

  tokens.push({ type: TokenType.EOF, value: "", start: input.length, end: input.length });
  return tokens;
}
