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

// --- AST Node Types ---

export interface AndNode {
  type: "AND";
  children: ASTNode[];
}

export interface OrNode {
  type: "OR";
  children: ASTNode[];
}

export interface NotNode {
  type: "NOT";
  child: ASTNode;
}

export interface FieldNode {
  type: "FIELD";
  field: string;
  operator: string;
  value: string;
}

export interface BareWordNode {
  type: "BARE";
  value: string;
  quoted: boolean;
}

export interface ExactNameNode {
  type: "EXACT";
  value: string;
}

export interface RegexFieldNode {
  type: "REGEX_FIELD";
  field: string;
  operator: string;
  pattern: string;
}

export type ASTNode =
  | AndNode
  | OrNode
  | NotNode
  | FieldNode
  | BareWordNode
  | ExactNameNode
  | RegexFieldNode;

// --- Evaluation Result ---

export interface QueryNodeResult {
  node: ASTNode;
  matchCount: number;
  cached: boolean;
  productionMs: number;
  evalMs: number;
  children?: QueryNodeResult[];
}

export interface EvalOutput {
  result: QueryNodeResult;
  matchingIndices: number[];
}
