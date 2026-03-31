// SPDX-License-Identifier: Apache-2.0
import type { OracleTagData } from "../data";
import { normalizeForResolution } from "./categorical-resolve";

function applyOracleIndices(faceIndices: number[], buf: Uint8Array): void {
  for (let i = 0; i < faceIndices.length; i++) {
    const f = faceIndices[i]!;
    if (f < buf.length) buf[f] = 1;
  }
}

function applyPrintingIndices(printingIndices: Uint32Array, buf: Uint8Array): void {
  for (let i = 0; i < printingIndices.length; i++) {
    const p = printingIndices[i]!;
    if (p < buf.length) buf[p] = 1;
  }
}

/**
 * Evaluate otag:value in face domain (Spec 174).
 * Normalized prefix on all oracle tag keys; union face indices. No error when no key matches.
 * Returns error string or null on success.
 */
export function evalOracleTag(
  label: string,
  oracleTags: OracleTagData | null,
  buf: Uint8Array,
): string | null {
  if (!oracleTags) return "oracle tags not loaded";
  const trimmed = label.trim();
  const prefix = normalizeForResolution(trimmed);
  for (const key of Object.keys(oracleTags)) {
    if (!normalizeForResolution(key).startsWith(prefix)) continue;
    applyOracleIndices(oracleTags[key]!, buf);
  }
  return null;
}

/**
 * Evaluate atag:value in printing domain (Spec 174).
 * Normalized prefix on all illustration tag keys; union printing indices.
 * Returns error string or null on success.
 */
export function evalIllustrationTag(
  label: string,
  illustrationTags: Map<string, Uint32Array> | null,
  buf: Uint8Array,
): string | null {
  if (!illustrationTags) return "illustration tags not loaded";
  const trimmed = label.trim();
  const prefix = normalizeForResolution(trimmed);
  for (const key of illustrationTags.keys()) {
    if (!normalizeForResolution(key).startsWith(prefix)) continue;
    const printingIndices = illustrationTags.get(key);
    if (printingIndices !== undefined) applyPrintingIndices(printingIndices, buf);
  }
  return null;
}
