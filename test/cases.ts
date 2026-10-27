// Reads the shared test cases in test/cases/*.cases. The format is described
// in test/cases/README.md.

import { readFileSync } from "node:fs";

export interface Case {
  readonly name: string;
  /** Every value of each key, in order. */
  readonly values: ReadonlyMap<string, readonly string[]>;
}

export function readCases(path: string): Case[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const cases: { name: string; values: Map<string, string[]> }[] = [];
  const add = (key: string, value: string, at: number) => {
    const current = cases[cases.length - 1];
    if (!current) throw new Error(`${path}:${at + 1}: \`${key}\` comes before any \`## name\``);
    current.values.set(key, [...(current.values.get(key) ?? []), value]);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      const name = line.slice(3).trim();
      if (cases.some((c) => c.name === name)) throw new Error(`${path}:${i + 1}: duplicate case name \`${name}\``);
      cases.push({ name, values: new Map() });
    } else if (line.trim() === "" || line.startsWith("#")) {
      continue;
    } else if (/^[a-z]+:$/.test(line)) {
      // A multi-line value: the following lines indented by two spaces.
      const body: string[] = [];
      while (lines[i + 1]?.startsWith("  ")) body.push(lines[++i]!.slice(2));
      add(line.slice(0, -1), body.join("\n"), i);
    } else {
      const m = /^([a-z]+): (.*)$/.exec(line);
      if (!m) throw new Error(`${path}:${i + 1}: expected \`key: value\`, \`## name\` or \`# comment\``);
      add(m[1]!, m[2]!.trimEnd(), i);
    }
  }
  return cases;
}

/** The one value of `key`, or undefined if it's absent. Throws if it repeats. */
export function single(c: Case, key: string): string | undefined {
  const values = c.values.get(key) ?? [];
  if (values.length > 1) throw new Error(`case \`${c.name}\`: \`${key}\` must appear at most once`);
  return values[0];
}

export function all(c: Case, key: string): readonly string[] {
  return c.values.get(key) ?? [];
}
