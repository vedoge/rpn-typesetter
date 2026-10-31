# Shared test cases

Every implementation (the TypeScript tool in `src/` and the LuaLaTeX package in `lualatex/`) must pass every case in this folder. A case that passes in one and fails in the other is a bug in one of them.

The cases describe what an author can observe: the LaTeX an RPN block becomes, the document a `.rtex` file becomes, and the exact error and warning messages. How an implementation gets there (its tokens, its trees) is its own business, so those tests stay with each implementation.

## Format

The files are plain text, so LaTeX needs no escaping.

```
# A comment.

## the quadratic formula
rpn: b neg b 2 ^ 4ac - sqrt + 2a /
latex: \frac{-b + \sqrt{b^{2} - 4 a c}}{2 a}

## a multi-line value
document:
  first line
  second line
output:
  first line
  second line
```

- `## name` starts a case. Names are unique within a file.
- `key: value` gives a one-line value: everything after `: `, with trailing spaces removed.
- `key:` on its own line takes the following lines that start with two spaces, with those two spaces removed, joined with newlines. The value ends at the first line that doesn't start with two spaces.
- A key can repeat. Repeats are kept in order.
- Blank lines and lines starting with `#` (outside a multi-line value) are ignored.

## `blocks.cases`: one RPN block

| Key | Meaning |
|---|---|
| `rpn` | The block's text, as written after the `@` marker. |
| `layout` | `single` (default), `multline`, `lines` (gather) or `aligned` (align). |
| `latex` | One equation of the output. Repeat for several equations, in order. |
| `error` | An expected error message. With errors, there is no `latex`. |
| `warning` | An expected warning message. |

The errors, warnings and equations must match exactly, with none missing and none extra.

## `documents.cases`: a whole document

| Key | Meaning |
|---|---|
| `document` | The `.rtex` source. |
| `output` | The converted document, without the guard line the command-line tool adds. |
| `error` | `line:column: message`, for an expected error. With errors, `output` isn't checked. |
| `warning` | `line:column: message`, for an expected warning. |
