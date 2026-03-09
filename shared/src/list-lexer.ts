// SPDX-License-Identifier: Apache-2.0

export const ListTokenType = {
  QUANTITY: "QUANTITY",
  CARD_NAME: "CARD_NAME",
  SET_CODE: "SET_CODE",
  COLLECTOR_NUMBER: "COLLECTOR_NUMBER",
  CATEGORY: "CATEGORY",
  CATEGORY_TAG: "CATEGORY_TAG",
  COMMENT: "COMMENT",
  SECTION: "SECTION",
  WHITESPACE: "WHITESPACE",
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
  | "category"
  | "category-tag"
  | "comment"
  | "error";

export interface ListHighlightSpan {
  text: string;
  role: ListHighlightRole | null;
  start: number;
  end: number;
}

export interface LineValidation {
  lineIndex: number;
  lineStart: number;
  lineEnd: number;
  kind: "ok" | "error";
  span?: { start: number; end: number };
  message?: string;
}

export interface ListValidationResult {
  lines: LineValidation[];
}

const CARD_LINE_RE =
  /^(\d+x?)\s+([^(]+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?(?:\s+\[([^\]]*)\])?\s*$/;
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

  const cardMatch = trimmed.match(CARD_LINE_RE);
  if (cardMatch) {
    const [, qty, name, setCode, collectorNum, categoryContent] = cardMatch;
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

      const numStart = trimmed.indexOf(collectorNum);
      tokens.push({
        type: ListTokenType.COLLECTOR_NUMBER,
        value: collectorNum,
        start: lineStart + numStart,
        end: lineStart + numStart + collectorNum.length,
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
  [ListTokenType.CATEGORY]: "category",
  [ListTokenType.CATEGORY_TAG]: "category-tag",
  [ListTokenType.COMMENT]: "comment",
  [ListTokenType.SECTION]: "comment",
  [ListTokenType.WHITESPACE]: null,
};

function spanOverlapsError(
  spanStart: number,
  spanEnd: number,
  validation: ListValidationResult
): boolean {
  for (const line of validation.lines) {
    if (line.kind !== "error" || !line.span) continue;
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
    const isError =
      validation &&
      role != null &&
      spanOverlapsError(tok.start, tok.end, validation);

    spans.push({
      text: text.slice(tok.start, tok.end),
      role: isError ? "error" : role,
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
