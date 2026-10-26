// Reserved words. A run of letters that exactly matches one of these is that
// word, not a product of letters (see "Reserved words win" in docs/design.md).
//
// Each word has a role:
// - a "value" is something that sits on the stack, like `pi`. It can be glued
//   after a number (`2pi` → 2·π), and it knows its LaTeX.
// - an "operator" takes things off the stack, like `sqrt`, and knows how
//   many (its arity).

export type Arity = number | "variadic" | "break" | "undecided";

export type Word =
  | { readonly role: "value"; readonly latex: string }
  | { readonly role: "operator"; readonly arity: Arity };

const values: Record<string, string> = {
  // Greek letters that LaTeX has commands for, lowercase and variants.
  alpha: "\\alpha", beta: "\\beta", gamma: "\\gamma", delta: "\\delta",
  epsilon: "\\epsilon", varepsilon: "\\varepsilon", zeta: "\\zeta",
  eta: "\\eta", theta: "\\theta", vartheta: "\\vartheta", iota: "\\iota",
  kappa: "\\kappa", varkappa: "\\varkappa", lambda: "\\lambda", mu: "\\mu",
  nu: "\\nu", xi: "\\xi", pi: "\\pi", varpi: "\\varpi", rho: "\\rho",
  varrho: "\\varrho", sigma: "\\sigma", varsigma: "\\varsigma", tau: "\\tau",
  upsilon: "\\upsilon", phi: "\\phi", varphi: "\\varphi", chi: "\\chi",
  psi: "\\psi", omega: "\\omega",
  // Uppercase Greek letters that LaTeX has commands for.
  Gamma: "\\Gamma", Delta: "\\Delta", Theta: "\\Theta", Lambda: "\\Lambda",
  Xi: "\\Xi", Pi: "\\Pi", Sigma: "\\Sigma", Upsilon: "\\Upsilon",
  Phi: "\\Phi", Psi: "\\Psi", Omega: "\\Omega",
  // Greek letters LaTeX has no command for, because they look like Latin
  // ones. Capitals are upright, matching \Gamma and the rest.
  Alpha: "\\mathrm{A}", Beta: "\\mathrm{B}", Epsilon: "\\mathrm{E}",
  Zeta: "\\mathrm{Z}", Eta: "\\mathrm{H}", Iota: "\\mathrm{I}",
  Kappa: "\\mathrm{K}", Mu: "\\mathrm{M}", Nu: "\\mathrm{N}",
  Omicron: "\\mathrm{O}", Rho: "\\mathrm{P}", Tau: "\\mathrm{T}",
  Chi: "\\mathrm{X}", omicron: "o",
  // Other letters LaTeX has commands for.
  ell: "\\ell", hbar: "\\hbar", hslash: "\\hslash", imath: "\\imath",
  jmath: "\\jmath", aleph: "\\aleph", beth: "\\beth", gimel: "\\gimel",
  daleth: "\\daleth", wp: "\\wp", Re: "\\Re", Im: "\\Im", eth: "\\eth",
  // Number sets.
  naturals: "\\mathbb{N}", integers: "\\mathbb{Z}", rationals: "\\mathbb{Q}",
  reals: "\\mathbb{R}", complex: "\\mathbb{C}",
  // Infinity, as used in the `ser` example (open question 1: does it stay?).
  oo: "\\infty",
};

// How many values each operator takes off the stack:
// - a number: exactly that many.
// - "variadic": everything above the nearest mark `[`.
// - "break": `br`, which takes no values; it flags the operator just applied.
// - "undecided": reserved, but its arity is still an open question, so the
//   parser rejects it for now.
const operators: Record<string, Arity> = {
  neg: 1, sqrt: 1, exists: 1, forall: 1,
  ssc: 2, sum: 2, and: 2, or: 2,
  ser: 3,
  int: 4,
  br: "break",
  mat: "variadic", cases: "variadic", col: "variadic",
  vec: "undecided",
  // Functions LaTeX has a command for (\sin, \log, \lim, …). Most take one
  // argument; the rest wait on open question 2.
  arccos: 1, arcsin: 1, arctan: 1, arg: 1, cos: 1, cosh: 1, cot: 1, coth: 1,
  csc: 1, deg: 1, det: 1, dim: 1, exp: 1, ker: 1, lg: 1, ln: 1, log: 1,
  Pr: 1, sec: 1, sin: 1, sinh: 1, tan: 1, tanh: 1,
  gcd: "undecided", hom: "undecided", inf: "undecided", lim: "undecided",
  liminf: "undecided", limsup: "undecided", max: "undecided",
  min: "undecided", sup: "undecided",
};

export const vocabulary: ReadonlyMap<string, Word> = new Map<string, Word>([
  ...Object.entries(values).map(
    ([name, latex]): [string, Word] => [name, { role: "value", latex }],
  ),
  ...Object.entries(operators).map(
    ([name, arity]): [string, Word] => [name, { role: "operator", arity }],
  ),
]);
