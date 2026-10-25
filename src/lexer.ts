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

/** One piece of a glued product: `4ac` has the factors 4, a and c. */
export type Factor =
  | { readonly kind: "number"; readonly text: string }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "word"; readonly name: string };

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
      const close = source.indexOf('"', i + 1);
      if (close === -1) {
        errors.push({ start, end: source.length, message: 'unterminated string: missing the closing "' });
        break;
      }
      i = close + 1;
      if (i < source.length && !isSpace(source[i]!)) {
        const end = chunkEnd(source, i);
        errors.push({ start, end, message: "a string must be followed by a space" });
        i = end;
        continue;
      }
      tokens.push({ kind: "text", text: source.slice(start + 1, close), start, end: i });
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

  // An optional number, then optional letters: `2`, `x`, `4ac`, `2pi`, `sqrt`.
  const m = /^(\d+(?:\.\d+)?)?([A-Za-z]*)$/.exec(text);
  if (m) {
    const num = m[1];
    const letters = m[2] ?? "";
    const factors: Factor[] = [];
    if (num !== undefined) factors.push({ kind: "number", text: num });

    const word = vocabulary.get(letters);
    if (word) {
      // Reserved words win over a product of letters.
      if (word.role === "operator" && num !== undefined) {
        return fail(`\`${num}\` is glued to the operator \`${letters}\`; did you mean \`${num} ${letters}\`?`);
      }
      factors.push({ kind: "word", name: letters });
    } else {
      for (const c of letters) factors.push({ kind: "variable", name: c });
    }

    const [only, ...rest] = factors;
    if (only && rest.length === 0) return { ...only, ...span };
    return { kind: "product", factors, ...span };
  }

  if (/[A-Za-z]\d/.test(text)) {
    return fail(`digits after letters (\`${text}\`) aren't defined yet: subscript or product?`);
  }
  if (/[A-Za-z0-9]/.test(text) && [...text].some((c) => symbols.has(c))) {
    return fail(`\`${text}\` needs spaces: tokens are separated by whitespace`);
  }
  return fail(`unknown symbol \`${text}\``);
}
