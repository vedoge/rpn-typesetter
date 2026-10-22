# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Implementation:** TypeScript. The output is LaTeX, rendered by KaTeX.
- **Postfix input:** math is written in RPN, so the author never types grouping parentheses. The typesetter adds any visual parentheses the output needs, based on operator precedence.
- **Keyboard cost:** operators are short typed words or symbols that need no Shift: `- = / , ; . [ ] '`. Shifted characters are avoided wherever possible, and so is `\` (it's too far from the home row).
- **Variable-length arguments:** operators that take a variable number of arguments (matrices, piecewise, column vectors, …) use a **stack mark**. The operator takes everything above the mark.

## Proposed (not yet accepted)

| Idea | Suggestion | Trade-off to weigh |
|---|---|---|
| Mark spelling | `[` (one key, nothing to close; the operator itself ends the group) | `mark` is clearer to read but four keystrokes. |
| Where marks apply | Only operators that are *always* variadic | If marks were optional, `sum` inside a matrix row would see the matrix's mark and take the whole row. |
| Rows inside a mark | `;` separates rows: `[ a b ; c d mat` | The same row shape works for `cases`. |
| Bound variants | Digit suffix: `sum` = `sum2` (lower+upper), `sum1`, `sum0`; `int`/`int0`; `rt3` = cube root | Cheaper than a mark for the common case, but a digit suffix means something different here than on an identifier (`x1` → x₁). |
| Leftover stack | Items left on the stack at the end are juxtaposed (`2 x sq` → 2x²) | Saves typing a product operator, but a forgotten operator becomes a silent juxtaposition instead of an error. |
| Glued tokens | `-b` (negated operand), `x1` (subscript), `2x`/`4ac` (coefficient), `f'` (prime) | Cuts the token count, but the lexer gets more rules. |
| Draft words | `pl` +, `pm` ±, `.` juxtapose, `..` ⋅, `xx` ×, `/` fraction, `hi` superscript, `lo` subscript, `sq` ², `rt` √, `of` f(x), `neg`, `to`, `ge`/`le`/`lt`/`gt`/`ne`, `oo` ∞, `nab` ∇, `abs`, `bf`, `mat`, `cases`, `lim`, `sum`, `int`, `dd`/`pd` derivatives | Every reserved word stops being usable as a glued multi-letter identifier (`pl` can't mean p·l). |

### Draft vocabulary in practice

Characters / shifted keys, compared with the LaTeX for the same output:

| Expression | RPN (draft) | RPN | LaTeX |
|---|---|---|---|
| Quadratic formula | `x -b b sq 4ac- rt pm 2a/ =` | 26 / 0 | 38 / 7 |
| Euler's identity | `e i pi . hi 1 pl 0=` | 19 / 0 | 16 / 4 |
| Basel problem | `n 1= oo 1 n sq / sum pi sq 6/ =` | 31 / 0 | 51 / 16 |
| Gaussian integral | `-oo oo e x sq neg hi x int pi rt =` | 34 / 0 | 51 / 12 |
| Derivative definition | `x f' of h 0 to x h pl f of x f of - h/ lim =` | 44 / 0 | 46 / 14 |
| Faraday's law | `nab E bf xx B bf t pd neg =` | 27 / 2 | 66 / 10 |
| Binomial square | `a b pl sq a sq 2ab pl b sq pl =` | 31 / 0 | 25 / 8 |
| 2×2 matrix | `[ a b ; c d mat` | 15 / 0 | 44 / 6 |
| Piecewise \|x\| | `x abs [ x x 0 ge ; -x x 0 lt cases =` | 36 / 0 | 57 / 9 |

Euler's identity and the binomial square are the weak spots: with `+` spelled as a word, short sums cost about as many characters as LaTeX does.

## Open questions

1. **Tokenizing.** What counts as a token? Must every token be separated by whitespace, or can unshifted symbols end the token before them (`4ac-`)? How are reserved words told apart from multi-letter identifiers?
2. **Inserting parentheses.** Which node types are atoms (never wrapped in parentheses)? When does a function argument get parentheses (`sin x` vs `sin(x+y)`)? How are `-` and `neg` handled on the right-hand side?
3. **Escape hatch without `\`.** How do you reach a LaTeX command that isn't in the vocabulary, or write upright text, without typing a backslash?
4. **Embedding in Markdown.** Does `$…$` switch to RPN completely, or do RPN and plain LaTeX live side by side? How do multi-line derivations line up (e.g. a line that starts with `=` continuing the previous one)?
5. **Errors.** What does a stack underflow or an unknown word look like, both in the rendered page and on the command line?
6. **Greek letters and capitals.** Full names (`alpha`) or short forms? Capitals cost a Shift press. Is that acceptable?
