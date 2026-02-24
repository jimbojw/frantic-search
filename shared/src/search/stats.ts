// SPDX-License-Identifier: Apache-2.0

const ZERO_ALIASES = new Set(["*", "x", "y", "?"]);

const DICE_RE = /(\d+)d(\d+)/gi;

const TOKEN_RE = /(\d*\.?\d+|\*\*|[+\-*])/g;

/**
 * Evaluate a simple arithmetic expression with +, -, *, and ** operators.
 * Respects standard precedence: ** > * > +/-.
 * Returns NaN if the expression is malformed.
 */
function evalArithmetic(expr: string): number {
  const tokens: string[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(expr)) !== null) {
    if (m.index !== lastIndex) return NaN;
    tokens.push(m[0]);
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex !== expr.length || tokens.length === 0) return NaN;

  const values: number[] = [];
  const ops: string[] = [];
  let expectNumber = true;
  for (const tok of tokens) {
    if (expectNumber) {
      const n = Number(tok);
      if (isNaN(n)) return NaN;
      values.push(n);
      expectNumber = false;
    } else {
      if (tok !== "+" && tok !== "-" && tok !== "*" && tok !== "**") return NaN;
      ops.push(tok);
      expectNumber = true;
    }
  }
  if (expectNumber) return NaN;

  // Apply ** right-to-left
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i] === "**") {
      values[i] = values[i] ** values[i + 1];
      values.splice(i + 1, 1);
      ops.splice(i, 1);
    }
  }

  // Apply * left-to-right
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === "*") {
      values[i] = values[i] * values[i + 1];
      values.splice(i + 1, 1);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }

  // Apply +/- left-to-right
  let result = values[0];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === "+") result += values[i + 1];
    else if (ops[i] === "-") result -= values[i + 1];
    else return NaN;
  }
  return result;
}

/**
 * Convert a stat string (power, toughness, loyalty, defense) to a numeric
 * value for comparison operators. Variable components (`*`, `X`, `Y`, `?`)
 * are treated as zero; dice notation (`NdM`) uses the minimum roll (N×1).
 * Returns NaN for empty/missing values and unrecognizable strings.
 *
 * See Spec 034 for the full algorithm and rationale.
 */
export function parseStatValue(raw: string): number {
  const s = raw.trim();
  if (s === "") return NaN;

  const lower = s.toLowerCase();
  if (ZERO_ALIASES.has(lower)) return 0;
  if (s === "∞") return Infinity;

  let normalized = s.replace(/\*/g, "0");
  normalized = normalized.replace(/²/g, "**2");
  normalized = normalized.replace(DICE_RE, (_match, n) => `${n}*1`);

  const direct = Number(normalized);
  if (!isNaN(direct)) return direct;

  return evalArithmetic(normalized);
}
