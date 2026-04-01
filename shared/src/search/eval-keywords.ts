// SPDX-License-Identifier: Apache-2.0
import type { KeywordData } from "../data";
import { normalizeForResolution } from "./categorical-resolve";

function applyKeywordFaceIndices(faceIndices: number[], buf: Uint8Array): void {
  for (let i = 0; i < faceIndices.length; i++) {
    const f = faceIndices[i]!;
    if (f < buf.length) buf[f] = 1;
  }
}

/**
 * Evaluate kw:value / keyword:value in face domain (Spec 176).
 * Normalized prefix on all keyword index keys; union face indices.
 * Non-empty value with no matching key: `unknown keyword "…"` (passthrough, Spec 039).
 * Empty (trimmed) value: all faces match.
 */
export function evalKeyword(
  value: string,
  keywords: KeywordData | null,
  buf: Uint8Array,
): string | null {
  if (!keywords) return "keywords not loaded";
  const trimmed = value.trim();
  if (trimmed === "") {
    for (let i = 0; i < buf.length; i++) buf[i] = 1;
    return null;
  }
  const prefix = normalizeForResolution(trimmed);
  let matchedAny = false;
  for (const key of Object.keys(keywords)) {
    if (!normalizeForResolution(key).startsWith(prefix)) continue;
    matchedAny = true;
    applyKeywordFaceIndices(keywords[key]!, buf);
  }
  if (!matchedAny) return `unknown keyword "${trimmed}"`;
  return null;
}
