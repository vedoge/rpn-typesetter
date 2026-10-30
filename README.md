# rpn-typesetter

Write LaTeX math in RPN (postfix notation) and never type a grouping bracket again. The tool turns RPN math in a `.rtex` file into ordinary LaTeX, adding brackets only where the maths needs them, and pdfLaTeX compiles the result as usual.

```latex
The roots are \[@ x b neg b 2 ^ 4ac - sqrt + 2a / = \]
```

becomes

```latex
The roots are \[ x = \frac{-b + \sqrt{b^{2} - 4 a c}}{2 a} \]
```

It's experimental: the language is still being designed (see [`docs/design.md`](docs/design.md)), so spellings may change.

## Install

You need Node.js 22 or later and a TeX distribution with `latexmk` (MacTeX and TeX Live both have it).

```sh
npm install -g https://github.com/vedoge/rpn-typesetter/releases/latest/download/rpn-typesetter.tgz
rpn-typesetter --version
```

To update, run the same `npm install -g …` command again; it always fetches the latest release. To remove it, `npm uninstall -g rpn-typesetter`.

Then tell `latexmk` about it, once, by adding this line to `~/.latexmkrc` (create the file if it doesn't exist):

```perl
$pdflatex = 'rpn-typesetter --latexmk %S && pdflatex %O %R.tex';
```

With `--latexmk`, the tool converts `.rtex` files and leaves ordinary `.tex` files alone, so your other documents build exactly as before. If you don't already build PDFs by default, add `$pdf_mode = 1;` too, or run `latexmk -pdf`. To set it up for one project only, copy [`examples/latexmkrc`](examples/latexmkrc) next to your document as `.latexmkrc` instead.

## Use

1. Write your document as `paper.rtex`: ordinary LaTeX, with RPN math wherever you want it.
2. Run `latexmk paper.rtex`, or `latexmk -pvc paper.rtex` to rebuild on every save.

Each pdfLaTeX pass first runs `rpn-typesetter`, which writes `paper.tex`. Don't edit `paper.tex`: it's regenerated every time, and the tool refuses to overwrite a `paper.tex` it didn't write. Errors point at your `.rtex` file:

```
paper.rtex:12:8: error: `+` needs 2 values, but only 1 is available
```

If any RPN is invalid, nothing is written and LaTeX doesn't run. You can also run `rpn-typesetter paper.rtex` on its own.

[`examples/demo.rtex`](examples/demo.rtex) is a small document to start from.

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
| `alpha` · `Gamma` · `reals` · `infty` | α · Γ · ℝ · ∞ (LaTeX names, no backslash) |
| `x sin` · `x y + sin` | sin x · sin(x + y) |
| `0 x < 1 <=` | 0 < x ≤ 1 (also `>`, `>=`, `!=`, `->`, `<<`, `>>`) |
| `x reals in` · `a b approx` | x ∈ ℝ · a ≈ b (relations by name) |
| `p q and r or s =>` | p ∧ q ∨ r ⇒ s (also `<=>`, `not`) |
| `x exists` · `x forall` | ∃x · ∀x |
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
- `br` after an operator breaks the line before it (`a b + c + br` puts `+ c` on a new line).
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

With `pdflatex` installed, `npm test` also compiles every expected output in the shared cases with real LaTeX. CI runs everything on every push and typesets `examples/demo.rtex`.

To release, bump `version` in `package.json`, commit, and push a matching tag (`git tag v0.2.0 && git push origin v0.2.0`). The release workflow tests, packs, and publishes `rpn-typesetter.tgz` to GitHub Releases, which is what the install command fetches. (Installing straight from git with `npm install -g github:…` doesn't work: npm skips the build step's dependencies for global git installs.)
