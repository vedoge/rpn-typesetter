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
-- The emitter: the last stage of the pipeline. It walks the parser's tree and
-- writes LaTeX. Writing output from a tree like this is called code
-- generation. Kept in step with src/emitter.ts.
--
-- Most of its work is deciding where brackets go. The tree has no brackets,
-- because its shape already says what groups with what. The emitter adds
-- them only where the printed formula would otherwise read wrongly:
--
--   (- a (+ b c))  →  a - (b + c)      without them it would read (a - b) + c
--   (+ a (- b c))  →  a + b - c        here they'd change nothing, so none
--
-- Layouts say how the surrounding math lays out equations, which decides
-- what a `br` break becomes:
-- - "single": one equation that can't break (`$…$`, `\[…\]`, `equation`).
-- - "multline": one equation; a break is `\\`.
-- - "lines": several equations, one per line (`gather`); a break is `\\`.
-- - "aligned": several equations aligned at their relation (`align`); a break
--   is `\\ &` before a relation, `\\ &\qquad` before anything else.

local parser = require("rpn-typesetter-parser")
local text = require("rpn-typesetter-text")
local vocab = require("rpn-typesetter-vocabulary")

local accents, functions, subscripted, relations, arrows = vocab.accents, vocab.functions, vocab.subscripted, vocab.relations, vocab.arrows

local M = {}

-- Errors are raised with error() as a table marked `emit_error`; catch them
-- with M.catch.
local function fail(span, message)
  error({ emit_error = true, diagnostic = { start = span.start, stop = span.stop, message = message } }, 0)
end

-- While an equation is written, each `br` break is a placeholder: a NUL
-- character, then "r" before a relation or "o" before anything else. Brackets
-- around a placeholder split across the lines, and emit_equation finally
-- turns each placeholder into the LaTeX the layout needs.
local break_mark = "\0"
local function break_before(relation) return break_mark .. (relation and "r" or "o") end
local function has_break(s) return s:find(break_mark, 1, true) ~= nil end

--- Set while writing \vphantom contents, which must not break.
local breaks_off = false
--- The relation that gets `&` in an aligned layout, if any.
local align_at = nil

--- How tightly each kind of node binds, loosest first. A child gets brackets
--- when it binds more loosely than its parent (the bracket rule in
--- docs/design.md).
local Rank = {
  iff = 1, -- <=> iff Leftrightarrow
  implies = 2, -- => implies impliedby Rightarrow Leftarrow
  ["or"] = 3,
  ["and"] = 4,
  relation = 5, -- = < <= in …
  additive = 6, -- + - neg
  prefix = 7, -- functions, sums, integrals, quantifiers: they swallow what follows
  multiplicative = 8, -- * / and glued products
  script = 9, -- ^ ssc !
  atom = 10, -- never needs brackets
}

--- Operators where (a ∘ b) ∘ c = a ∘ (b ∘ c), so a right child of equal rank needs no brackets.
local associative = { ["+"] = true, ["*"] = true, ["and"] = true, ["or"] = true }

local infix_latex = { ["+"] = "+", ["-"] = "-", ["and"] = "\\wedge", ["or"] = "\\vee" }
for spelling, latex in pairs(relations) do infix_latex[spelling] = latex end
for spelling, latex in pairs(arrows) do infix_latex[spelling] = latex end

--- Operators an aligned layout lines up at, and that start a line with `&` after a break.
local function is_aligning(op) return relations[op] ~= nil or arrows[op] ~= nil end

local prefix_operators = { sum = true, ser = true, int = true, exists = true, forall = true, ["not"] = true }
for name in pairs(functions) do prefix_operators[name] = true end
for name in pairs(subscripted) do prefix_operators[name] = true end

local function rank(node)
  local kind = node.kind
  if kind == "product" or kind == "juxtapose" then return Rank.multiplicative end
  if kind ~= "apply" then return Rank.atom end -- numbers, letters, raw LaTeX, text, matrices, raw operators
  local op = node.operator
  if vocab.equivalences[op] then return Rank.iff end
  if arrows[op] then return Rank.implies end
  if op == "or" then return Rank["or"] end
  if op == "and" then return Rank["and"] end
  if relations[op] then return Rank.relation end
  if op == "+" or op == "-" or op == "neg" then return Rank.additive end
  if prefix_operators[op] then return Rank.prefix end
  if op == "*" or op == "/" then return Rank.multiplicative end
  if op == "^" or op == "ssc" or op == "!" then return Rank.script end
  return Rank.atom -- sqrt draws its own enclosure, and an accent sits on its argument
end

local atoms = { number = true, variable = true, named = true, raw = true, text = true }

--- The decided atoms, and an accent over one (ẋ): these never get brackets anywhere.
local function is_atom(node)
  if node.kind == "apply" and accents[node.operator] then return is_atom(node.args[1]) end
  return atoms[node.kind] == true
end

--- A letter with primes, like x''.
local function has_primes(node)
  return (node.kind == "variable" or node.kind == "named") and (node.primes or 0) > 0
end

--- An atom with a subscript, like x_i.
local function is_subscripted_atom(node)
  return node.kind == "apply" and node.operator == "ssc" and is_atom(node.args[1])
end

local function any(list, predicate)
  for _, item in ipairs(list) do
    if predicate(item) then return true end
  end
  return false
end

local tall_operators = { ["/"] = true, sum = true, ser = true, int = true }

--- Tall contents get brackets that stretch to fit (\left( … \right)).
local function is_tall(node)
  local kind = node.kind
  if kind == "variadic" then return true end
  if kind == "apply" then return tall_operators[node.operator] or any(node.args, is_tall) end
  if kind == "rawApply" then return any(node.args, is_tall) end
  if kind == "product" then return any(node.factors, is_tall) end
  if kind == "juxtapose" then return any(node.items, is_tall) end
  return false
end

local emit_node

local function bracket(node)
  local inner = emit_node(node)
  if not has_break(inner) then
    return is_tall(node) and ("\\left(" .. inner .. "\\right)") or ("(" .. inner .. ")")
  end

  -- A break inside brackets: each line closes its half with an invisible
  -- \right. or opens with \left., and a \vphantom of the whole contents
  -- makes every half the same height.
  breaks_off = true
  local phantom = "\\vphantom{" .. emit_node(node) .. "}"
  breaks_off = false
  -- Split into lines and the placeholders between them: line, break, line, …
  local parts, from = {}, 1
  while true do
    local at = inner:find(break_mark .. "[ro]", from)
    if not at then break end
    parts[#parts + 1] = inner:sub(from, at - 1)
    parts[#parts + 1] = inner:sub(at, at + 1)
    from = at + 2
  end
  parts[#parts + 1] = inner:sub(from)

  local out = {}
  for k, part in ipairs(parts) do
    if k % 2 == 0 then
      out[k] = part -- a break placeholder
    else
      local open = k == 1 and "\\left(" or "\\left."
      local close = k == #parts and "\\right)" or "\\right."
      out[k] = open .. phantom .. " " .. text.trim(part) .. close .. " "
    end
  end
  return text.trim_end(table.concat(out))
end

--- Emits a child, in brackets if `needed`.
local function child(node, needed, followed)
  if needed then return bracket(node) end
  return emit_node(node, followed)
end

--- Emits something the layout puts in its own box, where a line can't break.
local function boxed(node, where)
  local out = emit_node(node)
  if has_break(out) then fail(node, ("`br` can't break a line inside %s"):format(where)) end
  return out
end

--- Factors printed side by side. A factor that would start with a digit gets
--- `\cdot` before it, so `2 3 *` prints 2·3, not 23. With `break_at_last`,
--- the line breaks before the last factor.
local function side_by_side(parts, break_at_last)
  local out = parts[1]
  for k = 2, #parts do
    local part = parts[k]
    local digit = part:find("^%d") ~= nil
    if break_at_last and k == #parts then
      out = out .. " " .. break_before(false) .. (digit and "\\cdot " or "") .. part
    else
      out = out .. (digit and " \\cdot " or " ") .. part
    end
  end
  return out
end

--- Emits an operand of a product: bracketed if it binds more loosely than
--- multiplication. A function or sum is the exception when nothing follows
--- it in the product (`followed` is false), because there it can't swallow
--- anything: y sin x, but (sin x)y.
local function factor(node, followed)
  local r = rank(node)
  return child(node, r < Rank.multiplicative and (followed or r ~= Rank.prefix), followed)
end

--- The argument of a function or quantifier: bracketed unless it's an atom or a subscripted atom.
local function argument(node)
  return child(node, not is_atom(node) and not is_subscripted_atom(node))
end

--- The summand or integrand of a big operator: bracketed if it's a sum or looser.
local function body(node)
  return child(node, rank(node) <= Rank.additive)
end

--- Writes `a ∘ b` for an infix operator. A `br` break goes just before the
--- symbol; so does `&` if this is the relation an aligned layout aligns at.
--- Arrows bracket an equal-rank child on either side, since p ⇒ q ⇒ r reads
--- differently to different readers.
local function infix(node)
  local operator = node.operator
  local a, b = node.args[1], node.args[2]
  local r = rank(node)
  local arrow = arrows[operator] ~= nil
  local left = child(a, rank(a) < r or (rank(a) == r and arrow))
  local neg_on_right = b.kind == "apply" and b.operator == "neg" and (operator == "+" or operator == "-")
  local right = child(b, rank(b) < r or (rank(b) == r and not associative[operator]) or neg_on_right)
  local line_break = node.breakBefore and not breaks_off and break_before(is_aligning(operator)) or ""
  local align = node == align_at and "&" or ""
  return left .. " " .. line_break .. align .. infix_latex[operator] .. " " .. right
end

local function emit_apply(node, followed)
  local operator, args = node.operator, node.args
  local a, b, c, d = args[1], args[2], args[3], args[4]

  if infix_latex[operator] then return infix(node) end

  if functions[operator] then return "\\" .. operator .. " " .. argument(a) end

  local accent = accents[operator]
  if accent then return accent .. "{" .. boxed(a, "an accent") .. "}" end

  local under = subscripted[operator]
  if under then return under .. "_{" .. boxed(a, "a subscript") .. "} " .. body(b) end

  if operator == "*" then
    return side_by_side({ factor(a, true), factor(b, followed) }, node.breakBefore and not breaks_off)
  elseif operator == "/" then
    return "\\frac{" .. boxed(a, "a fraction") .. "}{" .. boxed(b, "a fraction") .. "}"
  elseif operator == "^" then
    -- A prime is already a superscript, so x'_1 with a power is grouped,
    -- {x'_1}^2, or LaTeX reports a double superscript. (x'^2 is fine: LaTeX
    -- merges a power straight after primes into the same superscript.)
    local base
    if is_subscripted_atom(a) and has_primes(a.args[1]) then
      base = "{" .. emit_node(a) .. "}"
    else
      base = child(a, not is_atom(a) and not is_subscripted_atom(a))
    end
    return base .. "^{" .. boxed(b, "an exponent") .. "}"
  elseif operator == "ssc" then
    -- Subscripts are notational (tensor indices), so the base never gets
    -- visible brackets. A base that isn't an atom or a power goes in an
    -- invisible group, so x_i_j doesn't become a double-subscript error. A
    -- power whose own base is subscripted (x_i^2) is grouped for the same reason.
    local power = a.kind == "apply" and a.operator == "^"
      and not (a.args[1].kind == "apply" and a.args[1].operator == "ssc")
    local base = (is_atom(a) or power) and emit_node(a) or ("{" .. boxed(a, "a subscripted group") .. "}")
    return base .. "_{" .. boxed(b, "a subscript") .. "}"
  elseif operator == "neg" then
    return "-" .. child(a, rank(a) <= Rank.additive)
  elseif operator == "!" then
    return child(a, not is_atom(a) and not is_subscripted_atom(a)) .. "!"
  elseif operator == "sqrt" then
    return "\\sqrt{" .. boxed(a, "a square root") .. "}"
  elseif operator == "not" then
    -- ¬ binds tighter than ∧ and ∨, so it brackets a relation or anything looser.
    return "\\neg " .. child(a, rank(a) <= Rank.relation)
  elseif operator == "exists" or operator == "forall" then
    return "\\" .. operator .. " " .. argument(a)
  elseif operator == "sum" then
    return "\\sum_{" .. boxed(a, "a sum's index") .. "} " .. body(b)
  elseif operator == "ser" then
    return "\\sum_{" .. boxed(a, "a sum's bounds") .. "}^{" .. boxed(b, "a sum's bounds") .. "} " .. body(c)
  elseif operator == "int" then
    return "\\int_{" .. boxed(a, "an integral's bounds") .. "}^{" .. boxed(b, "an integral's bounds") .. "} "
      .. body(c) .. " \\,d" .. child(d, not is_atom(d))
  end
  error(("the emitter doesn't know the operator `%s`"):format(operator), 0)
end

local variadic_environment = { mat = "pmatrix", col = "pmatrix", cases = "cases" }

--- Writes the LaTeX for one node of the tree. `followed` says whether another
--- factor is printed right after it, side by side (see `factor`).
emit_node = function(node, followed)
  local kind = node.kind
  if kind == "number" then return node.text end
  if kind == "variable" then return node.name .. ("'"):rep(node.primes or 0) end
  if kind == "named" then return node.latex .. ("'"):rep(node.primes or 0) end
  if kind == "raw" then return node.latex end
  if kind == "text" then return "\\text{" .. node.text .. "}" end
  if kind == "product" or kind == "juxtapose" then
    local items = kind == "product" and node.factors or node.items
    local parts = {}
    for k, item in ipairs(items) do parts[k] = factor(item, followed or k < #items) end
    return side_by_side(parts)
  end
  if kind == "apply" then return emit_apply(node, followed) end
  if kind == "rawApply" then
    local out = { node.command }
    for _, arg in ipairs(node.args) do out[#out + 1] = "{" .. boxed(arg, "a raw operator's argument") .. "}" end
    return table.concat(out)
  end
  if kind == "variadic" then
    local env = variadic_environment[node.operator]
    if env == nil then error(("the emitter doesn't know the operator `%s`"):format(node.operator), 0) end
    -- A column vector puts every entry on its own row.
    local rows = node.rows
    if node.operator == "col" then
      rows = {}
      for _, row in ipairs(node.rows) do
        for _, cell in ipairs(row) do rows[#rows + 1] = { cell } end
      end
    end
    local lines = {}
    for r, row in ipairs(rows) do
      local cells = {}
      for k, cell in ipairs(row) do cells[k] = boxed(cell, "a matrix entry") end
      lines[r] = table.concat(cells, " & ")
    end
    return "\\begin{" .. env .. "} " .. table.concat(lines, " \\\\ ") .. " \\end{" .. env .. "}"
  end
  error(("the emitter doesn't know the node `%s`"):format(tostring(kind)), 0)
end
M.emit_node = function(node, followed) return emit_node(node, followed) end

local function children(node)
  local kind = node.kind
  if kind == "apply" or kind == "rawApply" then return node.args end
  if kind == "product" then return node.factors end
  if kind == "juxtapose" then return node.items end
  if kind == "variadic" then
    local cells = {}
    for _, row in ipairs(node.rows) do
      for _, cell in ipairs(row) do cells[#cells + 1] = cell end
    end
    return cells
  end
  return {}
end

--- The first node `br` breaks before, if any.
local function find_break(node)
  if node.kind == "apply" and node.breakBefore then return node end
  for _, c in ipairs(children(node)) do
    local found = find_break(c)
    if found then return found end
  end
  return nil
end

--- Where an aligned layout lines up: the relation or arrow at the root. For a
--- chain of relations it's the leftmost one, like the first = in a = b = c;
--- the chain only continues through relations, so in a = b ⇒ c = d it's the
--- ⇒. Arrows don't chain, because an arrow's arrow child is in brackets.
local function leftmost_relation(node)
  if node.kind ~= "apply" or not is_aligning(node.operator) then return nil end
  if arrows[node.operator] then return node end
  local found = node
  local n = node.args[1]
  while n and n.kind == "apply" and relations[n.operator] do
    found = n
    n = n.args[1]
  end
  return found
end

--- Writes one equation, with its label and \notag, for the given layout. In
--- an aligned layout, the first relation at the root gets `&`. A `br` break
--- becomes `\\` (with `&` or `&\qquad` when aligned). In layouts that number
--- every line, lines that end in a break get \notag, so the equation is
--- numbered once, on its last line. Raises an emit error (see M.catch).
function M.emit_equation(equation, layout)
  layout = layout or "single"
  local root = equation.body
  if layout == "single" then
    local broken = find_break(root)
    if broken then fail(broken, "`br` needs a display that can hold several lines, like multline, align or gather") end
  end

  align_at = layout == "aligned" and leftmost_relation(root) or nil
  if align_at and align_at.breakBefore then align_at = nil end -- its break supplies the &
  local ok, out = pcall(emit_node, root)
  align_at, breaks_off = nil, false
  if not ok then error(out, 0) end

  local notag = (layout == "aligned" or layout == "lines") and "\\notag " or ""
  out = out:gsub(break_mark .. "([ro])", function(kind)
    local line_start = layout ~= "aligned" and "" or kind == "r" and "&" or "&\\qquad "
    return notag .. "\\\\ " .. line_start
  end)
  if equation.label ~= nil then out = out .. " \\label{" .. equation.label .. "}" end
  if equation.notag then out = out .. " \\notag" end
  return out
end

--- Calls `f`, turning an emit error into a returned diagnostic: returns
--- true and f's result, or false and the diagnostic.
function M.catch(f, ...)
  local result = table.pack(pcall(f, ...))
  if result[1] then return true, table.unpack(result, 2, result.n) end
  local err = result[2]
  if type(err) == "table" and err.emit_error then return false, err.diagnostic end
  error(err, 0)
end

--- Lexes, parses and emits one RPN block, laid out as `layout`. Returns
--- { equations = the LaTeX of each, errors, warnings }.
function M.to_latex(source, layout)
  local parsed = parser.parse(source)
  local ok, result = M.catch(function()
    local out = {}
    for k, equation in ipairs(parsed.equations) do out[k] = M.emit_equation(equation, layout) end
    return out
  end)
  if not ok then return { equations = {}, errors = { result }, warnings = parsed.warnings } end
  return { equations = result, errors = parsed.errors, warnings = parsed.warnings }
end

return M
