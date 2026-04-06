// SPDX-License-Identifier: Apache-2.0

import type { ArtistIndexData } from "./data";

/**
 * Spec 148 / 183: first raw artist key whose strided pairs include (faceWithinCard, printingRowIndex).
 */
export function resolveArtistForPrintingRow(
  raw: ArtistIndexData | null,
  printingRowIndex: number,
  faceWithinCard: number,
): string | null {
  if (!raw) return null;
  for (const [name, pairs] of Object.entries(raw)) {
    for (let i = 0; i < pairs.length; i += 2) {
      if (pairs[i] === faceWithinCard && pairs[i + 1] === printingRowIndex) {
        return name;
      }
    }
  }
  return null;
}
