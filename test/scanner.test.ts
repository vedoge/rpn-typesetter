import { describe, expect, it } from "vitest";
import { convert, locate } from "../src/scanner.js";

/** The converted document, which must have no errors or warnings. */
function output(document: string): string {
  const result = convert(document);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  return result.output;
}

describe("scanner", () => {
  describe("finding RPN blocks", () => {
    it("converts inline math that starts with @", () => {
      expect(output("so $@ a b + 2 ^$ holds")).toBe("so $ (a + b)^{2} $ holds");
    });

    it("leaves plain math and ordinary text alone", () => {
      const plain = "Text with $x^2 + 1$, \\[ \\frac{a}{b} \\] and \\begin{equation} E = mc^2 \\end{equation}.";
      expect(output(plain)).toBe(plain);
    });

    it("allows spaces before the marker", () => {
      expect(output("$ @ a b +$")).toBe("$  a + b $");
    });

    it("treats ${}@$ as plain math", () => {
      expect(output("${}@$")).toBe("${}@$");
    });

    it("converts every kind of delimiter", () => {
      expect(output("\\(@ a b +\\)")).toBe("\\( a + b \\)");
      expect(output("\\[@ a b +\\]")).toBe("\\[ a + b \\]");
      expect(output("$$@ a b +$$")).toBe("$$ a + b $$");
      expect(output("\\ensuremath{@ a b +}")).toBe("\\ensuremath{ a + b }");
      expect(output("\\begin{equation*}@ a b + \\end{equation*}")).toBe("\\begin{equation*} a + b \\end{equation*}");
    });

    it("keeps an environment's own arguments", () => {
      expect(output("\\begin{alignat}{2}@ a b = \\end{alignat}")).toBe("\\begin{alignat}{2} a &= b \\end{alignat}");
    });
  });

  describe("equations in displays", () => {
    it("aligns separate equations at their relation in align", () => {
      expect(output("\\begin{align*}@ a b = ; c d e + = \\end{align*}")).toBe(
        "\\begin{align*} a &= b \\\\ c &= d + e \\end{align*}",
      );
    });

    it("puts them on separate lines without & in gather", () => {
      expect(output("\\begin{gather}@ a b = ; c d = \\end{gather}")).toBe("\\begin{gather} a = b \\\\ c = d \\end{gather}");
    });

    it("places br breaks for the environment", () => {
      expect(output("\\begin{multline}@ a b + c + br \\end{multline}")).toBe(
        "\\begin{multline} a + b \\\\ + c \\end{multline}",
      );
      expect(output("\\begin{align}@ a b = c = br ; d e = \\end{align}")).toBe(
        "\\begin{align} a &= b \\notag \\\\ &= c \\\\ d &= e \\end{align}",
      );
    });

    it("reports a br that the region can't hold", () => {
      expect(convert("$@ a b + br$").errors.map((e) => e.start)).toEqual([3]);
    });

    it("keeps each equation's label", () => {
      expect(output("\\begin{align}@ \\label{eq:one} a b = ; c d = \\notag \\end{align}")).toBe(
        "\\begin{align} a &= b \\label{eq:one} \\\\ c &= d \\notag \\end{align}",
      );
    });

    it("rejects several equations where only one fits", () => {
      const { errors } = convert("$@ a b = ; c d =$");
      expect(errors).toEqual([
        { start: 11, end: 16, message: "$…$ holds one equation; use an environment like align or gather for several" },
      ]);
    });
  });

  describe("places that aren't math", () => {
    it("skips comments", () => {
      const commented = "% $@ a +$ is not math\n";
      expect(output(commented)).toBe(commented);
    });

    it("ignores a comment inside an RPN block", () => {
      expect(output("$@ a b + % the sum\n$")).toBe("$ a + b $");
    });

    it("skips escaped dollars and percent signs", () => {
      expect(output("costs \\$5 and 10\\% off, $@ a b +$")).toBe("costs \\$5 and 10\\% off, $ a + b $");
    });

    it("passes \\% inside an RPN block through as raw LaTeX", () => {
      expect(output("$@ 50 \\% *$")).toBe("$ 50 \\% $");
    });

    it("keeps \\% inside quoted text", () => {
      expect(output('$@ "50\\% off"$')).toBe("$ \\text{50\\% off} $");
    });

    it("skips verbatim environments and \\verb", () => {
      const verbatim = "\\begin{verbatim}$@ a +$\\end{verbatim} \\verb|$@ a +| \\verb*+$+";
      expect(output(verbatim)).toBe(verbatim);
    });
  });

  describe("errors and warnings", () => {
    it("reports errors at their place in the document", () => {
      const document = "Line one.\nThen $@ a +$.";
      const { errors } = convert(document);
      expect(errors.map((e) => ({ ...locate(document, e.start), message: e.message }))).toEqual([
        { line: 2, column: 11, message: "`+` needs 2 values, but only 1 is available" },
      ]);
    });

    it("reports every bad block, not just the first", () => {
      expect(convert("$@ a +$ $@ b c$ $@ sqrt$").errors.map((e) => e.message)).toEqual([
        "`+` needs 2 values, but only 1 is available",
        "`sqrt` needs 1 value, but none is available",
      ]);
    });

    it("passes warnings through", () => {
      const { warnings } = convert("$@ 2 x 2 ^$");
      expect(warnings.map((w) => w.start)).toEqual([3]);
    });
  });

  describe("packages", () => {
    const body = "\n\\begin{document}$@ a$\\end{document}";

    it("loads amsmath and amssymb right after \\documentclass, on the same line", () => {
      expect(output(`\\documentclass[11pt]{article}${body}`)).toBe(
        `\\documentclass[11pt]{article}\\usepackage{amsmath,amssymb}\n\\begin{document}$ a $\\end{document}`,
      );
    });

    it("doesn't load a package the author already loads", () => {
      expect(output(`\\documentclass{article}\n\\usepackage[fleqn]{amsmath}${body}`)).toContain(
        "\\documentclass{article}\\usepackage{amssymb}\n",
      );
      expect(output(`\\documentclass{article}\n\\usepackage{mathtools,amssymb}${body}`)).toContain(
        "\\documentclass{article}\n",
      );
    });

    it("ignores a \\usepackage that's commented out", () => {
      expect(output(`\\documentclass{article}\n% \\usepackage{amsmath}${body}`)).toContain(
        "\\documentclass{article}\\usepackage{amsmath,amssymb}\n",
      );
    });

    it("adds nothing to a file without \\documentclass", () => {
      expect(output("$@ a$")).toBe("$ a $");
    });
  });
});
