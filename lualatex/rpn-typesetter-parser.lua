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
-- The parser: the second stage of the pipeline. It runs the stack over the
-- lexer's tokens and builds a tree of the expression, called an abstract
-- syntax tree (AST). Each operator becomes a node whose children are the
-- values it took off the stack. Kept in step with src/parser.ts.
--
--   a b c - +   →        +
--                       / \
--                      a   -
--                         / \
--                        b   c
--
-- The tree records what the math *is*. How it looks, including where
-- brackets go, is the emitter's job.
--
-- Node kinds, with their fields (every node also has `start` and `stop`):
--   number { text }                          2
--   variable { name, primes? }               x, x''
--   named { name, latex, primes? }           pi → \pi
--   raw { latex }                            \mathcal{F}
--   text { text }                            "if "
--   product { factors }                      glued: 4ac
--   apply { operator, args, breakBefore? }   + sqrt ssc ser …; `br` sets breakBefore
--   rawApply { command, args }               \overset/2
--   variadic { operator, rows }              mat
--   juxtapose { items }                      leftovers: 2 x 2 ^ → 2x²
--
-- An equation is { body, label?, notag, start, stop }.

local lexer = require("rpn-typesetter-lexer")
local text = require("rpn-typesetter-text")
local vocab = require("rpn-typesetter-vocabulary")

local M = {}

--- Symbols take two values, except factorial `!`, which takes one.
local function symbol_arity(symbol) return symbol == "!" and 1 or 2 end

--- Symbols that are another spelling of a named operator: `x i _` builds the same tree as `x i ssc`.
local function symbol_operator(symbol) return symbol == "_" and "ssc" or symbol end

--- Operators written between their operands, the only ones `br` can follow.
local infix = { ["+"] = true, ["-"] = true, ["*"] = true, [","] = true, ["and"] = true, ["or"] = true }
for spelling in pairs(vocab.relations) do infix[spelling] = true end
for spelling in pairs(vocab.arrows) do infix[spelling] = true end

-- Errors are raised with error() as a table marked `parse_error`, and caught
-- in parse_tokens.
local function fail(span, message)
  error({ parse_error = true, diagnostic = { start = span.start, stop = span.stop, message = message } }, 0)
end

--- A single factor as a node. Primes stay on the letter; a glued subscript
--- becomes `ssc`: `x1'` → x' 1 ssc.
local function factor_node(factor, span)
  local function node(kind, fields)
    local n = { kind = kind, start = span.start, stop = span.stop }
    for k, v in pairs(fields) do n[k] = v end
    return n
  end
  local base
  if factor.kind == "number" then return node("number", { text = factor.text }) end
  if factor.kind == "variable" then
    base = node("variable", { name = factor.name, primes = factor.primes })
  else
    local word = vocab.vocabulary[factor.name]
    base = node("named", { name = factor.name, latex = word and word.role == "value" and word.latex or factor.name, primes = factor.primes })
  end
  if factor.subscript == nil then return base end
  return node("apply", { operator = "ssc", args = { base, node("number", { text = factor.subscript }) } })
end

--- Parses a block's tokens. `end_of_block` is where errors about the end of
--- the block point. It stops at the first error, because after one the stack
--- no longer means anything.
function M.parse_tokens(tokens, end_of_block)
  local equations, warnings = {}, {}
  local stack = {} -- items: { kind = "value", node }, { kind = "mark", span }, { kind = "row", span }
  local label, notag = nil, false
  local first -- first token of the current equation
  local previous

  local function push(node) stack[#stack + 1] = { kind = "value", node = node } end

  local function has_mark()
    for _, item in ipairs(stack) do
      if item.kind == "mark" then return item end
    end
    return nil
  end

  --- Takes `count` values off the stack for an operator, oldest first.
  local function take(count, name, at)
    local args = {}
    for k = 0, count - 1 do
      local top = stack[#stack - k]
      if top == nil or top.kind ~= "value" then
        local where = top == nil and "" or top.kind == "mark" and " after the last `[`" or " in this row"
        local have = k == 0 and "none is" or k == 1 and "only 1 is" or ("only %d are"):format(k)
        fail(at, ("`%s` needs %d value%s, but %s available%s"):format(name, count, count == 1 and "" or "s", have, where))
      end
      table.insert(args, 1, top.node)
    end
    for _ = 1, count do stack[#stack] = nil end
    return args
  end

  --- Applies an operator; `spelled` is how the author wrote it, for error messages.
  local function apply(operator, arity, at, spelled)
    local args = take(arity, spelled or operator, at)
    push({ kind = "apply", operator = operator, args = args, start = args[1] and args[1].start or at.start, stop = at.stop })
  end

  local function apply_variadic(operator, at)
    local mark_index
    for k = #stack, 1, -1 do
      if stack[k].kind == "mark" then
        mark_index = k
        break
      end
    end
    if not mark_index then fail(at, ("`%s` needs a mark `[` before its entries"):format(operator)) end

    local rows = { {} }
    for k = mark_index + 1, #stack do
      local item = stack[k]
      if item.kind == "row" then
        rows[#rows + 1] = {}
      elseif item.kind == "value" then
        local row = rows[#rows]
        row[#row + 1] = item.node
      end
    end
    for _, row in ipairs(rows) do
      if #row == 0 then fail(at, ("`%s` has an empty row"):format(operator)) end
    end

    local mark = stack[mark_index]
    for k = #stack, mark_index, -1 do stack[k] = nil end
    push({ kind = "variadic", operator = operator, rows = rows, start = mark.span.start, stop = at.stop })
  end

  local function apply_break(at)
    local top = stack[#stack]
    local node = top and top.kind == "value" and top.node or nil
    local just_applied = node ~= nil and node.kind == "apply" and previous ~= nil and node.stop == previous.stop
    if not just_applied or not infix[node.operator] then
      fail(at, "`br` must come right after an operator written between its operands, such as + or =")
    end
    stack[#stack] = { kind = "value", node = text.with(node, { breakBefore = true }) }
  end

  local function apply_word(name, arity, at)
    if type(arity) == "number" then
      apply(name, arity, at)
    elseif arity == "variadic" then
      apply_variadic(name, at)
    elseif arity == "break" then
      apply_break(at)
    else
      fail(at, ("`%s` is reserved, but how many values it takes isn't decided yet"):format(name))
    end
  end

  --- Ends the current equation, at a top-level `;` or the end of the block.
  local function finish_equation(at)
    local mark = has_mark()
    if mark then fail(mark.span, "this mark `[` is never used by a variadic operator (`mat`, `cases`, `col`)") end

    local values = {}
    for _, item in ipairs(stack) do
      if item.kind == "value" then values[#values + 1] = item.node end
    end
    if #values == 0 then fail(at, #tokens == 0 and "the RPN block is empty" or "this equation is empty") end

    local body = values[1]
    if #values > 1 then
      body = { kind = "juxtapose", items = values, start = values[1].start, stop = values[#values].stop }
      warnings[#warnings + 1] = {
        start = body.start,
        stop = body.stop,
        message = ("%d values were left on the stack, so they're set side by side; is an operator missing?"):format(#values),
      }
    end

    equations[#equations + 1] = {
      body = body,
      notag = notag,
      label = label,
      start = first and first.start or body.start,
      stop = previous and previous.stop or body.stop,
    }
    stack, label, notag, first = {}, nil, false, nil
  end

  local function run()
    for _, token in ipairs(tokens) do
      if token.kind == "symbol" and token.symbol == ";" and not has_mark() then
        finish_equation(token)
      else
        first = first or token
        local kind = token.kind
        if kind == "number" or kind == "variable" then
          push(factor_node(token, token))
        elseif kind == "word" then
          local word = vocab.vocabulary[token.name]
          if word.role == "value" then push(factor_node(token, token)) else apply_word(token.name, word.arity, token) end
        elseif kind == "product" then
          local factors = {}
          for k, f in ipairs(token.factors) do factors[k] = factor_node(f, token) end
          push({ kind = "product", factors = factors, start = token.start, stop = token.stop })
        elseif kind == "raw" then
          push({ kind = "raw", latex = token.latex, start = token.start, stop = token.stop })
        elseif kind == "text" then
          push({ kind = "text", text = token.text, start = token.start, stop = token.stop })
        elseif kind == "rawOperator" then
          local args = take(token.arity, token.command, token)
          push({ kind = "rawApply", command = token.command, args = args, start = args[1] and args[1].start or token.start, stop = token.stop })
        elseif kind == "symbol" then
          if token.symbol == "[" then
            stack[#stack + 1] = { kind = "mark", span = token }
          elseif token.symbol == ";" then
            stack[#stack + 1] = { kind = "row", span = token }
          else
            apply(symbol_operator(token.symbol), symbol_arity(token.symbol), token, token.symbol)
          end
        elseif kind == "label" then
          if label ~= nil then fail(token, ("this equation already has the label `%s`"):format(label)) end
          label = token.name
        elseif kind == "notag" then
          notag = true
        end
      end
      previous = token
    end
    if previous and previous.kind == "symbol" and previous.symbol == ";" and first == nil then
      fail(previous, "nothing follows this `;`")
    end
    finish_equation(end_of_block)
  end

  local ok, err = pcall(run)
  if not ok then
    if type(err) == "table" and err.parse_error then return { equations = {}, errors = { err.diagnostic }, warnings = warnings } end
    error(err, 0)
  end
  return { equations = equations, errors = {}, warnings = warnings }
end

--- Lexes and parses one RPN block. If the lexer finds errors, parsing doesn't start.
function M.parse(source)
  local lexed = lexer.lex(source)
  if #lexed.errors > 0 then return { equations = {}, errors = lexed.errors, warnings = {} } end
  return M.parse_tokens(lexed.tokens, { start = #source + 1, stop = #source + 1 })
end

return M
