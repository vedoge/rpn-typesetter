// Entry point for the preprocessor. The pipeline is lexer → parser → emitter;
// the emitter doesn't exist yet.
export { lex } from "./lexer.js";
export type { Diagnostic, Factor, LexResult, Span, SymbolChar, Token } from "./lexer.js";
export { parse, parseTokens } from "./parser.js";
export type { Equation, Node, ParseResult } from "./parser.js";
export { vocabulary } from "./vocabulary.js";
export type { Arity, Word } from "./vocabulary.js";
