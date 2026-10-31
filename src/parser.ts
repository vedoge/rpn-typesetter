// Copyright 2026 vedoge
//
// This work may be distributed and/or modified under the conditions of the
// LaTeX Project Public License, either version 1.3c of this license or (at
// your option) any later version. The latest version of this license is in
// https://www.latex-project.org/lppl.txt and version 1.3c or later is part
// of all distributions of LaTeX version 2008 or later.
//
// This work has the LPPL maintenance status `maintained'.
// The Current Maintainer of this work is vedoge (https://github.com/vedoge).
//
// This work consists of all the files in https://github.com/vedoge/rpn-typesetter.
//
// The parser: the second stage of the pipeline. It runs the stack over the
// lexer's tokens and builds a tree of the expression, called an abstract
// syntax tree (AST). Each operator becomes a node whose children are the
// values it took off the stack:
//
//   a b c - +   →        +
//                       / \
//                      a   -
//                         / \
//                        b   c
//
// The tree records what the math *is*. How it looks, including where
// brackets go, is the emitter's job.

import { lex, type Diagnostic, type Factor, type Span, type Token } from "./lexer.js";
import { arrows, relations, vocabulary, type Arity } from "./vocabulary.js";

export type Node = Span &
  (
    | { readonly kind: "number"; readonly text: string } // 2
    | { readonly kind: "variable"; readonly name: string; readonly primes?: number } // x, x''
    | { readonly kind: "named"; readonly name: string; readonly latex: string; readonly primes?: number } // pi → \pi
    | { readonly kind: "raw"; readonly latex: string } // \mathcal{F}
    | { readonly kind: "text"; readonly text: string } // "if "
    | { readonly kind: "product"; readonly factors: readonly Node[] } // glued: 4ac
    | {
        readonly kind: "apply"; // an operator and the values it took: + sqrt ssc ser …
        readonly operator: string;
        readonly args: readonly Node[];
        readonly breakBefore?: true; // set by `br`: break before the last argument
      }
    | { readonly kind: "rawApply"; readonly command: string; readonly args: readonly Node[] } // \overset/2
    | { readonly kind: "variadic"; readonly operator: string; readonly rows: readonly (readonly Node[])[] } // mat
    | { readonly kind: "juxtapose"; readonly items: readonly Node[] } // leftovers: 2 x 2 ^ → 2x²
  );

/** One equation: a whole RPN block, or one `;`-separated part of a display. */
export interface Equation extends Span {
  readonly body: Node;
  readonly label?: string;
  readonly notag: boolean;
}

export interface ParseResult {
  readonly equations: Equation[];
  readonly errors: Diagnostic[];
  readonly warnings: Diagnostic[];
}

/** Lexes and parses one RPN block. If the lexer finds errors, parsing doesn't start. */
export function parse(source: string): ParseResult {
  const { tokens, errors } = lex(source);
  if (errors.length > 0) return { equations: [], errors, warnings: [] };
  return parseTokens(tokens, { start: source.length, end: source.length });
}

/** Symbols take two values, except factorial `!`, which takes one. */
const symbolArity = (symbol: string): number => (symbol === "!" ? 1 : 2);

/** Symbols that are another spelling of a named operator: `x i _` builds the same tree as `x i ssc`. */
const symbolOperator = (symbol: string): string => (symbol === "_" ? "ssc" : symbol);

/** Operators written between their operands, the only ones `br` can follow. */
const infix: ReadonlySet<string> = new Set(["+", "-", "*", ",", "and", "or", ...relations.keys(), ...arrows.keys()]);

/** What can sit on the stack while parsing. */
type Item =
  | { readonly kind: "value"; readonly node: Node }
  | { readonly kind: "mark"; readonly span: Span } // `[`
  | { readonly kind: "row"; readonly span: Span }; // `;` inside a mark

class ParseError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

function fail(span: Span, message: string): never {
  throw new ParseError({ start: span.start, end: span.end, message });
}

/**
 * Parses a block's tokens. `endOfBlock` is where errors about the end of the
 * block point. It stops at the first error, because after one the stack no
 * longer means anything.
 */
export function parseTokens(tokens: readonly Token[], endOfBlock: Span): ParseResult {
  const equations: Equation[] = [];
  const warnings: Diagnostic[] = [];
  let stack: Item[] = [];
  let label: string | undefined;
  let notag = false;
  let first: Span | undefined; // first token of the current equation
  let previous: Token | undefined;

  const push = (node: Node) => stack.push({ kind: "value", node });

  /** Takes `count` values off the stack for an operator, oldest first. */
  function take(count: number, name: string, at: Span): Node[] {
    const args: Node[] = [];
    for (let k = 0; k < count; k++) {
      const top = stack[stack.length - 1 - k];
      if (top?.kind !== "value") {
        const where = top === undefined ? "" : top.kind === "mark" ? " after the last `[`" : " in this row";
        const have = k === 0 ? "none is" : k === 1 ? "only 1 is" : `only ${k} are`;
        fail(at, `\`${name}\` needs ${count} value${count === 1 ? "" : "s"}, but ${have} available${where}`);
      }
      args.unshift(top.node);
    }
    stack.length -= count;
    return args;
  }

  /** Applies an operator; `spelled` is how the author wrote it, for error messages. */
  function apply(operator: string, arity: number, at: Span, spelled = operator) {
    const args = take(arity, spelled, at);
    push({ kind: "apply", operator, args, start: args[0]?.start ?? at.start, end: at.end });
  }

  function applyVariadic(operator: string, at: Span) {
    let markIndex = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k]!.kind === "mark") {
        markIndex = k;
        break;
      }
    }
    if (markIndex === -1) fail(at, `\`${operator}\` needs a mark \`[\` before its entries`);

    const rows: Node[][] = [[]];
    for (const item of stack.slice(markIndex + 1)) {
      if (item.kind === "row") rows.push([]);
      else if (item.kind === "value") rows[rows.length - 1]!.push(item.node);
    }
    if (rows.some((row) => row.length === 0)) fail(at, `\`${operator}\` has an empty row`);

    const mark = stack[markIndex] as Extract<Item, { kind: "mark" }>;
    stack = stack.slice(0, markIndex);
    push({ kind: "variadic", operator, rows, start: mark.span.start, end: at.end });
  }

  function applyBreak(at: Span) {
    const top = stack[stack.length - 1];
    const node = top?.kind === "value" ? top.node : undefined;
    const justApplied = node?.kind === "apply" && previous !== undefined && node.end === previous.end;
    if (!justApplied || !infix.has(node.operator)) {
      fail(at, "`br` must come right after an operator written between its operands, such as + or =");
    }
    stack[stack.length - 1] = { kind: "value", node: { ...node, breakBefore: true } };
  }

  function applyWord(name: string, arity: Arity, at: Span) {
    if (typeof arity === "number") apply(name, arity, at);
    else if (arity === "variadic") applyVariadic(name, at);
    else if (arity === "break") applyBreak(at);
    else fail(at, `\`${name}\` is reserved, but how many values it takes isn't decided yet`);
  }

  /** Ends the current equation, at a top-level `;` or the end of the block. */
  function finishEquation(at: Span) {
    const mark = stack.find((item) => item.kind === "mark");
    if (mark) fail(mark.span, "this mark `[` is never used by a variadic operator (`mat`, `cases`, `col`)");

    const values = stack.flatMap((item) => (item.kind === "value" ? [item.node] : []));
    const [only, ...rest] = values;
    if (!only) fail(at, tokens.length === 0 ? "the RPN block is empty" : "this equation is empty");

    let body = only;
    if (rest.length > 0) {
      const last = rest[rest.length - 1]!;
      body = { kind: "juxtapose", items: values, start: only.start, end: last.end };
      warnings.push({
        start: body.start,
        end: body.end,
        message: `${values.length} values were left on the stack, so they're set side by side; is an operator missing?`,
      });
    }

    equations.push({
      body,
      notag,
      start: first?.start ?? body.start,
      end: previous?.end ?? body.end,
      ...(label === undefined ? {} : { label }),
    });
    stack = [];
    label = undefined;
    notag = false;
    first = undefined;
  }

  try {
    for (const token of tokens) {
      if (token.kind === "symbol" && token.symbol === ";" && !stack.some((item) => item.kind === "mark")) {
        finishEquation(token);
        previous = token;
        continue;
      }
      first ??= token;

      switch (token.kind) {
        case "number":
        case "variable":
          push(factorNode(token, token));
          break;
        case "word": {
          const word = vocabulary.get(token.name)!;
          if (word.role === "value") push(factorNode(token, token));
          else applyWord(token.name, word.arity, token);
          break;
        }
        case "product":
          push({ kind: "product", factors: token.factors.map((f) => factorNode(f, token)), start: token.start, end: token.end });
          break;
        case "raw":
          push({ kind: "raw", latex: token.latex, start: token.start, end: token.end });
          break;
        case "text":
          push({ kind: "text", text: token.text, start: token.start, end: token.end });
          break;
        case "rawOperator": {
          const args = take(token.arity, token.command, token);
          push({ kind: "rawApply", command: token.command, args, start: args[0]?.start ?? token.start, end: token.end });
          break;
        }
        case "symbol":
          if (token.symbol === "[") stack.push({ kind: "mark", span: token });
          else if (token.symbol === ";") stack.push({ kind: "row", span: token });
          else apply(symbolOperator(token.symbol), symbolArity(token.symbol), token, token.symbol);
          break;
        case "label":
          if (label !== undefined) fail(token, `this equation already has the label \`${label}\``);
          label = token.name;
          break;
        case "notag":
          notag = true;
          break;
      }
      previous = token;
    }
    if (previous?.kind === "symbol" && previous.symbol === ";" && first === undefined) {
      fail(previous, "nothing follows this `;`");
    }
    finishEquation(endOfBlock);
  } catch (error) {
    if (error instanceof ParseError) return { equations: [], errors: [error.diagnostic], warnings };
    throw error;
  }

  return { equations, errors: [], warnings };
}

/**
 * A single factor as a node. Primes stay on the letter; a glued subscript
 * becomes `ssc`: `x1'` → x' 1 ssc.
 */
function factorNode(factor: Factor, span: Span): Node {
  const at = { start: span.start, end: span.end };
  let base: Node;
  if (factor.kind === "number") return { kind: "number", text: factor.text, ...at };
  const primes = factor.primes === undefined ? {} : { primes: factor.primes };
  if (factor.kind === "variable") base = { kind: "variable", name: factor.name, ...primes, ...at };
  else {
    const word = vocabulary.get(factor.name);
    base = { kind: "named", name: factor.name, latex: word?.role === "value" ? word.latex : factor.name, ...primes, ...at };
  }
  if (factor.subscript === undefined) return base;
  return { kind: "apply", operator: "ssc", args: [base, { kind: "number", text: factor.subscript, ...at }], ...at };
}
