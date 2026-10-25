// Entry point for the preprocessor. The pipeline is lexer → parser → emitter;
// only the lexer exists so far.
export { lex } from "./lexer.js";
export type { Diagnostic, Factor, LexResult, Span, SymbolChar, Token } from "./lexer.js";
export { vocabulary } from "./vocabulary.js";
export type { Word } from "./vocabulary.js";
