// SPDX-License-Identifier: Apache-2.0
import type { OracleTagData } from "../data";

/**
 * Evaluate otag:label in face domain.
 * Returns error string or null on success.
 */
export function evalOracleTag(
  label: string,
  oracleTags: OracleTagData | null,
  buf: Uint8Array,
): string | null {
  if (!oracleTags) return "oracle tags not loaded";
  const key = label.toLowerCase();
  const faceIndices = oracleTags[key];
  if (faceIndices === undefined) return `unknown tag "${label}"`;
  for (let i = 0; i < faceIndices.length; i++) {
    const f = faceIndices[i];
    if (f < buf.length) buf[f] = 1;
  }
  return null;
}

/**
 * Evaluate atag:label in printing domain.
 * Returns error string or null on success.
 */
export function evalIllustrationTag(
  label: string,
  illustrationTags: Map<string, Uint32Array> | null,
  buf: Uint8Array,
): string | null {
  if (!illustrationTags) return "illustration tags not loaded";
  const key = label.toLowerCase();
  const printingIndices = illustrationTags.get(key);
  if (printingIndices === undefined) return `unknown tag "${label}"`;
  for (let i = 0; i < printingIndices.length; i++) {
    const p = printingIndices[i];
    if (p < buf.length) buf[p] = 1;
  }
  return null;
}
