-- Small text helpers shared by the Lua modules. Lua strings are bytes, and
-- the TypeScript tool works on JavaScript strings, so these keep the two in
-- step where that matters: what counts as whitespace, and how columns are
-- counted in error messages.

local M = {}

-- JavaScript's `\s`: ASCII whitespace plus the Unicode spaces, here as their
-- UTF-8 bytes. A no-break space (Option-Space on a Mac) ends a token in both
-- implementations.
local ascii_spaces = { [" "] = true, ["\t"] = true, ["\n"] = true, ["\v"] = true, ["\f"] = true, ["\r"] = true }
local unicode_spaces = {
  ["\194\160"] = true, -- U+00A0 no-break space
  ["\225\154\128"] = true, -- U+1680
  ["\226\128\168"] = true, ["\226\128\169"] = true, -- U+2028, U+2029
  ["\226\128\175"] = true, ["\226\129\159"] = true, -- U+202F, U+205F
  ["\227\128\128"] = true, ["\239\187\191"] = true, -- U+3000, U+FEFF
}
for c = 0x80, 0x8A do unicode_spaces["\226\128" .. string.char(c)] = true end -- U+2000 to U+200A

--- The length in bytes of the whitespace character at `i`, or 0 if there isn't one.
function M.space_length(s, i)
  local c = s:sub(i, i)
  if ascii_spaces[c] then return 1 end
  if unicode_spaces[s:sub(i, i + 1)] then return 2 end
  if unicode_spaces[s:sub(i, i + 2)] then return 3 end
  return 0
end

--- Position of the first non-space character at or after `from`, but not past `to`.
function M.skip_space(s, from, to)
  local i = from
  while i < to do
    local n = M.space_length(s, i)
    if n == 0 then break end
    i = i + n
  end
  return i
end

function M.starts_with(s, prefix, at)
  return s:sub(at or 1, (at or 1) + #prefix - 1) == prefix
end

function M.trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

function M.trim_end(s)
  return (s:gsub("%s+$", ""))
end

--- How many JavaScript characters (UTF-16 units) the bytes from `from` to `to` hold.
function M.width(s, from, to)
  local n = 0
  for i = from, to do
    local b = s:byte(i)
    if b < 0x80 or b >= 0xC0 then n = n + (b >= 0xF0 and 2 or 1) end
  end
  return n
end

--- The 1-based line and column of position `at`, for error messages.
function M.locate(document, at)
  local line, line_start = 1, 1
  local i = document:find("\n", 1, true)
  while i and i < at do
    line, line_start = line + 1, i + 1
    i = document:find("\n", i + 1, true)
  end
  return line, M.width(document, line_start, at - 1) + 1
end

--- A shallow copy of a table, with `changes` applied.
function M.with(t, changes)
  local copy = {}
  for k, v in pairs(t) do copy[k] = v end
  for k, v in pairs(changes or {}) do copy[k] = v end
  return copy
end

return M
