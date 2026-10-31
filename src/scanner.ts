// Copyright 2026 vedoge
//
// This work may be distributed and/or modified under the conditions of the
// LaTeX Project Public License, either version 1.3c of this license or (at
// your option) any later version. The latest version of this license is in
// https://www.latex-project.org/lppl.txt and version 1.3c or later is part
// of all distributions of LaTeX version 2008 or later.
//
// This work has the LPPL maintenance status `maintained'.
// The Current Maintainer of this work is vedoge (https://github.com/vedoge).
//
// This work consists of all the files in https://github.com/vedoge/rpn-typesetter.
//
// The scanner: the stage that works on a whole `.rtex` document. It's a
// second, simpler lexer. It doesn't understand LaTeX; it only knows enough to
// find math regions, and to skip the places where `$` or `\[` don't mean math
// (comments, `\$`, verbatim). Each math region whose first non-space
// character is the `@` marker is an RPN block: the scanner hands its text to
// the pipeline (lexer → parser → emitter) and splices the LaTeX back in.
// Everything else is copied through unchanged.

import type { Diagnostic } from "./lexer.js";
import { parse } from "./parser.js";
import { EmitError, emitEquation, type Layout } from "./emitter.js";

/** Math environments the scanner recognises, and their layout. */
const mathEnvironments: Readonly<Record<string, Layout>> = {
  equation: "single", "equation*": "single", displaymath: "single", math: "single",
  multline: "multline", "multline*": "multline",
  gather: "lines", "gather*": "lines", gathered: "lines",
  eqnarray: "lines", "eqnarray*": "lines",
  align: "aligned", "align*": "aligned", flalign: "aligned", "flalign*": "aligned",
  alignat: "aligned", "alignat*": "aligned", aligned: "aligned", alignedat: "aligned",
  split: "aligned",
};

/** Environments whose contents are copied untouched, `$` and all. */
const verbatimEnvironments: ReadonlySet<string> = new Set([
  "verbatim", "verbatim*", "Verbatim", "lstlisting", "minted", "comment",
]);

export const marker = "@";

/** The packages the generated LaTeX relies on: `\text`, `pmatrix`, `cases`; `\mathbb` and friends. */
const requiredPackages = ["amsmath", "amssymb"];

export interface ConvertResult {
  /** The converted document. Not meaningful when there are errors. */
  readonly output: string;
  /** Offsets are into the original document. */
  readonly errors: Diagnostic[];
  readonly warnings: Diagnostic[];
}

/** A math region: where its contents start and end, and how it lays out equations. */
interface Region {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly layout: Layout;
  /** Short description for error messages, e.g. "$…$". */
  readonly name: string;
}

export interface ConvertOptions {
  /**
   * Given the errors of one invalid block, returns LaTeX to put in its place.
   * Without it, an invalid block is left as it is.
   */
  readonly invalid?: (errors: readonly Diagnostic[]) => string;
}

/** Converts a whole `.rtex` document to LaTeX. */
export function convert(document: string, options: ConvertOptions = {}): ConvertResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const pieces: string[] = [];
  let copiedTo = 0; // everything before this offset is in `pieces`
  let packagesAt: number | undefined; // just after \documentclass{…}

  const regions = findRegions(document, (at) => (packagesAt ??= at));

  for (const region of regions) {
    const first = skipSpace(document, region.contentStart, region.contentEnd);
    if (document[first] !== marker) continue; // plain LaTeX math: leave it alone

    const rpnStart = first + 1;
    const rpn = blankComments(document.slice(rpnStart, region.contentEnd));
    const shift = (d: Diagnostic): Diagnostic => ({ ...d, start: d.start + rpnStart, end: d.end + rpnStart });

    const blockErrors: Diagnostic[] = [];
    const result = parse(rpn);
    blockErrors.push(...result.errors.map(shift));
    warnings.push(...result.warnings.map(shift));

    let latex: string | undefined;
    const second = result.equations[1];
    if (result.errors.length > 0) {
      // reported above
    } else if (second && (region.layout === "single" || region.layout === "multline")) {
      blockErrors.push(
        shift({
          start: second.start,
          end: second.end,
          message: `${region.name} holds one equation; use an environment like align or gather for several`,
        }),
      );
    } else {
      try {
        latex = result.equations.map((eq) => emitEquation(eq, region.layout)).join(" \\\\ ");
      } catch (error) {
        if (!(error instanceof EmitError)) throw error;
        blockErrors.push(shift(error.diagnostic));
      }
    }

    errors.push(...blockErrors);
    if (blockErrors.length > 0 && options.invalid) latex = options.invalid(blockErrors);
    if (latex === undefined) continue;
    pieces.push(document.slice(copiedTo, first), ` ${latex} `);
    copiedTo = region.contentEnd;
  }
  pieces.push(document.slice(copiedTo));

  let output = pieces.join("");
  if (packagesAt !== undefined) {
    // The offset is in the original document, and nothing before
    // \documentclass is ever rewritten, so it's still valid here.
    const missing = requiredPackages.filter((pkg) => !loadsPackage(document, pkg));
    if (missing.length > 0) {
      output = `${output.slice(0, packagesAt)}\\usepackage{${missing.join(",")}}${output.slice(packagesAt)}`;
    }
  }
  return { output, errors, warnings };
}

/**
 * Whether the document already loads a package (mathtools counts as loading
 * amsmath). Loading it again ourselves, before the author's own options,
 * would cause an "option clash" error.
 */
function loadsPackage(document: string, pkg: string): boolean {
  const names = pkg === "amsmath" ? ["amsmath", "mathtools"] : [pkg];
  const usepackage = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  for (const m of stripComments(document).matchAll(usepackage)) {
    if (m[1]!.split(",").some((name) => names.includes(name.trim()))) return true;
  }
  return false;
}

/** Finds every math region, plain or RPN, in document order. */
function findRegions(document: string, onDocumentClass: (afterArgument: number) => void): Region[] {
  const regions: Region[] = [];
  let i = 0;

  /** Adds a region whose closing delimiter is `closer`, and moves past it. */
  const closeWith = (contentStart: number, closer: string, layout: Layout, name: string) => {
    const close = findCloser(document, contentStart, closer);
    regions.push({ contentStart, contentEnd: close, layout, name });
    i = Math.min(document.length, close + closer.length);
  };

  while (i < document.length) {
    const c = document[i]!;

    if (c === "%") {
      i = endOfLine(document, i);
      continue;
    }

    if (c === "$") {
      if (document[i + 1] === "$") closeWith(i + 2, "$$", "single", "$$…$$");
      else closeWith(i + 1, "$", "single", "$…$");
      continue;
    }

    if (c !== "\\") {
      i++;
      continue;
    }

    // A control sequence: a backslash and a run of letters, or a backslash
    // and one other character (`\$`, `\%`, `\\`, `\(`, …).
    const next = document[i + 1];
    if (next === "(") {
      closeWith(i + 2, "\\)", "single", "\\(…\\)");
      continue;
    }
    if (next === "[") {
      closeWith(i + 2, "\\]", "single", "\\[…\\]");
      continue;
    }
    const word = /^[A-Za-z]+/.exec(document.slice(i + 1))?.[0];
    if (word === undefined) {
      i += 2; // `\$`, `\%` and the like are never math or comments
      continue;
    }
    const afterWord = i + 1 + word.length;

    if (word === "verb") {
      // \verb|…| or \verb*|…|: everything up to the next copy of the delimiter.
      let d = afterWord;
      if (document[d] === "*") d++;
      // The delimiter is a whole character, so an emoji is two UTF-16 units.
      const code = document.codePointAt(d);
      const delimiter = code === undefined ? undefined : String.fromCodePoint(code);
      const close = delimiter === undefined ? -1 : document.indexOf(delimiter, d + delimiter.length);
      i = close === -1 ? document.length : close + delimiter!.length;
      continue;
    }

    if (word === "documentclass") {
      const end = skipArgument(document, skipOptional(document, afterWord));
      onDocumentClass(end);
      i = end;
      continue;
    }

    if (word === "ensuremath") {
      const open = skipSpace(document, afterWord, document.length);
      if (document[open] === "{") {
        const close = matchingBrace(document, open);
        regions.push({ contentStart: open + 1, contentEnd: close, layout: "single", name: "\\ensuremath{…}" });
        i = Math.min(document.length, close + 1);
        continue;
      }
    }

    if (word === "begin") {
      const env = /^\s*\{([^{}]*)\}/.exec(document.slice(afterWord));
      if (env) {
        const name = env[1]!;
        let contentStart = afterWord + env[0].length;
        const end = `\\end{${name}}`;
        if (verbatimEnvironments.has(name)) {
          const close = document.indexOf(end, contentStart);
          i = close === -1 ? document.length : close + end.length;
          continue;
        }
        const layout = Object.hasOwn(mathEnvironments, name) ? mathEnvironments[name] : undefined;
        if (layout !== undefined) {
          // Skip the environment's own arguments: aligned[t], alignat{2}.
          contentStart = skipOptional(document, contentStart);
          if (name.startsWith("alignat") || name === "alignedat") contentStart = skipArgument(document, contentStart);
          closeWith(contentStart, end, layout, name);
          continue;
        }
      }
    }

    i = afterWord;
  }
  return regions;
}

/**
 * Finds `closer`, skipping `\`-escapes and `%` comments on the way. Returns
 * the end of the document if it never appears; LaTeX will report that.
 */
function findCloser(document: string, from: number, closer: string): number {
  let i = from;
  while (i < document.length) {
    if (document.startsWith(closer, i)) return i;
    if (document[i] === "\\") i += 2;
    else if (document[i] === "%") i = endOfLine(document, i);
    else i++;
  }
  return document.length;
}

/** The `}` that closes the `{` at `open`, or the end of the document. */
function matchingBrace(document: string, open: number): number {
  let depth = 0;
  for (let i = open; i < document.length; i++) {
    const c = document[i];
    if (c === "\\") i++;
    else if (c === "%") i = endOfLine(document, i) - 1;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return document.length;
}

/** Skips an optional `[…]` argument, if there is one. */
function skipOptional(document: string, from: number): number {
  const i = skipSpace(document, from, document.length);
  if (document[i] !== "[") return from;
  const close = document.indexOf("]", i);
  return close === -1 ? document.length : close + 1;
}

/** Skips a `{…}` argument, if there is one. */
function skipArgument(document: string, from: number): number {
  const i = skipSpace(document, from, document.length);
  if (document[i] !== "{") return from;
  return Math.min(document.length, matchingBrace(document, i) + 1);
}

function skipSpace(document: string, from: number, to: number): number {
  let i = from;
  while (i < to && /\s/.test(document[i]!)) i++;
  return i;
}

function endOfLine(document: string, from: number): number {
  const newline = document.indexOf("\n", from);
  return newline === -1 ? document.length : newline;
}

/**
 * Replaces each `%` comment with spaces, so the RPN lexer never sees it but
 * every offset stays the same. `\%` is an escaped percent sign, not a comment.
 */
function blankComments(text: string): string {
  return text.replace(/(\\.)|%[^\n]*/g, (match, escape: string | undefined) => escape ?? " ".repeat(match.length));
}

function stripComments(text: string): string {
  return text.replace(/(\\.)|%[^\n]*/g, (match, escape: string | undefined) => escape ?? "");
}

/** The 1-based line and column of an offset, for error messages. */
export function locate(document: string, offset: number): { line: number; column: number } {
  const before = document.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}
