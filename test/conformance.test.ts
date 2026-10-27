// Runs the shared test cases (test/cases/*.cases) against the TypeScript
// implementation. The LuaLaTeX package will run the same files.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toLatex, type Layout } from "../src/emitter.js";
import { convert, locate } from "../src/scanner.js";
import { all, readCases, single } from "./cases.js";

const casesDir = fileURLToPath(new URL("./cases/", import.meta.url));
const layouts: readonly string[] = ["single", "multline", "lines", "aligned"];

describe("blocks.cases", () => {
  for (const c of readCases(`${casesDir}blocks.cases`)) {
    it(c.name, () => {
      const rpn = single(c, "rpn");
      const layout = single(c, "layout") ?? "single";
      if (rpn === undefined) throw new Error("a block case needs `rpn`");
      if (!layouts.includes(layout)) throw new Error(`unknown layout \`${layout}\``);

      const result = toLatex(rpn, layout as Layout);
      expect(result.errors.map((e) => e.message)).toEqual(all(c, "error"));
      expect(result.warnings.map((w) => w.message)).toEqual(all(c, "warning"));
      expect(result.equations).toEqual(all(c, "latex"));
    });
  }
});

describe("documents.cases", () => {
  for (const c of readCases(`${casesDir}documents.cases`)) {
    it(c.name, () => {
      const document = single(c, "document");
      if (document === undefined) throw new Error("a document case needs `document`");

      const result = convert(document);
      const at = (d: { start: number; message: string }) => {
        const { line, column } = locate(document, d.start);
        return `${line}:${column}: ${d.message}`;
      };
      expect(result.errors.map(at)).toEqual(all(c, "error"));
      expect(result.warnings.map(at)).toEqual(all(c, "warning"));
      if (result.errors.length === 0) expect(result.output).toBe(single(c, "output"));
    });
  }
});
