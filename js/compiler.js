/*
 * THE COMPILER DRIVER
 * -------------------
 * Runs the six phases in order and collects every intermediate result,
 * so the user interface can show what each phase produced.
 *
 *   source text
 *      -> [1 Lexer]      -> tokens
 *      -> [2 Parser]     -> AST
 *      -> [3 Semantic]   -> symbol table + annotated AST
 *      -> [4 IR gen]     -> IR
 *      -> [5 Optimizer]  -> optimized IR
 *      -> [6 Code gen]   -> SVG (target code)
 *
 * If a phase reports errors, the pipeline STOPS there: later phases cannot
 * work on a broken program. 'stoppedAt' says which phase failed.
 */
(function (root) {
  'use strict';

  var node = typeof require !== 'undefined';
  var Lexer = node ? require('./lexer.js') : root.TurtleLexer;
  var Parser = node ? require('./parser.js') : root.TurtleParser;
  var Semantic = node ? require('./semantic.js') : root.TurtleSemantic;
  var IR = node ? require('./ir.js') : root.TurtleIR;
  var Optimizer = node ? require('./optimizer.js') : root.TurtleOptimizer;
  var Codegen = node ? require('./codegen.js') : root.TurtleCodegen;

  var PHASES = ['lexical', 'syntax', 'semantic', 'ir', 'optimizer', 'codegen'];

  function compile(source) {
    var result = {
      source: source,
      tokens: null, ast: null, symbols: null, ir: null, optimized: null, target: null,
      errors: [], warnings: [],
      stoppedAt: null,     // name of the phase that failed, or null on success
      status: {}           // phase name -> 'ok' | 'error' | 'skipped'
    };
    PHASES.forEach(function (p) { result.status[p] = 'skipped'; });

    function stop(phase, errors) {
      result.errors = errors;
      result.status[phase] = 'error';
      result.stoppedAt = phase;
      return result;
    }

    // Phase 1: lexical analysis
    var lex = Lexer.tokenize(source);
    result.tokens = lex.tokens;
    if (lex.errors.length) return stop('lexical', lex.errors);
    result.status.lexical = 'ok';

    // Phase 2: syntax analysis
    var parsed = Parser.parse(lex.tokens);
    result.ast = parsed.ast;
    if (parsed.errors.length) return stop('syntax', parsed.errors);
    result.status.syntax = 'ok';

    // Phase 3: semantic analysis
    var sem = Semantic.analyze(parsed.ast);
    result.symbols = sem.symbols;
    result.warnings = sem.warnings;
    if (sem.errors.length) return stop('semantic', sem.errors);
    result.status.semantic = 'ok';

    // Phase 4: intermediate code generation
    result.ir = IR.generate(sem.ast).code;
    result.status.ir = 'ok';

    // Phase 5: optimization
    result.optimized = Optimizer.optimize(result.ir);
    result.status.optimizer = 'ok';

    // Phase 6: code generation
    result.target = Codegen.generate(result.optimized.code);
    result.status.codegen = 'ok';

    return result;
  }

  var api = { compile: compile, PHASES: PHASES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleCompiler = api;
})(typeof window !== 'undefined' ? window : globalThis);
