// The emitter: the last stage of the pipeline. It walks the parser's tree and
// writes LaTeX. Writing output from a tree like this is called code
// generation.
//
// Most of its work is deciding where brackets go. The tree has no brackets,
// because its shape already says what groups with what. The emitter adds
// them only where the printed formula would otherwise read wrongly:
//
//   (- a (+ b c))  →  a - (b + c)      without them it would read (a - b) + c
//   (+ a (- b c))  →  a + b - c        here they'd change nothing, so none

import { parse, type Equation, type Node } from "./parser.js";
import type { Diagnostic, Span } from "./lexer.js";
import { arrows, functions, relations, subscripted } from "./vocabulary.js";

/**
 * How the surrounding math lays out equations, which decides what a `br`
 * break becomes:
 * - "single": one equation that can't break (`$…$`, `\[…\]`, `equation`).
 * - "multline": one equation; a break is `\\`.
 * - "lines": several equations, one per line (`gather`); a break is `\\`.
 * - "aligned": several equations aligned at their relation (`align`); a break
 *   is `\\ &` before a relation, `\\ &\qquad` before anything else.
 */
export type Layout = "single" | "multline" | "lines" | "aligned";

/** A problem the emitter finds, such as a break inside a fraction. */
export class EmitError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

// While an equation is written, each `br` break is a placeholder: a NUL
// character, then "r" before a relation or "o" before anything else. Brackets
// around a placeholder split across the lines, and emitEquation finally turns
// each placeholder into the LaTeX the layout needs.
const breakMark = "\u0000";
const breakBefore = (relation: boolean) => `${breakMark}${relation ? "r" : "o"}`;

/** Set while writing \vphantom contents, which must not break. */
let breaksOff = false;
/** Breaks the tool chose by measuring (see breaking.ts), on top of the author's `br`s. */
let autoBreaks: ReadonlySet<Node> = new Set();
/** While cutting an equation into pieces to measure: the operators to cut before. */
let pieceCuts: ReadonlySet<Node> | undefined;
const pieceMark = "\u0001";
/** The relation that gets `&` in an aligned layout, if any. */
let alignAt: Node | undefined;

/**
 * How tightly each kind of node binds, loosest first. A child gets brackets
 * when it binds more loosely than its parent (the bracket rule in
 * docs/design.md).
 */
const Rank = {
  iff: 1, // <=> iff
  implies: 2, // => implies impliedby
  or: 3,
  and: 4,
  relation: 5, // = < <= in …
  additive: 6, // + - neg
  prefix: 7, // functions, sums, integrals, quantifiers: they swallow what follows
  multiplicative: 8, // * / and glued products
  script: 9, // ^ ssc !
  atom: 10, // never needs brackets
} as const;

/** Operators where (a ∘ b) ∘ c = a ∘ (b ∘ c), so a right child of equal rank needs no brackets. */
const associative: ReadonlySet<string> = new Set(["+", "*", "and", "or"]);

const infixLatex: ReadonlyMap<string, string> = new Map([
  ["+", "+"], ["-", "-"], ["and", "\\wedge"], ["or", "\\vee"], ...relations, ...arrows,
]);

/** Operators an aligned layout lines up at, and that start a line with `&` after a break. */
const isAligning = (op: string): boolean => relations.has(op) || arrows.has(op);

const prefixOperators: ReadonlySet<string> = new Set([
  "sum", "ser", "int", "exists", "forall", "not", ...functions, ...subscripted.keys(),
]);

function rank(node: Node): number {
  switch (node.kind) {
    case "product":
    case "juxtapose":
      return Rank.multiplicative;
    case "apply": {
      const op = node.operator;
      if (op === "<=>" || op === "iff") return Rank.iff;
      if (arrows.has(op)) return Rank.implies;
      if (op === "or") return Rank.or;
      if (op === "and") return Rank.and;
      if (relations.has(op)) return Rank.relation;
      if (op === "+" || op === "-" || op === "neg") return Rank.additive;
      if (prefixOperators.has(op)) return Rank.prefix;
      if (op === "*" || op === "/") return Rank.multiplicative;
      if (op === "^" || op === "ssc" || op === "!") return Rank.script;
      return Rank.atom; // sqrt draws its own enclosure
    }
    default:
      return Rank.atom; // numbers, letters, raw LaTeX, text, matrices, raw operators
  }
}

/** The decided atoms: these never get brackets anywhere. */
function isAtom(node: Node): boolean {
  return ["number", "variable", "named", "raw", "text"].includes(node.kind);
}

/** An atom with a subscript, like x_i. */
function isSubscriptedAtom(node: Node): boolean {
  return node.kind === "apply" && node.operator === "ssc" && isAtom(node.args[0]!);
}

/** Tall contents get brackets that stretch to fit (\left( … \right)). */
function isTall(node: Node): boolean {
  switch (node.kind) {
    case "variadic":
      return true;
    case "apply":
      return ["/", "sum", "ser", "int"].includes(node.operator) || node.args.some(isTall);
    case "rawApply":
      return node.args.some(isTall);
    case "product":
      return node.factors.some(isTall);
    case "juxtapose":
      return node.items.some(isTall);
    default:
      return false;
  }
}

function bracket(node: Node): string {
  const inner = emitNode(node);
  if (!inner.includes(breakMark)) return isTall(node) ? `\\left(${inner}\\right)` : `(${inner})`;

  // A break inside brackets: each line closes its half with an invisible
  // \right. or opens with \left., and a \vphantom of the whole contents
  // makes every half the same height.
  breaksOff = true;
  const phantom = `\\vphantom{${emitNode(node)}}`;
  breaksOff = false;
  const parts = inner.split(new RegExp(`(${breakMark}[ro])`));
  const last = parts.length - 1;
  return parts
    .map((part, k) => {
      if (k % 2 === 1) return part; // a break placeholder
      const open = k === 0 ? "\\left(" : "\\left.";
      const close = k === last ? "\\right)" : "\\right.";
      return `${open}${phantom} ${part.trim()}${close} `;
    })
    .join("")
    .trimEnd();
}

/** Emits a child, in brackets if `needed`. */
function child(node: Node, needed: boolean, followed = false): string {
  return needed ? bracket(node) : emitNode(node, followed);
}

/** Emits something the layout puts in its own box, where a line can't break. */
function boxed(node: Node, where: string): string {
  const out = emitNode(node);
  if (out.includes(breakMark)) fail(node, `\`br\` can't break a line inside ${where}`);
  return out;
}

function fail(span: Span, message: string): never {
  throw new EmitError({ start: span.start, end: span.end, message });
}

/**
 * Factors printed side by side. A factor that would start with a digit gets
 * `\cdot` before it, so `2 3 *` prints 2·3, not 23. With `breakAtLast`, the
 * line breaks before the last factor.
 */
function sideBySide(parts: readonly string[], breakAtLast = false): string {
  return parts.reduce((out, part, k) => {
    if (k === 0) return part;
    const separator = /^\d/.test(part) ? " \\cdot " : " ";
    if (breakAtLast && k === parts.length - 1) return `${out} ${breakBefore(false)}${separator.trimStart()}${part}`;
    return `${out}${separator}${part}`;
  }, "");
}

/**
 * Emits an operand of a product: bracketed if it binds more loosely than
 * multiplication. A function or sum is the exception when nothing follows it
 * in the product (`followed` is false), because there it can't swallow
 * anything: y sin x, but (sin x)y.
 */
function factor(node: Node, followed: boolean): string {
  const r = rank(node);
  return child(node, r < Rank.multiplicative && (followed || r !== Rank.prefix), followed);
}

/** The argument of a function or quantifier: bracketed unless it's an atom or a subscripted atom. */
function argument(node: Node): string {
  return child(node, !isAtom(node) && !isSubscriptedAtom(node));
}

/** The summand or integrand of a big operator: bracketed if it's a sum or looser. */
function body(node: Node): string {
  return child(node, rank(node) <= Rank.additive);
}

/**
 * Writes `a ∘ b` for an infix operator. A `br` break goes just before the
 * symbol; so does `&` if this is the relation an aligned layout aligns at.
 * Arrows bracket an equal-rank child on either side, since p ⇒ q ⇒ r reads
 * differently to different readers.
 */
function infix(node: Node & { kind: "apply" }): string {
  const [a, b] = node.args as [Node, Node];
  const brackets = infixBrackets(node);
  const left = child(a, brackets.left);
  const right = child(b, brackets.right);
  const lineBreak = isBroken(node) && !breaksOff ? breakBefore(isAligning(node.operator)) : "";
  const cut = pieceCuts?.has(node) ? pieceMark : "";
  const align = node === alignAt ? "&" : "";
  return `${left} ${lineBreak}${cut}${align}${infixLatex.get(node.operator)} ${right}`;
}

/** Which children of an infix node get brackets. */
function infixBrackets(node: Node & { kind: "apply" }): { left: boolean; right: boolean } {
  const { operator } = node;
  const [a, b] = node.args as [Node, Node];
  const r = rank(node);
  const arrow = arrows.has(operator);
  const negOnRight = b.kind === "apply" && b.operator === "neg" && (operator === "+" || operator === "-");
  return {
    left: rank(a) < r || (rank(a) === r && arrow),
    right: rank(b) < r || (rank(b) === r && !associative.has(operator)) || negOnRight,
  };
}

const isBroken = (node: Node): boolean => (node.kind === "apply" && node.breakBefore === true) || autoBreaks.has(node);

/**
 * Where the tool may break an equation by itself, in reading order: the
 * relations, arrows, `+`, `-`, `and` and `or` at the top level, meaning not
 * inside any brackets or boxes.
 */
export function breakCandidates(body: Node): Node[] {
  if (body.kind !== "apply" || !infixLatex.has(body.operator)) return [];
  const [a, b] = body.args as [Node, Node];
  const brackets = infixBrackets(body);
  return [...(brackets.left ? [] : breakCandidates(a)), body, ...(brackets.right ? [] : breakCandidates(b))];
}

/** Cuts an equation's LaTeX into the pieces between `candidates`, for measuring. */
export function emitPieces(body: Node, candidates: readonly Node[]): string[] {
  pieceCuts = new Set(candidates);
  try {
    return emitNode(body).split(pieceMark).map((piece) => piece.trim());
  } finally {
    pieceCuts = undefined;
  }
}

/** Whether an operator is one an aligned layout lines up at (a relation or an arrow). */
export const isAligningOperator = (operator: string): boolean => isAligning(operator);

function emitApply(node: Node & { kind: "apply" }, followed: boolean): string {
  const { operator, args } = node;
  const [a, b, c, d] = args;

  if (infixLatex.has(operator)) return infix(node);

  if (functions.has(operator)) return `\\${operator} ${argument(a!)}`;

  const under = subscripted.get(operator);
  if (under !== undefined) return `${under}_{${boxed(a!, "a subscript")}} ${body(b!)}`;

  switch (operator) {
    case "*":
      return sideBySide([factor(a!, true), factor(b!, followed)], node.breakBefore && !breaksOff);
    case "/":
      return `\\frac{${boxed(a!, "a fraction")}}{${boxed(b!, "a fraction")}}`;
    case "^":
      return `${child(a!, !isAtom(a!) && !isSubscriptedAtom(a!))}^{${boxed(b!, "an exponent")}}`;
    case "ssc": {
      // Subscripts are notational (tensor indices), so the base never gets
      // visible brackets. A base that isn't an atom or a power goes in an
      // invisible group, so x_i_j doesn't become a double-subscript error. A
      // power whose own base is subscripted (x_i^2) is grouped for the same reason.
      const power = a!.kind === "apply" && a!.operator === "^" && !(a!.args[0]!.kind === "apply" && a!.args[0]!.operator === "ssc");
      const base = isAtom(a!) || power ? emitNode(a!) : `{${boxed(a!, "a subscripted group")}}`;
      return `${base}_{${boxed(b!, "a subscript")}}`;
    }
    case "neg":
      return `-${child(a!, rank(a!) <= Rank.additive)}`;
    case "!":
      return `${child(a!, !isAtom(a!) && !isSubscriptedAtom(a!))}!`;
    case "sqrt":
      return `\\sqrt{${boxed(a!, "a square root")}}`;
    case "not":
      // ¬ binds tighter than ∧ and ∨, so it brackets a relation or anything looser.
      return `\\neg ${child(a!, rank(a!) <= Rank.relation)}`;
    case "exists":
    case "forall":
      return `\\${operator} ${argument(a!)}`;
    case "sum":
      return `\\sum_{${boxed(a!, "a sum's index")}} ${body(b!)}`;
    case "ser":
      return `\\sum_{${boxed(a!, "a sum's bounds")}}^{${boxed(b!, "a sum's bounds")}} ${body(c!)}`;
    case "int":
      return `\\int_{${boxed(a!, "an integral's bounds")}}^{${boxed(b!, "an integral's bounds")}} ${body(c!)} \\,d${child(d!, !isAtom(d!))}`;
  }
  throw new Error(`the emitter doesn't know the operator \`${operator}\``);
}

const variadicEnvironment: Readonly<Record<string, string>> = { mat: "pmatrix", col: "pmatrix", cases: "cases" };

/**
 * Writes the LaTeX for one node of the tree. `followed` says whether another
 * factor is printed right after it, side by side (see `factor`).
 */
export function emitNode(node: Node, followed = false): string {
  switch (node.kind) {
    case "number":
      return node.text;
    case "variable":
      return node.name;
    case "named":
      return node.latex;
    case "raw":
      return node.latex;
    case "text":
      return `\\text{${node.text}}`;
    case "product":
    case "juxtapose": {
      const items = node.kind === "product" ? node.factors : node.items;
      return sideBySide(items.map((item, k) => factor(item, followed || k < items.length - 1)));
    }
    case "apply":
      return emitApply(node, followed);
    case "rawApply":
      return `${node.command}${node.args.map((arg) => `{${boxed(arg, "a raw operator's argument")}}`).join("")}`;
    case "variadic": {
      const env = variadicEnvironment[node.operator];
      if (env === undefined) throw new Error(`the emitter doesn't know the operator \`${node.operator}\``);
      // A column vector puts every entry on its own row.
      const rows = node.operator === "col" ? node.rows.flat().map((cell) => [cell]) : node.rows;
      const body = rows.map((row) => row.map((cell) => boxed(cell, "a matrix entry")).join(" & ")).join(" \\\\ ");
      return `\\begin{${env}} ${body} \\end{${env}}`;
    }
  }
}

/** The first node the author's `br` breaks before, if any. */
export function findBreak(node: Node): Node | undefined {
  if (node.kind === "apply" && node.breakBefore) return node;
  const children =
    node.kind === "apply" || node.kind === "rawApply" ? node.args
    : node.kind === "product" ? node.factors
    : node.kind === "juxtapose" ? node.items
    : node.kind === "variadic" ? node.rows.flat()
    : [];
  for (const c of children) {
    const found = findBreak(c);
    if (found) return found;
  }
  return undefined;
}

/**
 * Where an aligned layout lines up: the relation or arrow at the root. For a
 * chain of relations it's the leftmost one, like the first = in a = b = c; the
 * chain only continues through relations, so in a = b ⇒ c = d it's the ⇒.
 * Arrows don't chain, because an arrow's arrow child is in brackets.
 */
export function leftmostRelation(node: Node): Node | undefined {
  if (node.kind !== "apply" || !isAligning(node.operator)) return undefined;
  if (arrows.has(node.operator)) return node;
  let found: Node = node;
  for (let n = node.args[0]; n?.kind === "apply" && relations.has(n.operator); n = n.args[0]) found = n;
  return found;
}

/**
 * Writes one equation, with its label and \notag, for the given layout. In an
 * aligned layout, the first relation at the root gets `&`. A `br` break
 * becomes `\\` (with `&` or `&\qquad` when aligned). In layouts that number
 * every line, lines that end in a break get \notag, so the equation is
 * numbered once, on its last line.
 */
export function emitEquation(
  equation: Equation,
  layout: Layout = "single",
  options: { readonly breaks?: ReadonlySet<Node> } = {},
): string {
  const { body } = equation;
  if (layout === "single") {
    const broken = findBreak(body);
    if (broken) fail(broken, "`br` needs a display that can hold several lines, like multline, align or gather");
  }

  autoBreaks = options.breaks ?? new Set();
  alignAt = layout === "aligned" ? leftmostRelation(body) : undefined;
  if (alignAt && isBroken(alignAt)) alignAt = undefined; // its break supplies the &
  let out: string;
  try {
    out = emitNode(body);
  } finally {
    alignAt = undefined;
    breaksOff = false;
    autoBreaks = new Set();
  }

  const notag = layout === "aligned" || layout === "lines" ? "\\notag " : "";
  out = out.replace(new RegExp(`${breakMark}([ro])`, "g"), (_, kind: string) => {
    const lineStart = layout !== "aligned" ? "" : kind === "r" ? "&" : "&\\qquad ";
    return `${notag}\\\\ ${lineStart}`;
  });
  if (equation.label !== undefined) out += ` \\label{${equation.label}}`;
  if (equation.notag) out += " \\notag";
  return out;
}

export interface EmitResult {
  /** The LaTeX for each equation. Joining them for a display is up to the caller. */
  readonly equations: string[];
  readonly errors: Diagnostic[];
  readonly warnings: Diagnostic[];
}

/** Lexes, parses and emits one RPN block, laid out as `layout`. */
export function toLatex(source: string, layout: Layout = "single"): EmitResult {
  const { equations, errors, warnings } = parse(source);
  try {
    return { equations: equations.map((equation) => emitEquation(equation, layout)), errors, warnings };
  } catch (error) {
    if (error instanceof EmitError) return { equations: [], errors: [error.diagnostic], warnings };
    throw error;
  }
}
