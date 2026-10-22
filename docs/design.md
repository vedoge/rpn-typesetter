# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Implementation:** TypeScript. The output is LaTeX, rendered by KaTeX.
- **Postfix input:** math is written in RPN, so the author never types grouping parentheses. The typesetter adds any visual parentheses the output needs, based on operator precedence.
- **Operator spelling:** operators are symbols, using standard math symbols where they exist (`+`, `^`, …) even if they need Shift. `a b + 2 ^` reads more naturally than a word like `pl`. Words are only for named functions such as `sqrt` and `exp`. Avoid `\`; it's too far from the home row.
- **Strict RPN for exponents:** `a b + 2 ^`, not `^2` as one token.
- **No glued minus:** `-b` is not a token. `-` always means binary subtraction.
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
| Glued tokens | `x1` (subscript), `2x`/`4ac` (coefficient, already used in practice), `f'` (prime) | Cuts the token count, but the lexer gets more rules. A glued product is safe because the lexer joins it before the stack sees it. |

## Open questions

1. **Which symbols count as "standard notation"?** `+ - * / ^ =` clearly do. What about `_`, `<`, `<=`, `!=`, `!`, `->`?
2. **Negation.** `-` is binary and `-b` isn't a token, so how is −b written? In RPN one symbol can't take both one and two values, because nothing in the input says which you meant.
3. **What counts as a "named function"?** `sqrt` and `exp` do. What about `sum`, `int`, `lim`, `mat`, `cases`, and decorations like bold or hat?
4. **Reserved words vs identifiers.** How is `exp` (a function) told apart from a product of variables `e x p`?
5. **Inserting parentheses.** Which node types are atoms (never wrapped)? When does a function argument get parentheses (`sin x` vs `sin(x+y)`)?
6. **Escape hatch without `\`.** How do you reach a LaTeX command that isn't in the vocabulary, or write upright text?
7. **Embedding in Markdown.** Does `$…$` switch to RPN completely, or do RPN and plain LaTeX live side by side? How do multi-line derivations line up?
8. **Errors and warnings.** What does a stack underflow, an unknown word, or the leftover-items warning look like, both in the rendered page and on the command line?
9. **Greek letters and capitals.** Full names (`alpha`) or short forms?
