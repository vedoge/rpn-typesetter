# Options

Choices still open. Pick by ID (e.g. `S2b`). Decided items are in `design.md`.

## Syntax

**S1 Rank of `ser`/`int`/`sum`** (sets when the summand/integrand gets brackets, and when the whole ∑ does)
- a. Same as `*`
- b. Same as `+`
- c. Lowest rank (summand never bracketed; ∑ bracketed inside anything)
- d. Always bracket a summand that isn't an atom

**S2 Function arguments** (`sin`, `ln`, `exp`, …)
- a. Bracket unless the argument is an atom: `sin x`, `sin(x+y)`
- b. Also leave products unbracketed: `sin 2x`
- c. Always bracket: `sin(x)`

**S3 Powers of functions** (`x sin 2 ^`)
- a. (sin x)²
- b. sin² x

**S4 What counts as an atom** (never bracketed). Choose any of: single letter, number, glued product, Greek letter, subscripted or primed symbol, fraction, root, already-bracketed group, function application.

**S5 Relations and other symbols** (`< > <= >= != -> => <=> ~ !`)
- a. ASCII symbols
- b. Words (`lt`, `le`, `ne`, `to`, `imp`, …)
- c. Both

**S6 `_` for subscript**
- a. `ssc` only
- b. Both `ssc` and `_`

**S7 Indefinite and multiple integrals**
- a. Separate words (e.g. one for ∫ f dx, one for ∬)
- b. Digit suffix (`int0`, `int2`)
- c. Mark plus a variable list: `[ f x y iint`
- d. Nest single integrals

**S8 Mark spelling**
- a. `[`
- b. `mark`

**S9 Row separator inside a mark**
- a. `;`
- b. A nested mark per row
- c. A row count or column count instead

**S10 Glued `x1`**
- a. Subscript x₁
- b. Product x·1
- c. Error

**S11 Glued `f'`**
- a. Prime
- b. Not allowed; use a word

**S12 Escape hatch without `\`**
- a. `name cmd`: re-reads the previous token's spelling as the LaTeX command `\name`
- b. Quoted raw string `"…"`
- c. A prefix character on the token
- d. None

**S13 Upright text**
- a. `"…"`
- b. `word txt`
- c. Shares the mechanism chosen in S12

**S14 Two adjacent numbers under the leftover rule** (`2 3`)
- a. Insert ⋅
- b. Plain juxtaposition
- c. Error

**S15 Words still needing a spelling and an arity**

| Construct | Arity | Spelling |
|---|---|---|
| limit | 2 (approach, body) | |
| product ∏ (both bound styles) | 2 / 3 | |
| matrix (round / square / determinant bars) | mark | |
| column vector | mark | |
| piecewise (cases) | mark | |
| absolute value, norm, floor, ceil | 1 | |
| hat, bar, dot, ddot, tilde, vec | 1 | |
| bold, blackboard, calligraphic | 1 | |
| derivative d/dx, partial ∂/∂x | 2 | |
| higher-order derivatives | 3? | |
| commutator, anticommutator | 2 | |
| bra, ket | 1 | |
| braket ⟨φ\|ψ⟩, matrix element ⟨φ\|A\|ψ⟩ | 2 / 3 | |
| expectation ⟨A⟩ | 1 | |
| function application f(x) | 2 | |
| list / tuple / set | binary chain or mark | |
| ± ∓, ×, ⋅, inline a/b | 2 | |
| factorial, transpose, dagger | 1 | |
| ∞, ∇, ∂, ℏ, ℓ | 0 | |

## Markdown embedding

**M1 Delimiters**
- a. `$…$` / `$$…$$` are RPN only
- b. New delimiter for RPN; `$` stays LaTeX
- c. Per-file switch (front matter)
- d. Fenced ` ```rpn ` blocks for display math

**M2 Multi-line display math**
- a. One expression per line, aligned at the top-level relation
- b. A line starting with a relation (`= …`) continues the previous line
- c. Not supported

## Errors

**E1 On error, the page shows**
- a. KaTeX-style red error inline
- b. The source left unchanged
- c. Nothing; the build fails

**E2 Message location**
- a. Line:column
- b. Token index
- c. Highlighted token in the source

## Implementation

**I1 Integration**
- a. CLI preprocessor (`.md` → `.md`)
- b. markdown-it plugin
- c. remark/unified plugin
- d. Core library plus thin wrappers for several of these

**I2 Pipeline**
- a. Separate stages: lexer → evaluator (stack → tree) → emitter
- b. Single pass: the stack holds LaTeX strings tagged with a rank

**I3 Operator definitions**
- a. One data table: name, arity, rank, associativity, which arguments the layout groups, LaTeX template
- b. Code per operator

**I4 Tooling**
- Package manager: npm / pnpm
- Build: tsc / tsup / esbuild
- Tests: vitest / node:test / jest
- Lint/format: eslint + prettier / biome

**I5 Tests**
- a. Golden input → LaTeX pairs
- b. Also render through KaTeX (it throws on invalid LaTeX)
- c. Both

**I6 Distribution**
- npm package, VS Code preview extension, Obsidian plugin, none yet
