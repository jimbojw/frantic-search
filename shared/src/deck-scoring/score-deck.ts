// SPDX-License-Identifier: Apache-2.0
import { aggregateGauge } from './aggregate.js'
import { renardScale } from './renard.js'
import type { ResolvedInstance, DeckScores, DeckScoringWeights, Coverage } from './types.js'

const DEFAULT_SALT_P = 3
const DEFAULT_CONFORMITY_P = 2
const DEFAULT_BLING_P = 2

export interface ScoreDeckConfig {
  saltP?: number
  conformityP?: number
  blingP?: number
}

/**
 * Compute Salt, Conformity, and Bling deck-level scores from resolved instances
 * and precomputed weight arrays. See Spec 185 for the full specification.
 */
export function scoreDeck(
  resolvedInstances: ResolvedInstance[],
  weights: DeckScoringWeights,
  config?: ScoreDeckConfig,
): DeckScores {
  const D = resolvedInstances.length
  if (D === 0) {
    const zeroCoverage: Coverage = { scoredCopies: 0, totalCopies: 0 }
    return {
      salt: 0,
      conformity: 0,
      bling: 0,
      saltCoverage: { ...zeroCoverage },
      conformityCoverage: { ...zeroCoverage },
      blingCoverage: { ...zeroCoverage },
    }
  }

  const saltP = config?.saltP ?? DEFAULT_SALT_P
  const conformityP = config?.conformityP ?? DEFAULT_CONFORMITY_P
  const blingP = config?.blingP ?? DEFAULT_BLING_P

  const {
    saltWeights, conformityWeights, blingWeights,
    cheapestPrintingPerFace,
    saltValid, conformityValid, blingValid,
  } = weights

  const faceIndices: number[] = new Array(D)
  const saltMissing: boolean[] = new Array(D)
  const conformityMissing: boolean[] = new Array(D)
  const blingIndices: number[] = new Array(D)
  const blingMissing: boolean[] = new Array(D)

  for (let i = 0; i < D; i++) {
    const inst = resolvedInstances[i]
    const face = inst.canonicalFaceIndex
    faceIndices[i] = face

    saltMissing[i] = face >= saltValid.length || saltValid[face] === 0
    conformityMissing[i] = face >= conformityValid.length || conformityValid[face] === 0

    let printingRow = inst.printingRowIndex
    let blingIsMissing: boolean

    if (printingRow === -1) {
      const cheapest = face < cheapestPrintingPerFace.length
        ? cheapestPrintingPerFace[face]
        : -1
      if (cheapest === -1) {
        blingIsMissing = true
        printingRow = 0
      } else {
        printingRow = cheapest
        blingIsMissing = printingRow >= blingValid.length || blingValid[printingRow] === 0
      }
    } else {
      blingIsMissing = printingRow >= blingValid.length || blingValid[printingRow] === 0
    }

    blingIndices[i] = printingRow
    blingMissing[i] = blingIsMissing
  }

  const saltResult = aggregateGauge(saltWeights, faceIndices, saltMissing, saltP)
  const conformityResult = aggregateGauge(conformityWeights, faceIndices, conformityMissing, conformityP)
  const blingResult = aggregateGauge(blingWeights, blingIndices, blingMissing, blingP)

  return {
    salt: saltResult.raw === 0 ? 0 : renardScale(saltResult.raw * 1000),
    conformity: conformityResult.raw === 0 ? 0 : renardScale(conformityResult.raw * 1000),
    bling: blingResult.raw === 0 ? 0 : renardScale(blingResult.raw * 1000),
    saltCoverage: { scoredCopies: saltResult.scoredCopies, totalCopies: saltResult.totalCopies },
    conformityCoverage: { scoredCopies: conformityResult.scoredCopies, totalCopies: conformityResult.totalCopies },
    blingCoverage: { scoredCopies: blingResult.scoredCopies, totalCopies: blingResult.totalCopies },
  }
}
