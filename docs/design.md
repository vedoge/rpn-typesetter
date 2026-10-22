# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Implementation:** TypeScript. The output is LaTeX, rendered by KaTeX.
- **Postfix input:** math is written in RPN, so the author never types grouping parentheses. The typesetter adds any visual parentheses the output needs, based on operator precedence.
- **Operator spelling:** standard mathematical symbols for standard operations (`+`, `^`, …), even where they need Shift. `a b + ^2` reads more naturally than a word like `pl`. Everything else is a short word or a symbol that needs no Shift (`- = / , ; . [ ] '`). Avoid `\`; it's too far from the home row.
- **Tokens are separated by whitespace:** `4ac -`, not `4ac-`.
- **Leftover stack items:** anything left on the stack at the end is juxtaposed (`2 x sq` → 2x²), and the tool **emits a warning**. Strictly this isn't valid RPN, but it's the convenient default.
- **Variable-length arguments:** operators that take a variable number of arguments (matrices, piecewise, column vectors, …) use a **stack mark**. The operator takes everything above the mark.

## Proposed (not yet accepted)

| Idea | Suggestion | Trade-off to weigh |
|---|---|---|
| Mark spelling | `[` (one key, nothing to close; the operator itself ends the group) | `mark` is clearer to read but four keystrokes. |
| Where marks apply | Only operators that are *always* variadic | If marks were optional, `sum` inside a matrix row would see the matrix's mark and take the whole row. |
| Rows inside a mark | `;` separates rows: `[ a b ; c d mat` | The same row shape works for `cases`. |
| Bound variants | Digit suffix: `sum` = `sum2` (lower+upper), `sum1`, `sum0`; `int`/`int0` | Cheaper than a mark for the common case, but a digit suffix means something different here than on an identifier (`x1` → x₁). |
| Glued tokens | `-b` (negated operand), `x1` (subscript), `2x`/`4ac` (coefficient), `f'` (prime) | Cuts the token count, but the lexer gets more rules. |
| Draft words for non-arithmetic operators | `sq` ², `rt` √, `of` f(x), `neg`, `to`, `ge`/`le`/`ne`, `oo` ∞, `nab` ∇, `abs`, `bf`, `mat`, `cases`, `lim`, `sum`, `int`, `dd`/`pd` derivatives | Every reserved word stops being usable as a glued multi-letter identifier. Some may now be replaced by standard symbols. |

## Open questions

1. **Which symbols count as "standard notation"?** `+ - * / ^ =` clearly do. What about `_`, `<`, `<=`, `!=`, `!`, `->`?
2. **`^2` as one token.** `a b + ^2` writes the exponent inside the operator token. Strict RPN would be `a b + 2 ^`. Allow both? Only for numbers?
3. **Reserved words vs identifiers.** How is `sq` (an operator) told apart from a product of variables `s q`?
4. **Inserting parentheses.** Which node types are atoms (never wrapped)? When does a function argument get parentheses (`sin x` vs `sin(x+y)`)?
5. **Escape hatch without `\`.** How do you reach a LaTeX command that isn't in the vocabulary, or write upright text?
6. **Embedding in Markdown.** Does `$…$` switch to RPN completely, or do RPN and plain LaTeX live side by side? How do multi-line derivations line up?
7. **Errors and warnings.** What does a stack underflow, an unknown word, or the leftover-items warning look like, both in the rendered page and on the command line?
8. **Greek letters and capitals.** Full names (`alpha`) or short forms?
