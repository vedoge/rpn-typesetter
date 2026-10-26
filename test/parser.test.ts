import { describe, expect, it } from "vitest";
import { parse, type Node } from "../src/parser.js";

/**
 * Writes a tree compactly: each operator node as `(operator children…)`.
 * `·` is a glued product, `/br` marks a break, and `juxt` is leftovers set
 * side by side.
 */
function show(node: Node): string {
  switch (node.kind) {
    case "number":
      return node.text;
    case "variable":
    case "named":
      return node.name;
    case "raw":
      return node.latex;
    case "text":
      return JSON.stringify(node.text);
    case "product":
      return `(· ${node.factors.map(show).join(" ")})`;
    case "apply":
      return `(${node.operator}${node.breakBefore ? "/br" : ""} ${node.args.map(show).join(" ")})`;
    case "rawApply":
      return `(${node.command} ${node.args.map(show).join(" ")})`;
    case "variadic":
      return `(${node.operator} ${node.rows.map((row) => `[${row.map(show).join(" ")}]`).join(" ")})`;
    case "juxtapose":
      return `(juxt ${node.items.map(show).join(" ")})`;
  }
}

/** The trees of every equation in a block, which must parse cleanly. */
function trees(source: string): string[] {
  const result = parse(source);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  return result.equations.map((eq) => show(eq.body));
}

/** The one error a block produces. */
function error(source: string): string {
  const { errors } = parse(source);
  expect(errors).toHaveLength(1);
  return errors[0]!.message;
}

describe("parser", () => {
  describe("building trees", () => {
    it("parses the quadratic formula", () => {
      expect(trees("b neg b 2 ^ 4ac - sqrt + 2a /")).toEqual([
        "(/ (+ (neg b) (sqrt (- (^ b 2) (· 4 a c)))) (· 2 a))",
      ]);
    });

    it("needs no parentheses to group", () => {
      expect(trees("a b c - -")).toEqual(["(- a (- b c))"]);
      expect(trees("a b - c -")).toEqual(["(- (- a b) c)"]);
    });

    it("takes arguments in reading order", () => {
      expect(trees("x i ssc")).toEqual(["(ssc x i)"]);
      expect(trees("n 1 = oo 1 n 2 ^ / ser")).toEqual(["(ser (= n 1) oo (/ 1 (^ n 2)))"]);
      expect(trees("0 pi x sin x int")).toEqual(["(int 0 pi (sin x) x)"]);
    });

    it("turns a glued subscript into ssc", () => {
      expect(trees("x1 2 +")).toEqual(["(+ (ssc x 1) 2)"]);
      expect(trees("2ab1")).toEqual(["(· 2 a (ssc b 1))"]);
      expect(trees("pi1")).toEqual(["(ssc pi 1)"]);
    });

    it("parses logic and quantifiers", () => {
      expect(trees("x exists x 0 = and")).toEqual(["(and (exists x) (= x 0))"]);
    });

    it("keeps raw LaTeX and quoted text as single values", () => {
      expect(trees("\\mathcal{F} x ssc")).toEqual(["(ssc \\mathcal{F} x)"]);
      expect(trees('"if "')).toEqual(['"if "']);
    });

    it("applies a raw operator to as many values as it says", () => {
      expect(trees("a b \\overset/2")).toEqual(["(\\overset a b)"]);
    });
  });

  describe("marks and variadic operators", () => {
    it("splits a mark's contents into rows at ;", () => {
      expect(trees("[ a b ; c d mat")).toEqual(["(mat [a b] [c d])"]);
    });

    it("lets fixed-arity operators work inside a row", () => {
      expect(trees("[ n a n ssc sum x ; c d mat")).toEqual(["(mat [(sum n (ssc a n)) x] [c d])"]);
    });

    it("uses the nearest mark when marks nest", () => {
      expect(trees("[ [ a b col c ; d e mat")).toEqual(["(mat [(col [a b]) c] [d e])"]);
    });

    it("rejects a variadic operator with no mark", () => {
      expect(error("a b mat")).toBe("`mat` needs a mark `[` before its entries");
    });

    it("rejects a mark that's never used", () => {
      expect(error("[ a b")).toBe("this mark `[` is never used by a variadic operator (`mat`, `cases`, `col`)");
    });

    it("rejects an empty row", () => {
      expect(error("[ a ; mat")).toBe("`mat` has an empty row");
    });

    it("doesn't let an operator reach past a mark or a row", () => {
      expect(error("a [ b + mat")).toBe("`+` needs 2 values, but only 1 is available after the last `[`");
      expect(error("[ a ; b + mat")).toBe("`+` needs 2 values, but only 1 is available in this row");
    });
  });

  describe("breaks", () => {
    it("flags the operator just applied", () => {
      expect(trees("a b + br")).toEqual(["(+/br a b)"]);
      expect(trees("a b = c = br")).toEqual(["(=/br (= a b) c)"]);
    });

    it("rejects br anywhere but right after an infix operator", () => {
      const message = "`br` must come right after an operator written between its operands (+ - * = and or)";
      expect(error("a br")).toBe(message);
      expect(error("a b ^ br")).toBe(message);
      expect(error("a b + c br")).toBe(message);
    });
  });

  describe("equations", () => {
    it("splits a display into equations at a top-level ;", () => {
      const { equations } = parse("a b = ; c d =");
      expect(equations.map((eq) => [show(eq.body), eq.start, eq.end])).toEqual([
        ["(= a b)", 0, 5],
        ["(= c d)", 8, 13],
      ]);
    });

    it("attaches labels and \\notag to their own equation", () => {
      const { equations } = parse("\\label{eq:one} a b = ; c d = \\notag");
      expect(equations.map(({ label, notag }) => ({ label, notag }))).toEqual([
        { label: "eq:one", notag: false },
        { label: undefined, notag: true },
      ]);
    });

    it("rejects a second label on one equation", () => {
      expect(error("\\label{a} x \\label{b}")).toBe("this equation already has the label `a`");
    });

    it("rejects empty equations", () => {
      expect(error("")).toBe("the RPN block is empty");
      expect(error("; a")).toBe("this equation is empty");
      expect(error("a ;")).toBe("nothing follows this `;`");
    });
  });

  describe("errors and warnings", () => {
    it("sets leftover values side by side, with a warning", () => {
      const result = parse("2 x 2 ^");
      expect(result.equations.map((eq) => show(eq.body))).toEqual(["(juxt 2 (^ x 2))"]);
      expect(result.warnings.map((w) => w.message)).toEqual([
        "2 values were left on the stack, so they're set side by side; is an operator missing?",
      ]);
    });

    it("reports stack underflow at the operator", () => {
      const { errors } = parse("a +");
      expect(errors).toEqual([{ start: 2, end: 3, message: "`+` needs 2 values, but only 1 is available" }]);
      expect(error("sqrt")).toBe("`sqrt` needs 1 value, but none is available");
      expect(error("a \\overset/2")).toBe("`\\overset` needs 2 values, but only 1 is available");
    });

    it("rejects operators whose arity isn't decided yet", () => {
      expect(error("x lim")).toBe("`lim` is reserved, but how many values it takes isn't decided yet");
    });

    it("passes lexer errors through without parsing", () => {
      expect(error("x1y +")).toBe(
        "`x1y`: glued digits after letters are a subscript and must end the token (`x1` → x₁)",
      );
    });
  });
});
