-- The scanner: the stage that works on a whole document. It's a second,
-- simpler lexer. It doesn't understand LaTeX; it only knows enough to find
-- math regions, and to skip the places where `$` or `\[` don't mean math
-- (comments, `\$`, verbatim). Each math region whose first non-space
-- character is the `@` marker is an RPN block: the scanner hands its text to
-- the pipeline (lexer → parser → emitter) and splices the LaTeX back in.
-- Everything else is copied through unchanged. Kept in step with
-- src/scanner.ts.

local emitter = require("rpn-typesetter-emitter")
local parser = require("rpn-typesetter-parser")
local text = require("rpn-typesetter-text")

local M = {}

--- Math environments the scanner recognises, and their layout.
local math_environments = {
  equation = "single", ["equation*"] = "single", displaymath = "single", math = "single",
  multline = "multline", ["multline*"] = "multline",
  gather = "lines", ["gather*"] = "lines", gathered = "lines",
  eqnarray = "lines", ["eqnarray*"] = "lines",
  align = "aligned", ["align*"] = "aligned", flalign = "aligned", ["flalign*"] = "aligned",
  alignat = "aligned", ["alignat*"] = "aligned", aligned = "aligned", alignedat = "aligned",
  split = "aligned",
}

--- Environments whose contents are copied untouched, `$` and all.
local verbatim_environments = {
  verbatim = true, ["verbatim*"] = true, Verbatim = true, lstlisting = true, minted = true, comment = true,
}

M.marker = "@"

--- The packages the generated LaTeX relies on: `\text`, `pmatrix`, `cases`; `\mathbb` and friends.
local required_packages = { "amsmath", "amssymb" }

local function end_of_line(document, from)
  return document:find("\n", from, true) or #document + 1
end

--- Finds `closer`, skipping `\`-escapes and `%` comments on the way. Returns
--- the end of the document if it never appears; LaTeX will report that.
local function find_closer(document, from, closer)
  local i = from
  while i <= #document do
    if text.starts_with(document, closer, i) then return i end
    local c = document:sub(i, i)
    if c == "\\" then
      i = i + 2
    elseif c == "%" then
      i = end_of_line(document, i)
    else
      i = i + 1
    end
  end
  return #document + 1
end

--- The `}` that closes the `{` at `open`, or the end of the document.
local function matching_brace(document, open)
  local depth = 0
  local i = open
  while i <= #document do
    local c = document:sub(i, i)
    if c == "\\" then
      i = i + 1
    elseif c == "%" then
      i = end_of_line(document, i) - 1
    elseif c == "{" then
      depth = depth + 1
    elseif c == "}" then
      depth = depth - 1
      if depth == 0 then return i end
    end
    i = i + 1
  end
  return #document + 1
end

--- Skips an optional `[…]` argument, if there is one.
local function skip_optional(document, from)
  local i = text.skip_space(document, from, #document + 1)
  if document:sub(i, i) ~= "[" then return from end
  local close = document:find("]", i, true)
  return close and close + 1 or #document + 1
end

--- Skips a `{…}` argument, if there is one.
local function skip_argument(document, from)
  local i = text.skip_space(document, from, #document + 1)
  if document:sub(i, i) ~= "{" then return from end
  return math.min(#document + 1, matching_brace(document, i) + 1)
end

--- Finds every math region, plain or RPN, in document order. Each region is
--- { content_start, content_stop, layout, name }, where `name` is a short
--- description for error messages, e.g. "$…$".
local function find_regions(document, on_document_class)
  local regions = {}
  local i = 1

  --- Adds a region whose closing delimiter is `closer`, and moves past it.
  local function close_with(content_start, closer, layout, name)
    local close = find_closer(document, content_start, closer)
    regions[#regions + 1] = { content_start = content_start, content_stop = close, layout = layout, name = name }
    i = math.min(#document + 1, close + #closer)
  end

  while i <= #document do
    local c = document:sub(i, i)
    if c == "%" then
      i = end_of_line(document, i)
    elseif c == "$" then
      if document:sub(i + 1, i + 1) == "$" then
        close_with(i + 2, "$$", "single", "$$…$$")
      else
        close_with(i + 1, "$", "single", "$…$")
      end
    elseif c ~= "\\" then
      i = i + 1
    else
      -- A control sequence: a backslash and a run of letters, or a backslash
      -- and one other character (`\$`, `\%`, `\\`, `\(`, …).
      local next = document:sub(i + 1, i + 1)
      local word = document:match("^[A-Za-z]+", i + 1)
      if next == "(" then
        close_with(i + 2, "\\)", "single", "\\(…\\)")
      elseif next == "[" then
        close_with(i + 2, "\\]", "single", "\\[…\\]")
      elseif word == nil then
        i = i + 2 -- `\$`, `\%` and the like are never math or comments
      else
        local after_word = i + 1 + #word
        i = after_word

        if word == "verb" then
          -- \verb|…| or \verb*|…|: everything up to the next copy of the delimiter.
          local d = after_word
          if document:sub(d, d) == "*" then d = d + 1 end
          local delimiter = document:match("^[%z\1-\127\194-\244][\128-\191]*", d)
          local close = delimiter and document:find(delimiter, d + #delimiter, true)
          i = close and close + #delimiter or #document + 1
        elseif word == "documentclass" then
          i = skip_argument(document, skip_optional(document, after_word))
          on_document_class(i)
        elseif word == "ensuremath" then
          local open = text.skip_space(document, after_word, #document + 1)
          if document:sub(open, open) == "{" then
            local close = matching_brace(document, open)
            regions[#regions + 1] = { content_start = open + 1, content_stop = close, layout = "single", name = "\\ensuremath{…}" }
            i = math.min(#document + 1, close + 1)
          end
        elseif word == "begin" then
          local open = text.skip_space(document, after_word, #document + 1)
          local name = document:match("^{([^{}]*)}", open)
          if name then
            local content_start = open + #name + 2
            local closer = "\\end{" .. name .. "}"
            local layout = math_environments[name]
            if verbatim_environments[name] then
              local close = document:find(closer, content_start, true)
              i = close and close + #closer or #document + 1
            elseif layout then
              -- Skip the environment's own arguments: aligned[t], alignat{2}.
              content_start = skip_optional(document, content_start)
              if text.starts_with(name, "alignat") or name == "alignedat" then
                content_start = skip_argument(document, content_start)
              end
              close_with(content_start, closer, layout, name)
            end
          end
        end
      end
    end
  end
  return regions
end

--- Replaces each `%` comment with `replace(comment)`. `\%` is an escaped
--- percent sign, not a comment. (A backslash before a line break escapes
--- nothing, as in the TypeScript tool's regular expression.)
local function replace_comments(s, replace)
  local out, i = {}, 1
  while i <= #s do
    local c = s:sub(i, i)
    local next = s:sub(i + 1, i + 1)
    if c == "\\" and next ~= "" and next ~= "\n" and next ~= "\r"
      and s:sub(i + 1, i + 3) ~= "\226\128\168" and s:sub(i + 1, i + 3) ~= "\226\128\169" then
      out[#out + 1] = s:sub(i, i + 1)
      i = i + 2
    elseif c == "%" then
      local stop = s:find("\n", i, true) or #s + 1
      out[#out + 1] = replace(s:sub(i, stop - 1))
      i = stop
    else
      out[#out + 1] = c
      i = i + 1
    end
  end
  return table.concat(out)
end

--- Replaces each comment with spaces, so the RPN lexer never sees it but
--- every position stays the same.
local function blank_comments(s)
  return replace_comments(s, function(comment) return (" "):rep(#comment) end)
end

local function strip_comments(s)
  return replace_comments(s, function() return "" end)
end

--- Whether the document already loads a package (mathtools counts as loading
--- amsmath). Loading it again ourselves, before the author's own options,
--- would cause an "option clash" error.
local function loads_package(document, pkg)
  local names = pkg == "amsmath" and { amsmath = true, mathtools = true } or { [pkg] = true }
  local s = strip_comments(document)
  local i = 1
  while true do
    local at = s:find("\\", i, true)
    if not at then return false end
    i = at + 1
    local command = (text.starts_with(s, "usepackage", at + 1) and "usepackage")
      or (text.starts_with(s, "RequirePackage", at + 1) and "RequirePackage")
    if command then
      local p = text.skip_space(s, at + 1 + #command, #s + 1)
      local options = s:match("^%[[^%]]*%]", p)
      if options then p = text.skip_space(s, p + #options, #s + 1) end
      local list = s:match("^{([^}]*)}", p)
      if list then
        for name in (list .. ","):gmatch("([^,]*),") do
          if names[text.trim(name)] then return true end
        end
      end
    end
  end
end

--- Converts a whole document. Returns { output, errors, warnings }; the
--- output isn't meaningful when there are errors. Diagnostic positions are
--- into the original document.
---
--- Options, for the LuaLaTeX package (the defaults match the TypeScript tool):
--- - keep_lines: each line break inside a replaced RPN block becomes `%` and
---   a line break, so every line keeps its number.
--- - packages = false: don't add `\usepackage{amsmath,amssymb}`.
function M.convert(document, options)
  options = options or {}
  local errors, warnings, pieces = {}, {}, {}
  local copied_to = 1 -- everything before this position is in `pieces`
  local packages_at -- just after \documentclass{…}

  local regions = find_regions(document, function(at) packages_at = packages_at or at end)

  for _, region in ipairs(regions) do
    local first = text.skip_space(document, region.content_start, region.content_stop)
    if document:sub(first, first) == M.marker then
      local rpn_start = first + 1
      local rpn = blank_comments(document:sub(rpn_start, region.content_stop - 1))
      local function shift(d)
        return { start = d.start + rpn_start - 1, stop = d.stop + rpn_start - 1, message = d.message }
      end

      local result = parser.parse(rpn)
      for _, e in ipairs(result.errors) do errors[#errors + 1] = shift(e) end
      for _, w in ipairs(result.warnings) do warnings[#warnings + 1] = shift(w) end
      local second = result.equations[2]

      if #result.errors > 0 then
        -- reported above
      elseif second and (region.layout == "single" or region.layout == "multline") then
        errors[#errors + 1] = shift({
          start = second.start,
          stop = second.stop,
          message = region.name .. " holds one equation; use an environment like align or gather for several",
        })
      else
        local ok, result_or_error = emitter.catch(function()
          local out = {}
          for k, equation in ipairs(result.equations) do out[k] = emitter.emit_equation(equation, region.layout) end
          return table.concat(out, " \\\\ ")
        end)
        if not ok then
          errors[#errors + 1] = shift(result_or_error)
        else
          local padding = ""
          if options.keep_lines then
            local _, breaks = document:sub(first, region.content_stop - 1):gsub("\n", "")
            padding = ("%\n"):rep(breaks)
          end
          pieces[#pieces + 1] = document:sub(copied_to, first - 1)
          pieces[#pieces + 1] = " " .. result_or_error .. " " .. padding
          copied_to = region.content_stop
        end
      end
    end
  end
  pieces[#pieces + 1] = document:sub(copied_to)

  local output = table.concat(pieces)
  if packages_at and options.packages ~= false then
    -- The position is in the original document, and nothing before
    -- \documentclass is ever rewritten, so it's still valid here.
    local missing = {}
    for _, pkg in ipairs(required_packages) do
      if not loads_package(document, pkg) then missing[#missing + 1] = pkg end
    end
    if #missing > 0 then
      output = output:sub(1, packages_at - 1) .. "\\usepackage{" .. table.concat(missing, ",") .. "}" .. output:sub(packages_at)
    end
  end
  return { output = output, errors = errors, warnings = warnings }
end

M.locate = text.locate

return M
