// Entry point for the preprocessor. The pipeline is lexer → parser → emitter.
export { lex } from "./lexer.js";
export type { Diagnostic, Factor, LexResult, Span, SymbolText, Token } from "./lexer.js";
export { emitEquation, emitNode, toLatex } from "./emitter.js";
export type { EmitResult } from "./emitter.js";
export { parse, parseTokens } from "./parser.js";
export { convert, locate, marker } from "./scanner.js";
export type { ConvertResult } from "./scanner.js";
export type { Equation, Node, ParseResult } from "./parser.js";
export { arrows, functions, relations, symbols, vocabulary } from "./vocabulary.js";
export type { Arity, Word } from "./vocabulary.js";
