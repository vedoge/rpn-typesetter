import { describe, expect, it } from "vitest";
import { lex } from "../src/lexer.js";

/** Tokens without their spans, for comparing shapes. */
function shapes(source: string) {
  const { tokens, errors } = lex(source);
  expect(errors).toEqual([]);
  return tokens.map(({ start: _start, end: _end, ...rest }) => rest);
}

/** Just the error messages. */
function errors(source: string): string[] {
  return lex(source).errors.map((e) => e.message);
}

describe("lexer", () => {
  it("lexes the quadratic formula", () => {
    expect(shapes("b neg b 2 ^ 4ac - sqrt + 2a /")).toEqual([
      { kind: "variable", name: "b" },
      { kind: "word", name: "neg" },
      { kind: "variable", name: "b" },
      { kind: "number", text: "2" },
      { kind: "symbol", symbol: "^" },
      {
        kind: "product",
        factors: [
          { kind: "number", text: "4" },
          { kind: "variable", name: "a" },
          { kind: "variable", name: "c" },
        ],
      },
      { kind: "symbol", symbol: "-" },
      { kind: "word", name: "sqrt" },
      { kind: "symbol", symbol: "+" },
      {
        kind: "product",
        factors: [
          { kind: "number", text: "2" },
          { kind: "variable", name: "a" },
        ],
      },
      { kind: "symbol", symbol: "/" },
    ]);
  });

  it("records where each token starts and ends", () => {
    expect(lex("ab  +\n2").tokens.map(({ start, end }) => [start, end])).toEqual([
      [0, 2],
      [4, 5],
      [6, 7],
    ]);
  });

  it("returns nothing for empty or blank input", () => {
    expect(lex("")).toEqual({ tokens: [], errors: [] });
    expect(lex("  \n\t ")).toEqual({ tokens: [], errors: [] });
  });

  describe("numbers", () => {
    it("reads integers and decimals", () => {
      expect(shapes("42 3.14")).toEqual([
        { kind: "number", text: "42" },
        { kind: "number", text: "3.14" },
      ]);
    });
  });

  describe("glued products and reserved words", () => {
    it("splits glued letters into a product", () => {
      expect(shapes("ab")).toEqual([
        {
          kind: "product",
          factors: [
            { kind: "variable", name: "a" },
            { kind: "variable", name: "b" },
          ],
        },
      ]);
    });

    it("reads a run that spells a reserved word as that word", () => {
      expect(shapes("pi mu Re br")).toEqual([
        { kind: "word", name: "pi" },
        { kind: "word", name: "mu" },
        { kind: "word", name: "Re" },
        { kind: "word", name: "br" },
      ]);
    });

    it("only matches a reserved word against the whole run of letters", () => {
      // `xpi` isn't a reserved word, so it's x·p·i, not x·π.
      expect(shapes("xpi")).toEqual([
        {
          kind: "product",
          factors: [
            { kind: "variable", name: "x" },
            { kind: "variable", name: "p" },
            { kind: "variable", name: "i" },
          ],
        },
      ]);
    });

    it("glues a number to a reserved value", () => {
      expect(shapes("2pi")).toEqual([
        {
          kind: "product",
          factors: [
            { kind: "number", text: "2" },
            { kind: "word", name: "pi" },
          ],
        },
      ]);
    });

    it("rejects a number glued to an operator", () => {
      expect(errors("2sqrt")).toEqual(["`2` is glued to the operator `sqrt`; did you mean `2 sqrt`?"]);
    });

    it("reserves uppercase Greek letters LaTeX has no command for", () => {
      expect(shapes("Alpha omicron")).toEqual([
        { kind: "word", name: "Alpha" },
        { kind: "word", name: "omicron" },
      ]);
    });

    it("reserves functions and variadic operators", () => {
      expect(shapes("cos lim mat cases")).toEqual([
        { kind: "word", name: "cos" },
        { kind: "word", name: "lim" },
        { kind: "word", name: "mat" },
        { kind: "word", name: "cases" },
      ]);
    });
  });

  describe("glued subscripts", () => {
    it("reads digits after a letter as its subscript", () => {
      expect(shapes("x1 x12")).toEqual([
        { kind: "variable", name: "x", subscript: "1" },
        { kind: "variable", name: "x", subscript: "12" },
      ]);
    });

    it("puts the subscript on the last letter of a product", () => {
      expect(shapes("2ab1")).toEqual([
        {
          kind: "product",
          factors: [
            { kind: "number", text: "2" },
            { kind: "variable", name: "a" },
            { kind: "variable", name: "b", subscript: "1" },
          ],
        },
      ]);
    });

    it("subscripts a reserved value", () => {
      expect(shapes("pi1")).toEqual([{ kind: "word", name: "pi", subscript: "1" }]);
    });

    it("rejects a subscript on an operator", () => {
      expect(errors("sqrt2")).toEqual(["the operator `sqrt` can't take a subscript; did you mean `2 sqrt`?"]);
    });

    it("rejects letters after a glued subscript", () => {
      expect(errors("x1y")).toEqual([
        "`x1y`: glued digits after letters are a subscript and must end the token (`x1` → x₁)",
      ]);
    });
  });

  describe("symbols", () => {
    it("reads arithmetic, marks and row separators", () => {
      expect(shapes("+ - * / ^ = [ ;").map((t) => ("symbol" in t ? t.symbol : t.kind))).toEqual([
        "+", "-", "*", "/", "^", "=", "[", ";",
      ]);
    });

    it("requires whitespace between tokens", () => {
      expect(errors("4ac-")).toEqual(["`4ac-` needs spaces: tokens are separated by whitespace"]);
    });

    it("rejects symbols that aren't in the language yet", () => {
      expect(errors("<=")).toEqual(["unknown symbol `<=`"]);
    });
  });

  describe("escape hatch", () => {
    it("passes a backslash token through as raw LaTeX", () => {
      expect(shapes("\\mathcal{F} \\,")).toEqual([
        { kind: "raw", latex: "\\mathcal{F}" },
        { kind: "raw", latex: "\\," },
      ]);
    });

    it("reads a raw operator with its arity", () => {
      expect(shapes("\\overset/2")).toEqual([{ kind: "rawOperator", command: "\\overset", arity: 2 }]);
    });

    it("rejects a lone backslash", () => {
      expect(errors("\\")).toEqual(["a lone `\\` is not a LaTeX command"]);
    });
  });

  describe("quoted text", () => {
    it("keeps spaces inside quotes", () => {
      expect(shapes('x "if " y')).toEqual([
        { kind: "variable", name: "x" },
        { kind: "text", text: "if " },
        { kind: "variable", name: "y" },
      ]);
    });

    it("reads \\\" as a quote inside the text", () => {
      expect(shapes('"say \\"hi\\""')).toEqual([{ kind: "text", text: 'say "hi"' }]);
    });

    it("keeps other backslashes, so LaTeX works inside text", () => {
      expect(shapes('"costs \\$5" "a\\\\"')).toEqual([
        { kind: "text", text: "costs \\$5" },
        { kind: "text", text: "a\\\\" },
      ]);
    });

    it("rejects a string with no closing quote", () => {
      expect(errors('x "if')).toEqual(['unterminated string: missing the closing "']);
    });

    it("rejects a string glued to the next token", () => {
      expect(errors('"if"x')).toEqual(["a string must be followed by a space"]);
    });
  });

  it("reports every bad chunk and keeps lexing", () => {
    const result = lex("x1y a 2sqrt b");
    expect(result.errors.map(({ start, end }) => [start, end])).toEqual([
      [0, 3],
      [6, 11],
    ]);
    expect(result.tokens.map((t) => ("name" in t ? t.name : t.kind))).toEqual(["a", "b"]);
  });
});
