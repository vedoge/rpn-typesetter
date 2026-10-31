-- The lexer: the first stage of the pipeline. It turns the text of one RPN
-- block into a list of tokens, the "words" the parser works with. It knows
-- nothing about the stack; it only decides what each piece of text is.
-- Kept in step with src/lexer.ts.
--
--   "b neg b 2 ^ 4ac -"  →  variable b, word neg, variable b, number 2,
--                           symbol ^, product 4·a·c, symbol -
--
-- Every token and diagnostic carries a span: `start` is the position of its
-- first byte (counting from 1, as Lua does), and `stop` is one past its last.
--
-- Token kinds, with their fields:
--   number { text }                      2
--   variable { name, subscript? }        x, x1
--   word { name, subscript? }            a reserved word: pi, sqrt
--   product { factors }                  4ac, 2pi; each factor is a number, variable or word
--   symbol { symbol }                    + [ ; <= …
--   raw { latex }                        \mathcal{F}
--   rawOperator { command, arity }       \overset/2
--   text { text }                        "if "
--   label { name }                       \label{eq:energy}
--   notag {}                             \notag or \nonumber

local text = require("rpn-typesetter-text")
local vocab = require("rpn-typesetter-vocabulary")

local M = {}

--- Every character that appears in a symbol, for spotting tokens glued together like `a<b`.
local symbol_characters = {}
for symbol in pairs(vocab.symbols) do
  for c in symbol:gmatch(".") do symbol_characters[c] = true end
end

--- Position where the whitespace-separated chunk starting at `from` ends.
local function chunk_end(source, from)
  local i = from
  while i <= #source and text.space_length(source, i) == 0 do i = i + 1 end
  return i
end

--- Reads a quoted string starting at the `"` at `from`. `\"` is a quote
--- inside the text. Every other backslash is kept, so LaTeX like `\$` still
--- works inside text; `\\` is kept as a pair, so it never escapes a quote.
--- Returns the text and the position after the closing quote, or nil if
--- there's no closing quote.
local function read_string(source, from)
  local out = {}
  local i = from + 1
  while i <= #source do
    local c = source:sub(i, i)
    if c == '"' then return table.concat(out), i + 1 end
    local next = source:sub(i + 1, i + 1)
    if c == "\\" and (next == '"' or next == "\\") then
      out[#out + 1] = next == '"' and '"' or "\\\\"
      i = i + 2
    else
      out[#out + 1] = c
      i = i + 1
    end
  end
  return nil
end

local function token(kind, span, fields)
  local t = { kind = kind, start = span.start, stop = span.stop }
  for k, v in pairs(fields or {}) do t[k] = v end
  return t
end

--- Matches `\d+(?:\.\d+)?` at `i`. Returns the number's text and the position after it.
local function read_number(s, i)
  local digits = s:match("^%d+", i)
  if not digits then return nil, i end
  local j = i + #digits
  local decimals = s:sub(j, j) == "." and s:match("^%d+", j + 1)
  if decimals then j = j + 1 + #decimals end
  return s:sub(i, j - 1), j
end

--- Decides what one whitespace-separated chunk is. Returns a token, or a
--- diagnostic (a table with `message`).
local function classify(chunk, span)
  local function fail(message)
    return { start = span.start, stop = span.stop, message = message }
  end

  if chunk:sub(1, 1) == "\\" then
    if chunk == "\\" then return fail("a lone `\\` is not a LaTeX command") end
    -- Labels and \notag belong to the equation, not the stack.
    if chunk == "\\notag" or chunk == "\\nonumber" then return token("notag", span) end
    if chunk == "\\label" or text.starts_with(chunk, "\\label{") then
      local name = chunk:match("^\\label{([^{}]+)}$")
      if not name then return fail("a label is written `\\label{name}`, with no spaces in the name") end
      return token("label", span, { name = name })
    end
    local command, arity = chunk:match("^(\\[A-Za-z]+)/(%d+)$")
    if command then return token("rawOperator", span, { command = command, arity = tonumber(arity) }) end
    return token("raw", span, { latex = chunk })
  end

  if vocab.symbols[chunk] then return token("symbol", span, { symbol = chunk }) end

  -- An optional number, then optional letters, then an optional subscript:
  -- `2`, `x`, `4ac`, `2pi`, `sqrt`, `x1`, `2x12`.
  local num, i = read_number(chunk, 1)
  local letters = chunk:match("^[A-Za-z]+", i) or ""
  i = i + #letters
  local subscript = letters ~= "" and chunk:match("^%d+", i) or nil
  if subscript then i = i + #subscript end
  if i > #chunk then
    local factors = {}
    if num then factors[#factors + 1] = { kind = "number", text = num } end

    local word = vocab.vocabulary[letters]
    if word then
      -- Reserved words win over a product of letters.
      if word.role == "operator" and subscript then
        return fail(("the operator `%s` can't take a subscript; did you mean `%s %s`?"):format(letters, subscript, letters))
      end
      if word.role == "operator" and num then
        return fail(("`%s` is glued to the operator `%s`; did you mean `%s %s`?"):format(num, letters, num, letters))
      end
      factors[#factors + 1] = { kind = "word", name = letters, subscript = subscript }
    else
      for k = 1, #letters do
        factors[#factors + 1] = { kind = "variable", name = letters:sub(k, k), subscript = k == #letters and subscript or nil }
      end
    end

    if #factors == 1 then return token(factors[1].kind, span, factors[1]) end
    return token("product", span, { factors = factors })
  end

  if chunk:find("[A-Za-z]%d") then
    return fail(("`%s`: glued digits after letters are a subscript and must end the token (`x1` → x₁)"):format(chunk))
  end
  if chunk:find("[A-Za-z0-9]") then
    for c in chunk:gmatch(".") do
      if symbol_characters[c] then
        return fail(("`%s` needs spaces: tokens are separated by whitespace"):format(chunk))
      end
    end
  end
  return fail(("unknown symbol `%s`"):format(chunk))
end

--- Splits one RPN block into tokens. It doesn't stop at the first error: it
--- reports each bad chunk and carries on, so `errors` lists every problem.
function M.lex(source)
  local tokens, errors = {}, {}
  local i = 1

  while i <= #source do
    local space = text.space_length(source, i)
    if space > 0 then
      i = i + space
    else
      local start = i
      -- A quoted string is the one place whitespace doesn't end a token: the
      -- lexer reads everything up to the closing quote.
      if source:sub(i, i) == '"' then
        local string, after = read_string(source, i)
        if not string then
          errors[#errors + 1] = { start = start, stop = #source + 1, message = 'unterminated string: missing the closing "' }
          break
        end
        i = after
        if i <= #source and text.space_length(source, i) == 0 then
          local stop = chunk_end(source, i)
          errors[#errors + 1] = { start = start, stop = stop, message = "a string must be followed by a space" }
          i = stop
        else
          tokens[#tokens + 1] = token("text", { start = start, stop = i }, { text = string })
        end
      else
        local stop = chunk_end(source, i)
        local result = classify(source:sub(start, stop - 1), { start = start, stop = stop })
        if result.message then errors[#errors + 1] = result else tokens[#tokens + 1] = result end
        i = stop
      end
    end
  end

  return { tokens = tokens, errors = errors }
end

return M
