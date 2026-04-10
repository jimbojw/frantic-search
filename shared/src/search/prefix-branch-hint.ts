// SPDX-License-Identifier: Apache-2.0

import {
  normalizeForResolution,
  normalizeForTagResolution,
  forEachBoundaryAlignedRemainder,
} from "./categorical-resolve";

const KIND_EQUALS = 0;
const KIND_LETTER = 1;
const KIND_DIGIT = 2;
const KIND_OTHER = 3;

function branchKind(s: string): number {
  if (s === "=") return KIND_EQUALS;
  if (s.length === 1) {
    const c = s.charCodeAt(0);
    if (c >= 0x61 && c <= 0x7a) return KIND_LETTER;
    if (c >= 0x30 && c <= 0x39) return KIND_DIGIT;
  }
  return KIND_OTHER;
}

function primaryCode(s: string): number {
  return s.charCodeAt(0);
}

/** Deterministic sort: `=` first, then letters a–z, then digits 0–9, then other (Spec 181). */
export function sortBranchTokens(tokens: string[]): string[] {
  return [...tokens].sort((a, b) => {
    const ka = branchKind(a);
    const kb = branchKind(b);
    if (ka !== kb) return ka - kb;
    return primaryCode(a) - primaryCode(b);
  });
}

/**
 * Collapse 3+ contiguous single-letter (a–z) or single-digit (0–9) branches into X..Y (Spec 181).
 * Input must be sorted per {@link sortBranchTokens}. `=` and other tokens pass through.
 */
export function collapseBranchTokens(sorted: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const t = sorted[i]!;
    const k = branchKind(t);
    if (k !== KIND_LETTER && k !== KIND_DIGIT) {
      out.push(t);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < sorted.length) {
      const u = sorted[j]!;
      const ku = branchKind(u);
      if (ku !== k) break;
      const prevCode = sorted[j - 1]!.charCodeAt(0);
      const curCode = u.charCodeAt(0);
      if (curCode !== prevCode + 1) break;
      j++;
    }
    const runLen = j - i;
    if (runLen >= 3) {
      out.push(`${sorted[i]}..${sorted[j - 1]}`);
    } else {
      for (let k = i; k < j; k++) out.push(sorted[k]!);
    }
    i = j;
  }
  return out;
}

function uniqueNonEmptyNormalized(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (c.length === 0) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Spec 181: `otag` / `atag` use Spec 174 tag normalization + boundary-aligned `:` eval. */
export type PrefixBranchHintMode = "default" | "tag";

/** Spec 181 tag mode: collect (normKey, R) for every Spec 174 boundary alignment. */
function collectTagAlignmentRows(
  nonEmpty: readonly string[],
  u: string,
): { normKey: string; R: string }[] {
  const rows: { normKey: string; R: string }[] = [];
  if (u.length === 0) return rows;
  for (const normKey of nonEmpty) {
    forEachBoundaryAlignedRemainder(normKey, u, (_i, R) => {
      rows.push({ normKey, R });
    });
  }
  return rows;
}

function tagFirstCharDigest(nonEmpty: readonly string[]): string {
  const chars = new Set<string>();
  for (const c of nonEmpty) {
    chars.add(c[0]!);
  }
  const sorted = sortBranchTokens([...chars]);
  const collapsed = collapseBranchTokens(sorted);
  return `(${collapsed.join("|")})`;
}

function buildPrefixBranchHintTag(trimmed: string, nonEmpty: string[]): string | null {
  const u = normalizeForTagResolution(trimmed);

  if (trimmed === "" || u.length === 0) {
    return tagFirstCharDigest(nonEmpty);
  }

  const rows = collectTagAlignmentRows(nonEmpty, u);
  if (rows.length === 0) return null;

  const distinctKeys = new Set(rows.map((r) => r.normKey));

  if (distinctKeys.size === 1) {
    const onlyKey = [...distinctKeys][0]!;
    if (onlyKey === u) return null;
    const rs = rows.filter((row) => row.normKey === onlyKey).map((row) => row.R);
    const hasEmpty = rs.some((R) => R === "");
    const uniqueNonEmpty = [...new Set(rs.filter((R) => R.length > 0))];
    if (!hasEmpty && uniqueNonEmpty.length === 1) {
      return `(${uniqueNonEmpty[0]!})`;
    }
    if (hasEmpty && uniqueNonEmpty.length === 0) {
      return null;
    }
  }

  const hasExact = rows.some((row) => row.R === "");
  const branchSet = new Set<string>();
  for (const { R } of rows) {
    if (R.length > 0) branchSet.add(R[0]!);
  }
  if (hasExact) branchSet.add("=");
  if (branchSet.size === 0) return null;
  const sorted = sortBranchTokens([...branchSet]);
  const collapsed = collapseBranchTokens(sorted);
  return `(${collapsed.join("|")})`;
}

/**
 * Spec 181: build parenthesized prefix-branch hint from normalized vocabulary strings.
 * @param trimmedValue - field value after trim (may be empty)
 * @param normalizedCandidates - each candidate already normalized like eval (non-empty)
 * @param mode - `tag` for Spec 174 otag/atag (boundary-aligned `:` + normalizeForTagResolution)
 */
export function buildPrefixBranchHint(
  trimmedValue: string,
  normalizedCandidates: readonly string[],
  mode: PrefixBranchHintMode = "default",
): string | null {
  const nonEmpty = uniqueNonEmptyNormalized(normalizedCandidates);
  if (nonEmpty.length === 0) return null;

  const t = trimmedValue.trim();
  if (mode === "tag") {
    return buildPrefixBranchHintTag(t, nonEmpty);
  }

  const prefix = normalizeForResolution(t);

  if (t === "") {
    const chars = new Set<string>();
    for (const c of nonEmpty) {
      chars.add(c[0]!);
    }
    const sorted = sortBranchTokens([...chars]);
    const collapsed = collapseBranchTokens(sorted);
    return `(${collapsed.join("|")})`;
  }

  const matches = nonEmpty.filter((c) => c.startsWith(prefix));
  if (matches.length === 0) return null;

  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 1) {
    const c = uniqueMatches[0]!;
    if (c === prefix) return null;
    return `(${c.slice(prefix.length)})`;
  }

  const branchSet = new Set<string>();
  let hasExact = false;
  for (const m of uniqueMatches) {
    if (m === prefix) {
      hasExact = true;
    } else {
      const rest = m.slice(prefix.length);
      if (rest.length > 0) branchSet.add(rest[0]!);
    }
  }
  if (hasExact) branchSet.add("=");
  const sorted = sortBranchTokens([...branchSet]);
  const collapsed = collapseBranchTokens(sorted);
  return `(${collapsed.join("|")})`;
}
