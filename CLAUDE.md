# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goal

A math typesetter for Markdown files that is simpler and quicker to type than LaTeX. Math is written in RPN (postfix notation), so the author never types grouping parentheses. The tool turns that input into LaTeX for KaTeX to render, and adds visual parentheses wherever precedence requires them.

## Working with the user

The user is designing this language and wants Claude to act as a **guide, not the designer**. Lay out options, trade-offs, and consequences, and ask questions that help them think. Don't settle open design questions yourself, and don't present a finished design as decided.

`docs/design.md` is the design log. It separates **Decided**, **Proposed**, and **Open** items. Only move something to Decided when the user has explicitly agreed to it.

## Design constraints already agreed

- TypeScript implementation; output is LaTeX for KaTeX.
- Operators are short typed words or symbols that need no Shift (`- = / , ; . [ ] '`). Avoid Shift and `\`.
- Operators that take a variable number of arguments use a stack mark.

## Current state

There is no code yet, so there are no build or test commands. Add them here, along with an architecture overview, once they exist.
