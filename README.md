# rpn-typesetter

Write LaTeX math in RPN (postfix notation) and never type a grouping bracket again. RPN math in your document becomes ordinary LaTeX, with brackets added only where the maths needs them:

```latex
The roots are \[@ x b neg b 2 ^ 4ac - sqrt + 2a / = \]
```

typesets as if you had written

```latex
The roots are \[ x = \frac{-b + \sqrt{b^{2} - 4 a c}}{2 a} \]
```

It's experimental: the language is still being designed (see [`docs/design.md`](docs/design.md)), so spellings may change.

## Two ways to use it

The same language works in two ways, and both turn the same RPN into the same LaTeX:

| | LuaLaTeX package | Command, for pdfLaTeX |
|---|---|---|
| You write | `paper.tex`, with `\usepackage{rpn-typesetter}` | `paper.rtex` |
| You build with | `latexmk -lualatex paper.tex` | `latexmk paper.rtex` |
| Converts | inside the LaTeX run | before each pdfLaTeX run, writing `paper.tex` |
| Needs | LuaLaTeX (in TeX Live, MacTeX, MiKTeX, Overleaf) | Node.js 22+ and `latexmk` |
| Breaks long equations by itself | not yet | yes |

## With LuaLaTeX

### Install

The package is headed for CTAN, after which TeX Live and MiKTeX will install it like any other package. Until then, copy its files into your personal TeX folder:

```sh
dir="$(kpsewhich -var-value TEXMFHOME)/tex/lualatex/rpn-typesetter"
mkdir -p "$dir" && cd "$dir"
for f in rpn-typesetter.sty rpn-typesetter.lua rpn-typesetter-text.lua rpn-typesetter-vocabulary.lua rpn-typesetter-lexer.lua rpn-typesetter-parser.lua rpn-typesetter-emitter.lua rpn-typesetter-scanner.lua; do curl -fsSLO "https://raw.githubusercontent.com/vedoge/rpn-typesetter/main/lualatex/$f"; done
kpsewhich rpn-typesetter.sty    # prints the path if TeX finds it
```

To update, run the same commands again. On Overleaf, upload those eight files next to your document instead. On MiKTeX, register the folder first (MiKTeX Console → Settings → Directories).

### Use

Load the package in an ordinary `.tex` document, and build with LuaLaTeX:

```latex
\documentclass{article}
\usepackage{rpn-typesetter}
\begin{document}
The roots are \[@ x b neg b 2 ^ 4ac - sqrt + 2a / = \]
\end{document}
```

```sh
latexmk -lualatex paper.tex
```

- RPN works anywhere after the `\usepackage` line, in your document and in the `.tex` files it `\input`s or `\include`s.
- Line numbers in LaTeX's own messages still match your file.
- The package loads `amsmath` and `unicode-math` unless your document already does. `\usepackage[unicode-math=false]{rpn-typesetter}` loads `amssymb` instead, keeping LaTeX's traditional math fonts.
- Under pdfLaTeX the package does nothing, so a document that loads it can still go through the command.

[`examples/lualatex/demo.tex`](examples/lualatex/demo.tex) is a small document to start from, and [`lualatex/rpn-typesetter-doc.tex`](lualatex/rpn-typesetter-doc.tex) is the package's documentation.

## With pdfLaTeX: the command

### Install

You need Node.js 22 or later and a TeX distribution with `latexmk` (MacTeX and TeX Live both have it).

```sh
npm install -g https://github.com/vedoge/rpn-typesetter/releases/latest/download/rpn-typesetter.tgz
rpn-typesetter --version
```

To update, run the same `npm install -g …` command again; it always fetches the latest release. To remove it, `npm uninstall -g rpn-typesetter`.

Then tell `latexmk` about it, once, by adding these lines to `~/.latexmkrc` (create the file if it doesn't exist):

```perl
$pdflatex = 'rpn-typesetter --latexmk %S && pdflatex %O %R.tex';
add_cus_dep('rtex', 'tex', 0, 'rtex2tex');
sub rtex2tex { return system('rpn-typesetter', '--latexmk', "$_[0].rtex"); }
```

The first line converts your document before each pdfLaTeX pass. The other two tell `latexmk` that a `.tex` file is made from the `.rtex` file of the same name, so it rebuilds when you edit a chapter your document `\input`s. (If you set this up before chapters were supported, add those two lines.)

With `--latexmk`, the tool converts `.rtex` files and leaves ordinary `.tex` files alone, so your other documents build exactly as before. If you don't already build PDFs by default, add `$pdf_mode = 1;` too, or run `latexmk -pdf`. To set it up for one project only, copy [`examples/latexmkrc`](examples/latexmkrc) next to your document as `.latexmkrc` instead.

### Use

1. Write your document as `paper.rtex`: ordinary LaTeX, with RPN math wherever you want it.
2. Run `latexmk paper.rtex`, or `latexmk -pvc paper.rtex` to rebuild on every save.

Each pdfLaTeX pass first runs `rpn-typesetter`, which writes `paper.tex`.

- **Split documents:** `\input{chapter}` or `\include{chapter}` makes the tool convert `chapter.rtex` to `chapter.tex` as well, which LaTeX then reads. Write the name without `.rtex`, as LaTeX expects.
- **Generated files:** don't edit them. They're regenerated every time, and the tool refuses to overwrite a `.tex` file it didn't write.
- **Running it alone:** `rpn-typesetter paper.rtex` works on its own too. It exits 1 if any RPN is invalid, though it still writes `paper.tex`.

[`examples/demo.rtex`](examples/demo.rtex) is a small document to start from.

## Mistakes

Both report invalid RPN the same way: first the line and column in your source file (`paper.tex` with the package, `paper.rtex` with the command), then a LaTeX error where LaTeX reaches the block:

```
paper.tex:12:8: error: `+` needs 2 values, but only 1 is available
! Package rpn-typesetter Error: `+` needs 2 values, but only 1 is available.
```

As with any LaTeX error, LaTeX stops and waits; press Return to carry on, and the block is typeset as **??**, like a missing reference. Values left over at the end, as in `2 x 2 ^`, are set side by side, with a warning, since an operator may be missing.

## Marking RPN math

Put `@` straight after any math delimiter: `$@ … $`, `\(@ … \)`, `\[@ … \]`, `\ensuremath{@ … }`, or `\begin{align}@ … \end{align}` and the other math environments. Math without the `@` is left exactly as you wrote it, so you can mix the two freely. To write plain math that starts with an `@`, put `{}` first: `${}@$`.

## The language in brief

Values come first, then the operator that combines them: `a b +` is a + b. Tokens are separated by spaces.

| You write | You get |
|---|---|
| `a b + c *` | (a + b) c |
| `a b / ` · `a sqrt` · `a 2 ^` · `x i _` | a/b as a fraction · √a · a² · xᵢ |
| `4ac` · `2pi` · `x1` | 4ac · 2π · x₁ (glued letters multiply; glued digits subscript) |
| `b neg` · `n !` | −b · n! |
| `x dot` · `x ddot` · `a tilde` · `x hat` · `x bar` | ẋ · ẍ · ã · x̂ · x̄ (accents) |
| `f'` · `x''` · `x1'` | f′ · x″ · x₁′ (glued primes) |
| `alpha` · `Gamma` · `reals` · `infty` | α · Γ · ℝ · ∞ (LaTeX names, no backslash) |
| `x sin` · `x y + sin` | sin x · sin(x + y) |
| `z Re` · `z w + Im` | Re z · Im(z + w) (real and imaginary parts) |
| `0 x < 1 <=` | 0 < x ≤ 1 (also `>`, `>=`, `!=`, `->`, `<-`, `<<`, `>>`) |
| `x reals in` · `a b approx` | x ∈ ℝ · a ≈ b (relations by name) |
| `p q and r or s =>` | p ∧ q ∨ r ⟹ s (also `<=>`, `not`, and the short ⇒ ⇐ ⇔ as `Rightarrow`, `Leftarrow`, `Leftrightarrow`) |
| `x exists` · `epsilon 0 > forall` | ∃x · ∀ε > 0 |
| `x reals in forall x 2 ^ 0 >= ,` · `a b , c ,` | ∀x ∈ ℝ, x² ≥ 0 · a, b, c (`,` joins a quantifier to its body, or makes a list) |
| `x 0 -> x sin x / lim` | lim as x → 0 of sin x / x (also `liminf`, `limsup`) |
| `x S in f max` · `A sup` | max over x ∈ S of f (also `min`, `argmax`, `argmin`) · sup A (also `inf`) |
| `n a n _ sum` | ∑ₙ aₙ |
| `n 1 = infty 1 n 2 ^ / ser` | ∑ from n=1 to ∞ of 1/n² |
| `0 pi x sin x int` | ∫₀^π sin x dx |
| `[ a b ; c d mat` | a 2×2 matrix; `[` marks where the entries start, `;` ends a row |
| `[ 1 x 0 = ; 0 "otherwise" cases` | a piecewise function; `"…"` is upright text |
| `\mathcal{F}` · `a b \overset/2` | any LaTeX command, passed through as a value, or as an operator taking 2 values |

In a display environment:

- `;` separates equations. In `align` they line up at their relations.
- With the command, long equations in `multline`, `align` and `gather` are broken automatically. LaTeX measures them on one run, and the next run (which `latexmk` does for you) breaks them where they stop fitting. The LuaLaTeX package doesn't break automatically yet, so use `br` there.
- `br` after an operator breaks the line before it by hand (`a b + c + br` puts `+ c` on a new line). An equation with a `br` isn't broken automatically.
- `\label{…}` and `\notag` go inside the RPN, with the equation they belong to.

The full set of rules and the reasons behind them are in [`docs/design.md`](docs/design.md).

## Develop

```sh
git clone https://github.com/vedoge/rpn-typesetter
cd rpn-typesetter
npm ci              # also builds dist/
npm test            # unit tests and the shared cases in test/cases/
npm run typecheck
npm link            # use your working copy as the rpn-typesetter command
```

With `pdflatex` installed, `npm test` also compiles every expected output in the shared cases with real LaTeX. With `texlua` (part of LuaTeX) or Lua 5.3+, it runs the shared cases against the LuaLaTeX package's Lua code (`texlua test/lualatex/conformance.lua` does just that), and with `lualatex` it typesets every document case through the package. CI runs everything on every push and typesets both demos.

To release, bump `version` in `package.json` and in `lualatex/rpn-typesetter.sty` (a test checks they match), commit to `main`, and either push a matching tag (`git tag v0.2.0 && git push origin v0.2.0`) or run the Release workflow by hand on `main` from the Actions tab, which tags the commit itself. The release workflow tests, packs, and publishes `rpn-typesetter.tgz` to GitHub Releases, which is what the install command fetches. It also attaches `rpn-typesetter-ctan.zip` (built locally with `npm run ctan`), the LuaLaTeX package as CTAN takes it, to upload at [ctan.org/upload](https://ctan.org/upload). (Installing straight from git with `npm install -g github:…` doesn't work: npm skips the build step's dependencies for global git installs.)

## License

Copyright 2026 vedoge. rpn-typesetter, the command and the LuaLaTeX package, may be distributed and/or modified under the conditions of the [LaTeX Project Public License](LICENSE), version 1.3c or (at your option) any later version. It has the LPPL maintenance status `maintained`, and the Current Maintainer is vedoge.
