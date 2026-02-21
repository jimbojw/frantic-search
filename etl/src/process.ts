// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import {
  ORACLE_CARDS_PATH,
  DICTIONARY_PATH,
  MANA_DICTIONARY_PATH,
  TRIE_PATH,
  MANA_TRIE_PATH,
  ensureIntermediateDir,
} from "./paths";
import { log } from "./log";

interface Card {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

const MANA_COST_RE = /^(\{[^}]+\})+$/;

function isManaToken(token: string): boolean {
  return MANA_COST_RE.test(token);
}

function normalize(token: string): string {
  return token
    .replace(/^["(]+/, "")
    .replace(/[,.:")+]+$/, "")
    .toLowerCase();
}

function expandSlashes(token: string): string[] {
  if (!token.includes("/")) return [token];
  if (token.includes("{") || token.includes("}")) return [token];
  const parts = token.split("/").filter((p) => p.length > 0);
  return [token, ...parts];
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s\u2014]+/)
    .map(normalize)
    .filter((t) => t.length > 0)
    .flatMap(expandSlashes);
}

function extractTokens(card: Card): string[] {
  const fields = [card.name, card.mana_cost, card.type_line, card.oracle_text];
  return fields.flatMap((f) => (f ? tokenize(f) : []));
}

// ---------------------------------------------------------------------------
// Trie (shared)
// ---------------------------------------------------------------------------

/** Split a token into atomic symbols: brace-enclosed sequences or single chars. */
function toSymbols(token: string): string[] {
  return token.match(/\{[^}]*\}|./g) ?? [];
}

interface TrieNode {
  count: number;
  children: Record<string, TrieNode>;
}

function createTrieNode(): TrieNode {
  return { count: 0, children: {} };
}

function insertIntoTrie(
  root: TrieNode,
  symbols: string[],
  count: number,
): void {
  let node = root;
  for (const symbol of symbols) {
    if (!node.children[symbol]) {
      node.children[symbol] = createTrieNode();
    }
    node = node.children[symbol];
  }
  node.count += count;
}

/** Strip zero counts and empty children for a compact JSON representation. */
function compactTrie(node: TrieNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (node.count > 0) out.count = node.count;
  const keys = Object.keys(node.children);
  if (keys.length > 0) {
    const children: Record<string, unknown> = {};
    for (const key of keys) {
      children[key] = compactTrie(node.children[key]);
    }
    out.children = children;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mana canonical ordering
// ---------------------------------------------------------------------------

const MANA_PRIORITY: Record<string, number> = {
  "{w}": 0,
  "{u}": 1,
  "{b}": 2,
  "{r}": 3,
  "{g}": 4,
  "{c}": 5,
  "{s}": 6,
  "{x}": 7,
};

function manaSortKey(symbol: string): number {
  const priority = MANA_PRIORITY[symbol];
  if (priority !== undefined) return priority;
  // Hybrid symbols (e.g. {w/u}, {r/p}) — sort after basic colors, before generics
  if (symbol.includes("/")) return 8;
  // Numeric mana — sort last, by value
  const num = parseInt(symbol.replace(/[{}]/g, ""), 10);
  if (!isNaN(num)) return 100 + num;
  // Anything else
  return 50;
}

function canonicalizeMana(symbols: string[]): string[] {
  return [...symbols].sort((a, b) => manaSortKey(a) - manaSortKey(b));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildDictionary(verbose: boolean): void {
  log(`Reading ${ORACLE_CARDS_PATH}…`, verbose);
  const raw = fs.readFileSync(ORACLE_CARDS_PATH, "utf-8");
  const cards: Card[] = JSON.parse(raw);

  log(`Processing ${cards.length} cards…`, verbose);

  const wordFreq: Record<string, number> = {};
  const manaFreq: Record<string, number> = {};

  for (const card of cards) {
    for (const token of extractTokens(card)) {
      if (isManaToken(token)) {
        manaFreq[token] = (manaFreq[token] ?? 0) + 1;
      } else {
        wordFreq[token] = (wordFreq[token] ?? 0) + 1;
      }
    }
  }

  const wordCount = Object.keys(wordFreq).length;
  const manaCount = Object.keys(manaFreq).length;
  log(`Found ${wordCount} word tokens, ${manaCount} mana cost tokens`, verbose);

  ensureIntermediateDir();

  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(wordFreq, null, 2) + "\n");
  log(`Wrote ${DICTIONARY_PATH}`, true);

  fs.writeFileSync(
    MANA_DICTIONARY_PATH,
    JSON.stringify(manaFreq, null, 2) + "\n",
  );
  log(`Wrote ${MANA_DICTIONARY_PATH}`, true);

  log("Building word trie…", verbose);
  const wordTrie = createTrieNode();
  for (const [token, count] of Object.entries(wordFreq)) {
    insertIntoTrie(wordTrie, toSymbols(token), count);
  }
  fs.writeFileSync(
    TRIE_PATH,
    JSON.stringify(compactTrie(wordTrie), null, 2) + "\n",
  );
  log(`Wrote ${TRIE_PATH}`, true);

  log("Building mana trie (canonical order)…", verbose);
  const manaTrie = createTrieNode();
  for (const [token, count] of Object.entries(manaFreq)) {
    const symbols = toSymbols(token);
    insertIntoTrie(manaTrie, canonicalizeMana(symbols), count);
  }
  fs.writeFileSync(
    MANA_TRIE_PATH,
    JSON.stringify(compactTrie(manaTrie), null, 2) + "\n",
  );
  log(`Wrote ${MANA_TRIE_PATH}`, true);
}
