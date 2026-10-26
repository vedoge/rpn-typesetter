// The lexer: the first stage of the pipeline. It turns the text of one RPN
// block into a list of tokens, the "words" the parser works with. It knows
// nothing about the stack; it only decides what each piece of text is.
//
//   "b neg b 2 ^ 4ac -"  →  variable b, word neg, variable b, number 2,
//                           symbol ^, product 4·a·c, symbol -

import { vocabulary } from "./vocabulary.js";

/** Where something sits in the RPN text: offset of its first character, and one past its last. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export type SymbolChar = "+" | "-" | "*" | "/" | "^" | "=" | "[" | ";";

/**
 * One piece of a glued product: `4ac` has the factors 4, a and c. Digits
 * glued after letters are a subscript on the last letter: `x1` → x₁.
 */
export type Factor =
  | { readonly kind: "number"; readonly text: string }
  | { readonly kind: "variable"; readonly name: string; readonly subscript?: string }
  | { readonly kind: "word"; readonly name: string; readonly subscript?: string };

export type Token = Span &
  (
    | Factor // `2`, `x`, or a reserved word such as `pi` or `sqrt`
    | { readonly kind: "product"; readonly factors: readonly Factor[] } // `4ac`, `2pi`
    | { readonly kind: "symbol"; readonly symbol: SymbolChar } // `+`, `[`, `;`, …
    | { readonly kind: "raw"; readonly latex: string } // `\mathcal{F}`
    | { readonly kind: "rawOperator"; readonly command: string; readonly arity: number } // `\overset/2`
    | { readonly kind: "text"; readonly text: string } // `"if "`
  );

/** A problem found in the input. Any error means the RPN is invalid. */
export interface Diagnostic extends Span {
  readonly message: string;
}

export interface LexResult {
  readonly tokens: Token[];
  readonly errors: Diagnostic[];
}

const symbols: ReadonlySet<string> = new Set<SymbolChar>(["+", "-", "*", "/", "^", "=", "[", ";"]);

const isSpace = (c: string): boolean => /\s/.test(c);

/** Offset where the whitespace-separated chunk starting at `from` ends. */
function chunkEnd(source: string, from: number): number {
  let i = from;
  while (i < source.length && !isSpace(source[i]!)) i++;
  return i;
}

/**
 * Splits one RPN block into tokens. It doesn't stop at the first error: it
 * reports each bad chunk and carries on, so `errors` lists every problem.
 */
export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const errors: Diagnostic[] = [];
  let i = 0;

  while (i < source.length) {
    if (isSpace(source[i]!)) {
      i++;
      continue;
    }
    const start = i;

    // A quoted string is the one place whitespace doesn't end a token: the
    // lexer reads everything up to the closing quote.
    if (source[i] === '"') {
      const string = readString(source, i);
      if (!string) {
        errors.push({ start, end: source.length, message: 'unterminated string: missing the closing "' });
        break;
      }
      i = string.end;
      if (i < source.length && !isSpace(source[i]!)) {
        const end = chunkEnd(source, i);
        errors.push({ start, end, message: "a string must be followed by a space" });
        i = end;
        continue;
      }
      tokens.push({ kind: "text", text: string.text, start, end: i });
      continue;
    }

    const end = chunkEnd(source, i);
    const result = classify(source.slice(start, end), { start, end });
    if ("message" in result) errors.push(result);
    else tokens.push(result);
    i = end;
  }

  return { tokens, errors };
}

/**
 * Reads a quoted string starting at the `"` at `from`. `\"` is a quote
 * inside the text. Every other backslash is kept, so LaTeX like `\$` still
 * works inside text; `\\` is kept as a pair, so it never escapes a quote.
 * Returns undefined if there's no closing quote.
 */
function readString(source: string, from: number): { text: string; end: number } | undefined {
  let text = "";
  let i = from + 1;
  while (i < source.length) {
    const c = source[i]!;
    if (c === '"') return { text, end: i + 1 };
    if (c === "\\" && (source[i + 1] === '"' || source[i + 1] === "\\")) {
      text += source[i + 1] === '"' ? '"' : "\\\\";
      i += 2;
      continue;
    }
    text += c;
    i++;
  }
  return undefined;
}

/** Decides what one whitespace-separated chunk is. */
function classify(text: string, span: Span): Token | Diagnostic {
  const fail = (message: string): Diagnostic => ({ ...span, message });

  if (text.startsWith("\\")) {
    if (text === "\\") return fail("a lone `\\` is not a LaTeX command");
    const op = /^(\\[A-Za-z]+)\/(\d+)$/.exec(text);
    if (op) return { kind: "rawOperator", command: op[1]!, arity: Number(op[2]), ...span };
    return { kind: "raw", latex: text, ...span };
  }

  if (symbols.has(text)) return { kind: "symbol", symbol: text as SymbolChar, ...span };

  // An optional number, then optional letters, then an optional subscript:
  // `2`, `x`, `4ac`, `2pi`, `sqrt`, `x1`, `2x12`.
  const m = /^(\d+(?:\.\d+)?)?(?:([A-Za-z]+)(\d+)?)?$/.exec(text);
  if (m) {
    const [, num, letters = "", subscript] = m;
    const sub = subscript === undefined ? {} : { subscript };
    const factors: Factor[] = [];
    if (num !== undefined) factors.push({ kind: "number", text: num });

    const word = vocabulary.get(letters);
    if (word) {
      // Reserved words win over a product of letters.
      if (word.role === "operator" && subscript !== undefined) {
        return fail(`the operator \`${letters}\` can't take a subscript; did you mean \`${subscript} ${letters}\`?`);
      }
      if (word.role === "operator" && num !== undefined) {
        return fail(`\`${num}\` is glued to the operator \`${letters}\`; did you mean \`${num} ${letters}\`?`);
      }
      factors.push({ kind: "word", name: letters, ...sub });
    } else {
      [...letters].forEach((c, k) =>
        factors.push({ kind: "variable", name: c, ...(k === letters.length - 1 ? sub : {}) }),
      );
    }

    const [only, ...rest] = factors;
    if (only && rest.length === 0) return { ...only, ...span };
    return { kind: "product", factors, ...span };
  }

  if (/[A-Za-z]\d/.test(text)) {
    return fail(`\`${text}\`: glued digits after letters are a subscript and must end the token (\`x1\` → x₁)`);
  }
  if (/[A-Za-z0-9]/.test(text) && [...text].some((c) => symbols.has(c))) {
    return fail(`\`${text}\` needs spaces: tokens are separated by whitespace`);
  }
  return fail(`unknown symbol \`${text}\``);
}
