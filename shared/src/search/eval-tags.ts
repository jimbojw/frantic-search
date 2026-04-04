// SPDX-License-Identifier: Apache-2.0
import type { OracleTagData } from "../data";
import { normalizeForResolution } from "./categorical-resolve";

/** One wire oracle tag key’s normalized form and face index list (Spec 174 precompute). */
export type OracleTagEvalEntry = {
  readonly normKey: string;
  readonly faceIndices: readonly number[];
};

/** One wire illustration tag key’s normalized form and printing index list (Spec 174 precompute). */
export type IllustrationTagEvalEntry = {
  readonly normKey: string;
  readonly printingIndices: Uint32Array;
};

function applyOracleIndices(faceIndices: readonly number[], buf: Uint8Array): void {
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
 * Precompute `normalizeForResolution` for each oracle tag wire key once (Spec 174).
 */
export function buildOracleTagEvalIndex(oracle: OracleTagData): OracleTagEvalEntry[] {
  const keys = Object.keys(oracle);
  const out: OracleTagEvalEntry[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    out[i] = { normKey: normalizeForResolution(k), faceIndices: oracle[k]! };
  }
  return out;
}

/**
 * Precompute `normalizeForResolution` for each illustration tag wire key once (Spec 174).
 */
export function buildIllustrationTagEvalIndex(illustration: Map<string, Uint32Array>): IllustrationTagEvalEntry[] {
  const keys = Array.from(illustration.keys());
  const out: IllustrationTagEvalEntry[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    out[i] = { normKey: normalizeForResolution(k), printingIndices: illustration.get(k)! };
  }
  return out;
}

/**
 * Evaluate otag:value in face domain (Spec 174 / ADR-022).
 * `:` — prefix union; `=` — exact; `!=` — negation of exact `=` mask.
 */
export function evalOracleTag(
  operator: ":" | "=" | "!=",
  value: string,
  oracle: OracleTagData | null,
  rows: readonly OracleTagEvalEntry[] | null,
  buf: Uint8Array,
): string | null {
  if (!oracle) return "oracle tags not loaded";
  const indexRows = rows ?? buildOracleTagEvalIndex(oracle);
  const trimmed = value.trim();

  if (trimmed === "") {
    for (let i = 0; i < buf.length; i++) buf[i] = 0;
    for (let r = 0; r < indexRows.length; r++) {
      applyOracleIndices(indexRows[r]!.faceIndices, buf);
    }
    if (operator === "!=") {
      for (let i = 0; i < buf.length; i++) buf[i] ^= 1;
    }
    return null;
  }

  const u = normalizeForResolution(trimmed);

  if (operator === ":") {
    let matchedAny = false;
    for (let r = 0; r < indexRows.length; r++) {
      const { normKey, faceIndices } = indexRows[r]!;
      if (!normKey.startsWith(u)) continue;
      matchedAny = true;
      applyOracleIndices(faceIndices, buf);
    }
    if (!matchedAny) return `unknown oracle tag "${trimmed}"`;
    return null;
  }

  if (operator === "=") {
    let matchedAny = false;
    for (let r = 0; r < indexRows.length; r++) {
      const { normKey, faceIndices } = indexRows[r]!;
      if (normKey !== u) continue;
      matchedAny = true;
      applyOracleIndices(faceIndices, buf);
    }
    if (!matchedAny) return `unknown oracle tag "${trimmed}"`;
    return null;
  }

  for (let i = 0; i < buf.length; i++) buf[i] = 0;
  let matchedAny = false;
  for (let r = 0; r < indexRows.length; r++) {
    const { normKey, faceIndices } = indexRows[r]!;
    if (normKey !== u) continue;
    matchedAny = true;
    applyOracleIndices(faceIndices, buf);
  }
  if (!matchedAny) return `unknown oracle tag "${trimmed}"`;
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! ? 0 : 1;
  return null;
}

/**
 * Evaluate atag:value in printing domain (Spec 174 / ADR-022).
 */
export function evalIllustrationTag(
  operator: ":" | "=" | "!=",
  value: string,
  illustration: Map<string, Uint32Array> | null,
  rows: readonly IllustrationTagEvalEntry[] | null,
  buf: Uint8Array,
): string | null {
  if (!illustration) return "illustration tags not loaded";
  const indexRows = rows ?? buildIllustrationTagEvalIndex(illustration);
  const trimmed = value.trim();

  if (trimmed === "") {
    for (let i = 0; i < buf.length; i++) buf[i] = 0;
    for (let r = 0; r < indexRows.length; r++) {
      applyPrintingIndices(indexRows[r]!.printingIndices, buf);
    }
    if (operator === "!=") {
      for (let i = 0; i < buf.length; i++) buf[i] ^= 1;
    }
    return null;
  }

  const u = normalizeForResolution(trimmed);

  if (operator === ":") {
    let matchedAny = false;
    for (let r = 0; r < indexRows.length; r++) {
      const { normKey, printingIndices } = indexRows[r]!;
      if (!normKey.startsWith(u)) continue;
      matchedAny = true;
      applyPrintingIndices(printingIndices, buf);
    }
    if (!matchedAny) return `unknown illustration tag "${trimmed}"`;
    return null;
  }

  if (operator === "=") {
    let matchedAny = false;
    for (let r = 0; r < indexRows.length; r++) {
      const { normKey, printingIndices } = indexRows[r]!;
      if (normKey !== u) continue;
      matchedAny = true;
      applyPrintingIndices(printingIndices, buf);
    }
    if (!matchedAny) return `unknown illustration tag "${trimmed}"`;
    return null;
  }

  for (let i = 0; i < buf.length; i++) buf[i] = 0;
  let matchedAny = false;
  for (let r = 0; r < indexRows.length; r++) {
    const { normKey, printingIndices } = indexRows[r]!;
    if (normKey !== u) continue;
    matchedAny = true;
    applyPrintingIndices(printingIndices, buf);
  }
  if (!matchedAny) return `unknown illustration tag "${trimmed}"`;
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! ? 0 : 1;
  return null;
}
