// SPDX-License-Identifier: Apache-2.0

import type { ColumnarData } from "./data";
import { CardFlag, Format } from "./bits";

/** Grist: legendary planeswalker that is a creature at deck construction (Spec 032). */
export const COMMANDER_EXCEPTION_NAMES = new Set(["grist, the hunger tide"]);

const REMINDER_TEXT_RE = /\([^)]*\)/g;

function stripReminderText(text: string): string {
  return text.replace(REMINDER_TEXT_RE, "");
}

export type IsCommanderColumnarSlice = Pick<
  ColumnarData,
  | "layouts"
  | "flags"
  | "type_lines"
  | "oracle_texts"
  | "names"
  | "powers"
  | "toughnesses"
  | "power_lookup"
  | "toughness_lookup"
  | "canonical_face"
  | "legalities_banned"
>;

/** Pre-stripped/lowercased oracle + type line, as in `CardIndex` (evaluator path). */
export type IsCommanderFaceFields = {
  layout: string;
  flags: number;
  typeLineLower: string;
  oracleTextLower: string;
  nameLower: string;
  powerIndex: number;
  toughnessIndex: number;
  powerLookup: readonly string[];
  toughnessLookup: readonly string[];
  /** `canonical_face[i]` for this face row. */
  canonicalFaceForRow: number;
  /** Face row index `i` (for front-face check: `canonicalFaceForRow === i`). */
  faceRowIndex: number;
  /** `legalities_banned[canonical_face[i]]` for this row. */
  legalitiesBannedAtCanonical: number;
};

/**
 * True iff this face row matches `is:commander` / `is:brawler` (Spec 032).
 * Used by the evaluator (`CardIndex` lowers) and by `faceRowMatchesIsCommander` (columnar data).
 */
export function faceRowMatchesIsCommanderFields(f: IsCommanderFaceFields): boolean {
  const isToken = f.layout === "token" || f.layout === "double_faced_token";
  if (isToken) return false;
  if ((f.flags & CardFlag.MeldResult) !== 0) return false;

  const isFront = f.canonicalFaceForRow === f.faceRowIndex;
  const tl = f.typeLineLower;
  const isLegendary = tl.includes("legendary");
  const isCreature = tl.includes("creature");
  const isVehicle = tl.includes("vehicle") || tl.includes("spacecraft");
  const isBackground = tl.includes("background");

  const powStr = f.powerLookup[f.powerIndex] ?? "";
  const touStr = f.toughnessLookup[f.toughnessIndex] ?? "";
  const hasPowerToughness = powStr.length > 0 && touStr.length > 0;

  const ot = f.oracleTextLower;
  const hasCommanderText =
    ot.includes("can be your commander") || ot.includes("spell commander");

  const isException = COMMANDER_EXCEPTION_NAMES.has(f.nameLower);

  const notBanned = (f.legalitiesBannedAtCanonical & Format.Commander) === 0;
  if (!notBanned) return false;

  return (
    (isFront &&
      isLegendary &&
      (isCreature || (isVehicle && hasPowerToughness) || isBackground)) ||
    hasCommanderText ||
    isException
  );
}

/**
 * Face row `i` vs columnar data: same semantics as `CardIndex` + `is:commander` (reminder text
 * stripped from oracle like `CardIndex` constructor).
 */
export function faceRowMatchesIsCommander(data: IsCommanderColumnarSlice, i: number): boolean {
  const cf = data.canonical_face[i] ?? i;
  return faceRowMatchesIsCommanderFields({
    layout: data.layouts[i] ?? "",
    flags: data.flags[i] ?? 0,
    typeLineLower: (data.type_lines[i] ?? "").toLowerCase(),
    oracleTextLower: stripReminderText(data.oracle_texts[i] ?? "").toLowerCase(),
    nameLower: (data.names[i] ?? "").toLowerCase(),
    powerIndex: data.powers[i] ?? 0,
    toughnessIndex: data.toughnesses[i] ?? 0,
    powerLookup: data.power_lookup,
    toughnessLookup: data.toughness_lookup,
    canonicalFaceForRow: cf,
    faceRowIndex: i,
    legalitiesBannedAtCanonical: data.legalities_banned[cf] ?? 0,
  });
}
