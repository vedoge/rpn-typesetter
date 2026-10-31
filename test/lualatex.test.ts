// Tests the LuaLaTeX package in lualatex/. Its Lua pipeline runs the shared
// cases (test/lualatex/conformance.lua) wherever a Lua 5.3+ interpreter is
// installed, and every document case is typeset through `lualatex` with the
// package wherever LuaLaTeX is installed. Both are skipped elsewhere.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { all, readCases, single } from "./cases.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const runs = (command: string, args: string[]): boolean => spawnSync(command, args).status === 0;

/** texlua comes with LuaTeX; plain Lua 5.3 or 5.4 runs the pipeline just as well. */
const lua = ["texlua", "lua5.4", "lua5.3", "lua"].find((name) => runs(name, ["-e", "assert(utf8)"]));
const hasLuaLatex = runs("lualatex", ["--version"]);

// CI sets REQUIRE_LATEX, so a missing LuaLaTeX there fails instead of quietly skipping.
if (process.env["REQUIRE_LATEX"] && !hasLuaLatex) throw new Error("REQUIRE_LATEX is set, but lualatex isn't installed");

describe.skipIf(lua === undefined)("the Lua pipeline", () => {
  it("passes every shared case", () => {
    const run = spawnSync(lua!, [join(root, "test/lualatex/conformance.lua")], { encoding: "utf8" });
    expect(run.stdout + run.stderr).toMatch(/(\d+) of \1 shared cases passed/);
    expect(run.status).toBe(0);
  });
});

it("the package's version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  const sty = readFileSync(join(root, "lualatex/rpn-typesetter.sty"), "utf8");
  expect(/\\ProvidesPackage\{rpn-typesetter\}\[\S+ v([^ \]]+)/.exec(sty)?.[1]).toBe(pkg.version);
});

/**
 * A document case as a whole LuaLaTeX document that loads the package, and
 * how many lines were added above the case's own first line.
 */
function asDocument(document: string): { source: string; shift: number } {
  if (document.startsWith("\\documentclass")) {
    const [first, ...rest] = document.split("\n");
    return { source: [`${first}\\usepackage{rpn-typesetter}`, ...rest, ""].join("\n"), shift: 0 };
  }
  const head = ["\\documentclass{article}", "\\usepackage{rpn-typesetter}", "\\begin{document}"];
  return { source: [...head, document, "\\end{document}", ""].join("\n"), shift: head.length };
}

describe.skipIf(!hasLuaLatex)("lualatex with the package", () => {
  const packageDir = join(root, "lualatex") + "//";
  const env = {
    ...process.env,
    TEXINPUTS: `${packageDir}${delimiter}`,
    LUAINPUTS: `${packageDir}${delimiter}`,
    max_print_line: "10000", // don't wrap long lines in the log
  };

  /** Runs lualatex on `source` as case.tex in a new folder. */
  function typeset(source: string, ...extra: string[]): { status: number | null; log: string; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), "rpn-lualatex-"));
    writeFileSync(join(dir, "case.tex"), source);
    const run = spawnSync("lualatex", ["-interaction=nonstopmode", ...extra, "case.tex"], { cwd: dir, env });
    return { status: run.status, log: readFileSync(join(dir, "case.log"), "utf8"), dir };
  }

  // An invalid block raises a LaTeX error where TeX reaches it and is typeset
  // as ??, so the run carries on and reports every error.
  for (const c of readCases(join(root, "test/cases/documents.cases"))) {
    it(c.name, () => {
      const { source, shift } = asDocument(single(c, "document")!);
      const { status, log, dir } = typeset(source);

      // The package reports problems as the command-line tool does: case.tex:line:column: …
      const located = (severity: string) => (expected: string) => {
        const [, line, rest] = /^(\d+):(.*)$/.exec(expected)!;
        return `case.tex:${Number(line) + shift}:${rest!.replace(/^(\d+): /, `$1: ${severity}: `)}`;
      };
      const reported = (severity: string) => log.split("\n").filter((l) => l.startsWith(`case.tex:`) && l.includes(`: ${severity}: `));
      expect(reported("error")).toEqual(all(c, "error").map(located("error")));
      expect(reported("warning")).toEqual(all(c, "warning").map(located("warning")));

      const errors = all(c, "error").map((e) => `! Package rpn-typesetter Error: ${e.replace(/^\d+:\d+: /, "")}.`);
      expect(log.split("\n").filter((l) => l.startsWith("!"))).toEqual(errors);
      expect(status === 0, `lualatex in ${dir}`).toBe(errors.length === 0);
    }, 30_000);
  }

  it("converts files the document \\inputs, and only once raises each error", () => {
    const dir = mkdtempSync(join(tmpdir(), "rpn-lualatex-"));
    writeFileSync(join(dir, "part.tex"), "$@ a b +$ and $@ c +$\n");
    const document = [
      "\\documentclass{article}",
      "\\usepackage{rpn-typesetter}",
      "\\begin{document}",
      "\\input{part}",
      "\\begin{align}@ a b = ; c sqrt sqrt + \\end{align}",
      "\\end{document}",
      "",
    ];
    writeFileSync(join(dir, "case.tex"), document.join("\n"));
    spawnSync("lualatex", ["-interaction=nonstopmode", "case.tex"], { cwd: dir, env });
    const log = readFileSync(join(dir, "case.log"), "utf8");
    expect(log.split("\n").filter((l) => /^\w+\.tex:\d/.test(l))).toEqual([
      "part.tex:1:20: error: `+` needs 2 values, but only 1 is available",
      "case.tex:5:36: error: `+` needs 2 values, but only 1 is available",
    ]);
  }, 30_000);

  // test/latex.test.ts does this with pdfLaTeX and amssymb.
  it("accepts every expected block output, with unicode-math", () => {
    const lines = ["\\documentclass{article}", "\\usepackage{amsmath,unicode-math}", "\\begin{document}"];
    for (const c of readCases(join(root, "test/cases/blocks.cases"))) {
      const equations = all(c, "latex");
      if (equations.length === 0) continue; // an error case
      const layout = single(c, "layout") ?? "single";
      const env = { multline: "multline*", lines: "gather*", aligned: "align*" }[layout] ?? (equations.length > 1 ? "gather*" : "equation*");
      lines.push(`% ${c.name}`, `\\begin{${env}}`, equations.join(" \\\\ "), `\\end{${env}}`);
    }
    const { status, log, dir } = typeset([...lines, "\\end{document}", ""].join("\n"), "-halt-on-error");
    expect(status, `lualatex in ${dir}: ${/^!.*$/m.exec(log)?.[0] ?? ""}`).toBe(0);
    expect(log).not.toMatch(/Missing character/);
  }, 60_000);
});
