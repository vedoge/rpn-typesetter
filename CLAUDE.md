# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goal

A LaTeX preprocessor that makes math simpler and quicker to type. Math is written in RPN (postfix notation), so the author never types grouping parentheses. The tool rewrites RPN math in a `.tex` file into plain LaTeX, adding visual parentheses wherever precedence requires them, and LaTeX compiles the result as usual.

## Working with the user

The user is designing this language and wants Claude to act as a **guide, not the designer**. Lay out options, trade-offs, and consequences, and ask questions that help them think. Don't settle open design questions yourself, and don't present a finished design as decided.

The user is new to language implementation (lexing, parsing, ASTs, code generation) and wants to learn the theory along the way. Introduce each concept when it first matters, explain it briefly with a concrete example from this project, and don't use jargon that hasn't been explained yet.

`docs/design.md` is the design log. It separates **Decided**, **Proposed**, and **Open** items. Only move something to Decided when the user has explicitly agreed to it.

## Design constraints already agreed

- Two implementations kept in step: a TypeScript tool run before LaTeX (via `latexmk`, for pdfLaTeX) whose output is plain LaTeX, and later a LuaLaTeX package doing the same inside the TeX run. Only the TypeScript one exists so far.
- Arithmetic uses standard symbols (`+ - * / ^ _ = !`); relations and arrows use ASCII where a common spelling exists (`< <= != -> => <=>`) and names otherwise (`approx`, `in`, `iff`). Named operations are short words (`sqrt`, `neg`, `ssc`, `sum`, …). Avoid `\`.
- Tokens are separated by whitespace. Glued letters are a product; reserved words take priority over that.
- Operators that take a variable number of arguments use a stack mark.

## Current state

The tool converts a whole `.rtex` file to `.tex`: `npm run build`, then `node dist/cli.js paper.rtex` (installed as the `rpn-typesetter` command). Authors run `latexmk paper.rtex`; a `$pdflatex` line in `~/.latexmkrc` (or a project `.latexmkrc`, see `examples/latexmkrc`) makes each pdfLaTeX pass run `rpn-typesetter --latexmk %S` first, which converts `.rtex` files and ignores `.tex` ones. `README.md` has install and usage. Manual `br` breaks work; measured (automatic) breaks don't exist yet.

- `npm install`: install dev dependencies (TypeScript, Vitest).
- `npm test`: run the tests once (Vitest). `npm run test:watch` reruns on change.
- `npm run typecheck`: type-check `src/` and `test/` (`tsconfig.json`, no output).
- `npm run build`: compile `src/` to `dist/` (`tsconfig.build.json`).
- Releases: bump `version` in `package.json`, then push tag `v<version>`, or run the Release workflow on `main` by hand (`workflow_dispatch`; it creates the tag). This cloud session can't push tags, so it uses the manual run. `.github/workflows/release.yml` checks the tag matches, tests, runs `npm pack`, and attaches `rpn-typesetter.tgz` to a GitHub Release. Authors install and update with `npm install -g https://github.com/vedoge/rpn-typesetter/releases/latest/download/rpn-typesetter.tgz`. Installing from git directly fails (npm doesn't install dev dependencies for the `prepare` build in global git installs).

Layout: source in `src/` (entry point `src/index.ts`), tests in `test/` as `*.test.ts`.

CI (`.github/workflows/ci.yml`) runs on every push and pull request. The `checks` job typechecks, tests and builds. The `latex` job installs TeX Live, so `test/latex.test.ts` runs for real, then typesets `examples/demo.rtex` through `latexmk` and `examples/latexmkrc`, as an author would; the PDF is uploaded as the `demo` artifact. Generated `examples/*.tex` and LaTeX's own files are git-ignored.

## Architecture

The scanner finds RPN blocks in a document; each block goes through lexer → parser → emitter.

- `src/cli.ts`: `main(args)` reads `paper.rtex`, prints diagnostics as `file:line:col: error: …`, and writes `paper.tex` with a guard line on top. It refuses to overwrite a `.tex` without the guard, and writes nothing (exit 1) if any block is invalid.
- `src/scanner.ts`: `convert(document)` finds math regions (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `\ensuremath{…}`, math environments), skipping comments, `\$`, `\verb` and verbatim environments. A region whose first non-space character is `@` is RPN: its text is parsed and emitted, and the LaTeX replaces it. It also adds `\usepackage{amsmath,amssymb}` after `\documentclass` unless the author loads them. Diagnostic offsets are into the whole document; `locate` turns them into line and column.
- `src/lexer.ts`: `lex(source)` splits one RPN block into tokens (number, variable, reserved word, glued product, symbol, raw LaTeX, raw operator, quoted text), each with its `start`/`end` offsets. It doesn't stop at the first error; it returns every problem in `errors`.
- `src/parser.ts`: `parse(source)` lexes, then runs the stack over the tokens and builds a tree (`Node`) for each equation (`;` at the top level splits equations). Each operator becomes an `apply` node holding its arguments in reading order. Glued subscripts become `ssc` nodes, `br` sets `breakBefore`, variadic operators hold `rows`, and leftover values become a `juxtapose` node plus a warning. Labels and `\notag` attach to the `Equation`. It stops at the first error in a block.
- `src/emitter.ts`: `toLatex(source)` runs the whole pipeline on one block and returns LaTeX per equation. `emitNode` walks the tree; most of its work is the bracket rule, driven by `rank()` (how tightly each node binds) plus the layout rules for boxed arguments. `emitEquation(eq, layout)` writes an equation for a `Layout` (`single`, `multline`, `lines`, `aligned`): in `aligned` the first root relation gets `&`. A `br` break is written as a placeholder first; brackets around one split into `\left( … \right.` / `\left. … \right)` halves with a `\vphantom`, and the placeholder finally becomes `\\`, `\\ &` or `\\ &\qquad`. Problems such as a break inside a fraction throw `EmitError`.
- `src/vocabulary.ts`: the reserved words, plus the `relations` and `arrows` tables (spelling → LaTeX) and the lexer's `symbols`. Values carry their LaTeX; operators carry their arity (a number, `"variadic"`, `"break"` for `br`, or `"undecided"`, which the parser rejects).

Tests:

- `test/cases/*.cases` are the shared cases every implementation must pass: `blocks.cases` (RPN block → LaTeX, errors, warnings) and `documents.cases` (`.rtex` → `.tex`). The plain-text format is in `test/cases/README.md`. Add behaviour an author can observe here, not in TypeScript tests. `test/conformance.test.ts` runs them through `test/cases.ts`.
- `test/lexer.test.ts` and `test/parser.test.ts` test internals (token shapes, trees, spans); parser tests print trees compactly, e.g. `(+ a (- b c))`. `test/cli.test.ts` tests the command-line tool.
- `test/latex.test.ts` compiles every expected output in the case files with `pdflatex`, and names the case LaTeX stopped in. It is skipped where `pdflatex` isn't installed (as in the cloud container), so run `npm test` on a machine with TeX to cover it.

When the code has to make a choice the design log hasn't settled, it records it under **Proposed** in `docs/design.md` and says so.
