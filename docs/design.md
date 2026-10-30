# Design notes

Working log for the input syntax. **Decided** items are settled. **Proposed** items are suggestions that haven't been accepted yet. **Open questions** still need thinking through.

## Decided

- **Target: LaTeX documents.** The tool is a preprocessor. It reads a `.tex` file that contains RPN math and writes plain LaTeX, which the normal LaTeX toolchain then compiles. (This replaces the earlier Markdown + KaTeX target.)
- **Implementation:** an external tool written in TypeScript, run before LaTeX. `latexmk` runs both steps.
- **Source files are `.rtex`:** the author edits `paper.rtex`, and the tool writes `paper.tex`, which LaTeX compiles.
- **`latexmk` wraps the LaTeX command:** `.latexmkrc` replaces the LaTeX command with one that runs the tool first, so every LaTeX pass starts from freshly generated `.tex`. Only the pdfLaTeX command is wrapped; XeLaTeX and LuaLaTeX can be wrapped the same way if they're ever needed.
- **`latexmk` is given the `.rtex` file:** `latexmk paper.rtex`, with `$pdflatex = 'rpn-typesetter %S && pdflatex %O %R.tex'` in `.latexmkrc`. That sidesteps the first run, when `paper.tex` doesn't exist yet, and `latexmk -pvc` rebuilds whenever `paper.rtex` changes. (`examples/latexmkrc`.)
- **Generated-file guard:** the tool writes a "generated from paper.rtex, do not edit" comment at the top of `paper.tex`, and refuses to overwrite a `paper.tex` that lacks it.
- **Two implementations, kept in step:** the TypeScript tool (for pdfLaTeX, run through `latexmk`) comes first. A LuaLaTeX package that does the same job inside the TeX run follows later. Both must turn the same RPN into the same LaTeX. (LuaLaTeX was first rejected because of the Lua rewrite and losing pdfLaTeX; keeping both answers the second. Its pull is measuring breaks in the same run, with no `.aux` loop.)
- **Shared test cases keep them in step:** what an author can observe (RPN → LaTeX, `.rtex` → `.tex`, and error and warning messages) lives in plain-text case files in `test/cases/`, which every implementation runs. Internals (tokens, trees) are tested per implementation.
- **The RPN marker is `@`:** a block is RPN when `@` comes right after LaTeX's own math delimiter: `$@ a b +$`, `\[@ … \]`. Unmarked math stays plain LaTeX. (`;` was the other candidate; it went to the line separator instead.)
- **The marker works in every kind of math:** inline (`$…$`, `\(…\)`), display (`\[…\]`), every math environment (`equation`, `align`, `gather`, `multline`, …), and `\ensuremath{@ …}`.
- **`;` is the line separator:** inside a mark it separates rows, e.g. `[ a b ; c d mat`, and the same shape works for `cases`. At the top level, with no mark open, it separates equations in one display: each is its own expression, numbered and labelled on its own. A forgotten variadic operator leaves a mark open, which is invalid RPN, so a `;` can't silently change meaning.
- **Line breaks: the tool chooses, the author overrides.** By default the tool breaks long formulas sensibly. The author adds a break by hand only when the default is wrong.
- **Manual breaks use `br`:** it comes right after an operator and means "break before this operator's right operand". `a b + br` → a ⏎ + b, and `a b = c = br` → a = b ⏎ = c. `br` is a reserved word, so a product b·r has to be written `b r *`.
- **Inline math:** the tool adds break hints at top-level operators (`=`, `+`, …) and TeX chooses where to break. The emitter avoids braces that would block a break.
- **Displayed formulas are broken by measuring.** On one LaTeX run, the emitted LaTeX measures the width of each piece where a break could go, and of the available line, and writes the numbers to the `.aux` file. On the next run, the tool reads them from `.aux` and chooses the breaks. `latexmk` already reruns when `.aux` changes, so no extra file or rule is needed. (Estimating widths from the tree, and leaving displays unbroken, were the rejected options.)
- **Measurement IDs:** each measurement is keyed by a hash of the formula's RPN text, plus its occurrence number when the same formula appears more than once. An edit changes the hash, so an edited formula is unmeasured for one run.
- **Unmeasured formulas get no breaks.** On the first run, or just after an edit, a display with no measurements yet is emitted unbroken. The next round breaks it.
- **If the loop doesn't settle,** for example a two-column document where a break pushes an equation into a column of a different width, `latexmk`'s own rerun limit (`$max_repeat`, 5 by default) stops it, and `latexmk` warns. The tool doesn't count rounds.
- **The author picks the display environment** (`\begin{align}@ …`, `\begin{multline}@ …`, …). The tool never chooses it.
- **Breaks in `align`:** the tool writes the `&`s. A line that starts with a relation gets `&` before it (`&= d`). A line that continues a long step at `+`/`-` gets `&\qquad` before it (`&\qquad + e`).
- **Breaks in `multline`:** the tool only places the `\\`s. `multline` handles the layout.
- **Brackets across a break:** `\left( … \right. \\ \left. … \right)`, with `\vphantom{…}` of the whole bracketed contents on both lines, so both halves come out the same height. (Fixed sizes like `\bigl( … \bigr)` were rejected.)
- **Marker position:** the marker is the first non-space character after the opening math delimiter, so `$@ a b +$` and `$ @ a b +$` are both RPN. Spaces never decide whether a block is RPN.
- **Labels go inside the RPN:** `\label{…}` and `\notag`/`\nonumber` are set aside rather than pushed, and attach to the equation they appear in, so each `;`-separated equation can carry its own: `\begin{align}@ \label{eq:one} a b = ; c d = \notag \end{align}`.
- **Invalid RPN stops the build.** If any RPN block is invalid (stack underflow, a variadic operator with no mark, …), the tool reports it and exits with an error, so LaTeX never runs. Once the RPN is valid, any LaTeX error in the output is LaTeX's to report. The tool has no source map.
- **Plain math that starts with the marker character:** put an empty group first. With `@` as the marker, `${}@$` is plain LaTeX math that typesets @. TeX ignores `{}`, so it doesn't change the output. Only the start of a block matters: `$x@y$` needs nothing.
- **Postfix input:** math is written in RPN, so the author never types grouping parentheses. The typesetter adds any visual parentheses the output needs, based on operator precedence.
- **Operator spelling:** arithmetic uses standard math symbols (`+ - * / ^ =`), even where they need Shift. Named operations are short words. That covers functions (`sqrt`, `exp`), notation like `ssc` (subscript) and `vec`, and `sum`. Avoid `\`; it's too far from the home row.
- **`*` prints side by side:** `a b *` → ab, like a glued product. `\times` is kept for the cross product.
- **`\cdot` only when needed:** when a factor would start with a digit, it gets `\cdot` before it: `2 3 *` → 2·3, `a 2 *` → a·2, `x 2 ^ 3 *` → x²·3.
- **Atoms never get brackets:** numbers, single letters, reserved values (Greek letters, `ell`, `reals`, …), raw LaTeX and quoted text.
- **Ranks for the bracket rule,** loosest to tightest: `iff` < `implies` < `or` < `and` < relations < `+ - neg` < functions, sums, integrals, quantifiers < `* /` and glued products < `^ ssc !` < atoms. Functions sit below products because they swallow what follows.
- **Subscripted atoms count as atoms** as a function argument (`x1 sin` → sin x₁) and as the base of `^` (`x i ssc 2 ^` → x_i²).
- **The base of `^` is bracketed unless it's an atom or a subscripted atom:** `a 2 ^ 3 ^` → (a²)³, `x sin 2 ^` → (sin x)².
- **The base of `ssc` never gets brackets:** subscripts are notational (tensor indices, for example). `T mu ^ nu ssc` → T^μ_ν. A base that LaTeX can't take as is goes in an invisible group: `x i ssc j ssc` → `{x_i}_j`, `a b + i ssc` → `{a + b}_i`.
- **The tool loads `amsmath` and `amssymb` itself,** which the output needs for `\text`, `pmatrix`, `cases` and `\mathbb`.
- **Packages load right after `\documentclass{…}`,** on the same line so line numbers don't move. A package the author already loads is skipped (`mathtools` counts as `amsmath`), to avoid an option clash. Files without `\documentclass` get nothing.
- **Separate equations in `align`-like environments** each get `&` before their relation: `a &= b \\ c &= d`. `gather` gets no `&`.
- **Recognised math environments:** `equation`, `displaymath`, `math`, `multline`, `gather`, `gathered`, `eqnarray`, `align`, `flalign`, `alignat`, `aligned`, `alignedat`, `split`, and starred forms. Several equations in a one-equation region (`$…$`, `\[…\]`, `equation`, `multline`) are an error that points to `align` or `gather`.
- **`%` comments inside an RPN block are ignored,** as LaTeX would. `\%` is never a comment: in RPN it's a raw token (a literal %), and inside quoted text it stays `\%`.
- **Errors:** every bad block is reported (one error per block) as `paper.rtex:12:8: error: …`, then the tool exits 1 without writing `paper.tex`.
- **A function or sum used as a factor is bracketed only when something follows it:** `x sin y *` → (sin x)y, but `y x sin *` → y sin x.
- **Function arguments are bracketed unless they're atoms:** `x sin` → sin x, `x y + sin` → sin(x + y).
- **Relations: ASCII where a common spelling exists, names for all:** `<` `>` `<=` `>=` `!=` `<<` `>>` `->`, and the names `leq` `geq` `neq` `ll` `gg` `to` `approx` `equiv` `sim` `propto` `in` `notin` `subset` `subseteq` `supset` `mapsto` `perp`. `<=` is ≤ (`\leq`), not ⇐. All are binary and rank with `=`, so chains work: `0 x < 1 <=` → 0 < x ≤ 1.
- **Logical arrows:** `=>`/`implies` (⇒, `\implies`), `impliedby` (⇐), `<=>`/`iff` (⇔, `\iff`). They bind more loosely than `and` and `or`, and `iff` most loosely of all: `p q and r or s =>` → p ∧ q ∨ r ⇒ s.
- **Logical not is `not`** (¬, `\neg`), taking one value: `p not` → ¬p. `!` is already factorial. It binds like a function or quantifier, tighter than `and`/`or`: `p not q and` → ¬p ∧ q. Its operand is bracketed if it's a relation or looser: ¬(p ∧ q), ¬(a = b), but ¬∃x.
- **Factorial is `!`,** a postfix operator taking one value: `n !` → n!. `!=` is a separate whole token, so the two never clash.
- **Strict RPN for exponents:** `a b + 2 ^`, not `^2` as one token.
- **No glued minus:** `-b` is not a token. `-` always means binary subtraction.
- **Negation is `neg`:** `b neg` → −b. One symbol can't take two different numbers of arguments in RPN, so negation needs its own spelling.
- **Tokens are separated by whitespace:** `4ac -`, not `4ac-`.
- **Glued digits after letters are a subscript:** `x1` → x₁, `x12` → x₁₂.
- **Glued letters are a product:** `ab` → a·b, `4ac` → 4·a·c. The lexer joins them before the stack sees them, so this is always safe.
- **Reserved words win:** if a run of letters matches a reserved word (`neg`, `exp`, `sum`, …), it's that word, not a product. A product that happens to spell a reserved word has to be written with spaces and `*`.
- **Leftover stack items:** anything left on the stack at the end is juxtaposed (`2 x 2 ^` → 2x²), and the tool **emits a warning**. Strictly this isn't valid RPN, but it's the convenient default. In the middle of an expression, multiplication is never implied, because values sitting next to each other are waiting for an operator. `*` must be written there.
- **Variable-length arguments:** operators that take a variable number of arguments (matrices, piecewise, column vectors, …) use a **stack mark**. The operator takes everything above the mark.
- **The mark is spelled `[`:** it's one key with nothing to close, because the operator ends the group. `[ a b ; c d mat`.
- **Marks apply only to operators with no fixed arity.** Operators that always take a fixed number of arguments (`+`, `sum`, `ser`, …) ignore marks, so `sum` inside a matrix row takes its two arguments, not the whole row.
- **Marks nest:** a variadic operator takes everything above the *nearest* mark, then removes that mark. In `[ [ a b col c ; d e mat`, `col` uses the second `[` and `mat` uses the first.
- **Argument order: the order a human reads it aloud**, with the operator word last. `a 2 ^` ("a to the 2"), `x i ssc` ("x sub i"), `n 1 = infty 1 n 2 ^ / ser` ("sum from n=1 to ∞ of 1/n²").
- **Greek letters use the LaTeX names without the backslash:** `alpha`, `pi`, `Gamma`. They're reserved words, so glued letters that spell one (`mu`, `pi`, `eta`) mean the Greek letter, not a product.
- **Every letter LaTeX has a command for works the same way:** `ell` → ℓ, `hbar` → ℏ, `aleph` → ℵ, `Re` → ℜ, `wp` → ℘. These are reserved words too, so a product that spells one (`Re`, `wp`) needs spaces and `*`.
- **Symbols by name:** most symbols with a LaTeX command can be reserved names, even though each one takes a glued product away (`in` would mean ∈, not i·n). The vocabulary will be revised after testing if it doesn't fit.
- **Uppercase Greek letters LaTeX has no command for are reserved too:** `Alpha`, `Beta`, `Eta`, `Mu`, … and `omicron`, so the whole Greek alphabet is available by name.
- **LaTeX's named functions are reserved operators:** `sin`, `cos`, `tan`, `log`, `ln`, `exp`, `lim`, `max`, `min`, `det`, … (every function LaTeX has a command for). So are the variadic `mat` and `cases`.
- **Infinity is `infty`,** the LaTeX name. There's no short form: `oo` is just o·o.
- **Starting vocabulary:** the whole Greek alphabet; `reals` → ℝ, `complex` → ℂ, `naturals` → ℕ, `integers` → ℤ, `rationals` → ℚ; `and` → ∧ and `or` → ∨ (binary operators); `exists` and `forall`.
- **Quantifiers are operators:** `exists` and `forall` take one argument, the thing they quantify. `x exists` → ∃x, `x forall` → ∀x.
- **Escape hatch: raw value.** A token starting with `\` is copied into the output as-is and pushed as one value: `\mathcal{F} x ssc` → 𝓕ₓ. The tool can't see inside it, so it's an **atom** and never gets brackets. If the raw text needs brackets (`\alpha+\beta`), the author writes them.
- **Escape hatch: raw operator.** `\cmd/N` pops N values and emits `\cmd{…}{…}`: `a b \overset/2` → `\overset{a}{b}`.
- **Upright text:** a quoted string becomes `\text{…}`: `"if "` → `\text{if }`. Inside quotes, the lexer keeps spaces instead of ending the token. A backslash escapes a quote: `"say \"hi\""`.
- **Spaces always end a raw LaTeX token,** even inside braces, so `\operatorname{arg max}` splits in two.
- **Letters are ASCII only:** `α` typed directly is an error; write `alpha`.
- **Decimals:** `3.14` is one number. `3.` and `.5` are errors.
- **Subscript is `ssc`, or `_`:** binary. `x i ssc` and `x i _` both → x_i, the same tree, just as `^` is the symbol for powers. Like every symbol, `_` needs spaces around it: `x_i` is an error.
- **Sums:** `sum` takes 2 arguments (index, summand) → ∑ₙ aₙ. `ser` takes 3 (lower bound, upper bound, summand) → ∑ₙ₌₁^∞. **Bounds come first:** `n 1 = infty 1 n 2 ^ / ser`. There's no bare ∑ without an index.
- **Limits take two values, approach then body:** `x 0 -> x sin x / lim` → lim_{x→0} sin x / x. `liminf` and `limsup` work the same way.
- **`max`, `min`, `argmax`, `argmin` take a subscript, then a body:** `x S in f max` → max_{x∈S} f. `argmax`/`argmin` are written `\operatorname*{arg\,max}`.
- **`sup` and `inf` take one value,** like functions: `A sup` → sup A.
- **Definite integrals:** `int` takes 4 arguments: lower bound, upper bound, integrand, variable. `0 pi x sin x int` → ∫₀^π sin x dx. You type the variable (`x`), and `int` writes the d and its spacing.
- **Bracket rule (emitter):** wrap a child in brackets if its operator ranks lower than its parent's (BIDMAS precedence), or if it ranks equal, is the right-hand child, and the parent is not associative. So `a b c - -` → a − (b − c) and `a b c + +` → a + b + c.
- **Layout groups some arguments:** an argument the layout puts in its own box never gets brackets. Fraction numerator and denominator, the `sqrt` radicand, the exponent of `^`, the subscript of `ssc`, and the bounds of `ser`/`int` are all in this group. Arguments that stay on the line next to something (the base of `^`/`ssc`, operands of `+ - *`) follow the bracket rule.

## Proposed (not yet accepted)

| Idea | Suggestion | Trade-off to weigh |
|---|---|---|
| Upright capitals for borrowed Greek | `Alpha` → `\mathrm{A}`, `Eta` → `\mathrm{H}`, …; `omicron` → `o` | Matches LaTeX's own capitals (`\Gamma` is upright). Plain `A` would come out italic. |
| Backslashes in quoted text | Only `\"` is an escape. Every other backslash is kept, so `"costs \$5"` works; `\\` is kept as a pair so it never escapes a quote | The lexer does this now. |
| Glued subscript details | The subscript goes on the last letter (`2ab1` → 2·a·b₁), works on reserved values (`pi1` → π₁), and must end the token (`x1y` is an error). An operator can't take one (`sqrt2` is an error) | The lexer does this now. |
| `col` | Column vector, variadic: `[ a b c col` | Spelling came from an example, not a decision. |
| Operators can't reach past a mark or row | `a [ b + mat` and `[ a ; b + mat` are errors: `+` finds only one value before the `[` or `;` | The parser does this now. Reaching past would put a value from outside a matrix cell inside it. |
| Where `br` is allowed | Only right after an operator written between its operands (`+ - * = and or`). Not after `/`, `^`, `ssc` or functions, whose arguments get their own boxes | The parser does this now. |
| Empty pieces are errors | An empty block, an empty row (`[ a ; mat`), an empty equation (`; a`) and a trailing `;` (`a ;`) | The parser does this now. A trailing `;` could instead be allowed and ignored. |
| Function arities | Named functions (`sin`, `log`, `det`, …) take 1 argument. `lim`, `liminf`, `limsup`, `max`, `min`, `sup`, `inf`, `gcd`, `hom` and `vec` are rejected until open question 2 settles them | The parser does this now. |
| One parse error per block | The lexer reports every bad token, but the parser stops at the first error in a block, because the stack means nothing after one | Blocks are independent, so the tool can still report one error per block across a whole file. |
| Negation after `+` or `-` | Bracketed: `a b neg +` → a + (−b). Elsewhere it isn't: −b + a, a = −b | The emitter does this now. |
| Summands and integrands | Bracketed only if a sum or looser: ∑ₙ (aₙ + b), but ∑ₙ aₙbₙ | The emitter does this now. |
| Stretchy brackets | `\left( … \right)` only around tall contents (fractions, sums, integrals, matrices); plain `( … )` otherwise | The emitter does this now. `\left`/`\right` adds stray spacing around short contents. |
| Matrix brackets | `mat` and `col` print with round brackets (`pmatrix`). `cases` rows are value, then condition | The emitter does this now. `bmatrix` gives square brackets. |
| Integral d | `\,dx`: italic d after a thin space | The emitter does this now. ISO style uses an upright d: `\,\mathrm{d}x`. |
| Logic symbols | `and` → `\wedge`, `or` → `\vee` | The emitter does this now. |
| A chain aligns at its first relation | In `align`, `a b = c =` → `a &= b = c`, so a broken chain reads `a &= b \\ &= c` | The emitter does this now. |
| Where `br` can't go | An error in a one-line region (`$…$`, `\[…\]`, `equation`), and inside a box (fraction, root, exponent, subscript, bounds, matrix entry) | The emitter does this now. A broken `equation` could instead be wrapped in `split` automatically. |
| Numbering a broken equation | In `align` and `gather`, every line but the last gets `\notag`, so the equation is numbered once, on its last line (where its `\label` goes) | The emitter does this now. |
| Breaking between factors | `a b * br` → a ⏎ b; with a digit, a ⏎ ·2 | The emitter does this now. |
| Arrow chains get brackets on both sides | `p q => r =>` → (p ⇒ q) ⇒ r, and `p q r => =>` → p ⇒ (q ⇒ r). Readers disagree on which way p ⇒ q ⇒ r groups, so neither is left bare | The emitter does this now. |
| Where `align` lines up | At the leftmost relation of a relation chain (`a &\leq b < c`); at the root for an arrow (`a = b &\implies c = d`), never inside its brackets. A `br` before any relation or arrow starts the line with `&` | The emitter does this now. |
| Bodies of limits and max/min | Bracketed like a summand: only if it's a sum or looser, so lim (f + g) but lim sin x / x. `sup`/`inf` bracket their argument like a function | The emitter does this now. |
| Factorial brackets | The operand is bracketed unless it's an atom or a subscripted atom: (n + 1)!, (2n)!, (n!)!, but n₁! | The emitter does this now. |
| Prime | `f'` glued | Not built yet. |
| Precedence of `and`/`or` | ∧ ranks above ∨, and both rank below relations (`=`, `<`, …), so `a b = c d = and` → a = b ∧ c = d with no brackets | This is the usual convention in logic. |

## Wanted, spelling not yet chosen

- Cross product a × b (`\times`). Dot product a · b (`\cdot`)?
- Commutators: [A, B] (and anticommutators?)
- Bras ⟨ψ|, kets |ψ⟩, and probably brakets ⟨φ|ψ⟩
- `vec`: how many arguments? A unary decoration (v → v⃗), or something else?

## Open questions

1. **More relations** (`supseteq`, `parallel`, `mid`, …), as they come up.
2. **What else is a named word, and arities.** Bold, hat? How many arguments do `gcd`, `hom` and `vec` take? How is a bare lim (no subscript), a subscripted sup (sup_n aₙ), or a list max(a, b) written: raw LaTeX, or more words? How is a one-sided target like 0⁺ written?
3. **Indefinite and multiple integrals.** What word or words for ∫ f dx and ∬ f dx dy?
4. **Embedding in LaTeX.** How does the tool know an environment is math? It needs a list (amsmath and mathtools environments, starred forms), and perhaps a way for the author to add their own. Where does `\label` go relative to `@`?
5. **Error details.** Does the tool stop at the first invalid block, or report every one in the file before stopping? What format do messages use (e.g. `paper.rtex:12:8: stack underflow at '+'`, which editors can jump to)? Leftover stack items are technically invalid RPN but were decided as a warning; do they stay a warning? A misspelled word (`sqtr`) silently becomes a product s·q·t·r rather than an error; should the tool warn when a product is one typo away from a reserved word? Should the output keep each line on the same line number as the source, so LaTeX's line numbers point at the right place without a source map?
6. **Markdown.** Is Markdown support dropped, or kept as a second front end that shares the same core?
7. **Included files.** Does the tool follow `\input`/`\include` into the author's other `.rtex` files, or convert every `.rtex` in the project? (It never reads packages.)
8. **Measured breaks in each implementation.** TypeScript measures on one run and breaks on the next (`.aux`); the Lua package can measure in the same run. Must both choose the same breaks, or only the same LaTeX for everything else?
