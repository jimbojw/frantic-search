// SPDX-License-Identifier: Apache-2.0

export interface ResolvedInstance {
  canonicalFaceIndex: number
  printingRowIndex: number // -1 when oracle-only
}

export interface Coverage {
  scoredCopies: number
  totalCopies: number
}

export interface DeckScores {
  salt: number
  conformity: number
  bling: number
  saltCoverage: Coverage
  conformityCoverage: Coverage
  blingCoverage: Coverage
}

export interface DeckScoringWeights {
  saltWeights: Float32Array
  conformityWeights: Float32Array
  blingWeights: Float32Array
  cheapestPrintingPerFace: Int32Array
  /** 1 = face has valid salt data, 0 = null/missing. Indexed by face row. */
  saltValid: Uint8Array
  /** 1 = face has valid EDHREC rank, 0 = null/missing. Indexed by face row. */
  conformityValid: Uint8Array
  /** 1 = printing has valid USD price, 0 = sentinel. Indexed by printing row. */
  blingValid: Uint8Array
}
