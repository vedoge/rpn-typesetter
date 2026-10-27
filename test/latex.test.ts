// Compiles every expected output in the shared cases with real LaTeX, to
// check that the tool writes LaTeX that LaTeX accepts. It runs only where
// `pdflatex` is installed, and is skipped elsewhere.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { all, readCases, single } from "./cases.js";

const hasLatex = spawnSync("pdflatex", ["--version"]).status === 0;

// CI sets REQUIRE_LATEX, so a missing pdflatex there fails instead of quietly skipping.
if (process.env["REQUIRE_LATEX"] && !hasLatex) throw new Error("REQUIRE_LATEX is set, but pdflatex isn't installed");

const casesDir = fileURLToPath(new URL("./cases/", import.meta.url));

/** Environment for each layout. Several equations in "single" need a multi-line one. */
function environment(layout: string, equations: number): string {
  if (layout === "multline") return "multline";
  if (layout === "lines") return "gather";
  if (layout === "aligned") return "align";
  return equations > 1 ? "gather" : "equation";
}

/**
 * Compiles a document. On failure, names the case whose lines LaTeX stopped
 * in, using `starts`: the first line of each case in the document.
 */
function compile(name: string, document: string, starts: { line: number; name: string }[] = []): void {
  const dir = mkdtempSync(join(tmpdir(), "rpn-latex-"));
  writeFileSync(join(dir, `${name}.tex`), document);
  const run = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `${name}.tex`], { cwd: dir });
  if (run.status === 0) return;

  const log = readFileSync(join(dir, `${name}.log`), "utf8");
  const error = /^!.*$/m.exec(log)?.[0] ?? "(no error line in the log)";
  const line = Number(/^l\.(\d+)/m.exec(log)?.[1] ?? 0);
  const culprit = starts.filter((s) => s.line <= line).pop()?.name ?? "unknown";
  expect.fail(`pdflatex failed in case \`${culprit}\` (line ${line} of ${join(dir, `${name}.tex`)}): ${error}`);
}

describe.skipIf(!hasLatex)("pdflatex accepts the expected output", () => {
  it("of every block case", () => {
    const lines = ["\\documentclass{article}", "\\usepackage{amsmath,amssymb}", "\\begin{document}"];
    const starts: { line: number; name: string }[] = [];
    for (const c of readCases(`${casesDir}blocks.cases`)) {
      const equations = all(c, "latex");
      if (equations.length === 0) continue; // an error case
      const env = environment(single(c, "layout") ?? "single", equations.length);
      starts.push({ line: lines.length + 1, name: c.name });
      lines.push(`% ${c.name}`, `\\begin{${env}}`, equations.join(" \\\\ "), `\\end{${env}}`);
    }
    lines.push("\\end{document}", "");
    compile("blocks", lines.join("\n"), starts);
  });

  it("of every document case", () => {
    const body: string[] = [];
    const starts: { line: number; name: string }[] = [];
    for (const c of readCases(`${casesDir}documents.cases`)) {
      const output = single(c, "output");
      if (output === undefined || all(c, "error").length > 0) continue;
      if (output.includes("\\documentclass")) {
        compile(`document-${starts.length}-${body.length}`, `${output}\n`);
      } else {
        starts.push({ line: 4 + body.length, name: c.name });
        body.push(...`% ${c.name}\n${output}\n\\par`.split("\n"));
      }
    }
    const document = ["\\documentclass{article}", "\\usepackage{amsmath,amssymb}", "\\begin{document}", ...body, "\\end{document}", ""];
    compile("documents", document.join("\n"), starts);
  });
});
