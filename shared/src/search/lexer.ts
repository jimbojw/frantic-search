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
    ch === '"' ||
    ch === "-"
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
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch], value: ch });
      pos++;
      continue;
    }

    if (ch === "-") {
      tokens.push({ type: TokenType.DASH, value: "-" });
      pos++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      pos++;
      const start = pos;
      while (pos < input.length && input[pos] !== ch) {
        pos++;
      }
      tokens.push({ type: TokenType.QUOTED, value: input.slice(start, pos) });
      if (pos < input.length) pos++; // skip closing quote
      continue;
    }

    if (ch === "/") {
      pos++;
      const start = pos;
      while (pos < input.length && !(input[pos] === "/" && input[pos - 1] !== "\\")) {
        pos++;
      }
      tokens.push({ type: TokenType.REGEX, value: input.slice(start, pos) });
      if (pos < input.length) pos++; // skip closing slash
      continue;
    }

    if (ch === "!") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.NEQ, value: "!=" });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.BANG, value: "!" });
        pos++;
      }
      continue;
    }

    if (ch === "<") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.LTE, value: "<=" });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.LT, value: "<" });
        pos++;
      }
      continue;
    }

    if (ch === ">") {
      if (pos + 1 < input.length && input[pos + 1] === "=") {
        tokens.push({ type: TokenType.GTE, value: ">=" });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.GT, value: ">" });
        pos++;
      }
      continue;
    }

    if (ch === "=") {
      tokens.push({ type: TokenType.EQ, value: "=" });
      pos++;
      continue;
    }

    // Consume a WORD: contiguous non-whitespace, non-special characters
    const start = pos;
    while (pos < input.length && !isWhitespace(input[pos]) && !isSpecial(input[pos])) {
      pos++;
    }
    if (pos > start) {
      const value = input.slice(start, pos);
      tokens.push({ type: value.toUpperCase() === "OR" ? TokenType.OR : TokenType.WORD, value });
    }
  }

  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}
