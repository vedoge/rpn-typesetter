# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goal

A LaTeX preprocessor that makes math simpler and quicker to type. Math is written in RPN (postfix notation), so the author never types grouping parentheses. The tool rewrites RPN math in a `.tex` file into plain LaTeX, adding visual parentheses wherever precedence requires them, and LaTeX compiles the result as usual.

## Working with the user

The user is designing this language and wants Claude to act as a **guide, not the designer**. Lay out options, trade-offs, and consequences, and ask questions that help them think. Don't settle open design questions yourself, and don't present a finished design as decided.

The user is new to language implementation (lexing, parsing, ASTs, code generation) and wants to learn the theory along the way. Introduce each concept when it first matters, explain it briefly with a concrete example from this project, and don't use jargon that hasn't been explained yet.

`docs/design.md` is the design log. It separates **Decided**, **Proposed**, and **Open** items. Only move something to Decided when the user has explicitly agreed to it.

## Design constraints already agreed

- TypeScript implementation, run as an external tool before LaTeX (via `latexmk`); output is plain LaTeX. Not a LuaLaTeX package.
- Arithmetic uses standard symbols (`+ - * / ^ =`). Named operations are short words (`sqrt`, `neg`, `ssc`, `sum`, …). Avoid `\`.
- Tokens are separated by whitespace. Glued letters are a product; reserved words take priority over that.
- Operators that take a variable number of arguments use a stack mark.

## Current state

There is no code yet, so there are no build or test commands. Add them here, along with an architecture overview, once they exist.
