// SPDX-License-Identifier: Apache-2.0
import type { DisplayColumns, PrintingDisplayColumns } from '@frantic-search/shared'
import type { MaterializedView } from '@frantic-search/shared'
import { FINISH_FROM_STRING } from '@frantic-search/shared'

/**
 * Builds oracle_id → canonical face index map from display columns.
 * For each face row i, oracle_ids[i] maps to canonical_face[i].
 */
export function buildOracleToCanonicalFaceMap(
  display: DisplayColumns
): Map<string, number> {
  const map = new Map<string, number>()
  const oracleIds = display.oracle_ids
  const canonicalFace = display.canonical_face
  for (let i = 0; i < oracleIds.length; i++) {
    const oid = oracleIds[i]
    if (oid) map.set(oid, canonicalFace[i])
  }
  return map
}

/**
 * Builds (scryfall_id, finish) → printing row index lookup.
 * Key format: `${scryfall_id}:${finish}` where finish is 0|1|2 (nonfoil|foil|etched).
 */
export function buildPrintingLookup(
  pd: PrintingDisplayColumns
): Map<string, number> {
  const map = new Map<string, number>()
  const scryfallIds = pd.scryfall_ids
  const finish = pd.finish
  for (let i = 0; i < scryfallIds.length; i++) {
    map.set(`${scryfallIds[i]}:${finish[i]}`, i)
  }
  return map
}

/**
 * Encodes InstanceState.finish string to numeric finish (0=nonfoil, 1=foil, 2=etched).
 * Returns undefined if finish is null or invalid.
 */
function encodeFinish(finish: string | null): number | undefined {
  if (!finish) return undefined
  const n = FINISH_FROM_STRING[finish.toLowerCase()]
  return n !== undefined ? n : undefined
}

export interface BuildMasksOptions {
  view: MaterializedView
  listId: string
  faceCount: number
  printingCount?: number
  oracleToCanonicalFace: Map<string, number>
  printingLookup?: Map<string, number>
}

export interface BuildMasksResult {
  faceMask: Uint8Array
  printingMask?: Uint8Array
}

/**
 * Builds faceMask and optionally printingMask for a list from the materialized view.
 * Oracle-level entries set faceMask bits; printing-level entries set printingMask bits when lookup exists.
 * Empty list returns zeroed faceMask, no printingMask.
 */
export function buildMasksForList(options: BuildMasksOptions): BuildMasksResult {
  const {
    view,
    listId,
    faceCount,
    printingCount = 0,
    oracleToCanonicalFace,
    printingLookup,
  } = options

  const faceMask = new Uint8Array(faceCount)
  let printingMask: Uint8Array | undefined
  if (printingCount > 0 && printingLookup) {
    printingMask = new Uint8Array(printingCount)
  }

  const uuids = view.instancesByList.get(listId)
  if (!uuids || uuids.size === 0) {
    return { faceMask }
  }

  for (const uuid of uuids) {
    const instance = view.instances.get(uuid)
    if (!instance) continue

    const { oracle_id, scryfall_id, finish } = instance

    if (scryfall_id && finish && printingLookup && printingMask) {
      const enc = encodeFinish(finish)
      if (enc !== undefined) {
        const key = `${scryfall_id}:${enc}`
        const pi = printingLookup.get(key)
        if (pi !== undefined) printingMask[pi] = 1
      }
    }

    const cf = oracleToCanonicalFace.get(oracle_id)
    if (cf !== undefined) faceMask[cf] = 1
  }

  return printingMask ? { faceMask, printingMask } : { faceMask }
}

/**
 * Returns true if any instance in the list has printing-level data (scryfall_id and finish set).
 */
export function hasPrintingLevelEntries(view: MaterializedView, listId: string): boolean {
  const uuids = view.instancesByList.get(listId)
  if (!uuids) return false
  for (const uuid of uuids) {
    const instance = view.instances.get(uuid)
    if (instance?.scryfall_id && instance?.finish) return true
  }
  return false
}
