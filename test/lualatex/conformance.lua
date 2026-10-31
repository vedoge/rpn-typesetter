-- Runs the shared test cases (test/cases/*.cases) against the Lua
-- implementation in lualatex/, the same files test/conformance.test.ts runs
-- against the TypeScript one. The format is described in
-- test/cases/README.md.
--
--   texlua test/lualatex/conformance.lua      (or lua5.3, lua5.4)
--
-- Prints each failing case and exits 1 if any fail.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
package.path = root .. "/lualatex/?.lua;" .. package.path

local emitter = require("rpn-typesetter-emitter")
local scanner = require("rpn-typesetter-scanner")

local function read_file(path)
  local file = assert(io.open(path, "rb"))
  local contents = file:read("a")
  file:close()
  return contents
end

--- Reads a case file into a list of { name, values }, where values maps each
--- key to the list of its values, in order.
local function read_cases(path)
  local lines = {}
  for line in (read_file(path) .. "\n"):gmatch("(.-)\n") do lines[#lines + 1] = line end
  if lines[#lines] == "" then lines[#lines] = nil end
  local cases, seen = {}, {}

  local function add(key, value, at)
    local current = cases[#cases]
    if not current then error(("%s:%d: `%s` comes before any `## name`"):format(path, at, key)) end
    current.values[key] = current.values[key] or {}
    table.insert(current.values[key], value)
  end

  local i = 1
  while i <= #lines do
    local line = lines[i]
    if line:sub(1, 3) == "## " then
      local name = line:sub(4):match("^%s*(.-)%s*$")
      if seen[name] then error(("%s:%d: duplicate case name `%s`"):format(path, i, name)) end
      seen[name] = true
      cases[#cases + 1] = { name = name, values = {} }
    elseif line:match("^%s*$") or line:sub(1, 1) == "#" then
      -- blank or a comment
    elseif line:match("^[a-z]+:$") then
      -- A multi-line value: the following lines indented by two spaces.
      local body = {}
      while lines[i + 1] and lines[i + 1]:sub(1, 2) == "  " do
        i = i + 1
        body[#body + 1] = lines[i]:sub(3)
      end
      add(line:sub(1, -2), table.concat(body, "\n"), i)
    else
      local key, value = line:match("^([a-z]+): (.*)$")
      if not key then error(("%s:%d: expected `key: value`, `## name` or `# comment`"):format(path, i)) end
      add(key, (value:gsub("%s+$", "")), i)
    end
    i = i + 1
  end
  return cases
end

local function all(c, key) return c.values[key] or {} end

local function single(c, key)
  local values = all(c, key)
  if #values > 1 then error(("case `%s`: `%s` must appear at most once"):format(c.name, key)) end
  return values[1]
end

local function show(list)
  local out = {}
  for k, v in ipairs(list) do out[k] = ("  %q"):format(v) end
  return #out == 0 and "  (none)" or table.concat(out, "\n")
end

local failures, total = 0, 0

--- Compares two lists of strings; on a mismatch, reports it and returns false.
local function expect(name, what, actual, expected)
  local same = #actual == #expected
  for k = 1, #expected do same = same and actual[k] == expected[k] end
  if not same then
    print(("FAIL %s: %s\n expected:\n%s\n actual:\n%s"):format(name, what, show(expected), show(actual)))
  end
  return same
end

local function run(file, check)
  for _, c in ipairs(read_cases(root .. "/test/cases/" .. file)) do
    total = total + 1
    local ok, passed = pcall(check, c)
    if not ok then print(("FAIL %s: %s: %s"):format(file, c.name, tostring(passed))) end
    if not (ok and passed) then failures = failures + 1 end
  end
end

local layouts = { single = true, multline = true, lines = true, aligned = true }

run("blocks.cases", function(c)
  local rpn = single(c, "rpn")
  local layout = single(c, "layout") or "single"
  if rpn == nil then error("a block case needs `rpn`") end
  if not layouts[layout] then error(("unknown layout `%s`"):format(layout)) end

  local result = emitter.to_latex(rpn, layout)
  local function messages(list)
    local out = {}
    for k, d in ipairs(list) do out[k] = d.message end
    return out
  end
  local name = "blocks.cases: " .. c.name
  return expect(name, "errors", messages(result.errors), all(c, "error"))
    and expect(name, "warnings", messages(result.warnings), all(c, "warning"))
    and expect(name, "latex", result.equations, all(c, "latex"))
end)

run("documents.cases", function(c)
  local document = single(c, "document")
  if document == nil then error("a document case needs `document`") end

  local result = scanner.convert(document)
  local function at(list)
    local out = {}
    for k, d in ipairs(list) do
      local line, column = scanner.locate(document, d.start)
      out[k] = ("%d:%d: %s"):format(line, column, d.message)
    end
    return out
  end
  local name = "documents.cases: " .. c.name
  return expect(name, "errors", at(result.errors), all(c, "error"))
    and expect(name, "warnings", at(result.warnings), all(c, "warning"))
    and (#result.errors > 0 or expect(name, "output", { result.output }, { single(c, "output") }))
end)

print(("%d of %d shared cases passed"):format(total - failures, total))
os.exit(failures == 0 and 0 or 1)
