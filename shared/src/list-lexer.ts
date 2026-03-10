// SPDX-License-Identifier: Apache-2.0

export const ListTokenType = {
  QUANTITY: "QUANTITY",
  CARD_NAME: "CARD_NAME",
  SET_CODE: "SET_CODE",
  COLLECTOR_NUMBER: "COLLECTOR_NUMBER",
  FOIL_MARKER: "FOIL_MARKER",
  ALTER_MARKER: "ALTER_MARKER",
  ETCHED_MARKER: "ETCHED_MARKER",
  CATEGORY: "CATEGORY",
  CATEGORY_TAG: "CATEGORY_TAG",
  COLLECTION_STATUS_TEXT: "COLLECTION_STATUS_TEXT",
  COLLECTION_STATUS_COLOR: "COLLECTION_STATUS_COLOR",
  SECTION_HEADER: "SECTION_HEADER",
  METADATA: "METADATA",
  COMMENT: "COMMENT",
  SECTION: "SECTION",
  WHITESPACE: "WHITESPACE",
  /** MTGGoldfish: content of <...> (collector number or variant). */
  VARIANT: "VARIANT",
  /** MTGGoldfish: set code from [SET] brackets. */
  SET_CODE_BRACKET: "SET_CODE_BRACKET",
  /** MTGGoldfish: (F) foil marker. */
  FOIL_PAREN: "FOIL_PAREN",
  /** MTGGoldfish: (E) etched marker. */
  ETCHED_PAREN: "ETCHED_PAREN",
  /** TappedOut: inline #Tag (e.g. #Land, #Ramp/Reduction). */
  HASH_TAG: "HASH_TAG",
  /** TappedOut: *CMDR* or *CMPN* role marker. */
  ROLE_MARKER: "ROLE_MARKER",
  /** TappedOut: *f-pre* prerelease variant (like MTGGoldfish <prerelease>). */
  FOIL_PRERELEASE_MARKER: "FOIL_PRERELEASE_MARKER",
} as const;

export type ListTokenType = (typeof ListTokenType)[keyof typeof ListTokenType];

export interface ListToken {
  type: ListTokenType;
  value: string;
  start: number;
  end: number;
}

export type ListHighlightRole =
  | "quantity"
  | "card-name"
  | "set-code"
  | "collector-number"
  | "foil-marker"
  | "alter-marker"
  | "etched-marker"
  | "category"
  | "category-tag"
  | "collection-status-text"
  | "collection-status-color"
  | "section-header"
  | "metadata"
  | "comment"
  | "error"
  | "variant"
  | "variant-approx"
  | "hash-tag"
  | "role-marker";

export interface ListHighlightSpan {
  text: string;
  role: ListHighlightRole | null;
  start: number;
  end: number;
}

export interface QuickFix {
  /** Short label shown on the fix button or in a menu. */
  label: string;
  /** The full replacement line text. Applied to the draft when user selects this fix. */
  replacement: string;
}

export interface LineValidation {
  lineIndex: number;
  lineStart: number;
  lineEnd: number;
  kind: "ok" | "error" | "warning";
  span?: { start: number; end: number };
  message?: string;
  /** Suggested fixes for this line. Only present when kind === "error". */
  quickFixes?: QuickFix[];
}

export interface ListValidationResult {
  lines: LineValidation[];
}

const CARD_LINE_RE =
  /^(\d+x?)\s+([^(]+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?(?:\s+(\*F\*))?(?:\s+(\*A\*))?(?:\s+(\*E\*))?(?:\s+\[([^\]]*)\])?(?:\s+\^([^^]+)\^)?\s*$/;
/** TappedOut inline format: (SET) or (SET:num), *f*|*f-etch*|*e*|*f-pre*|*f-pp*, *CMDR*|*CMPN*, #Tag... */
const TAPPEDOUT_CARD_LINE_RE =
  /^(\d+x?)\s+([^(]+?)(?:\s+\(([A-Za-z0-9]+)(?::(\S+))?\))?(?:\s+(\*f\*|\*f-etch\*|\*e\*|\*f-pre\*|\*f-pp\*))?(?:\s+(\*CMDR\*|\*CMPN\*))?((?:\s+#\S+)*)\s*$/;
/** Line has TappedOut-specific markers; try TappedOut pattern before Moxfield. */
function hasTappedOutMarkers(line: string): boolean {
  // Exclude # when it's a hex color inside Archidekt ^...^ (e.g. ^Have,#37d67a^)
  const hasHashTag = /#\S/.test(line) && !/\^[^^]*#[0-9a-fA-F]{6}\^/.test(line);
  return (
    hasHashTag ||
    /\*f\*|\*f-etch\*|\*e\*|\*f-pre\*|\*f-pp\*|\*CMDR\*|\*CMPN\*/.test(line) ||
    /\([A-Za-z0-9]+:\S+\)/.test(line)
  );
}
/** MTGGoldfish Exact Card Versions (Tabletop): Qty Name <variant> [SET] (F|E)? */
const MTGGOLDFISH_CARD_LINE_RE =
  /^(\d+x?)\s+(.+?)\s+<([^>]+)>\s+\[([A-Za-z0-9_-]+)\]\s*(?:\((F|E)\))?\s*$/;
/** MTGGoldfish MTGO / no-variant: Qty Name [SET] (F|E)? — no <variant> angle brackets */
const MTGGOLDFISH_NO_VARIANT_RE =
  /^(\d+x?)\s+(.+?)\s+\[([A-Za-z0-9_-]+)\]\s*(?:\((F|E)\))?\s*$/;
const SECTION_HEADER_RE = /^\s*(About|Main\s*Deck|Deck|Sideboard|Commander)\s*:?\s*$/i;
const ARENA_METADATA_RE = /^\s*Name\s+(.+)$/;
const COMMENT_LINE_RE = /^\s*(\/\/|#).*$/;
const QUANTITY_ONLY_RE = /^(\d+x?)\s*$/;

function parseLine(line: string, lineStart: number): ListToken[] {
  const tokens: ListToken[] = [];
  const trimmed = line.trimEnd();

  if (trimmed.length === 0) {
    return [];
  }

  const commentMatch = trimmed.match(COMMENT_LINE_RE);
  if (commentMatch) {
    tokens.push({
      type: ListTokenType.COMMENT,
      value: line.slice(0, trimmed.length),
      start: lineStart,
      end: lineStart + trimmed.length,
    });
    return tokens;
  }

  const sectionMatch = trimmed.match(SECTION_HEADER_RE);
  if (sectionMatch) {
    tokens.push({
      type: ListTokenType.SECTION_HEADER,
      value: trimmed.trim(),
      start: lineStart,
      end: lineStart + trimmed.length,
    });
    return tokens;
  }

  const metadataMatch = trimmed.match(ARENA_METADATA_RE);
  if (metadataMatch) {
    tokens.push({
      type: ListTokenType.METADATA,
      value: trimmed,
      start: lineStart,
      end: lineStart + trimmed.length,
    });
    return tokens;
  }

  // MTGGoldfish Exact Card Versions (Tabletop): try before Moxfield pattern
  const mtgGoldfishMatch = trimmed.match(MTGGOLDFISH_CARD_LINE_RE);
  if (mtgGoldfishMatch) {
    const [, qty, name, variant, setCode, modifier] = mtgGoldfishMatch;
    const qtyStart = lineStart + trimmed.search(/\d/);
    tokens.push({
      type: ListTokenType.QUANTITY,
      value: qty!,
      start: qtyStart,
      end: qtyStart + qty!.length,
    });
    const nameStart = lineStart + trimmed.indexOf(name!.trimStart());
    const nameEnd = nameStart + name!.trim().length;
    tokens.push({
      type: ListTokenType.CARD_NAME,
      value: name!.trim(),
      start: nameStart,
      end: nameEnd,
    });
    const variantStart = trimmed.indexOf("<" + variant + ">");
    tokens.push({
      type: ListTokenType.VARIANT,
      value: variant!,
      start: lineStart + variantStart + 1,
      end: lineStart + variantStart + 1 + variant!.length,
    });
    const bracketStart = trimmed.indexOf("[" + setCode + "]");
    tokens.push({
      type: ListTokenType.SET_CODE_BRACKET,
      value: setCode!,
      start: lineStart + bracketStart + 1,
      end: lineStart + bracketStart + 1 + setCode!.length,
    });
    if (modifier === "F") {
      const foilStart = trimmed.indexOf("(F)");
      tokens.push({
        type: ListTokenType.FOIL_PAREN,
        value: "(F)",
        start: lineStart + foilStart,
        end: lineStart + foilStart + 3,
      });
    } else if (modifier === "E") {
      const etchedStart = trimmed.indexOf("(E)");
      tokens.push({
        type: ListTokenType.ETCHED_PAREN,
        value: "(E)",
        start: lineStart + etchedStart,
        end: lineStart + etchedStart + 3,
      });
    }
    return tokens;
  }

  // MTGGoldfish MTGO / no-variant: quantity name [SET] (F|E)? — only when no Moxfield (SET) number
  const hasMoxfieldSetNumber = /\s+\([A-Za-z0-9]+\)\s+\S+/.test(trimmed);
  const mtgGoldfishNoVariantMatch =
    !hasMoxfieldSetNumber && trimmed.match(MTGGOLDFISH_NO_VARIANT_RE);
  if (mtgGoldfishNoVariantMatch) {
    const [, qty, name, setCode, modifier] = mtgGoldfishNoVariantMatch;
    const qtyStart = lineStart + trimmed.search(/\d/);
    tokens.push({
      type: ListTokenType.QUANTITY,
      value: qty!,
      start: qtyStart,
      end: qtyStart + qty!.length,
    });
    const nameStart = lineStart + trimmed.indexOf(name!.trimStart());
    const nameEnd = nameStart + name!.trim().length;
    tokens.push({
      type: ListTokenType.CARD_NAME,
      value: name!.trim(),
      start: nameStart,
      end: nameEnd,
    });
    const bracketStart = trimmed.indexOf("[" + setCode + "]");
    tokens.push({
      type: ListTokenType.SET_CODE_BRACKET,
      value: setCode!,
      start: lineStart + bracketStart + 1,
      end: lineStart + bracketStart + 1 + setCode!.length,
    });
    if (modifier === "F") {
      const foilStart = trimmed.indexOf("(F)");
      tokens.push({
        type: ListTokenType.FOIL_PAREN,
        value: "(F)",
        start: lineStart + foilStart,
        end: lineStart + foilStart + 3,
      });
    } else if (modifier === "E") {
      const etchedStart = trimmed.indexOf("(E)");
      tokens.push({
        type: ListTokenType.ETCHED_PAREN,
        value: "(E)",
        start: lineStart + etchedStart,
        end: lineStart + etchedStart + 3,
      });
    }
    return tokens;
  }

  // TappedOut inline format: try when line has #Tag, *f*, *CMDR*, or (SET:num)
  if (hasTappedOutMarkers(trimmed)) {
    const tappedOutMatch = trimmed.match(TAPPEDOUT_CARD_LINE_RE);
    if (tappedOutMatch) {
      const [, qty, name, setCode, collectorNum, finishMarker, roleMarker, tagsPart] =
        tappedOutMatch;
      const qtyStart = lineStart + trimmed.search(/\d/);
      tokens.push({
        type: ListTokenType.QUANTITY,
        value: qty!,
        start: qtyStart,
        end: qtyStart + qty!.length,
      });
      const nameStart = lineStart + trimmed.indexOf(name!.trimStart());
      const nameEnd = nameStart + name!.trim().length;
      tokens.push({
        type: ListTokenType.CARD_NAME,
        value: name!.trim(),
        start: nameStart,
        end: nameEnd,
      });
      if (setCode) {
        const parenStart = trimmed.indexOf("(" + setCode);
        const setCodeStart = lineStart + parenStart + 1;
        tokens.push({
          type: ListTokenType.SET_CODE,
          value: setCode,
          start: setCodeStart,
          end: setCodeStart + setCode.length,
        });
        if (collectorNum) {
          const colonIdx = trimmed.indexOf(":" + collectorNum, parenStart);
          const numStart = lineStart + colonIdx + 1;
          tokens.push({
            type: ListTokenType.COLLECTOR_NUMBER,
            value: collectorNum,
            start: numStart,
            end: numStart + collectorNum.length,
          });
        }
      }
      if (finishMarker === "*f*" || finishMarker === "*f-pp*") {
        const pos = trimmed.indexOf(finishMarker);
        tokens.push({
          type: ListTokenType.FOIL_MARKER,
          value: finishMarker,
          start: lineStart + pos,
          end: lineStart + pos + finishMarker.length,
        });
      } else if (finishMarker === "*f-etch*" || finishMarker === "*e*") {
        const pos = trimmed.indexOf(finishMarker);
        tokens.push({
          type: ListTokenType.ETCHED_MARKER,
          value: finishMarker,
          start: lineStart + pos,
          end: lineStart + pos + finishMarker.length,
        });
      } else if (finishMarker === "*f-pre*") {
        const pos = trimmed.indexOf(finishMarker);
        tokens.push({
          type: ListTokenType.FOIL_PRERELEASE_MARKER,
          value: finishMarker,
          start: lineStart + pos,
          end: lineStart + pos + finishMarker.length,
        });
      }
      if (roleMarker) {
        const pos = trimmed.indexOf(roleMarker);
        tokens.push({
          type: ListTokenType.ROLE_MARKER,
          value: roleMarker,
          start: lineStart + pos,
          end: lineStart + pos + roleMarker.length,
        });
      }
      if (tagsPart) {
        const tagMatches = tagsPart.matchAll(/#(\S+)/g);
        for (const m of tagMatches) {
          const full = m[0]!;
          const tagValue = m[1]!;
          const pos = trimmed.indexOf(full);
          tokens.push({
            type: ListTokenType.HASH_TAG,
            value: tagValue,
            start: lineStart + pos,
            end: lineStart + pos + full.length,
          });
        }
      }
      return tokens;
    }
  }

  const cardMatch = trimmed.match(CARD_LINE_RE);
  if (cardMatch) {
    const [, qty, name, setCode, collectorNum, foilMarker, alterMarker, etchedMarker, categoryContent, collectionMarkerContent] =
      cardMatch;
    const qtyStart = lineStart + trimmed.search(/\d/);
    tokens.push({
      type: ListTokenType.QUANTITY,
      value: qty!,
      start: qtyStart,
      end: qtyStart + qty!.length,
    });

    const nameStart = lineStart + trimmed.indexOf(name!.trimStart());
    const nameEnd = nameStart + name!.trim().length;
    tokens.push({
      type: ListTokenType.CARD_NAME,
      value: name!.trim(),
      start: nameStart,
      end: nameEnd,
    });

    if (setCode && collectorNum) {
      const setParenStart = trimmed.indexOf("(");
      const setCodeStart = lineStart + setParenStart + 1;
      tokens.push({
        type: ListTokenType.SET_CODE,
        value: setCode,
        start: setCodeStart,
        end: setCodeStart + setCode.length,
      });

      const afterSetParen = setParenStart + 1 + setCode.length + 1;
      const numStart = trimmed.indexOf(collectorNum, afterSetParen);
      tokens.push({
        type: ListTokenType.COLLECTOR_NUMBER,
        value: collectorNum,
        start: lineStart + numStart,
        end: lineStart + numStart + collectorNum.length,
      });
    }

    if (foilMarker) {
      const pos = trimmed.indexOf("*F*");
      tokens.push({
        type: ListTokenType.FOIL_MARKER,
        value: "*F*",
        start: lineStart + pos,
        end: lineStart + pos + 3,
      });
    }
    if (alterMarker) {
      const pos = trimmed.indexOf("*A*");
      tokens.push({
        type: ListTokenType.ALTER_MARKER,
        value: "*A*",
        start: lineStart + pos,
        end: lineStart + pos + 3,
      });
    }
    if (etchedMarker) {
      const pos = trimmed.indexOf("*E*");
      tokens.push({
        type: ListTokenType.ETCHED_MARKER,
        value: "*E*",
        start: lineStart + pos,
        end: lineStart + pos + 3,
      });
    }

    if (categoryContent !== undefined && categoryContent.length > 0) {
      const bracketStart = trimmed.indexOf("[");
      const base = lineStart + bracketStart;
      const tagMatch = categoryContent.match(/^(.+?)\{([^}]+)\}$/);
      if (tagMatch) {
        const [, categoryName, tagContent] = tagMatch;
        const catStart = base + 1;
        const catEnd = catStart + categoryName!.length;
        tokens.push({
          type: ListTokenType.CATEGORY,
          value: categoryName!,
          start: catStart,
          end: catEnd,
        });
        const tagStart = catEnd;
        const tagEnd = tagStart + 1 + tagContent!.length + 1; // { + content + }
        tokens.push({
          type: ListTokenType.CATEGORY_TAG,
          value: tagContent!,
          start: tagStart,
          end: tagEnd,
        });
      } else {
        const categoryStart = base;
        const categoryEnd = base + 1 + categoryContent.length + 1;
        tokens.push({
          type: ListTokenType.CATEGORY,
          value: categoryContent,
          start: categoryStart,
          end: categoryEnd,
        });
      }
    }

    if (collectionMarkerContent) {
      const commaIdx = collectionMarkerContent.indexOf(",");
      const statusText = commaIdx >= 0 ? collectionMarkerContent.slice(0, commaIdx) : collectionMarkerContent;
      const color = commaIdx >= 0 ? collectionMarkerContent.slice(commaIdx + 1) : "";
      const markerStart = trimmed.indexOf("^");
      const contentStart = lineStart + markerStart + 1;
      if (statusText) {
        tokens.push({
          type: ListTokenType.COLLECTION_STATUS_TEXT,
          value: statusText,
          start: contentStart,
          end: contentStart + statusText.length,
        });
      }
      if (color) {
        const colorStart = contentStart + statusText.length + (commaIdx >= 0 ? 1 : 0);
        tokens.push({
          type: ListTokenType.COLLECTION_STATUS_COLOR,
          value: color,
          start: colorStart,
          end: colorStart + color.length,
        });
      }
    }
    return tokens;
  }

  const qtyOnlyMatch = trimmed.match(QUANTITY_ONLY_RE);
  if (qtyOnlyMatch) {
    const qtyStart = lineStart + trimmed.search(/\d/);
    tokens.push({
      type: ListTokenType.QUANTITY,
      value: qtyOnlyMatch[1]!,
      start: qtyStart,
      end: qtyStart + qtyOnlyMatch[1]!.length,
    });
    return tokens;
  }

  return [];
}

export function lexDeckList(input: string): ListToken[] {
  const tokens: ListToken[] = [];
  const lines = input.split(/\r?\n/);
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineTokens = parseLine(line, offset);
    tokens.push(...lineTokens);
    offset += line.length;
    if (i < lines.length - 1 && offset < input.length) {
      if (input[offset] === "\r" && input[offset + 1] === "\n") offset += 2;
      else if (input[offset] === "\n") offset += 1;
    }
  }

  return tokens;
}

const ROLE_FOR_TYPE: Record<ListTokenType, ListHighlightRole | null> = {
  [ListTokenType.QUANTITY]: "quantity",
  [ListTokenType.CARD_NAME]: "card-name",
  [ListTokenType.SET_CODE]: "set-code",
  [ListTokenType.COLLECTOR_NUMBER]: "collector-number",
  [ListTokenType.FOIL_MARKER]: "foil-marker",
  [ListTokenType.ALTER_MARKER]: "alter-marker",
  [ListTokenType.ETCHED_MARKER]: "etched-marker",
  [ListTokenType.CATEGORY]: "category",
  [ListTokenType.CATEGORY_TAG]: "category-tag",
  [ListTokenType.COLLECTION_STATUS_TEXT]: "collection-status-text",
  [ListTokenType.COLLECTION_STATUS_COLOR]: "collection-status-color",
  [ListTokenType.SECTION_HEADER]: "section-header",
  [ListTokenType.METADATA]: "metadata",
  [ListTokenType.COMMENT]: "comment",
  [ListTokenType.SECTION]: "comment",
  [ListTokenType.WHITESPACE]: null,
  [ListTokenType.VARIANT]: "variant",
  [ListTokenType.SET_CODE_BRACKET]: "set-code",
  [ListTokenType.FOIL_PAREN]: "foil-marker",
  [ListTokenType.ETCHED_PAREN]: "etched-marker",
  [ListTokenType.HASH_TAG]: "hash-tag",
  [ListTokenType.ROLE_MARKER]: "role-marker",
  [ListTokenType.FOIL_PRERELEASE_MARKER]: "variant",
};

function spanOverlapsValidation(
  spanStart: number,
  spanEnd: number,
  validation: ListValidationResult,
  kind: "error" | "warning"
): boolean {
  for (const line of validation.lines) {
    if (line.kind !== kind || !line.span) continue;
    const { start, end } = line.span;
    if (spanStart < end && spanEnd > start) return true;
  }
  return false;
}

export function buildListSpans(
  text: string,
  validation?: ListValidationResult | null
): ListHighlightSpan[] {
  if (!text) return [];

  const tokens = lexDeckList(text);
  const spans: ListHighlightSpan[] = [];
  let cursor = 0;

  for (const tok of tokens) {
    if (tok.start > cursor) {
      spans.push({
        text: text.slice(cursor, tok.start),
        role: null,
        start: cursor,
        end: tok.start,
      });
    }

    const role = ROLE_FOR_TYPE[tok.type];
    let effectiveRole = role;
    if (validation && role != null) {
      if (spanOverlapsValidation(tok.start, tok.end, validation, "error")) {
        effectiveRole = "error";
      } else if (spanOverlapsValidation(tok.start, tok.end, validation, "warning")) {
        effectiveRole = "variant-approx";
      }
    }

    spans.push({
      text: text.slice(tok.start, tok.end),
      role: effectiveRole,
      start: tok.start,
      end: tok.end,
    });
    cursor = tok.end;
  }

  if (cursor < text.length) {
    spans.push({
      text: text.slice(cursor),
      role: null,
      start: cursor,
      end: text.length,
    });
  }

  return spans;
}
