// SPDX-License-Identifier: Apache-2.0
import { lexDeckList, ListTokenType } from "./list-lexer";
import type { ListToken } from "./list-lexer";
import { validateDeckList } from "./list-validate";
import type { ParsedEntry } from "./list-validate";
import { KNOWN_ZONES } from "./card-list";
import type { DisplayColumns, PrintingDisplayColumns } from "./worker-protocol";

export interface ImportCandidate {
  oracle_id: string;
  scryfall_id: string | null;
  finish: string | null;
  zone: string | null;
  tags: string[];
  collection_status: string | null;
  variant: string | null;
}

export interface ImportResult {
  candidates: ImportCandidate[];
  deckName: string | null;
  tagColors: Record<string, string>;
}

const KNOWN_ZONES_LOWER = KNOWN_ZONES.map((z) => z.toLowerCase());

function canonicalZone(name: string): string | null {
  const lower = name.toLowerCase();
  const idx = KNOWN_ZONES_LOWER.indexOf(lower);
  return idx >= 0 ? KNOWN_ZONES[idx] : null;
}

/**
 * Normalize section header synonyms: "MainDeck" / "Main Deck" → "Deck".
 */
function normalizeHeaderValue(value: string): string {
  const trimmed = value.replace(/:$/, "").trim();
  if (/^main\s*deck$/i.test(trimmed)) return "Deck";
  return trimmed;
}

/**
 * Extract base name from a bracket category tag (strip {modifier} suffixes).
 * E.g. "Commander{top}" → "Commander", "Maybeboard{noDeck}{noPrice}" → "Maybeboard"
 */
function baseName(tag: string): string {
  const braceIdx = tag.indexOf("{");
  return braceIdx >= 0 ? tag.slice(0, braceIdx) : tag;
}

/**
 * Group tokens by line. Tokens from lexDeckList are ordered by position;
 * we group them by comparing against line boundaries from the original text.
 */
function groupTokensByLine(text: string, tokens: ListToken[]): ListToken[][] {
  const lines = text.split(/\r?\n/);
  const groups: ListToken[][] = [];
  let offset = 0;
  let tokenIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i]!.length;
    const lineTokens: ListToken[] = [];

    while (tokenIdx < tokens.length && tokens[tokenIdx]!.start < lineEnd) {
      lineTokens.push(tokens[tokenIdx]!);
      tokenIdx++;
    }

    groups.push(lineTokens);
    offset = lineEnd;
    if (i < lines.length - 1 && offset < text.length) {
      if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
      else if (text[offset] === "\n") offset += 1;
    }
  }

  return groups;
}

export function importDeckList(
  text: string,
  display: DisplayColumns | null,
  printingDisplay: PrintingDisplayColumns | null
): ImportResult {
  const candidates: ImportCandidate[] = [];
  let deckName: string | null = null;
  const tagColors: Record<string, string> = {};

  if (!display || !text.trim()) {
    return { candidates, deckName, tagColors };
  }

  const tokens = lexDeckList(text);
  const validation = validateDeckList(text, display, printingDisplay);
  const resolved = validation.resolved ?? [];

  const lineGroups = groupTokensByLine(text, tokens);

  let currentZone: string | null = null;
  let resolvedIdx = 0;

  for (let lineIdx = 0; lineIdx < lineGroups.length; lineIdx++) {
    const lineTokens = lineGroups[lineIdx]!;
    if (lineTokens.length === 0) continue;

    const firstType = lineTokens[0]!.type;

    if (firstType === ListTokenType.SECTION_HEADER) {
      const normalized = normalizeHeaderValue(lineTokens[0]!.value);
      const zone = canonicalZone(normalized);
      currentZone = zone;
      continue;
    }

    if (firstType === ListTokenType.METADATA) {
      const match = lineTokens[0]!.value.match(/^\s*Name\s+(.+)$/);
      if (match) deckName = match[1]!.trim();
      continue;
    }

    if (firstType === ListTokenType.COMMENT) continue;

    const hasQuantity = lineTokens.some((t) => t.type === ListTokenType.QUANTITY);
    const hasName = lineTokens.some((t) => t.type === ListTokenType.CARD_NAME);
    if (!hasQuantity || !hasName) continue;

    // Check if validation marked this line as an error
    const lineValidation = validation.lines.find((l) => l.lineIndex === lineIdx);
    if (lineValidation?.kind === "error") continue;

    // Consume the next resolved entry
    if (resolvedIdx >= resolved.length) continue;
    const entry: ParsedEntry = resolved[resolvedIdx]!;
    resolvedIdx++;

    // Extract tags from CATEGORY + CATEGORY_TAG tokens.
    // The lexer splits [Category{tag}] into CATEGORY("Category") + CATEGORY_TAG("tag").
    // Multi-segment brackets like [A,B] produce a single CATEGORY("A,B").
    // We reconstruct the full bracket content, then split on commas.
    const tags: string[] = [];
    let fullCategoryValue = "";
    for (const t of lineTokens) {
      if (t.type === ListTokenType.CATEGORY) {
        fullCategoryValue = t.value;
      } else if (t.type === ListTokenType.CATEGORY_TAG) {
        fullCategoryValue += `{${t.value}}`;
      }
    }
    if (fullCategoryValue) {
      const parts = fullCategoryValue.split(",").map((s) => s.trim()).filter(Boolean);
      tags.push(...parts);
    }

    // Determine zone: bracket category takes priority over section header
    let zone = currentZone;
    if (tags.length > 0) {
      const primaryBase = baseName(tags[0]!);
      const bracketZone = canonicalZone(primaryBase);
      if (bracketZone) zone = bracketZone;
    }

    // Extract collection status
    let collectionStatus: string | null = null;
    const statusTextTok = lineTokens.find(
      (t) => t.type === ListTokenType.COLLECTION_STATUS_TEXT
    );
    const statusColorTok = lineTokens.find(
      (t) => t.type === ListTokenType.COLLECTION_STATUS_COLOR
    );
    if (statusTextTok) {
      if (statusColorTok) {
        collectionStatus = `${statusTextTok.value},${statusColorTok.value}`;
        tagColors[statusTextTok.value] = statusColorTok.value;
      } else {
        collectionStatus = statusTextTok.value;
      }
    }

    const finish = entry.finish ?? null;
    const variant = entry.variant ?? null;
    const quantity = entry.quantity;

    for (let i = 0; i < quantity; i++) {
      candidates.push({
        oracle_id: entry.oracle_id,
        scryfall_id: entry.scryfall_id,
        finish,
        zone,
        tags: [...tags],
        collection_status: collectionStatus,
        variant,
      });
    }
  }

  return { candidates, deckName, tagColors };
}
