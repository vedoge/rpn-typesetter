# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Target: LaTeX documents.** The tool is a preprocessor. It reads a `.tex` file that contains RPN math and writes plain LaTeX, which the normal LaTeX toolchain then compiles. (This replaces the earlier Markdown + KaTeX target.)
- **Implementation:** an external tool written in TypeScript, run before LaTeX. `latexmk` runs both steps.
- **Not LuaLaTeX:** running inside TeX through Lua was considered and rejected. It would avoid the extra step, but it would mean writing Lua instead of TypeScript, debugging inside a TeX run, and supporting only LuaLaTeX.
- **The RPN marker is `@`:** a block is RPN when `@` comes right after LaTeX's own math delimiter: `$@ a b +$`, `\[@ … \]`. Unmarked math stays plain LaTeX. (`;` was the other candidate; it went to the line separator instead.)
- **`;` is the line separator:** it separates rows inside a mark, e.g. `[ a b ; c d mat`, and the same shape works for `cases`.
- **Line breaks: the tool chooses, the author overrides.** By default the tool breaks long formulas sensibly. The author adds a break by hand only when the default is wrong.
- **Manual breaks use `br`:** it comes right after an operator and means "break before this operator's right operand". `a b + br` → a ⏎ + b, and `a b = c = br` → a = b ⏎ = c. `br` is a reserved word, so a product b·r has to be written `b r *`.
- **Inline math:** the tool adds break hints at top-level operators (`=`, `+`, …) and TeX chooses where to break. The emitter avoids braces that would block a break.
- **Displayed formulas are broken by measuring.** On one LaTeX run, the emitted LaTeX measures the width of each piece where a break could go, and of the available line, and writes the numbers to a file. On the next run, the tool reads that file and chooses the breaks. `latexmk` already reruns until the output settles. (Estimating widths from the tree, and leaving displays unbroken, were the rejected options.)
- **Unmeasured formulas get no breaks.** On the first run, or just after an edit, a display with no measurements yet is emitted unbroken. The next round breaks it.
- **If the loop doesn't settle,** for example a two-column document where a break pushes an equation into a column of a different width, the tool stops after a maximum number of rounds and emits a warning.
- **The author picks the display environment** (`\begin{align}@ …`, `\begin{multline}@ …`, …). The tool never chooses it.
- **Breaks in `align`:** the tool writes the `&`s. A line that starts with a relation gets `&` before it (`&= d`). A line that continues a long step at `+`/`-` gets `&\qquad` before it (`&\qquad + e`).
- **Breaks in `multline`:** the tool only places the `\\`s. `multline` handles the layout.
- **Brackets across a break:** `\left( … \right. \\ \left. … \right)`, with `\vphantom{…}` of the whole bracketed contents on both lines, so both halves come out the same height. (Fixed sizes like `\bigl( … \bigr)` were rejected.)
- **Marker position:** the marker is the first non-space character after the opening math delimiter, so `$@ a b +$` and `$ @ a b +$` are both RPN. Spaces never decide whether a block is RPN.
- **Invalid RPN stops the build.** If any RPN block is invalid (stack underflow, a variadic operator with no mark, …), the tool reports it and exits with an error, so LaTeX never runs. Once the RPN is valid, any LaTeX error in the output is LaTeX's to report. The tool has no source map.
- **Plain math that starts with the marker character:** put an empty group first. With `@` as the marker, `${}@$` is plain LaTeX math that typesets @. TeX ignores `{}`, so it doesn't change the output. Only the start of a block matters: `$x@y$` needs nothing.
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
- **The mark is spelled `[`:** it's one key with nothing to close, because the operator ends the group. `[ a b ; c d mat`.
- **Marks apply only to operators with no fixed arity.** Operators that always take a fixed number of arguments (`+`, `sum`, `ser`, …) ignore marks, so `sum` inside a matrix row takes its two arguments, not the whole row.
- **Marks nest:** a variadic operator takes everything above the *nearest* mark, then removes that mark. In `[ [ a b col c ; d e mat`, `col` uses the second `[` and `mat` uses the first.
- **Argument order: the order a human reads it aloud**, with the operator word last. `a 2 ^` ("a to the 2"), `x i ssc` ("x sub i"), `n 1 = oo 1 n 2 ^ / ser` ("sum from n=1 to ∞ of 1/n²").
- **Greek letters use the LaTeX names without the backslash:** `alpha`, `pi`, `Gamma`. They're reserved words, so glued letters that spell one (`mu`, `pi`, `eta`) mean the Greek letter, not a product.
- **Every letter LaTeX has a command for works the same way:** `ell` → ℓ, `hbar` → ℏ, `aleph` → ℵ, `Re` → ℜ, `wp` → ℘. These are reserved words too, so a product that spells one (`Re`, `wp`) needs spaces and `*`.
- **Subscript is `ssc`:** binary. `x i ssc` → x_i.
- **Sums:** `sum` takes 2 arguments (index, summand) → ∑ₙ aₙ. `ser` takes 3 (lower bound, upper bound, summand) → ∑ₙ₌₁^∞. **Bounds come first:** `n 1 = oo 1 n 2 ^ / ser`. There's no bare ∑ without an index.
- **Definite integrals:** `int` takes 4 arguments: lower bound, upper bound, integrand, variable. `0 pi x sin x int` → ∫₀^π sin x dx. You type the variable (`x`), and `int` writes the d and its spacing.
- **Bracket rule (emitter):** wrap a child in brackets if its operator ranks lower than its parent's (BIDMAS precedence), or if it ranks equal, is the right-hand child, and the parent is not associative. So `a b c - -` → a − (b − c) and `a b c + +` → a + b + c.
- **Layout groups some arguments:** an argument the layout puts in its own box never gets brackets. Fraction numerator and denominator, the `sqrt` radicand, the exponent of `^`, the subscript of `ssc`, and the bounds of `ser`/`int` are all in this group. Arguments that stay on the line next to something (the base of `^`/`ssc`, operands of `+ - *`) follow the bracket rule.

## Proposed (not yet accepted)

| Idea | Suggestion | Trade-off to weigh |
|---|---|---|
| More glued tokens | `x1` (subscript), `f'` (prime) | With glued letters meaning a product, does `x1` mean x₁ or x·1? |

## Wanted, spelling not yet chosen

- Commutators: [A, B] (and anticommutators?)
- Bras ⟨ψ|, kets |ψ⟩, and probably brakets ⟨φ|ψ⟩
- `vec`: how many arguments? A unary decoration (v → v⃗), or something else?
- **Escape hatch:** a way to reach any LaTeX command that isn't in the vocabulary, and to write upright text (see open question 5).

## Open questions

1. **Which other symbols are "standard"?** Letters are settled (every LaTeX letter command, by name). Does the same rule cover non-letter symbols: `infty`, `partial`, `nabla`, and relations and arrows like `leq`, `in`, `to`? Each name added steals a glued product: `in` would mean ∈, not i·n, and `ne` would mean ≠. Does `oo` stay as a short form of `infty`? And what about ASCII spellings: `<`, `<=`, `!=`, `!`, `->`, and `_` alongside `ssc`?
2. **What else is a named word?** `lim`, `mat`, `cases`, bold, hat?
3. **Indefinite and multiple integrals.** What word or words for ∫ f dx and ∬ f dx dy?
4. **Inserting parentheses.** Which node types are atoms (never wrapped)? When does a function argument get parentheses (`sin x` vs `sin(x+y)`)?
5. **Escape hatch spelling.** Options: a token starting with `\` is raw LaTeX pushed as a single value (`\mathcal{F}`), which breaks "avoid `\`" only in rare cases; a way to use an unknown command as an operator by stating its arity; a quoted string for upright text (`"if "` → `\text{if }`), which means the lexer must allow spaces inside quotes. Which of these, and how are they spelled?
6. **Embedding in LaTeX.** Which delimiters and environments accept the marker (`$…$`, `\(…\)`, `\[…\]`, `equation`, `align`, …)? In `align`, does each line need its own marker, and how do `&` and `\\` fit in with RPN? Does `;` also separate the lines of a multi-line display?
7. **Error details.** Does the tool stop at the first invalid block, or report every one in the file before stopping? What format do messages use (e.g. `paper.rtex:12:8: stack underflow at '+'`, which editors can jump to)? Leftover stack items are technically invalid RPN but were decided as a warning; do they stay a warning? A misspelled word (`sqtr`) silently becomes a product s·q·t·r rather than an error; should the tool warn when a product is one typo away from a reserved word? Should the output keep each line on the same line number as the source, so LaTeX's line numbers point at the right place without a source map?
8. **Markdown.** Is Markdown support dropped, or kept as a second front end that shares the same core?
9. **Files and `latexmk`.** What extension does the source file use (e.g. `paper.rtex` → `paper.tex`), and how does `latexmk` call the tool? Does the tool follow `\input`/`\include` into the author's other files? (It never reads packages.)
10. **Measuring across runs.** How does `latexmk` learn that a changed measurements file means the tool must run again? What is the maximum number of rounds? Derivation chains and long single expressions are about equally common, so both need to work.