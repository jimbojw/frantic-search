// SPDX-License-Identifier: Apache-2.0
import { PrintingFlag, PROMO_TYPE_FLAGS } from "./bits";
import type { ListToken } from "./list-lexer";
import type { PrintingDisplayColumns } from "./worker-protocol";

export type { LineValidation, ListValidationResult, ParsedEntry, ValidationResult } from "./list-lexer";

/**
 * Reconstruct the line without set/collector (or variant+set for MTGGoldfish).
 * When alsoRemoveFinish is true, removes foil/etched/alter markers too — they only
 * apply to specific printings; resolving by name only has no finish.
 * Preserves quantity, name, tags, etc. Returns line without trailing newline.
 */
export function reconstructLineWithoutSet(
  line: string,
  setTok: ListToken | undefined,
  collectorTok: ListToken | undefined,
  variantTok?: ListToken,
  setCodeBracketTok?: ListToken,
  finishTokens?: ListToken[]
): string {
  const tokensToRemove: ListToken[] = [];
  if (variantTok && setCodeBracketTok) {
    tokensToRemove.push(variantTok, setCodeBracketTok);
  } else if (setTok) {
    tokensToRemove.push(setTok);
    if (collectorTok) tokensToRemove.push(collectorTok);
  }
  if (finishTokens) tokensToRemove.push(...finishTokens);
  if (tokensToRemove.length === 0) return line.trimEnd();

  const minStart = Math.min(...tokensToRemove.map((t) => t.start));
  const maxEnd = Math.max(...tokensToRemove.map((t) => t.end));

  let start = minStart;
  let end = maxEnd;
  while (start > 0 && /[\s(\[<]/.test(line[start - 1]!)) start--;
  while (end < line.length && /[):\]>]/.test(line[end]!)) end++;

  return (line.slice(0, start) + line.slice(end)).trimEnd();
}

/** Human-readable variant label from printing flags (e.g. "extended art", "borderless"). */
export function variantLabelForPrinting(
  printing: PrintingDisplayColumns,
  rowIndex: number
): string {
  const pf = printing.printing_flags ?? [];
  const pt0 = printing.promo_types_flags_0 ?? [];
  const pt1 = printing.promo_types_flags_1 ?? [];
  const flags = pf[rowIndex] ?? 0;
  const promo0 = pt0[rowIndex] ?? 0;
  const promo1 = pt1[rowIndex] ?? 0;

  const labels: string[] = [];
  if (flags & PrintingFlag.ExtendedArt) labels.push("extended art");
  if (flags & PrintingFlag.Borderless) labels.push("borderless");
  if (flags & PrintingFlag.Showcase) labels.push("showcase");
  if (flags & PrintingFlag.FullArt) labels.push("full art");
  const prerelease = PROMO_TYPE_FLAGS.prerelease;
  if (prerelease && ((prerelease.column === 0 ? promo0 : promo1) & (1 << prerelease.bit))) {
    labels.push("prerelease");
  }
  return labels.length > 0 ? ` (${labels[0]})` : "";
}

/** Canonical MTGGoldfish variation strings (lowercased, after "SetName - " stripping). */
const KNOWN_GOLDFISH_VARIANTS = new Set([
  "showcase", "extended", "borderless", "japanese",
  "planeswalker stamp", "precon", "prerelease",
  "pw_deck", "brawl_deck", "buy-a-box",
  "promo pack", "bundle", "sealed", "timeshifted",
]);

export function isKnownGoldfishVariant(variant: string): boolean {
  const v = variant.toLowerCase().trim();
  const dashIdx = v.indexOf(" - ");
  const flagPart = dashIdx >= 0 ? v.slice(dashIdx + 3) : v;
  return KNOWN_GOLDFISH_VARIANTS.has(flagPart);
}
