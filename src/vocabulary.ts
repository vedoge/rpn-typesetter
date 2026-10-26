// Reserved words. A run of letters that exactly matches one of these is that
// word, not a product of letters (see "Reserved words win" in docs/design.md).
//
// For now the lexer only needs to know each word's role:
// - a "value" is something that sits on the stack, like `pi`. It can be glued
//   after a number (`2pi` → 2·π), and it knows its LaTeX.
// - an "operator" takes things off the stack, like `sqrt`. The parser will
//   add each operator's arity when that stage is written.

export type Word =
  | { readonly role: "value"; readonly latex: string }
  | { readonly role: "operator" };

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

const operators = [
  "neg", "sqrt", "ssc", "sum", "ser", "int", "vec",
  "and", "or", "exists", "forall",
  "br",
  // Variadic: these take everything above the nearest mark.
  "mat", "cases", "col",
  // Functions LaTeX has a command for (\sin, \log, \lim, …).
  "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
  "deg", "det", "dim", "exp", "gcd", "hom", "inf", "ker", "lg", "lim",
  "liminf", "limsup", "ln", "log", "max", "min", "Pr", "sec", "sin", "sinh",
  "sup", "tan", "tanh",
];

export const vocabulary: ReadonlyMap<string, Word> = new Map<string, Word>([
  ...Object.entries(values).map(
    ([name, latex]): [string, Word] => [name, { role: "value", latex }],
  ),
  ...operators.map((name): [string, Word] => [name, { role: "operator" }]),
]);
