import { describe, expect, it } from "vitest";
import { toLatex } from "../src/emitter.js";

/** The LaTeX for a block that has exactly one equation and no problems. */
function latex(source: string): string {
  const result = toLatex(source);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.equations).toHaveLength(1);
  return result.equations[0]!;
}

describe("emitter", () => {
  it("writes the quadratic formula", () => {
    expect(latex("b neg b 2 ^ 4ac - sqrt + 2a /")).toBe("\\frac{-b + \\sqrt{b^{2} - 4 a c}}{2 a}");
  });

  describe("the bracket rule", () => {
    it("brackets a looser child", () => {
      expect(latex("a b + c *")).toBe("(a + b) c");
      expect(latex("c a b + *")).toBe("c (a + b)");
      expect(latex("a b + 2 ^")).toBe("(a + b)^{2}");
    });

    it("brackets an equal-rank right child only under a non-associative parent", () => {
      expect(latex("a b c - -")).toBe("a - (b - c)");
      expect(latex("a b c + -")).toBe("a - (b + c)");
      expect(latex("a b c + +")).toBe("a + b + c");
      expect(latex("a b c - +")).toBe("a + b - c");
      expect(latex("a b - c -")).toBe("a - b - c");
    });

    it("never brackets an argument the layout boxes", () => {
      expect(latex("a b + c d - /")).toBe("\\frac{a + b}{c - d}");
      expect(latex("x a b + ^")).toBe("x^{a + b}");
      expect(latex("a b + sqrt")).toBe("\\sqrt{a + b}");
      expect(latex("x i 1 + ssc")).toBe("x_{i + 1}");
    });

    it("stretches brackets around tall contents", () => {
      expect(latex("a b / c + 2 ^")).toBe("\\left(\\frac{a}{b} + c\\right)^{2}");
    });
  });

  describe("powers and subscripts", () => {
    it("writes x_i^2 for a subscripted base", () => {
      expect(latex("x i ssc 2 ^")).toBe("x_{i}^{2}");
      expect(latex("x1 2 ^")).toBe("x_{1}^{2}");
    });

    it("brackets a base that is itself a power or subscript", () => {
      expect(latex("a 2 ^ 3 ^")).toBe("(a^{2})^{3}");
      expect(latex("x 2 ^ i ssc")).toBe("(x^{2})_{i}");
    });
  });

  describe("multiplication", () => {
    it("prints factors side by side", () => {
      expect(latex("4ac")).toBe("4 a c");
      expect(latex("2 a *")).toBe("2 a");
      expect(latex("2pi")).toBe("2 \\pi");
      expect(latex("a b + c d + *")).toBe("(a + b) (c + d)");
    });

    it("uses \\cdot when a factor would start with a digit", () => {
      expect(latex("2 3 *")).toBe("2 \\cdot 3");
      expect(latex("a 2 *")).toBe("a \\cdot 2");
      expect(latex("x 2 ^ 3 *")).toBe("x^{2} \\cdot 3");
    });
  });

  describe("functions, negation and logic", () => {
    it("brackets a function argument unless it's an atom or a subscripted atom", () => {
      expect(latex("x sin")).toBe("\\sin x");
      expect(latex("x1 sin")).toBe("\\sin x_{1}");
      expect(latex("x y + sin")).toBe("\\sin (x + y)");
      expect(latex("2x sin")).toBe("\\sin (2 x)");
    });

    it("brackets a function used as a factor", () => {
      expect(latex("x sin y *")).toBe("(\\sin x) y");
    });

    it("brackets a negation that follows + or -", () => {
      expect(latex("a b neg +")).toBe("a + (-b)");
      expect(latex("b neg a +")).toBe("-b + a");
      expect(latex("a b neg =")).toBe("a = -b");
      expect(latex("a b + neg")).toBe("-(a + b)");
    });

    it("ranks and above or, and both below relations", () => {
      expect(latex("a b = c d = and")).toBe("a = b \\wedge c = d");
      expect(latex("a b or c and")).toBe("(a \\vee b) \\wedge c");
    });

    it("writes quantifiers", () => {
      expect(latex("x exists")).toBe("\\exists x");
      expect(latex("x forall")).toBe("\\forall x");
    });
  });

  describe("sums and integrals", () => {
    it("writes a series", () => {
      expect(latex("n 1 = oo 1 n 2 ^ / ser")).toBe("\\sum_{n = 1}^{\\infty} \\frac{1}{n^{2}}");
    });

    it("brackets a summand that is a sum", () => {
      expect(latex("n a n ssc b + sum")).toBe("\\sum_{n} (a_{n} + b)");
    });

    it("writes the d and its spacing for an integral", () => {
      expect(latex("0 pi x sin x int")).toBe("\\int_{0}^{\\pi} \\sin x \\,dx");
    });
  });

  describe("variadic operators", () => {
    it("writes a matrix", () => {
      expect(latex("[ a b ; c d mat")).toBe("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}");
    });

    it("writes a column vector", () => {
      expect(latex("[ a b c col")).toBe("\\begin{pmatrix} a \\\\ b \\\\ c \\end{pmatrix}");
    });

    it("writes cases", () => {
      expect(latex('[ 1 x 0 = ; 0 "otherwise" cases')).toBe(
        "\\begin{cases} 1 & x = 0 \\\\ 0 & \\text{otherwise} \\end{cases}",
      );
    });
  });

  describe("values", () => {
    it("writes reserved values, raw LaTeX and text", () => {
      expect(latex("Alpha")).toBe("\\mathrm{A}");
      expect(latex("\\mathcal{F} x ssc")).toBe("\\mathcal{F}_{x}");
      expect(latex("a b \\overset/2")).toBe("\\overset{a}{b}");
      expect(latex('"if "')).toBe("\\text{if }");
    });
  });

  describe("equations", () => {
    it("writes each equation with its label and \\notag", () => {
      expect(toLatex("\\label{eq:e} E m c 2 ^ * = ; a b = \\notag").equations).toEqual([
        "E = m c^{2} \\label{eq:e}",
        "a = b \\notag",
      ]);
    });

    it("sets leftovers side by side and keeps the warning", () => {
      const result = toLatex("2 x 2 ^");
      expect(result.equations).toEqual(["2 x^{2}"]);
      expect(result.warnings).toHaveLength(1);
    });

    it("writes nothing when the block has errors", () => {
      const result = toLatex("a +");
      expect(result.equations).toEqual([]);
      expect(result.errors).toHaveLength(1);
    });
  });
});
