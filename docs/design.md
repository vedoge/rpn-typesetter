# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Implementation:** TypeScript. The output is LaTeX, rendered by KaTeX.
- **Postfix input:** math is written in RPN, so the author never types grouping parentheses. The typesetter adds any visual parentheses the output needs, based on operator precedence.
- **Operator spelling:** arithmetic uses standard math symbols (`+ - * / ^ =`), even where they need Shift. Named operations are short words. That covers functions (`sqrt`, `exp`), notation like `ssc` (subscript) and `vec`, and `sum`. Avoid `\`; it's too far from the home row.
- **Strict RPN for exponents:** `a b + 2 ^`, not `^2` as one token.
- **No glued minus:** `-b` is not a token. `-` always means binary subtraction.
- **Negation is `neg`:** `b neg` → −b. One symbol can't take two different numbers of arguments in RPN, so negation needs its own spelling.
- **Tokens are separated by whitespace:** `4ac -`, not `4ac-`.
- **Glued letters are a product:** `ab` → a·b, `4ac` → 4·a·c. The lexer joins them before the stack sees them, so this is always safe.
- **Reserved words win:** if a run of letters matches a reserved word (`neg`, `exp`, `sum`, …), it's that word, not a product. A product that happens to spell a reserved word has to be written with spaces and `*`.
- **Leftover stack items:** anything left on the stack at the end is juxtaposed (`2 x 2 ^` → 2x²), and the tool **emits a warning**. Strictly this isn't valid RPN, but it's the convenient default. In the middle of an expression, multiplication is never implied, because values sitting next to each other are waiting for an operator. `*` must be written there.
- **Variable-length arguments:** operators that take a variable number of arguments (matrices, piecewise, column vectors, …) use a **stack mark**. The operator takes everything above the mark.
- **Argument order: the order a human reads it aloud**, with the operator word last. `a 2 ^` ("a to the 2"), `x i ssc` ("x sub i"), `n 1 = oo 1 n 2 ^ / ser` ("sum from n=1 to ∞ of 1/n²").
- **Greek letters use the LaTeX names without the backslash:** `alpha`, `pi`, `Gamma`. They're reserved words, so glued letters that spell one (`mu`, `pi`, `eta`) mean the Greek letter, not a product.
- **Subscript is `ssc`:** binary. `x i ssc` → x_i.
- **Sums:** `sum` takes 2 arguments (index, summand) → ∑ₙ aₙ. `ser` takes 3 (lower bound, upper bound, summand) → ∑ₙ₌₁^∞. **Bounds come first:** `n 1 = oo 1 n 2 ^ / ser`. There's no bare ∑ without an index.
- **Definite integrals:** `int` takes 4 arguments: lower bound, upper bound, integrand, variable. `0 pi x sin x int` → ∫₀^π sin x dx. You type the variable (`x`), and `int` writes the d and its spacing.
- **Bracket rule (emitter):** wrap a child in brackets if its operator ranks lower than its parent's (BIDMAS precedence), or if it ranks equal, is the right-hand child, and the parent is not associative. So `a b c - -` → a − (b − c) and `a b c + +` → a + b + c.

## Proposed (not yet accepted)

| Idea | Suggestion | Trade-off to weigh |
|---|---|---|
| Mark spelling | `[` (one key, nothing to close; the operator itself ends the group) | `mark` is clearer to read but four keystrokes. |
| Where marks apply | Only operators that are *always* variadic | If marks were optional, `sum` inside a matrix row would see the matrix's mark and take the whole row. |
| Rows inside a mark | `;` separates rows: `[ a b ; c d mat` | The same row shape works for `cases`. |
| More glued tokens | `x1` (subscript), `f'` (prime) | With glued letters meaning a product, does `x1` mean x₁ or x·1? |

## Wanted, spelling not yet chosen

- Commutators: [A, B] (and anticommutators?)
- Bras ⟨ψ|, kets |ψ⟩, and probably brakets ⟨φ|ψ⟩
- `vec`: how many arguments? A unary decoration (v → v⃗), or something else?

## Open questions

1. **Which other symbols are "standard"?** `<`, `<=`, `!=`, `!`, `->`? Is `_` allowed alongside `ssc`?
2. **What else is a named word?** `lim`, `mat`, `cases`, bold, hat?
3. **Indefinite and multiple integrals.** What word or words for ∫ f dx and ∬ f dx dy?
4. **Inserting parentheses.** Which node types are atoms (never wrapped)? When does a function argument get parentheses (`sin x` vs `sin(x+y)`)?
5. **Escape hatch without `\`.** How do you reach a LaTeX command that isn't in the vocabulary, or write upright text?
6. **Embedding in Markdown.** Does `$…$` switch to RPN completely, or do RPN and plain LaTeX live side by side? How do multi-line derivations line up?
7. **Errors and warnings.** What does a stack underflow, an unknown word, or the leftover-items warning look like, both in the rendered page and on the command line?
