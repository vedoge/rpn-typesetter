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

--- The length in bytes of the whitespace character ending at `j`, or 0.
local function space_before(s, j)
  if j < 1 then return 0 end
  if ascii_spaces[s:sub(j, j)] then return 1 end
  if j >= 2 and unicode_spaces[s:sub(j - 1, j)] then return 2 end
  if j >= 3 and unicode_spaces[s:sub(j - 2, j)] then return 3 end
  return 0
end

--- Removes whitespace from the end, as JavaScript's trimEnd() does.
function M.trim_end(s)
  local j = #s
  while true do
    local n = space_before(s, j)
    if n == 0 then break end
    j = j - n
  end
  return s:sub(1, j)
end

--- Removes whitespace from both ends, as JavaScript's trim() does.
function M.trim(s)
  return M.trim_end(s:sub(M.skip_space(s, 1, #s + 1)))
end

--- How many JavaScript characters (UTF-16 units) the bytes from `from` to
--- `to` hold. A character outside the BMP is 2; a byte that isn't part of
--- valid UTF-8 is 1, as Node reads it (as U+FFFD).
function M.width(s, from, to)
  local n, i = 0, from
  while i <= to do
    local b = s:byte(i)
    local length = b >= 0xC2 and b <= 0xDF and 2 or b >= 0xE0 and b <= 0xEF and 3 or b >= 0xF0 and b <= 0xF4 and 4 or 1
    if length > 1 and not s:sub(i + 1, i + length - 1):match("^[\128-\191]+$") then length = 1 end
    if length > 1 and i + length - 1 > to then length = 1 end
    n = n + (length == 4 and 2 or 1)
    i = i + length
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
