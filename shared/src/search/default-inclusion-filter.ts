// SPDX-License-Identifier: Apache-2.0

import { CardFlag, PrintingFlag } from "../bits";
import {
  EXTRAS_LAYOUT_SET,
  DEFAULT_OMIT_SET_CODES,
  isMemorabiliaDefaultOmit,
} from "./default-filter";

/** Per-printing inputs for Spec 178 default inclusion passes (printing-domain path). */
export interface DefaultInclusionPrintingRow {
  /** `setWide || typeWide` — positive `set:` and/or `st:` / `set_type:`. */
  wide: boolean;
  widenExtrasLayout: boolean;
  widenContentWarning: boolean;
  widenPlaytest: boolean;
  widenOversized: boolean;
  layout: string;
  faceFlags: number;
  printingFlags: number;
  promoTypesFlags1: number;
  setCode: string;
  setType: string;
}

/** Whether a candidate printing survives all default omission passes (Spec 178). */
export function printingPassesDefaultInclusionFilter(row: DefaultInclusionPrintingRow): boolean {
  const w = row.wide;
  if (!w && !row.widenExtrasLayout && EXTRAS_LAYOUT_SET.has(row.layout)) return false;
  if (!w && !row.widenPlaytest && (row.promoTypesFlags1 & 1) !== 0) return false;
  if (!w && isMemorabiliaDefaultOmit(row.setType)) return false;
  if (!w && DEFAULT_OMIT_SET_CODES.has(row.setCode)) return false;
  if (!w && !row.widenContentWarning && (row.faceFlags & CardFlag.ContentWarning) !== 0) {
    return false;
  }
  if (!w && !row.widenOversized && (row.printingFlags & PrintingFlag.Oversized) !== 0) {
    return false;
  }
  return true;
}
