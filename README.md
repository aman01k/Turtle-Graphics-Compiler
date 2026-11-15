# Turtle Graphics Compiler

A complete, six-phase compiler for a small turtle-graphics language, with an interactive web interface that shows the output of **every phase**: tokens, syntax tree, symbol table, intermediate code, optimized code, target code (SVG) and the final drawing.

Compiler Design course project, built under the **AI Product Engineering Track**.

```
PEN BLUE;
REPEAT 4 {
  MOVE 100;
  TURN 90;
}
```

This program compiles to an SVG image of a blue square.

## Features

- **All six compiler phases**, each in its own file and each visible in its own tab.
- **Live compilation**: the result updates as you type.
- **Error handling in three phases** (lexical, syntax, semantic) with line and column numbers. Click an error to jump to it.
- **Error recovery**: the lexer and parser keep going after an error, so several errors are reported in one run.
- **Symbol table with scopes**: variables declared inside a `REPEAT` block are local to it.
- **Optimizer** with five peephole passes and a log of every change.
- **Step-by-step animation** of the turtle drawing the picture.
- **Nine built-in examples**, including one error demo for each analysis phase.
- **No dependencies**: plain HTML, CSS and JavaScript. Nothing to install or build.

## How to run

**Option 1 - open the file.** Download or clone the repository and double-click `index.html`. It opens in any modern browser.

**Option 2 - local server** (optional):

```bash
git clone https://github.com/aman01k/Turtle-Graphics-Compiler.git
cd Turtle-Graphics-Compiler
python3 -m http.server 8000
# open http://localhost:8000
```

**Option 3 - GitHub Pages.** In the repository, go to *Settings > Pages*, choose the `main` branch and the root folder. The compiler is then live at `https://aman01k.github.io/Turtle-Graphics-Compiler/`.

### Running the tests

The tests need [Node.js](https://nodejs.org) (any recent version). No packages are required.

```bash
node tests/run-tests.js
```

There are 47 tests covering correct programs and error cases for every phase.

## The language

| Statement | Meaning | Semantic rule |
|---|---|---|
| `PEN BLUE;` | Set the pen colour | Must be a known colour |
| `MOVE 100;` | Go forward (negative = backward) | -1000 to 1000 |
| `TURN 90;` | Turn right (negative = left) | -360 to 360 degrees |
| `WIDTH 3;` | Set the line thickness | 1 to 20 |
| `PENUP;` / `PENDOWN;` | Stop / start drawing while moving | |
| `LET size = 50;` | Declare a named constant | Once per scope, before use |
| `REPEAT 4 { ... }` | Run the block several times | Whole number, 1 to 1000 |
| `# text` | Comment | |

- Values can be arithmetic expressions with `+ - * /`, parentheses and unary minus: `MOVE size * 2 + 10;`
- Colours: `BLACK RED GREEN BLUE YELLOW ORANGE PURPLE PINK BROWN CYAN GRAY WHITE`
- Keywords and colour names are case-insensitive. Variable names are case-sensitive.
- The turtle starts at (0, 0), facing up, with a black pen of width 2 that is down.

### Grammar

```
program    -> statement* EOF
statement  -> PEN IDENT ';'
            | MOVE expr ';'
            | TURN expr ';'
            | WIDTH expr ';'
            | PENUP ';'
            | PENDOWN ';'
            | LET IDENT '=' expr ';'
            | REPEAT expr '{' statement* '}'
expr       -> term   ( ('+' | '-') term )*
term       -> factor ( ('*' | '/') factor )*
factor     -> NUMBER | IDENT | '(' expr ')' | '-' factor
```

## The compiler pipeline

| # | Phase | File | Input | Output |
|---|---|---|---|---|
| 1 | Lexical analysis | `js/lexer.js` | Source text | Tokens |
| 2 | Syntax analysis | `js/parser.js` | Tokens | Abstract Syntax Tree |
| 3 | Semantic analysis | `js/semantic.js` | AST | Symbol table, annotated AST |
| 4 | IR generation | `js/ir.js` | Annotated AST | Linear intermediate code |
| 5 | Optimization | `js/optimizer.js` | IR | Shorter IR |
| 6 | Code generation | `js/codegen.js` | Optimized IR | SVG |

`js/compiler.js` runs the phases in order. If a phase reports errors, the pipeline stops there.

### Worked example

Source:

```
LET side = 50;
REPEAT 2 { MOVE side; MOVE side; TURN 90; }
```

1. **Tokens**: `KEYWORD(LET) IDENT(side) ASSIGN NUMBER(50) SEMI KEYWORD(REPEAT) NUMBER(2) LBRACE ...`
2. **AST**: `Program -> [ Let(side, 50), Repeat(count 2, body [ Move(Var side), Move(Var side), Turn(90) ]) ]`
3. **Semantic analysis**: `side` is added to the symbol table (constant, value 50, global scope). Each `Var side` node is annotated with the value 50. All ranges are valid.
4. **IR**: the loop is unrolled and variables are replaced by values:
   `MOVE 50, MOVE 50, TURN 90, MOVE 50, MOVE 50, TURN 90`
5. **Optimized IR**: adjacent moves are merged: `MOVE 100, TURN 90, MOVE 100, TURN 90`
6. **Target code**: two SVG `<line>` elements.

### Phase details

**1. Lexical analysis.** A hand-written scanner reads the text one character at a time and groups characters into tokens: `KEYWORD`, `IDENT`, `NUMBER`, `SEMI`, `LBRACE`, `RBRACE`, `LPAREN`, `RPAREN`, `ASSIGN`, `PLUS`, `MINUS`, `STAR`, `SLASH`, `EOF`. Whitespace and comments are discarded. Every token stores its line and column.

**2. Syntax analysis.** A recursive descent (top-down, LL(1)) parser with one function per grammar rule. Operator precedence is encoded in the grammar. On an error the parser uses panic-mode recovery: it skips to the next `;`, keyword or `}` and continues.

**3. Semantic analysis.** Walks the AST with a stack of scopes. It builds the symbol table, evaluates every expression at compile time (all variables are constants) and enforces the rules in the language table above.

**4. IR generation.** Produces a flat list of six instruction kinds: `PEN`, `MOVE`, `TURN`, `WIDTH`, `PENUP`, `PENDOWN`. Loops are unrolled and constants are folded, so the IR has no nesting, no variables and no expressions.

**5. Optimization.** Five peephole passes, repeated until nothing changes:

| Pass | Example |
|---|---|
| Remove no-ops | `MOVE 0`, `TURN 360` are deleted |
| Merge turns | `TURN 30, TURN 60` becomes `TURN 90` |
| Merge moves | `MOVE 50, MOVE 50` becomes `MOVE 100` |
| Remove redundant sets | `PEN RED` when the pen is already red is deleted |
| Remove dead sets | `PEN RED, PEN BLUE` becomes `PEN BLUE` |

**6. Code generation.** Simulates the turtle (position, heading, pen state) over the optimized IR and emits one SVG `<line>` for each move made with the pen down. The SVG `viewBox` is fitted to the drawing.

## Errors detected

| Phase | Errors |
|---|---|
| Lexical | Illegal characters (`@`, `$`); names starting with a digit (`9x0`) |
| Syntax | Missing `;`, missing `{` or `}`, stray `}`, missing value, unknown command, missing `=` in `LET` |
| Semantic | Unknown colour; `MOVE`, `TURN` or `WIDTH` out of range; `REPEAT` count not a positive whole number; undeclared variable; variable used outside its scope; duplicate declaration; division by zero; program too large |
| Warnings | Unused variable; empty `REPEAT` block |

## Project structure

```
Turtle-Graphics-Compiler/
├── index.html          The page
├── css/style.css       Styles
├── js/
│   ├── lexer.js        Phase 1
│   ├── parser.js       Phase 2
│   ├── semantic.js     Phase 3
│   ├── ir.js           Phase 4
│   ├── optimizer.js    Phase 5
│   ├── codegen.js      Phase 6
│   ├── compiler.js     Runs the pipeline
│   ├── examples.js     Example programs
│   └── app.js          User interface
├── tests/run-tests.js  Test suite
├── report/             Project report (PDF and LaTeX source)
└── README.md
```

## Future scope

- Mutable variables, `IF` conditions and user-defined procedures.
- More optimizations, such as removing instructions after the last drawn line.
- More targets: HTML canvas code, Python `turtle` scripts, or G-code for pen plotters.
- Filled shapes and curves (`ARC`, `FILL`).
- Syntax highlighting in the editor.
