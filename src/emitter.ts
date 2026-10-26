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
import type { Diagnostic } from "./lexer.js";
import { functions } from "./vocabulary.js";

/**
 * How tightly each kind of node binds, loosest first. A child gets brackets
 * when it binds more loosely than its parent (the bracket rule in
 * docs/design.md).
 */
const Rank = {
  or: 1,
  and: 2,
  relation: 3, // =
  additive: 4, // + - neg
  prefix: 5, // functions, sums, integrals, quantifiers: they swallow what follows
  multiplicative: 6, // * / and glued products
  script: 7, // ^ ssc
  atom: 8, // never needs brackets
} as const;

/** Operators where (a ∘ b) ∘ c = a ∘ (b ∘ c), so a right child of equal rank needs no brackets. */
const associative: ReadonlySet<string> = new Set(["+", "*", "and", "or"]);

const infixLatex: Readonly<Record<string, string>> = { "+": "+", "-": "-", "=": "=", and: "\\wedge", or: "\\vee" };

const prefixOperators: ReadonlySet<string> = new Set(["sum", "ser", "int", "exists", "forall", ...functions]);

function rank(node: Node): number {
  switch (node.kind) {
    case "product":
    case "juxtapose":
      return Rank.multiplicative;
    case "apply": {
      const op = node.operator;
      if (op === "or") return Rank.or;
      if (op === "and") return Rank.and;
      if (op === "=") return Rank.relation;
      if (op === "+" || op === "-" || op === "neg") return Rank.additive;
      if (prefixOperators.has(op)) return Rank.prefix;
      if (op === "*" || op === "/") return Rank.multiplicative;
      if (op === "^" || op === "ssc") return Rank.script;
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
  return isTall(node) ? `\\left(${inner}\\right)` : `(${inner})`;
}

/** Emits a child, in brackets if `needed`. */
function child(node: Node, needed: boolean): string {
  return needed ? bracket(node) : emitNode(node);
}

/**
 * Factors printed side by side. A factor that would start with a digit gets
 * `\cdot` before it, so `2 3 *` prints 2·3, not 23.
 */
function sideBySide(parts: readonly string[]): string {
  return parts.reduce((out, part) => (out === "" ? part : `${out}${/^\d/.test(part) ? " \\cdot " : " "}${part}`), "");
}

/** Emits an operand of a product: bracketed if it binds more loosely than multiplication. */
function factor(node: Node): string {
  return child(node, rank(node) < Rank.multiplicative);
}

/** The argument of a function or quantifier: bracketed unless it's an atom or a subscripted atom. */
function argument(node: Node): string {
  return child(node, !isAtom(node) && !isSubscriptedAtom(node));
}

/** The summand or integrand of a big operator: bracketed if it's a sum or looser. */
function body(node: Node): string {
  return child(node, rank(node) <= Rank.additive);
}

function emitApply(operator: string, args: readonly Node[], parent: Node): string {
  const [a, b, c, d] = args;
  const r = rank(parent);

  if (operator in infixLatex) {
    const left = child(a!, rank(a!) < r);
    const negOnRight = b!.kind === "apply" && b!.operator === "neg" && (operator === "+" || operator === "-");
    const right = child(b!, rank(b!) < r || (rank(b!) === r && !associative.has(operator)) || negOnRight);
    return `${left} ${infixLatex[operator]} ${right}`;
  }

  if (functions.has(operator)) return `\\${operator} ${argument(a!)}`;

  switch (operator) {
    case "*":
      return sideBySide([factor(a!), factor(b!)]);
    case "/":
      return `\\frac{${emitNode(a!)}}{${emitNode(b!)}}`;
    case "^":
      return `${child(a!, !isAtom(a!) && !isSubscriptedAtom(a!))}^{${emitNode(b!)}}`;
    case "ssc":
      return `${child(a!, !isAtom(a!))}_{${emitNode(b!)}}`;
    case "neg":
      return `-${child(a!, rank(a!) <= Rank.additive)}`;
    case "sqrt":
      return `\\sqrt{${emitNode(a!)}}`;
    case "exists":
    case "forall":
      return `\\${operator} ${argument(a!)}`;
    case "sum":
      return `\\sum_{${emitNode(a!)}} ${body(b!)}`;
    case "ser":
      return `\\sum_{${emitNode(a!)}}^{${emitNode(b!)}} ${body(c!)}`;
    case "int":
      return `\\int_{${emitNode(a!)}}^{${emitNode(b!)}} ${body(c!)} \\,d${child(d!, !isAtom(d!))}`;
  }
  throw new Error(`the emitter doesn't know the operator \`${operator}\``);
}

const variadicEnvironment: Readonly<Record<string, string>> = { mat: "pmatrix", col: "pmatrix", cases: "cases" };

/** Writes the LaTeX for one node of the tree. */
export function emitNode(node: Node): string {
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
      return sideBySide(node.factors.map(factor));
    case "juxtapose":
      return sideBySide(node.items.map(factor));
    case "apply":
      // node.breakBefore is handled later, by the stage that knows the environment.
      return emitApply(node.operator, node.args, node);
    case "rawApply":
      return `${node.command}${node.args.map((arg) => `{${emitNode(arg)}}`).join("")}`;
    case "variadic": {
      const env = variadicEnvironment[node.operator];
      if (env === undefined) throw new Error(`the emitter doesn't know the operator \`${node.operator}\``);
      // A column vector puts every entry on its own row.
      const rows = node.operator === "col" ? node.rows.flat().map((cell) => [cell]) : node.rows;
      const body = rows.map((row) => row.map(emitNode).join(" & ")).join(" \\\\ ");
      return `\\begin{${env}} ${body} \\end{${env}}`;
    }
  }
}

/** Writes one equation, with its label and \notag. */
export function emitEquation(equation: Equation): string {
  let out = emitNode(equation.body);
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

/** Lexes, parses and emits one RPN block. */
export function toLatex(source: string): EmitResult {
  const { equations, errors, warnings } = parse(source);
  return { equations: equations.map(emitEquation), errors, warnings };
}
