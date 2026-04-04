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
  /** Display form for desugared aliases (e.g. "++", "@@"). Used by breakdown. */
  sourceText?: string;
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
  /** Card count; present when dual counts available. */
  matchCountCards?: number;
  /** Print count; present when PrintingIndex is loaded and dual counts available. */
  matchCountPrints?: number;
  cached: boolean;
  productionMs: number;
  evalMs: number;
  error?: string;
  children?: QueryNodeResult[];
}

export type UniqueMode = "cards" | "prints" | "art";

export interface SortDirective {
  field: string;
  direction: "asc" | "desc";
  isPrintingDomain: boolean;
}

export interface EvalOutput {
  result: QueryNodeResult;
  indices: Uint32Array;
  printingIndices?: Uint32Array;
  hasPrintingConditions: boolean;
  printingsUnavailable: boolean;
  /** True when query has flavor: term but flavor-index.json not yet loaded. Spec 142. */
  flavorUnavailable?: boolean;
  /** True when query has a:/artist: term but artist-index.json not yet loaded. Spec 149. */
  artistUnavailable?: boolean;
  uniqueMode: UniqueMode;
  includeExtras: boolean;
  /** Spec 178: positive `is:<extras-layout>` disables extras-layout default omission. */
  widenExtrasLayout: boolean;
  /** Spec 178: positive `is:content_warning` disables content-warning default omission. */
  widenContentWarning: boolean;
  /** Spec 178: positive `is:playtest` disables playtest default omission. */
  widenPlaytest: boolean;
  /** Spec 178: positive `is:oversized` disables oversized default omission. */
  widenOversized: boolean;
  /** Spec 178: normalized prefixes from positive `set:` / `s:` / `e:` / `edition:` with `:` only. */
  positiveSetPrefixes: string[];
  /** Spec 178: normalized exact values from positive `set=` / `s=` / `e=` / `edition=`. */
  positiveSetExact: string[];
  /** Spec 178: normalized prefixes from positive `set_type:` / `st:` with `:` only. */
  positiveSetTypePrefixes: string[];
  /** Spec 178: normalized exact values from positive `set_type=` / `st=`. */
  positiveSetTypeExact: string[];
  sortBy: SortDirective | null;
}
