# rpn-typesetter

Write LaTeX math in RPN (postfix notation) and never type a grouping bracket
again. In a LuaLaTeX document that loads this package, math that starts with
`@` is RPN, and is converted to ordinary LaTeX during the run, with brackets
added only where the maths needs them:

```latex
\documentclass{article}
\usepackage{rpn-typesetter}
\begin{document}
The roots are \[@ x b neg b 2 ^ 4ac - sqrt + 2a / = \]
\end{document}
```

typesets as if you had written

```latex
\[ x = \frac{-b + \sqrt{b^{2} - 4 a c}}{2 a} \]
```

The package needs LuaLaTeX (`lualatex paper.tex`, or `latexmk -lualatex
paper.tex`). It loads `amsmath` and `unicode-math` unless the document already
has; `\usepackage[unicode-math=false]{rpn-typesetter}` loads `amssymb` instead.
Under pdfLaTeX it does nothing: the separate `rpn-typesetter` command converts
the document before pdfLaTeX runs instead.

The language is still being designed, so spellings may change between
versions. `rpn-typesetter-doc.pdf` describes it.

## Files

- `rpn-typesetter.sty`: the package.
- `rpn-typesetter.lua` and `rpn-typesetter-*.lua`: the conversion, in Lua.
- `rpn-typesetter-doc.tex`, `rpn-typesetter-doc.pdf`: the documentation.

Development, bug reports and the command-line tool:
<https://github.com/vedoge/rpn-typesetter>

## License

Copyright 2026 vedoge. This work may be distributed and/or modified under
the conditions of the LaTeX Project Public License, either version 1.3c of
this license or (at your option) any later version. It has the LPPL
maintenance status `maintained`; the Current Maintainer is vedoge.
