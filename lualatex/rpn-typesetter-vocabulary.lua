-- Copyright 2026 vedoge
--
-- This work may be distributed and/or modified under the conditions of the
-- LaTeX Project Public License, either version 1.3c of this license or (at
-- your option) any later version. The latest version of this license is in
-- https://www.latex-project.org/lppl.txt and version 1.3c or later is part
-- of all distributions of LaTeX version 2008 or later.
--
-- This work has the LPPL maintenance status `maintained'.
-- The Current Maintainer of this work is vedoge (https://github.com/vedoge).
--
-- This work consists of all the files in https://github.com/vedoge/rpn-typesetter.
--
-- Reserved words. A run of letters that exactly matches one of these is that
-- word, not a product of letters (see "Reserved words win" in docs/design.md).
-- Kept in step with src/vocabulary.ts.
--
-- Each word has a role:
-- - a "value" is something that sits on the stack, like `pi`. It can be glued
--   after a number (`2pi` → 2·π), and it knows its LaTeX.
-- - an "operator" takes things off the stack, like `sqrt`, and knows how
--   many (its arity).

local M = {}

local values = {
  -- Greek letters that LaTeX has commands for, lowercase and variants.
  alpha = "\\alpha", beta = "\\beta", gamma = "\\gamma", delta = "\\delta",
  epsilon = "\\epsilon", varepsilon = "\\varepsilon", zeta = "\\zeta",
  eta = "\\eta", theta = "\\theta", vartheta = "\\vartheta", iota = "\\iota",
  kappa = "\\kappa", varkappa = "\\varkappa", lambda = "\\lambda", mu = "\\mu",
  nu = "\\nu", xi = "\\xi", pi = "\\pi", varpi = "\\varpi", rho = "\\rho",
  varrho = "\\varrho", sigma = "\\sigma", varsigma = "\\varsigma", tau = "\\tau",
  upsilon = "\\upsilon", phi = "\\phi", varphi = "\\varphi", chi = "\\chi",
  psi = "\\psi", omega = "\\omega",
  -- Uppercase Greek letters that LaTeX has commands for.
  Gamma = "\\Gamma", Delta = "\\Delta", Theta = "\\Theta", Lambda = "\\Lambda",
  Xi = "\\Xi", Pi = "\\Pi", Sigma = "\\Sigma", Upsilon = "\\Upsilon",
  Phi = "\\Phi", Psi = "\\Psi", Omega = "\\Omega",
  -- Greek letters LaTeX has no command for, because they look like Latin
  -- ones. Capitals are upright, matching \Gamma and the rest.
  Alpha = "\\mathrm{A}", Beta = "\\mathrm{B}", Epsilon = "\\mathrm{E}",
  Zeta = "\\mathrm{Z}", Eta = "\\mathrm{H}", Iota = "\\mathrm{I}",
  Kappa = "\\mathrm{K}", Mu = "\\mathrm{M}", Nu = "\\mathrm{N}",
  Omicron = "\\mathrm{O}", Rho = "\\mathrm{P}", Tau = "\\mathrm{T}",
  Chi = "\\mathrm{X}", omicron = "o",
  -- Other letters LaTeX has commands for.
  ell = "\\ell", hbar = "\\hbar", hslash = "\\hslash", imath = "\\imath",
  jmath = "\\jmath", aleph = "\\aleph", beth = "\\beth", gimel = "\\gimel",
  daleth = "\\daleth", wp = "\\wp", eth = "\\eth",
  -- Number sets.
  naturals = "\\mathbb{N}", integers = "\\mathbb{Z}", rationals = "\\mathbb{Q}",
  reals = "\\mathbb{R}", complex = "\\mathbb{C}",
  -- Infinity.
  infty = "\\infty",
}

local function set(list)
  local s = {}
  for _, name in ipairs(list) do s[name] = true end
  return s
end

--- Functions that take one argument: those LaTeX has a command for (\sin,
--- \log, \sup, …), and the real and imaginary parts `Re` and `Im`. `gcd` and
--- `hom` also have commands, but their arity is open.
M.functions = set {
  "arccos", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc",
  "deg", "det", "dim", "exp", "inf", "ker", "lg", "ln", "log", "Pr", "sec", "sin",
  "sinh", "sup", "tan", "tanh", "Re", "Im",
}

--- Functions whose LaTeX isn't the command of the same name: \Re is the symbol ℜ, so `Re` is written upright.
M.function_latex = { Re = "\\operatorname{Re}", Im = "\\operatorname{Im}" }

--- Operators written with a subscript, taking two values: what goes underneath,
--- then the body. `x 0 -> f lim` → lim_{x→0} f. Each maps to its LaTeX.
M.subscripted = {
  lim = "\\lim", liminf = "\\liminf", limsup = "\\limsup",
  max = "\\max", min = "\\min",
  argmax = "\\operatorname*{arg\\,max}", argmin = "\\operatorname*{arg\\,min}",
}

--- Accents over a value, taking one: `x dot` → ẋ (Newton's notation for derivatives), `a tilde` → ã, `x hat` → x̂, `x bar` → x̄. Each maps to its LaTeX.
M.accents = { dot = "\\dot", ddot = "\\ddot", tilde = "\\tilde", hat = "\\hat", bar = "\\bar" }

--- Relations, all binding like `=`, and the LaTeX each writes. Common ones
--- have an ASCII spelling; every one has a name.
M.relations = {
  ["="] = "=", ["<"] = "<", [">"] = ">",
  ["<="] = "\\leq", [">="] = "\\geq", ["!="] = "\\neq", ["<<"] = "\\ll", [">>"] = "\\gg", ["->"] = "\\to", ["<-"] = "\\leftarrow",
  leq = "\\leq", geq = "\\geq", neq = "\\neq", ll = "\\ll", gg = "\\gg", to = "\\to",
  approx = "\\approx", equiv = "\\equiv", sim = "\\sim", propto = "\\propto",
  ["in"] = "\\in", notin = "\\notin", subset = "\\subset", subseteq = "\\subseteq", supset = "\\supset",
  mapsto = "\\mapsto", perp = "\\perp", rightarrow = "\\rightarrow", leftarrow = "\\leftarrow",
}

--- Logical arrows. They bind more loosely than `and` and `or`; `iff` and
--- `Leftrightarrow` most loosely of all. `Rightarrow` and its kin are the
--- short glyphs (⇒) of `implies` and its kin (⟹).
M.arrows = {
  ["=>"] = "\\implies", implies = "\\implies", impliedby = "\\impliedby",
  ["<=>"] = "\\iff", iff = "\\iff",
  Rightarrow = "\\Rightarrow", Leftarrow = "\\Leftarrow", Leftrightarrow = "\\Leftrightarrow",
}

--- The arrows that bind most loosely of all.
M.equivalences = { ["<=>"] = true, iff = true, Leftrightarrow = true }

local function is_name(spelling) return spelling:find("^[A-Za-z]") ~= nil end

--- Symbols the lexer reads: arithmetic, `_` (subscript), factorial, marks, row separators, the comma, and the ASCII relations and arrows.
M.symbols = set { "+", "-", "*", "/", "^", "_", "!", "[", ";", "," }
for _, table in ipairs { M.relations, M.arrows } do
  for spelling in pairs(table) do
    if not is_name(spelling) then M.symbols[spelling] = true end
  end
end

-- How many values each operator takes off the stack:
-- - a number: exactly that many.
-- - "variadic": everything above the nearest mark `[`.
-- - "break": `br`, which takes no values; it flags the operator just applied.
-- - "undecided": reserved, but its arity is still an open question, so the
--   parser rejects it for now.
local operators = {
  neg = 1, sqrt = 1, exists = 1, forall = 1, ["not"] = 1,
  ssc = 2, sum = 2, ["and"] = 2, ["or"] = 2,
  ser = 3,
  int = 4,
  br = "break",
  mat = "variadic", cases = "variadic", col = "variadic", tuple = "variadic",
  vec = "undecided",
}
for _, table in ipairs { M.relations, M.arrows } do
  for spelling in pairs(table) do
    if is_name(spelling) then operators[spelling] = 2 end
  end
end
for name in pairs(M.functions) do operators[name] = 1 end
for name in pairs(M.subscripted) do operators[name] = 2 end
for name in pairs(M.accents) do operators[name] = 1 end
operators.gcd, operators.hom = "undecided", "undecided"

--- Every reserved word: `{ role = "value", latex = … }` or `{ role = "operator", arity = … }`.
M.vocabulary = {}
for name, latex in pairs(values) do M.vocabulary[name] = { role = "value", latex = latex } end
for name, arity in pairs(operators) do M.vocabulary[name] = { role = "operator", arity = arity } end

return M
