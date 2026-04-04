// SPDX-License-Identifier: Apache-2.0
import type { KeywordData } from "../data";
import { normalizeForResolution } from "./categorical-resolve";

/** One wire keyword key’s normalized form and face index list (Spec 176 precompute). */
export type KeywordEvalEntry = {
  readonly normKey: string;
  readonly faceIndices: readonly number[];
};

export type KeywordEvalIndex = readonly KeywordEvalEntry[];

export type KeywordDataRef = {
  keywords: KeywordData | null;
  keywordEvalIndex: KeywordEvalIndex | null;
};

function applyKeywordFaceIndices(faceIndices: readonly number[], buf: Uint8Array): void {
  for (let i = 0; i < faceIndices.length; i++) {
    const f = faceIndices[i]!;
    if (f < buf.length) buf[f] = 1;
  }
}

/**
 * Precompute `normalizeForResolution` for each wire key once (Spec 176 / Spec 182).
 */
export function buildKeywordEvalIndex(keywords: KeywordData): KeywordEvalIndex {
  const keys = Object.keys(keywords);
  const out: KeywordEvalEntry[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    out[i] = { normKey: normalizeForResolution(k), faceIndices: keywords[k]! };
  }
  return out;
}

/** Build ref for worker / CLI: `keywords` null → not loaded; else wire map + prepared rows. */
export function buildKeywordDataRef(keywords: KeywordData | null): KeywordDataRef {
  if (keywords === null) return { keywords: null, keywordEvalIndex: null };
  return { keywords, keywordEvalIndex: buildKeywordEvalIndex(keywords) };
}

/**
 * Evaluate kw:value / keyword:value in face domain (Spec 176).
 * `:` — normalized prefix union; `=` — normalized exact match.
 * Non-empty value with no matching key: `unknown keyword "…"` (passthrough, Spec 039).
 * Empty (trimmed) value: all faces match.
 */
export function evalKeyword(
  operator: ":" | "=",
  value: string,
  ref: KeywordDataRef | null,
  buf: Uint8Array,
): string | null {
  const keywords = ref?.keywords ?? null;
  if (keywords === null) return "keywords not loaded";
  const rows = ref!.keywordEvalIndex ?? buildKeywordEvalIndex(keywords);
  const trimmed = value.trim();
  if (trimmed === "") {
    for (let i = 0; i < buf.length; i++) buf[i] = 1;
    return null;
  }
  const u = normalizeForResolution(trimmed);
  let matchedAny = false;
  const prefixOp = operator === ":";
  for (let i = 0; i < rows.length; i++) {
    const { normKey, faceIndices } = rows[i]!;
    const ok = prefixOp ? normKey.startsWith(u) : normKey === u;
    if (!ok) continue;
    matchedAny = true;
    applyKeywordFaceIndices(faceIndices, buf);
  }
  if (!matchedAny) return `unknown keyword "${trimmed}"`;
  return null;
}
