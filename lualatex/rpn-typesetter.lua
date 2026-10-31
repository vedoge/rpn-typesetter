-- The LuaLaTeX package's link to TeX. The other rpn-typesetter-*.lua files
-- are the same pipeline as the TypeScript tool; this one decides which file
-- to convert and feeds the result to TeX as it reads.
--
-- TeX reads its input a line at a time. LuaTeX lets Lua code see each line
-- before TeX does, through a *callback*: a function TeX calls at a fixed
-- moment. The one used here, `process_input_buffer`, can return a different
-- line for TeX to read instead.
--
-- So when the package loads, it registers that callback. The first time TeX
-- reads a line of the document, the callback reads the whole file from disk,
-- converts it exactly as the command-line tool would, and reports any
-- errors. From then on it hands TeX the converted version of each line that
-- changed. A block spread over several lines becomes one line of LaTeX
-- followed by lines holding only `%`, so every line keeps its number and
-- TeX's own error messages still point at the right line.

local scanner = require("rpn-typesetter-scanner")
local text = require("rpn-typesetter-text")

local M = {}

local main -- the document being converted, named as status.filename names it
local replaced = {} -- line number → the converted line, for lines that changed
local original = {} -- line number → that line as written
local ruled_out = {} -- files already seen that aren't the document

--- The file name without its folder or extension.
local function stem(path)
  local name = path:match("([^/\\]+)$") or path
  return (name:gsub("%.[^.]*$", ""))
end

--- Names the document's file may have, without folder or extension: the job
--- name, and the file named on the command line (they differ under
--- `-jobname`, which Overleaf uses).
local function candidates()
  local names = { [(tex.jobname:gsub('"', ""))] = true }
  for k = #arg, 1, -1 do
    local a = arg[k]
    if a:sub(1, 1) ~= "-" and a:sub(1, 1) ~= "&" and a:sub(1, 1) ~= "\\" then
      names[stem(a:gsub('"', ""))] = true
      break
    end
  end
  return names
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

--- What TeX reads instead of the current line when the document has invalid
--- RPN: an error, then the end of the run, so nothing is typeset.
local abort = "\\PackageError{rpn-typesetter}{Invalid RPN; the errors are listed above}"
  .. "{Fix the RPN blocks listed above, then run LaTeX again.}\\csname @@end\\endcsname"

--- Converts `file`, the document. Returns the LaTeX TeX should read instead
--- of the current line if the document has invalid RPN, and nil otherwise.
local function adopt(file)
  local handle = io.open(file, "rb")
  if not handle then return nil end
  main = file
  local document = handle:read("a"):gsub("\r\n?", "\n")
  handle:close()

  local result = scanner.convert(document, { keep_lines = true, packages = false })
  local shown = file:gsub("^%./", "")
  for _, w in ipairs(result.warnings) do report(shown, document, "warning", w) end
  for _, e in ipairs(result.errors) do report(shown, document, "error", e) end
  if #result.errors > 0 then
    texio.write_nl("term and log", "")
    return abort
  end

  local before, after = lines_of(document), lines_of(result.output)
  assert(#before == #after, "rpn-typesetter: converting changed the number of lines")
  for n = 1, #before do
    if before[n] ~= after[n] then replaced[n], original[n] = after[n], before[n] end
  end
  return nil
end

--- The process_input_buffer callback: returns the line TeX should read
--- instead of `line`, or nil to leave it alone.
local function on_line(line)
  local file = status.filename
  if main == nil then
    if file == nil or ruled_out[file] then return nil end
    ruled_out[file] = true
    if not candidates()[stem(file)] then return nil end
    local failed = adopt(file)
    if failed then return failed end
  end
  if file ~= main then return nil end
  local n = tex.inputlineno
  -- Only replace the line that was converted: the same file can be read
  -- again some other way, and TeX drops spaces at the end of a line.
  if replaced[n] and text.trim_end(line) == text.trim_end(original[n]) then return replaced[n] end
  return nil
end

--- Called when the package loads.
function M.start()
  luatexbase.add_to_callback("process_input_buffer", on_line, "rpn-typesetter")
end

--- Called at \begin{document}. If no file has matched the document's name
--- by then, the file holding \begin{document} is the document.
function M.begin_document()
  if main ~= nil or status.filename == nil then return end
  local failed = adopt(status.filename)
  if failed then tex.print(failed) end
end

return M
