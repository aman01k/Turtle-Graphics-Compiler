/*
 * PHASE 3 - SEMANTIC ANALYSIS
 * ---------------------------
 * Input : the AST from the parser.
 * Output: the SYMBOL TABLE, an annotated AST (every expression gets its
 *         computed value), plus semantic errors and warnings.
 *
 * The parser only checks the SHAPE of the program ("is the grammar right?").
 * This phase checks the MEANING ("is this allowed?"):
 *
 *   1. PEN colour must be one of the known colours.
 *   2. MOVE distance must be within -1000 .. 1000.
 *   3. TURN angle must be within -360 .. 360.
 *   4. WIDTH must be within 1 .. 20.
 *   5. REPEAT count must be a positive whole number (1 .. 1000).
 *   6. A variable must be declared (LET) before it is used.
 *   7. A variable cannot be declared twice in the same scope.
 *   8. Division by zero is not allowed.
 *   9. The program must not expand to more than 20000 instructions.
 *
 * SCOPES: the program body is the "global" scope. Every REPEAT block opens
 * a new inner scope. A name is looked up from the innermost scope outwards.
 *
 * All variables are constants (LET gives a value once), so every expression
 * can be fully evaluated at compile time. That is what makes the range
 * checks above possible before the program ever runs.
 */
(function (root) {
  'use strict';

  var COLORS = {
    BLACK: '#1f2933', RED: '#e03131', GREEN: '#2f9e44', BLUE: '#1971c2',
    YELLOW: '#f2b705', ORANGE: '#f76707', PURPLE: '#7048e8', PINK: '#e64980',
    BROWN: '#8d5524', CYAN: '#0c8599', GRAY: '#868e96', WHITE: '#ffffff'
  };

  var LIMITS = {
    MOVE: { min: -1000, max: 1000 },
    TURN: { min: -360, max: 360 },
    WIDTH: { min: 1, max: 20 },
    REPEAT: { min: 1, max: 1000 },
    INSTRUCTIONS: 20000
  };

  function analyze(ast) {
    var errors = [];
    var warnings = [];
    var symbols = [];          // the full symbol table (every scope), for display
    var scopes = [];           // stack of active scopes; each scope is { name, level, table }
    var repeatCounter = 0;

    function error(node, message) {
      errors.push({ phase: 'Semantic', line: node.line, col: node.col, message: message });
    }
    function warn(node, message) {
      warnings.push({ phase: 'Semantic', line: node.line, col: node.col, message: message });
    }

    function enterScope(name) {
      scopes.push({ name: name, level: scopes.length, table: {} });
    }
    function exitScope() {
      var scope = scopes.pop();
      Object.keys(scope.table).forEach(function (key) {
        var sym = scope.table[key];
        if (sym.uses === 0) {
          warn(sym, "Variable '" + sym.name + "' is declared but never used");
        }
      });
    }
    function currentScope() { return scopes[scopes.length - 1]; }

    // Look a name up from the innermost scope outwards.
    function lookup(name) {
      for (var i = scopes.length - 1; i >= 0; i--) {
        if (Object.prototype.hasOwnProperty.call(scopes[i].table, name)) return scopes[i].table[name];
      }
      return null;
    }

    // Evaluate an expression at compile time. Returns a number, or null if
    // the expression contains an error (so we do not report follow-on errors).
    function evaluate(node) {
      var value = null;
      switch (node.type) {
        case 'Number':
          value = node.value;
          break;
        case 'Var': {
          var sym = lookup(node.name);
          if (!sym) {
            var hint = COLORS[node.name.toUpperCase()] ? ' (colour names can only be used after PEN)' : '';
            error(node, "Variable '" + node.name + "' is used but was never declared with LET" + hint);
          } else {
            sym.uses++;
            value = sym.value;
          }
          break;
        }
        case 'Neg': {
          var v = evaluate(node.operand);
          value = v === null ? null : -v;
          break;
        }
        case 'BinOp': {
          var l = evaluate(node.left);
          var r = evaluate(node.right);
          if (l === null || r === null) break;
          if (node.op === '+') value = l + r;
          else if (node.op === '-') value = l - r;
          else if (node.op === '*') value = l * r;
          else if (node.op === '/') {
            if (r === 0) error(node, 'Division by zero');
            else value = l / r;
          }
          break;
        }
      }
      if (value !== null) value = Math.round(value * 1e6) / 1e6; // avoid 0.30000000004
      node.computed = value;     // annotate the AST with the result
      return value;
    }

    function checkRange(node, value, what, limit, unit) {
      if (value === null) return;
      if (value < limit.min || value > limit.max) {
        error(node, what + ' ' + value + ' is out of range (allowed: ' + limit.min + ' to ' + limit.max + (unit ? ' ' + unit : '') + ')');
      }
    }

    // Visits statements and returns how many IR instructions they will produce.
    function visitBlock(statements) {
      var total = 0;
      statements.forEach(function (stmt) { total += visit(stmt); });
      return total;
    }

    function visit(node) {
      switch (node.type) {
        case 'Pen': {
          var key = node.color.toUpperCase();
          if (!COLORS[key]) {
            error({ line: node.colorLine, col: node.colorCol },
              "Unknown colour '" + node.color + "'. Allowed colours: " + Object.keys(COLORS).join(', '));
          } else {
            node.computed = key;
          }
          return 1;
        }
        case 'Move':
          checkRange(node, evaluate(node.value), 'MOVE distance', LIMITS.MOVE, 'units');
          return 1;
        case 'Turn':
          checkRange(node, evaluate(node.value), 'TURN angle', LIMITS.TURN, 'degrees');
          return 1;
        case 'Width':
          checkRange(node, evaluate(node.value), 'WIDTH', LIMITS.WIDTH);
          return 1;
        case 'PenUp':
        case 'PenDown':
          return 1;
        case 'Let': {
          // Evaluate first, so "LET x = x + 1;" correctly reports x as undeclared.
          var value = evaluate(node.value);
          var scope = currentScope();
          if (Object.prototype.hasOwnProperty.call(scope.table, node.name)) {
            var first = scope.table[node.name];
            error(node, "Variable '" + node.name + "' is already declared in this scope (first declared on line " + first.line + ')');
          } else {
            var sym = {
              name: node.name, kind: 'constant', type: 'number', value: value,
              scope: scope.name, level: scope.level, line: node.line, col: node.col, uses: 0
            };
            scope.table[node.name] = sym;
            symbols.push(sym);
          }
          return 0; // LET produces no instruction - its value is folded into its uses
        }
        case 'Repeat': {
          var count = evaluate(node.count);
          if (count !== null) {
            if (Math.floor(count) !== count) {
              error(node, 'REPEAT count must be a whole number, but got ' + count);
              count = null;
            } else if (count < LIMITS.REPEAT.min) {
              error(node, 'REPEAT count must be positive, but got ' + count);
              count = null;
            } else if (count > LIMITS.REPEAT.max) {
              error(node, 'REPEAT count ' + count + ' is too large (maximum ' + LIMITS.REPEAT.max + ')');
              count = null;
            }
          }
          if (node.body.length === 0) warn(node, 'REPEAT block is empty and does nothing');
          repeatCounter++;
          enterScope('repeat#' + repeatCounter + ' (line ' + node.line + ')');
          var bodySize = visitBlock(node.body);
          exitScope();
          return count === null ? 0 : count * bodySize;
        }
      }
      return 0;
    }

    enterScope('global');
    var size = visitBlock(ast.body);
    exitScope();

    if (size > LIMITS.INSTRUCTIONS) {
      error(ast, 'Program is too large: it expands to ' + size + ' instructions (maximum ' + LIMITS.INSTRUCTIONS + '). Reduce the REPEAT counts');
    }

    return { ast: ast, symbols: symbols, errors: errors, warnings: warnings };
  }

  var api = { analyze: analyze, COLORS: COLORS, LIMITS: LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleSemantic = api;
})(typeof window !== 'undefined' ? window : globalThis);
