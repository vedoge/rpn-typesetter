import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

// Checks that the toolchain works: TypeScript compiles and Vitest runs.
// Replace this with real tests once the lexer exists.
describe("toolchain", () => {
  it("imports the package entry point", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
