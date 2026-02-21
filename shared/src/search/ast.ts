// SPDX-License-Identifier: Apache-2.0

export const TokenType = {
  WORD: "WORD",
  QUOTED: "QUOTED",
  COLON: "COLON",
  EQ: "EQ",
  NEQ: "NEQ",
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  DASH: "DASH",
  BANG: "BANG",
  REGEX: "REGEX",
  OR: "OR",
  EOF: "EOF",
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  value: string;
}
