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
-- The LuaLaTeX package's link to TeX. The other rpn-typesetter-*.lua files
-- are the same pipeline as the TypeScript tool; this one decides which files
-- to convert and feeds the result to TeX as it reads.
--
-- TeX reads its input a line at a time. LuaTeX lets Lua code see each line
-- before TeX does, through a *callback*: a function TeX calls at a fixed
-- moment. The one used here, `process_input_buffer`, can return a different
-- line for TeX to read instead.
--
-- So when the package loads, it registers that callback. The first time TeX
-- reads a line of one of the author's files (the document, or a file it
-- \input's), the callback reads that whole file from disk and converts it
-- exactly as the command-line tool would. From then on it hands TeX the
-- converted version of each line that changed. A block spread over several
-- lines becomes one line of LaTeX followed by lines holding only `%`, so
-- every line keeps its number and TeX's own error messages still point at
-- the right line.
--
-- An invalid block becomes \RPNTypesetterInvalid{n}. When TeX reaches it,
-- the package prints the block's errors, raises a LaTeX error (TeX stops
-- and waits, like for any other error), and typesets ?? in its place.

local scanner = require("rpn-typesetter-scanner")
local text = require("rpn-typesetter-text")

local M = {}

--- File name (as status.filename names it) → { replaced, original }, the
--- converted and written versions of each line that changed; or false for
--- a file that isn't converted.
local documents = {}
--- The invalid blocks, numbered: { file, document, errors }.
local invalid_blocks = {}

--- Folders of the TeX installation, each ending in "/". Files under them
--- (packages, classes, the TeX distribution's own .tex files) aren't converted.
local tree_roots
local function in_tex_tree(file)
  if not tree_roots then
    tree_roots = {}
    local separator = os.type == "windows" and ";" or ":"
    for dir in kpse.expand_braces("$TEXMF"):gmatch("[^" .. separator .. "]+") do
      dir = dir:gsub("^!!", ""):gsub("\\", "/"):gsub("/+$", "")
      if dir ~= "" then tree_roots[#tree_roots + 1] = dir .. "/" end
    end
  end
  local path = file:gsub("\\", "/")
  for _, root in ipairs(tree_roots) do
    if path:sub(1, #root) == root then return true end
  end
  return false
end

--- Whether a file is one of the author's: a .tex file outside the TeX installation.
local function is_authors(file)
  return file:lower():match("%.tex$") ~= nil and not in_tex_tree(file)
end

local function lines_of(s)
  local lines = {}
  for line in (s .. "\n"):gmatch("(.-)\n") do lines[#lines + 1] = line end
  return lines
end

local function report(file, document, severity, d)
  local line, column = scanner.locate(document, d.start)
  texio.write_nl("term and log", ("%s:%d:%d: %s: %s"):format(file, line, column, severity, d.message))
end

--- Reads and converts `file`. Returns its entry for `documents`.
local function adopt(file)
  local handle = io.open(file, "rb")
  if not handle then return false end
  local document = handle:read("a"):gsub("\r\n?", "\n")
  handle:close()

  local shown = file:gsub("^%./", "")
  local result = scanner.convert(document, {
    keep_lines = true,
    packages = false,
    invalid = function(errors)
      invalid_blocks[#invalid_blocks + 1] = { file = shown, document = document, errors = errors }
      return ("\\RPNTypesetterInvalid{%d}"):format(#invalid_blocks)
    end,
  })
  for _, w in ipairs(result.warnings) do report(shown, document, "warning", w) end

  local entry = { replaced = {}, original = {} }
  local before, after = lines_of(document), lines_of(result.output)
  assert(#before == #after, "rpn-typesetter: converting changed the number of lines")
  for n = 1, #before do
    if before[n] ~= after[n] then entry.replaced[n], entry.original[n] = after[n], before[n] end
  end
  return entry
end

--- The process_input_buffer callback: returns the line TeX should read
--- instead of `line`, or nil to leave it alone.
local function on_line(line)
  local file = status.filename
  if file == nil then return nil end
  local entry = documents[file]
  if entry == nil then
    entry = is_authors(file) and adopt(file)
    documents[file] = entry
  end
  if not entry then return nil end
  local n = tex.inputlineno
  -- Only replace the line that was converted: the same file can be read
  -- again some other way, and TeX drops spaces at the end of a line.
  local new = entry.replaced[n]
  if new and text.trim_end(line) == text.trim_end(entry.original[n]) then return new end
  return nil
end

--- Called when the package loads.
function M.start()
  luatexbase.add_to_callback("process_input_buffer", on_line, "rpn-typesetter")
end

--- Called at \begin{document}. If the document's own file wasn't converted
--- (it isn't named .tex), it is converted from here on.
function M.begin_document()
  local file = status.filename
  if file ~= nil and not documents[file] then documents[file] = adopt(file) end
end

--- Called by \RPNTypesetterInvalid{n} when TeX reaches invalid block `n`:
--- prints its errors and raises a LaTeX error, once, though environments
--- like align read their contents twice. Messages go in as plain
--- characters, so a `\` or `{` in them is printed, not run.
function M.invalid(n)
  local block = invalid_blocks[n]
  if block.raised then return end
  block.raised = true
  for _, e in ipairs(block.errors) do report(block.file, block.document, "error", e) end
  texio.write_nl("term and log", "")
  local more = #block.errors - 1
  tex.sprint("\\PackageError{rpn-typesetter}{")
  tex.sprint(-2, block.errors[1].message)
  if more > 0 then tex.sprint(-2, (" (and %d more error%s)"):format(more, more == 1 and "" or "s")) end
  tex.sprint("}{This RPN is invalid, so ?? is typeset in its place. Fix it and run LaTeX again.}")
end

return M
