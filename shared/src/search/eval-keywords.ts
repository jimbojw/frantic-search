// SPDX-License-Identifier: Apache-2.0
import type { KeywordData } from "../data";

/**
 * Evaluate kw:value / keyword:value in face domain.
 * Returns error string or null on success.
 * Empty value: fills buffer with 1s (match all cards).
 */
export function evalKeyword(
  value: string,
  keywords: KeywordData | null,
  buf: Uint8Array,
): string | null {
  if (!keywords) return "keywords not loaded";
  if (value === "") {
    for (let i = 0; i < buf.length; i++) buf[i] = 1;
    return null;
  }
  const key = value.toLowerCase();
  const faceIndices = keywords[key];
  if (faceIndices === undefined) return `unknown keyword "${value}"`;
  for (let i = 0; i < faceIndices.length; i++) {
    const f = faceIndices[i];
    if (f < buf.length) buf[f] = 1;
  }
  return null;
}
