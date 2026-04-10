// SPDX-License-Identifier: Apache-2.0

/** Colon + comparison typos; Spec 002 — always evaluation errors. */
const INVALID_COLON_COMPOSITE = new Set<string>([":>", ":<", ":="]);

/** Non-null message if `op` is an invalid colon–comparison composite. */
export function invalidColonCompositeOperatorError(op: string): string | null {
  if (INVALID_COLON_COMPOSITE.has(op)) {
    return `unknown operator "${op}"`;
  }
  return null;
}
