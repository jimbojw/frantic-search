// SPDX-License-Identifier: Apache-2.0

/**
 * True when the raw field value should be treated as the query literal `null`
 * for operators that support null (`=`, `:`, `!=`) — Spec 172.
 * Trims whitespace; comparison is ASCII case-insensitive.
 */
export function isEquatableNullLiteral(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === "null") return true;
  return v.length > 0 && v.length < 4 && "null".startsWith(v);
}
