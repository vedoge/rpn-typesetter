// Measured line breaks. The tool can't measure LaTeX itself, so it works
// across two LaTeX runs:
//
// 1. For each equation in a display that can hold several lines, the tool
//    cuts the LaTeX into pieces at the places it may break (breakCandidates in
//    emitter.ts) and adds macros that measure every piece, the line width, the
//    equation number and a \qquad. LaTeX writes the widths into the .aux file.
// 2. On the next run, the tool reads them back and chooses where to break.
//
// The widths never depend on the breaks chosen (every piece is measured on
// every run), so once the widths are known the output stops changing, and
// latexmk stops rerunning.

import { createHash } from "node:crypto";

/** What LaTeX measured for one equation, in points. */
export interface Measurement {
  /** The width a line may use (\linewidth). */
  readonly line: number;
  /** The width of the equation number, as "(12)". */
  readonly number: number;
  /** The width of \qquad, the indent of a continued line in align. */
  readonly qquad: number;
  /** The width of each piece between break candidates, in order. */
  readonly pieces: readonly number[];
}

/**
 * Macros the measuring needs, added to the preamble on the \documentclass
 * line. \rpn@w is how the widths come back: LaTeX writes one call per width
 * into the .aux file, and reading the .aux runs them, so it must exist and do
 * nothing.
 */
export const measuringPreamble =
  "\\makeatletter" +
  "\\providecommand\\rpn@w[3]{}" +
  "\\providecommand\\rpnmeasure[1]{\\begingroup" +
  "\\immediate\\write\\@auxout{\\string\\rpn@w{#1}{L}{\\the\\linewidth}}" +
  "\\setbox\\z@\\hbox{\\normalfont(\\theequation)}\\immediate\\write\\@auxout{\\string\\rpn@w{#1}{N}{\\the\\wd\\z@}}" +
  "\\setbox\\z@\\hbox{$\\qquad$}\\immediate\\write\\@auxout{\\string\\rpn@w{#1}{Q}{\\the\\wd\\z@}}" +
  "\\endgroup}" +
  "\\providecommand\\rpnpiece[3]{\\begingroup" +
  "\\setbox\\z@\\hbox{$\\displaystyle#3$}\\immediate\\write\\@auxout{\\string\\rpn@w{#1}{#2}{\\the\\wd\\z@}}" +
  "\\endgroup}" +
  "\\makeatother";

/**
 * A stable name for an equation: a hash of its RPN, with runs of whitespace
 * made single so reformatting doesn't count as a change, plus its place among
 * identical equations in the document. MD5 is used because LuaTeX has it
 * built in, for the Lua implementation.
 */
export function measurementId(rpn: string, occurrence: number): string {
  const normalised = rpn.trim().split(/\s+/).join(" ");
  return `${createHash("md5").update(normalised).digest("hex").slice(0, 12)}-${occurrence}`;
}

/**
 * The LaTeX that measures an equation's pieces. A piece after the first starts
 * with its operator, so it's measured after an empty group, `{}`, which makes
 * LaTeX space the operator as it would in the full equation.
 */
export function measuringLatex(id: string, pieces: readonly string[]): string {
  const each = pieces.map((piece, k) => `\\rpnpiece{${id}}{${k}}{${k > 0 ? "{}" : ""}${piece}}`);
  return `\\rpnmeasure{${id}}${each.join("")}`;
}

/** Reads every complete measurement from the text of an .aux file. */
export function readMeasurements(aux: string): Map<string, Measurement> {
  const found = new Map<string, Map<string, number>>();
  for (const m of aux.matchAll(/\\rpn@w\{([^{}]*)\}\{([^{}]*)\}\{(-?[\d.]+)pt\}/g)) {
    const [, id, key, width] = m as unknown as [string, string, string, string];
    if (!found.has(id)) found.set(id, new Map());
    found.get(id)!.set(key, Number(width));
  }

  const measurements = new Map<string, Measurement>();
  for (const [id, widths] of found) {
    const line = widths.get("L");
    const number = widths.get("N");
    const qquad = widths.get("Q");
    const pieces: number[] = [];
    for (let k = 0; widths.has(String(k)); k++) pieces.push(widths.get(String(k))!);
    if (line !== undefined && number !== undefined && qquad !== undefined && pieces.length > 0) {
      measurements.set(id, { line, number, qquad, pieces });
    }
  }
  return measurements;
}

export interface BreakSetting {
  /** Whether the display is `align`-like, where continued lines are indented. */
  readonly aligned: boolean;
  /** Whether the equation is numbered, so its number takes room on the line. */
  readonly numbered: boolean;
  /** For each candidate, whether it's a relation or arrow (which starts its line at the alignment point). */
  readonly relation: readonly boolean[];
  /** The candidate an aligned layout lines up at, counted from 0, if any. */
  readonly alignAt: number | undefined;
}

/**
 * Chooses where to break, by first fit: fill each line with as many pieces as
 * fit, and break before the piece that doesn't. Returns the candidates to break
 * before, counted from 0; candidate k sits between piece k and piece k + 1.
 *
 * A line may use the line width, less a quad of margin, less the equation
 * number and another quad when numbered. In an aligned layout, a continued
 * line starts at the alignment point, after the left-hand side, plus \qquad
 * when it doesn't start with a relation.
 */
export function chooseBreaks(m: Measurement, setting: BreakSetting): number[] {
  const quad = m.qquad / 2;
  const usable = m.line - quad - (setting.numbered ? m.number + quad : 0);
  const lhs = setting.aligned && setting.alignAt !== undefined ? sum(m.pieces.slice(0, setting.alignAt + 1)) : 0;
  const indent = (candidate: number) => (setting.aligned ? lhs + (setting.relation[candidate] ? 0 : m.qquad) : 0);

  const breaks: number[] = [];
  let width = m.pieces[0]!;
  for (let k = 0; k + 1 < m.pieces.length; k++) {
    const next = m.pieces[k + 1]!;
    if (width + next > usable) {
      breaks.push(k);
      width = indent(k) + next;
    } else {
      width += next;
    }
  }
  return breaks;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
