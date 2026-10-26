import { describe, expect, it } from "vitest";
import { emitEquation, toLatex, type Layout } from "../src/emitter.js";
import { parse } from "../src/parser.js";

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

    it("brackets the base of a power that is itself a power", () => {
      expect(latex("a 2 ^ 3 ^")).toBe("(a^{2})^{3}");
    });

    it("subscripts a power without brackets, tensor style", () => {
      expect(latex("x 2 ^ i ssc")).toBe("x^{2}_{i}");
      expect(latex("T a ^ b ssc")).toBe("T^{a}_{b}");
    });

    it("groups any other subscript base invisibly, never with brackets", () => {
      expect(latex("x i ssc j ssc")).toBe("{x_{i}}_{j}");
      expect(latex("a b + i ssc")).toBe("{a + b}_{i}");
      expect(latex("x i ssc 2 ^ j ssc")).toBe("{x_{i}^{2}}_{j}");
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

    it("brackets a function used as a factor, unless it's the last factor", () => {
      expect(latex("x sin y *")).toBe("(\\sin x) y");
      expect(latex("y x sin *")).toBe("y \\sin x");
      expect(latex("y x sin * z *")).toBe("y (\\sin x) z");
      expect(latex("x sin y sin *")).toBe("(\\sin x) \\sin y");
      expect(latex("c n a n ssc sum *")).toBe("c \\sum_{n} a_{n}");
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

  describe("aligned equations", () => {
    /** The LaTeX for a one-equation block, emitted with `align`. */
    function aligned(source: string): string {
      const result = parse(source);
      expect(result.errors).toEqual([]);
      expect(result.equations).toHaveLength(1);
      return emitEquation(result.equations[0]!, "aligned");
    }

    it("puts & before the relation at the root", () => {
      expect(aligned("a b =")).toBe("a &= b");
      expect(aligned("E m c 2 ^ * =")).toBe("E &= m c^{2}");
    });

    it("brackets both sides exactly as without align", () => {
      expect(aligned("a b or c d and =")).toBe("(a \\vee b) &= (c \\wedge d)");
      expect(latex("a b or c d and =")).toBe("(a \\vee b) = (c \\wedge d)");
      expect(aligned("a b c = =")).toBe("a &= (b = c)");
    });

    it("aligns a chain at its first relation", () => {
      expect(aligned("a b = c =")).toBe("a &= b = c");
    });

    it("adds no & when the root isn't a relation", () => {
      expect(aligned("a b +")).toBe("a + b");
      expect(aligned("a b = c d = and")).toBe("a = b \\wedge c = d");
    });

    it("writes the label and \\notag after", () => {
      expect(aligned("\\label{eq:e} E m c 2 ^ * =")).toBe("E &= m c^{2} \\label{eq:e}");
      expect(aligned("a b = \\notag")).toBe("a &= b \\notag");
    });
  });

  describe("line breaks", () => {
    /** The one equation of a block, laid out as `layout`. */
    function laidOut(source: string, layout: Layout): string {
      const result = toLatex(source, layout);
      expect(result.errors).toEqual([]);
      return result.equations[0]!;
    }

    it("breaks before the operator in multline", () => {
      expect(laidOut("a b + c + br", "multline")).toBe("a + b \\\\ + c");
    });

    it("aligns a broken chain at its relations in align", () => {
      expect(laidOut("a b = c = br", "aligned")).toBe("a &= b \\notag \\\\ &= c");
    });

    it("indents a line that continues at + in align", () => {
      expect(laidOut("a b c + d + br =", "aligned")).toBe("a &= b + c \\notag \\\\ &\\qquad + d");
    });

    it("numbers a broken equation once, on its last line", () => {
      expect(laidOut("\\label{eq:x} a b + c + br", "lines")).toBe("a + b \\notag \\\\ + c \\label{eq:x}");
    });

    it("breaks between factors", () => {
      expect(laidOut("a b * br", "multline")).toBe("a \\\\ b");
      expect(laidOut("a 2 * br", "multline")).toBe("a \\\\ \\cdot 2");
    });

    it("splits brackets across a break, with a phantom of the whole contents", () => {
      expect(laidOut("a b c + br *", "multline")).toBe(
        "a \\left(\\vphantom{b + c} b\\right. \\\\ \\left.\\vphantom{b + c} + c\\right)",
      );
      expect(laidOut("x a b c + br * =", "aligned")).toBe(
        "x &= a \\left(\\vphantom{b + c} b\\right. \\notag \\\\ &\\qquad \\left.\\vphantom{b + c} + c\\right)",
      );
    });

    it("rejects a break where the display can't hold several lines", () => {
      expect(toLatex("a b + br").errors.map((e) => e.message)).toEqual([
        "`br` needs a display that can hold several lines, like multline, align or gather",
      ]);
    });

    it("rejects a break inside a box", () => {
      expect(toLatex("a b + br c /", "multline").errors.map((e) => e.message)).toEqual([
        "`br` can't break a line inside a fraction",
      ]);
      expect(toLatex("a b + br sqrt", "multline").errors.map((e) => e.message)).toEqual([
        "`br` can't break a line inside a square root",
      ]);
    });
  });
});
