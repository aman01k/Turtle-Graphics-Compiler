/*
 * PHASE 4 - INTERMEDIATE CODE (IR) GENERATION
 * -------------------------------------------
 * Input : the annotated AST from semantic analysis.
 * Output: a flat, linear list of simple instructions (like a tiny bytecode).
 *
 * The AST is a tree and has loops and expressions. The IR removes both:
 *   - every expression is replaced by its already-computed constant value
 *     (constant folding / constant propagation of LET variables),
 *   - every REPEAT loop is UNROLLED: its body is copied 'count' times.
 *
 * So the IR has only six very simple instructions and no nesting:
 *   PEN <colour>   MOVE <n>   TURN <n>   WIDTH <n>   PENUP   PENDOWN
 *
 * Example:  REPEAT 2 { MOVE 10; TURN 90; }
 * becomes:  MOVE 10 / TURN 90 / MOVE 10 / TURN 90
 *
 * A linear IR like this is easy to optimise (phase 5) and easy to
 * translate into any target (phase 6).
 */
(function (root) {
  'use strict';

  function generate(ast) {
    var code = [];

    function emit(op, arg, node) {
      var ins = { op: op, line: node.line };
      if (arg !== undefined) ins.arg = arg;
      code.push(ins);
    }

    function visit(node) {
      switch (node.type) {
        case 'Pen': emit('PEN', node.computed, node); break;
        case 'Move': emit('MOVE', node.value.computed, node); break;
        case 'Turn': emit('TURN', node.value.computed, node); break;
        case 'Width': emit('WIDTH', node.value.computed, node); break;
        case 'PenUp': emit('PENUP', undefined, node); break;
        case 'PenDown': emit('PENDOWN', undefined, node); break;
        case 'Let': break; // constants were already folded into their uses
        case 'Repeat':
          for (var i = 0; i < node.count.computed; i++) node.body.forEach(visit); // loop unrolling
          break;
      }
    }

    ast.body.forEach(visit);
    return { code: code };
  }

  // Turn one instruction into text, e.g. { op:'MOVE', arg:100 } -> "MOVE 100"
  function format(ins) {
    return ins.arg === undefined ? ins.op : ins.op + ' ' + ins.arg;
  }

  // The turtle's state before the first instruction runs.
  var DEFAULTS = { color: 'BLACK', width: 2, penDown: true };

  var api = { generate: generate, format: format, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleIR = api;
})(typeof window !== 'undefined' ? window : globalThis);
