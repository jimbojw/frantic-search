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
  start: number;
  end: number;
}

// --- Source Spans ---

export interface Span {
  start: number;
  end: number;
}

// --- AST Node Types ---

export interface AndNode {
  type: "AND";
  children: ASTNode[];
  span?: Span;
}

export interface OrNode {
  type: "OR";
  children: ASTNode[];
  span?: Span;
}

export interface NotNode {
  type: "NOT";
  child: ASTNode;
  span?: Span;
}

export interface FieldNode {
  type: "FIELD";
  field: string;
  operator: string;
  value: string;
  span?: Span;
  valueSpan?: Span;
}

export interface BareWordNode {
  type: "BARE";
  value: string;
  quoted: boolean;
  span?: Span;
}

export interface ExactNameNode {
  type: "EXACT";
  value: string;
  span?: Span;
}

export interface RegexFieldNode {
  type: "REGEX_FIELD";
  field: string;
  operator: string;
  pattern: string;
  span?: Span;
}

export interface NopNode {
  type: "NOP";
  span?: Span;
}

export type ASTNode =
  | AndNode
  | OrNode
  | NotNode
  | NopNode
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
  error?: string;
  children?: QueryNodeResult[];
}

export interface EvalOutput {
  result: QueryNodeResult;
  indices: Uint32Array;
  printingIndices?: Uint32Array;
  hasPrintingConditions: boolean;
  printingsUnavailable: boolean;
}
