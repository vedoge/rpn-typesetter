// Copyright 2026 vedoge
//
// This work may be distributed and/or modified under the conditions of the
// LaTeX Project Public License, either version 1.3c of this license or (at
// your option) any later version. The latest version of this license is in
// https://www.latex-project.org/lppl.txt and version 1.3c or later is part
// of all distributions of LaTeX version 2008 or later.
//
// This work has the LPPL maintenance status `maintained'.
// The Current Maintainer of this work is vedoge (https://github.com/vedoge).
//
// This work consists of all the files in https://github.com/vedoge/rpn-typesetter.
//
// Entry point for the preprocessor. The pipeline is lexer → parser → emitter.
export { lex } from "./lexer.js";
export type { Diagnostic, Factor, LexResult, Span, SymbolText, Token } from "./lexer.js";
export { emitEquation, emitNode, toLatex } from "./emitter.js";
export type { EmitResult } from "./emitter.js";
export { parse, parseTokens } from "./parser.js";
export { convert, locate, marker } from "./scanner.js";
export type { ConvertOptions, ConvertResult } from "./scanner.js";
export type { Equation, Node, ParseResult } from "./parser.js";
export { accents, arrows, equivalences, functions, relations, symbols, vocabulary } from "./vocabulary.js";
export type { Arity, Word } from "./vocabulary.js";
