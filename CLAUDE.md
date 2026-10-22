# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goal

A math typesetter for Markdown files that is simpler and quicker to type than LaTeX. Its main idea is that math is written in RPN (postfix notation), so the author never types grouping parentheses. Operator order and arity decide the structure, and the typesetter adds whatever visual parentheses or layout the rendered output needs.

The goal is typing speed. When weighing syntax choices, prefer whichever needs fewer keystrokes and fewer shifted characters to write common expressions.

## Current state

The repository has no code yet. The implementation language, input syntax, output target (for example LaTeX/MathJax/KaTeX, MathML, or HTML), and toolchain have not been chosen. Update this file with build/test commands and an architecture overview once they exist.
