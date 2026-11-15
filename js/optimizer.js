/*
 * PHASE 5 - CODE OPTIMIZATION
 * ---------------------------
 * Input : the IR instruction list.
 * Output: a shorter IR list that draws EXACTLY the same picture,
 *         plus a log of every change made.
 *
 * These are "peephole" optimizations: we look at a small window of
 * neighbouring instructions and replace them with something cheaper.
 *
 *   Pass 1  Remove no-ops         MOVE 0, TURN 0, TURN 360        -> (deleted)
 *   Pass 2  Merge turns           TURN 30, TURN 60                -> TURN 90
 *   Pass 3  Merge moves           MOVE 50, MOVE 50                -> MOVE 100
 *   Pass 4  Remove redundant sets PEN RED when pen is already RED -> (deleted)
 *   Pass 5  Remove dead sets      PEN RED, PEN BLUE               -> PEN BLUE
 *
 * One pass can create new chances for another (deleting a TURN 0 can put
 * two MOVEs side by side), so the passes are repeated until nothing changes
 * (this is called reaching a "fixed point").
 */
(function (root) {
  'use strict';

  var IR = typeof require !== 'undefined' ? require('./ir.js') : root.TurtleIR;

  // Bring an angle into the range (-180, 180]; e.g. 270 -> -90, 360 -> 0.
  function normalizeAngle(a) {
    a = a % 360;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    return Math.round(a * 1e6) / 1e6;
  }

  function round(n) { return Math.round(n * 1e6) / 1e6; }

  // Which piece of turtle state does an instruction set?
  function stateKind(ins) {
    if (ins.op === 'PEN') return 'color';
    if (ins.op === 'WIDTH') return 'width';
    if (ins.op === 'PENUP' || ins.op === 'PENDOWN') return 'pen';
    return null;
  }

  function optimize(input) {
    var code = input.map(function (ins) { return Object.assign({}, ins); });
    var log = [];

    function note(pass, line, detail) { log.push({ pass: pass, line: line, detail: detail }); }

    // Pass 1: instructions that do nothing.
    function removeNoOps() {
      var out = [], changed = false;
      code.forEach(function (ins) {
        if ((ins.op === 'MOVE' && ins.arg === 0) || (ins.op === 'TURN' && ins.arg % 360 === 0)) {
          note('Remove no-op', ins.line, IR.format(ins) + ' has no effect - removed');
          changed = true;
        } else out.push(ins);
      });
      code = out;
      return changed;
    }

    // Pass 2: two turns in a row are one turn.
    function mergeTurns() {
      var out = [], changed = false;
      code.forEach(function (ins) {
        var prev = out[out.length - 1];
        if (ins.op === 'TURN' && prev && prev.op === 'TURN') {
          var sum = normalizeAngle(prev.arg + ins.arg);
          note('Merge turns', ins.line, 'TURN ' + prev.arg + ' + TURN ' + ins.arg + ' -> TURN ' + sum);
          prev.arg = sum;
          changed = true;
        } else out.push(ins);
      });
      code = out;
      return changed;
    }

    // Pass 3: two moves in a row (same direction) are one longer move.
    // With the pen DOWN we only merge moves of the same sign: MOVE 50, MOVE -50
    // draws a line and comes back, so it must not be replaced by MOVE 0.
    function mergeMoves() {
      var out = [], changed = false, penDown = IR.DEFAULTS.penDown;
      code.forEach(function (ins) {
        var prev = out[out.length - 1];
        if (ins.op === 'PENUP') penDown = false;
        if (ins.op === 'PENDOWN') penDown = true;
        if (ins.op === 'MOVE' && prev && prev.op === 'MOVE' &&
            (!penDown || (prev.arg > 0) === (ins.arg > 0))) {
          var sum = round(prev.arg + ins.arg);
          note('Merge moves', ins.line, 'MOVE ' + prev.arg + ' + MOVE ' + ins.arg + ' -> MOVE ' + sum);
          prev.arg = sum;
          changed = true;
        } else out.push(ins);
      });
      code = out;
      return changed;
    }

    // Pass 4: setting the state to the value it already has.
    function removeRedundantSets() {
      var out = [], changed = false;
      var state = { color: IR.DEFAULTS.color, width: IR.DEFAULTS.width, pen: IR.DEFAULTS.penDown };
      code.forEach(function (ins) {
        var kind = stateKind(ins);
        if (kind) {
          var value = kind === 'pen' ? ins.op === 'PENDOWN' : ins.arg;
          if (state[kind] === value) {
            note('Remove redundant set', ins.line, IR.format(ins) + ' - already in that state - removed');
            changed = true;
            return;
          }
          state[kind] = value;
        }
        out.push(ins);
      });
      code = out;
      return changed;
    }

    // Pass 5: a setting that is overwritten before any MOVE uses it is dead.
    function removeDeadSets() {
      var out = [], changed = false;
      for (var i = 0; i < code.length; i++) {
        var kind = stateKind(code[i]);
        var dead = false;
        if (kind) {
          for (var j = i + 1; j < code.length && code[j].op !== 'MOVE'; j++) {
            if (stateKind(code[j]) === kind) {
              note('Remove dead set', code[i].line,
                IR.format(code[i]) + ' is overwritten by ' + IR.format(code[j]) + ' before it is used - removed');
              dead = true;
              break;
            }
          }
        }
        if (dead) changed = true; else out.push(code[i]);
      }
      code = out;
      return changed;
    }

    // Repeat all passes until a full round changes nothing (fixed point).
    var rounds = 0, changed = true;
    while (changed && rounds < 50) {
      changed = false;
      if (removeNoOps()) changed = true;
      if (mergeTurns()) changed = true;
      if (mergeMoves()) changed = true;
      if (removeRedundantSets()) changed = true;
      if (removeDeadSets()) changed = true;
      rounds++;
    }

    return { code: code, log: log, before: input.length, after: code.length, rounds: rounds };
  }

  var api = { optimize: optimize, normalizeAngle: normalizeAngle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleOptimizer = api;
})(typeof window !== 'undefined' ? window : globalThis);
